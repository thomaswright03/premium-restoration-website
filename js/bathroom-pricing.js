// Premium Restoration — shared bathroom pricing model.
//
// The single source of truth for bathroom labor prices AND for the
// calculation itself. Both the admin quoting tool (js/admin.js) and the
// public chat estimate (js/script.js) call computeEstimate() below, so the
// two always agree for the same inputs. The admin tool may add plumbing,
// electrical and surcharge lines (includeTrade: true); the public estimate
// never prices that work.
//
// Only the work that is explicitly chosen is priced: nothing is assumed
// from the room's dimensions alone. The line items are exactly the charges
// the business owner gave — do not add any without new pricing from the owner.
//
// Labor only. Materials, permits, and profit margin are never included.
//
// Text is in the page's language (js/i18n.js); labels below are read
// through getters so they always follow it.
//
// Loads as a plain browser script (window.BathroomPricing) and as a Node
// module (for the unit tests).

(function (root, factory) {
  "use strict";
  var api = factory(root.I18n || (typeof require === "function" ? require("./i18n.js") : null));
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BathroomPricing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (I18n) {
  "use strict";

  var T = I18n.t;

  // obj[prop] reads the translation of `key` in the page's language.
  function translated(obj, prop, key) {
    Object.defineProperty(obj, prop, {
      enumerable: true,
      get: function () {
        return T(key);
      },
    });
    return obj;
  }

  var RATES_KEY = "pr_business_rates";

  // Version of the calculation saved with each admin quote. Quotes saved
  // before version 2 were priced by the old calculator (which charged
  // demolition, tile, flooring and paint for every room) and are flagged for
  // review instead of being silently re-priced.
  var CALC_VERSION = 2;

  var DEFAULT_PRICES = {
    Demo_Price_Per_SqFt: 37.5,

    Toilet_Price: 200,
    Sink_Price: 200,
    Shower_Price: 500,
    Shower_Door_Price: 300,
    Door_Price: 200,
    Vanity_Price: 150,
    Cabinet_Price: 60,
    Mirror_Price: 100,
    Mirror_Huge_Price: 300,
    Shower_Shelf_Price: 125,

    Tile_Price_Per_SqFt: 4,
    // Owner-confirmed: $5 per sq ft of bathroom floor.
    Floor_Price_Per_SqFt: 5,
    Painting_Price_Per_SqFt: 1.79,

    Plumbing_Price_Per_Point: 300,
    No_Stack_Surcharge_Price: 1000,
    Bad_Valve_Surcharge_Price: 400,

    Electrical_Price_Per_Point: 100,

    // Labor on real property may not be taxable. Defaults to 0% so no tax
    // is added unless a tax adviser has confirmed it applies and the rate
    // has been set deliberately under Business Prices.
    Labor_Tax_Rate_Percent: 0,
  };

  var PRICE_LABELS = {
    Demo_Price_Per_SqFt: "Demolition (per sq ft of bathroom floor)",

    Toilet_Price: "Toilet install (each)",
    Sink_Price: "Sink install (each)",
    Shower_Price: "Shower install (each)",
    Shower_Door_Price: "Shower door install (each)",
    Door_Price: "Bathroom entry door install (each)",
    Vanity_Price: "Vanity install (each)",
    Cabinet_Price: "Cabinet install (each)",
    Mirror_Price: "Mirror install (each, standard size)",
    Mirror_Huge_Price: "Mirror install (each, huge/oversized)",
    Shower_Shelf_Price: "Built-in shower shelf (each)",

    Tile_Price_Per_SqFt: "Tile (per sq ft of floor or wall tiled)",
    Floor_Price_Per_SqFt: "Flooring other than tile (per sq ft of floor)",
    Painting_Price_Per_SqFt: "Painting (per sq ft of wall or ceiling painted)",

    Plumbing_Price_Per_Point: "Plumbing (per point: one per toilet, sink, shower and bathtub)",
    No_Stack_Surcharge_Price: "Surcharge: no existing plumbing stack (flat)",
    Bad_Valve_Surcharge_Price: "Surcharge: bad valve needs replacing (flat)",

    Electrical_Price_Per_Point: "Electrical (per point: lamp, outlet, fan, switch, electric toilet)",

    Labor_Tax_Rate_Percent: "Tax rate on labor (%) — leave at 0 unless a tax adviser confirms tax applies",
  };

  // Prices the public website shows (chat estimate, page text). Plumbing,
  // electrical and tax are never published.
  var UNPUBLISHED_PRICE_KEYS = [
    "Plumbing_Price_Per_Point",
    "No_Stack_Surcharge_Price",
    "Bad_Valve_Surcharge_Price",
    "Electrical_Price_Per_Point",
    "Labor_Tax_Rate_Percent",
  ];

  // Bathtub price isn't set directly — it's always 30% less than the
  // current shower price, per the business owner.
  function bathtubPrice(prices) {
    return roundCents((Number(prices.Shower_Price) || 0) * 0.7);
  }

  // Fixture counts, in the order they are asked for and listed.
  // needsPlumbing: installing it also needs plumbing work (priced per point
  // in the admin tool, never priced publicly).
  var FIXTURES = [
    { key: "Toilet_Quantity", priceKey: "Toilet_Price", needsPlumbing: true },
    { key: "Sink_Quantity", priceKey: "Sink_Price", needsPlumbing: true },
    { key: "Bathtub_Quantity", derivedPrice: bathtubPrice, needsPlumbing: true },
    { key: "Shower_Quantity", priceKey: "Shower_Price", needsPlumbing: true },
    { key: "Shower_Door_Quantity", priceKey: "Shower_Door_Price" },
    { key: "Door_Quantity", priceKey: "Door_Price" },
    { key: "Vanity_Quantity", priceKey: "Vanity_Price" },
    { key: "Cabinet_Quantity", priceKey: "Cabinet_Price" },
    { key: "Mirror_Quantity", priceKey: "Mirror_Price" },
    { key: "Mirror_Huge_Quantity", priceKey: "Mirror_Huge_Price" },
    { key: "Shower_Shelf_Quantity", priceKey: "Shower_Shelf_Price" },
  ];
  // label: "Toilet", plural: "Toilets" (and their translations).
  FIXTURES.forEach(function (f) {
    translated(f, "label", "fixture." + f.key);
    translated(f, "plural", "fixtures." + f.key);
  });

  function option(value, key) {
    return translated({ value: value }, "label", key);
  }

  var YES_NO = [option(true, "choice.yes"), option(false, "choice.no")];

  // The work questions, asked the same way in the public chat and the admin
  // quote. Nothing is pre-selected; every question must be answered.
  var SCOPE_QUESTIONS = [
    { key: "demolition", options: YES_NO },
    {
      key: "floorFinish",
      options: [
        option("tile", "choice.floor.tile"),
        option("flooring", "choice.floor.flooring"),
        option("none", "choice.none"),
      ],
    },
    {
      // One choice per wall surface, so the same walls can never be charged
      // for both tile and paint.
      key: "walls",
      options: [
        option("tile", "choice.walls.tile"),
        option("paint", "choice.walls.paint"),
        option("none", "choice.neither"),
      ],
    },
    { key: "paintCeiling", options: YES_NO },
  ];
  SCOPE_QUESTIONS.forEach(function (q) {
    translated(q, "label", "question." + q.key);
  });

  var DIMENSIONS = [
    { key: "Bathroom_Width_Ft", max: 50 },
    { key: "Bathroom_Length_Ft", max: 50 },
    { key: "Bathroom_Height_Ft", max: 20 },
  ];
  DIMENSIONS.forEach(function (d) {
    translated(d, "label", "dimension." + d.key);
  });

  var MAX_FIXTURE_COUNT = 20;
  var MAX_ELECTRICAL_POINTS = 50;

  function roundCents(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  // US dollars, written the way the page's language writes numbers
  // ($1,234.50 in English and Spanish, US$ 1.234,50 in Portuguese).
  // locale: optional, e.g. "pt-BR"; default: the page's language.
  function money(value, locale) {
    var n = Number(value) || 0;
    return formatUsd(n, 2, locale || I18n.locale());
  }

  // Whole dollars when there are no cents ($60), otherwise cents ($1.79).
  function shortMoney(value, locale) {
    var n = Number(value) || 0;
    return n % 1 === 0 ? formatUsd(n, 0, locale || I18n.locale()) : money(n, locale);
  }

  function formatUsd(n, digits, locale) {
    var opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    if (locale === "en-US") return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", opts);
    return n.toLocaleString(locale, Object.assign({ style: "currency", currency: "USD" }, opts));
  }

  function formatQty(n, locale) {
    return (Number(n) || 0).toLocaleString(locale || I18n.locale(), { maximumFractionDigits: 2 });
  }

  // Parses a form value. Returns null for blank, NaN for anything that
  // isn't a plain finite number.
  function parseNumber(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return isFinite(value) ? value : NaN;
    var s = String(value).trim();
    if (s === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  // Merges any prices saved from the admin "Business Prices" screen over the
  // defaults (admin only — the public estimate always uses DEFAULT_PRICES).
  function getPrices() {
    var prices = Object.assign({}, DEFAULT_PRICES);
    try {
      var saved = JSON.parse(globalThis.localStorage.getItem(RATES_KEY));
      if (saved && saved.prices) {
        Object.keys(saved.prices).forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(DEFAULT_PRICES, key) && isFinite(Number(saved.prices[key]))) {
            prices[key] = Number(saved.prices[key]);
          }
        });
      }
    } catch (e) {
      /* no storage, or nothing saved: defaults */
    }
    return prices;
  }

  function fixtureRate(fixture, prices) {
    return fixture.derivedPrice ? fixture.derivedPrice(prices) : Number(prices[fixture.priceKey]) || 0;
  }

  function plumbingFixtureCount(values) {
    return FIXTURES.reduce(function (sum, f) {
      return f.needsPlumbing ? sum + (parseNumber(values[f.key]) || 0) : sum;
    }, 0);
  }

  function areas(values) {
    var w = parseNumber(values.Bathroom_Width_Ft) || 0;
    var l = parseNumber(values.Bathroom_Length_Ft) || 0;
    var h = parseNumber(values.Bathroom_Height_Ft) || 0;
    return { floorSqFt: roundCents(w * l), wallSqFt: roundCents(2 * h * (w + l)) };
  }

  // What the chosen work needs measured.
  function scopeNeeds(scope) {
    scope = scope || {};
    var walls = scope.walls === "tile" || scope.walls === "paint";
    var floorArea =
      scope.demolition === true ||
      scope.floorFinish === "tile" ||
      scope.floorFinish === "flooring" ||
      scope.paintCeiling === true ||
      walls;
    return { floorArea: floorArea, height: walls };
  }

  function isScopeComplete(scope) {
    scope = scope || {};
    return SCOPE_QUESTIONS.every(function (q) {
      return q.options.some(function (o) {
        return o.value === scope[q.key];
      });
    });
  }

  // Field-level validation shared by the public chat and the admin quote.
  // Returns { valid, errors: { fieldKey: message } }.
  // options.includeTrade also checks the admin-only electrical points.
  function validateJob(values, scope, options) {
    values = values || {};
    scope = scope || {};
    options = options || {};
    var errors = {};

    SCOPE_QUESTIONS.forEach(function (q) {
      var answered = q.options.some(function (o) {
        return o.value === scope[q.key];
      });
      if (!answered) errors[q.key] = T("error.chooseAnswer");
    });

    var needs = scopeNeeds(scope);
    DIMENSIONS.forEach(function (d) {
      var required = d.key === "Bathroom_Height_Ft" ? needs.height : needs.floorArea;
      var n = parseNumber(values[d.key]);
      if (n === null) {
        if (required) errors[d.key] = T("error.dimension.missing." + d.key, { max: d.max });
        return;
      }
      if (isNaN(n) || n <= 0 || n > d.max) {
        errors[d.key] = T("error.dimension.range", { label: d.label, max: d.max });
      }
    });

    FIXTURES.forEach(function (f) {
      var n = parseNumber(values[f.key]);
      if (n === null) return;
      if (isNaN(n) || n < 0 || n > MAX_FIXTURE_COUNT || Math.floor(n) !== n) {
        errors[f.key] = T("error.wholeNumber", { max: MAX_FIXTURE_COUNT });
      }
    });

    if (options.includeTrade) {
      var points = parseNumber(values.Electrical_Points);
      if (
        points !== null &&
        (isNaN(points) || points < 0 || points > MAX_ELECTRICAL_POINTS || Math.floor(points) !== points)
      ) {
        errors.Electrical_Points = T("error.wholeNumber", { max: MAX_ELECTRICAL_POINTS });
      }
    }

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  // The one bathroom calculation. Prices only the work in `scope` and the
  // fixture counts in `values`.
  //
  // values: { Bathroom_Width_Ft, Bathroom_Length_Ft, Bathroom_Height_Ft,
  //           <fixture>_Quantity..., and with includeTrade: Electrical_Points,
  //           No_Stack_Surcharge_Included, Bad_Valve_Surcharge_Included }
  // scope:  { demolition: bool, floorFinish: "tile"|"flooring"|"none",
  //           walls: "tile"|"paint"|"none", paintCeiling: bool }
  // options: { prices (default DEFAULT_PRICES), includeTrade (default false) }
  //
  // Every line carries its quantity x rate. Lines costing $0 are left out.
  function computeEstimate(values, scope, options) {
    values = values || {};
    scope = scope || {};
    options = options || {};
    var prices = Object.assign({}, DEFAULT_PRICES, options.prices || {});
    var a = areas(values);
    var lines = [];

    function addLine(key, section, label, qty, unit, rate) {
      qty = Number(qty) || 0;
      rate = Number(rate) || 0;
      var cost = roundCents(qty * rate);
      if (cost <= 0) return;
      lines.push({
        key: key,
        section: section,
        label: label,
        qty: qty,
        unit: unit,
        rate: rate,
        cost: cost,
        detail: T("line.detail", { qty: formatQty(qty), unit: unit, rate: money(rate) }),
      });
    }

    function addFlat(key, section, label, rate) {
      rate = Number(rate) || 0;
      if (rate <= 0) return;
      lines.push({
        key: key,
        section: section,
        label: label,
        qty: 1,
        unit: T("unit.flat"),
        rate: rate,
        cost: roundCents(rate),
        detail: T("line.flatCharge"),
      });
    }

    if (scope.demolition === true) {
      addLine(
        "demolition",
        T("section.preparation"),
        T("line.demolition"),
        a.floorSqFt,
        T("unit.sqftFloor"),
        prices.Demo_Price_Per_SqFt,
      );
    }

    FIXTURES.forEach(function (f) {
      var qty = parseNumber(values[f.key]) || 0;
      addLine(
        f.key,
        T("section.fixtures"),
        f.plural,
        qty,
        T(qty === 1 ? "unit.unit" : "unit.units"),
        fixtureRate(f, prices),
      );
    });

    var surfaces = T("section.surfaces");
    var sqft = T("unit.sqft");
    if (scope.floorFinish === "tile") {
      addLine("floorTile", surfaces, T("line.floorTile"), a.floorSqFt, sqft, prices.Tile_Price_Per_SqFt);
    } else if (scope.floorFinish === "flooring") {
      addLine("flooring", surfaces, T("line.flooring"), a.floorSqFt, sqft, prices.Floor_Price_Per_SqFt);
    }
    if (scope.walls === "tile") {
      addLine("wallTile", surfaces, T("line.wallTile"), a.wallSqFt, sqft, prices.Tile_Price_Per_SqFt);
    } else if (scope.walls === "paint") {
      addLine("wallPaint", surfaces, T("line.wallPaint"), a.wallSqFt, sqft, prices.Painting_Price_Per_SqFt);
    }
    if (scope.paintCeiling === true) {
      addLine("ceilingPaint", surfaces, T("line.ceilingPaint"), a.floorSqFt, sqft, prices.Painting_Price_Per_SqFt);
    }

    var fixtureCount = plumbingFixtureCount(values);
    if (options.includeTrade) {
      var plumbing = T("section.plumbing");
      addLine(
        "plumbing",
        plumbing,
        T("line.plumbingPoints"),
        fixtureCount,
        T(fixtureCount === 1 ? "unit.point" : "unit.points"),
        prices.Plumbing_Price_Per_Point,
      );
      if (values.No_Stack_Surcharge_Included === true) {
        addFlat("noStack", plumbing, T("line.noStack"), prices.No_Stack_Surcharge_Price);
      }
      if (values.Bad_Valve_Surcharge_Included === true) {
        addFlat("badValve", plumbing, T("line.badValve"), prices.Bad_Valve_Surcharge_Price);
      }
      var points = parseNumber(values.Electrical_Points) || 0;
      addLine(
        "electrical",
        T("section.electrical"),
        T("line.electricalPoints"),
        points,
        T(points === 1 ? "unit.point" : "unit.points"),
        prices.Electrical_Price_Per_Point,
      );
    }

    var subtotal = roundCents(
      lines.reduce(function (sum, l) {
        return sum + l.cost;
      }, 0),
    );
    var taxRatePercent = options.includeTrade ? Number(prices.Labor_Tax_Rate_Percent) || 0 : 0;
    var taxAmount = roundCents(subtotal * (taxRatePercent / 100));

    return {
      lines: lines,
      floorSqFt: a.floorSqFt,
      wallSqFt: a.wallSqFt,
      plumbingFixtureCount: fixtureCount,
      subtotal: subtotal,
      taxRatePercent: taxRatePercent,
      taxAmount: taxAmount,
      total: roundCents(subtotal + taxAmount),
    };
  }

  // Public estimate: published prices only, no plumbing or electrical, no tax.
  function computePublicEstimate(values, scope) {
    return computeEstimate(values, scope, { prices: DEFAULT_PRICES, includeTrade: false });
  }

  function optionLabel(questionKey, value) {
    var q = SCOPE_QUESTIONS.filter(function (x) {
      return x.key === questionKey;
    })[0];
    var opt = q
      ? q.options.filter(function (o) {
          return o.value === value;
        })[0]
      : null;
    return opt ? opt.label : T("choice.notAnswered");
  }

  // One line describing the chosen work, e.g. "Demolition: No; new floor:
  // Other flooring; walls: Neither; paint ceiling: No".
  function describeScope(scope) {
    scope = scope || {};
    return T("scope.describe", {
      demolition: optionLabel("demolition", scope.demolition),
      floor: optionLabel("floorFinish", scope.floorFinish),
      walls: optionLabel("walls", scope.walls),
      ceiling: optionLabel("paintCeiling", scope.paintCeiling),
    });
  }

  // Plain-text list of what an estimate assumed (estimate card and PDFs).
  function estimateAssumptions(values, scope, result) {
    var needs = scopeNeeds(scope);
    var w = formatQty(parseNumber(values.Bathroom_Width_Ft) || 0);
    var l = formatQty(parseNumber(values.Bathroom_Length_Ft) || 0);
    var h = formatQty(parseNumber(values.Bathroom_Height_Ft) || 0);
    var list = [T("assume.scope", { scope: describeScope(scope) })];
    if (needs.floorArea) {
      list.push(T("assume.floorArea", { w: w, l: l, area: formatQty(result.floorSqFt) }));
    }
    if (needs.height) {
      list.push(T("assume.wallArea", { w: w, l: l, h: h, area: formatQty(result.wallSqFt) }));
    }
    list.push(T("assume.fixtures"));
    return list;
  }

  // Readable, editable summary of a public estimate, used to pre-fill the
  // Contact form's project details.
  function buildEstimateSummary(values, scope, result) {
    var out = [T("summary.title")];
    var needs = scopeNeeds(scope);
    if (needs.floorArea) {
      var size = {
        w: formatQty(parseNumber(values.Bathroom_Width_Ft)),
        l: formatQty(parseNumber(values.Bathroom_Length_Ft)),
        h: formatQty(parseNumber(values.Bathroom_Height_Ft)),
      };
      out.push(T("summary.room", { size: T(needs.height ? "summary.size3" : "summary.size2", size) }));
    }
    out.push(T("summary.work", { scope: describeScope(scope) }));
    var counts = FIXTURES.filter(function (f) {
      return (parseNumber(values[f.key]) || 0) > 0;
    }).map(function (f) {
      return f.plural + " " + formatQty(parseNumber(values[f.key]));
    });
    out.push(T("summary.fixtures", { list: counts.length ? counts.join(", ") : T("summary.none") }));
    out.push(
      T(result.plumbingFixtureCount > 0 ? "summary.totalBeforePlumbing" : "summary.total", {
        total: money(result.subtotal),
      }),
    );
    return out.join("\n");
  }

  function isLegacyQuoteData(bathroomData) {
    return !!bathroomData && !(Number(bathroomData.calcVersion) >= CALC_VERSION);
  }

  return {
    CALC_VERSION: CALC_VERSION,
    RATES_KEY: RATES_KEY,
    DEFAULT_PRICES: DEFAULT_PRICES,
    PRICE_LABELS: PRICE_LABELS,
    UNPUBLISHED_PRICE_KEYS: UNPUBLISHED_PRICE_KEYS,
    FIXTURES: FIXTURES,
    SCOPE_QUESTIONS: SCOPE_QUESTIONS,
    DIMENSIONS: DIMENSIONS,
    MAX_FIXTURE_COUNT: MAX_FIXTURE_COUNT,
    MAX_ELECTRICAL_POINTS: MAX_ELECTRICAL_POINTS,
    bathtubPrice: bathtubPrice,
    money: money,
    shortMoney: shortMoney,
    formatQty: formatQty,
    parseNumber: parseNumber,
    roundCents: roundCents,
    getPrices: getPrices,
    fixtureRate: fixtureRate,
    plumbingFixtureCount: plumbingFixtureCount,
    areas: areas,
    scopeNeeds: scopeNeeds,
    isScopeComplete: isScopeComplete,
    validateJob: validateJob,
    computeEstimate: computeEstimate,
    computePublicEstimate: computePublicEstimate,
    describeScope: describeScope,
    estimateAssumptions: estimateAssumptions,
    buildEstimateSummary: buildEstimateSummary,
    isLegacyQuoteData: isLegacyQuoteData,
  };
});
