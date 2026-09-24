// Premium Restoration — shared bathroom pricing model.
//
// The single source of truth for bathroom labor prices AND for the
// calculation itself. Both the admin quoting tool (js/admin/) and the
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
// The PUBLISHED prices (the ones the website shows) are not in this file:
// the owner sets them in site-config.json ("prices"), and js/site-config.js
// passes them to setPublishedPrices() when a page loads. Until then (or if
// they are missing or invalid) hasPublishedPrices() is false, and the site
// switches the estimator off rather than show a wrong price. Plumbing,
// electrical, the surcharges and tax are never published; their defaults
// are below and the admin tool can change them under Business Prices.
//
// Loads as a plain browser script (window.BathroomPricing) and as a Node
// module (for the unit tests and scripts/sync-pages.mjs), which reads
// site-config.json itself.

(function (root) {
  "use strict";

  var RATES_KEY = "pr_business_rates";

  // Version of the calculation saved with each admin quote. Quotes saved
  // before version 2 were priced by the old calculator (which charged
  // demolition, tile, flooring and paint for every room) and are flagged for
  // review instead of being silently re-priced.
  var CALC_VERSION = 2;

  // The prices the website publishes, as named in site-config.json
  // ("setting") and in the code ("key"). The bathtub price isn't set: it is
  // always 30% less than the shower price.
  var PUBLISHED_PRICES = [
    { setting: "demolitionPerSqFt", key: "Demo_Price_Per_SqFt" },
    { setting: "toiletEach", key: "Toilet_Price" },
    { setting: "sinkEach", key: "Sink_Price" },
    { setting: "showerEach", key: "Shower_Price" },
    { setting: "showerDoorEach", key: "Shower_Door_Price" },
    { setting: "entryDoorEach", key: "Door_Price" },
    { setting: "vanityEach", key: "Vanity_Price" },
    { setting: "cabinetEach", key: "Cabinet_Price" },
    { setting: "mirrorEach", key: "Mirror_Price" },
    { setting: "hugeMirrorEach", key: "Mirror_Huge_Price" },
    { setting: "showerShelfEach", key: "Shower_Shelf_Price" },
    { setting: "tilePerSqFt", key: "Tile_Price_Per_SqFt" },
    { setting: "flooringPerSqFt", key: "Floor_Price_Per_SqFt" },
    { setting: "paintingPerSqFt", key: "Painting_Price_Per_SqFt" },
  ];

  // Highest price accepted from the settings file: a guard against a typo
  // such as 60000 for 60.00.
  var MAX_PUBLISHED_PRICE = 10000;

  // Every price the calculation uses. The published ones are null until
  // setPublishedPrices() fills them in from site-config.json.
  var DEFAULT_PRICES = {
    Demo_Price_Per_SqFt: null,

    Toilet_Price: null,
    Sink_Price: null,
    Shower_Price: null,
    Shower_Door_Price: null,
    Door_Price: null,
    Vanity_Price: null,
    Cabinet_Price: null,
    Mirror_Price: null,
    Mirror_Huge_Price: null,
    Shower_Shelf_Price: null,

    Tile_Price_Per_SqFt: null,
    Floor_Price_Per_SqFt: null,
    Painting_Price_Per_SqFt: null,

    // Never published (admin quotes only).
    Plumbing_Price_Per_Point: 300,
    No_Stack_Surcharge_Price: 1000,
    Bad_Valve_Surcharge_Price: 400,

    Electrical_Price_Per_Point: 100,

    // Labor on real property may not be taxable. Defaults to 0% so no tax
    // is added unless a tax adviser has confirmed it applies and the rate
    // has been set deliberately under Business Prices.
    Labor_Tax_Rate_Percent: 0,
  };

  var publishedLoaded = false;

  // Checks the "prices" section of site-config.json. Returns
  // { valid, prices: { <code key>: number } | null, errors: [plain-English problems] }.
  function validatePublishedPrices(raw) {
    var errors = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { valid: false, prices: null, errors: ['site-config.json has no "prices" section.'] };
    }
    var known = {};
    /** @type {Record<string, number>} */
    var prices = {};
    PUBLISHED_PRICES.forEach(function (p) {
      known[p.setting] = true;
      var v = raw[p.setting];
      if (v === undefined) {
        errors.push("prices." + p.setting + " is missing.");
      } else if (typeof v !== "number" || !isFinite(v)) {
        errors.push("prices." + p.setting + " must be a number without quotes or a $ sign (e.g. 60 or 1.79).");
      } else if (v <= 0 || v > MAX_PUBLISHED_PRICE) {
        errors.push("prices." + p.setting + " must be more than 0 and no more than " + MAX_PUBLISHED_PRICE + ".");
      } else if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) {
        errors.push("prices." + p.setting + " can have at most 2 decimal places (cents).");
      } else {
        prices[p.key] = v;
      }
    });
    Object.keys(raw).forEach(function (name) {
      if (!known[name] && name.charAt(0) !== "_") {
        errors.push("prices." + name + " isn't a price the site knows — check the spelling.");
      }
    });
    return { valid: errors.length === 0, prices: errors.length ? null : prices, errors: errors };
  }

  // Fills in the published prices (keyed by code key, as returned by
  // validatePublishedPrices). DEFAULT_PRICES is changed in place, so every
  // script holding it sees the new prices.
  function setPublishedPrices(prices) {
    PUBLISHED_PRICES.forEach(function (p) {
      DEFAULT_PRICES[p.key] = Number(prices[p.key]);
    });
    publishedLoaded = true;
  }

  function hasPublishedPrices() {
    return publishedLoaded;
  }

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
    { key: "Toilet_Quantity", label: "Toilet", plural: "Toilets", priceKey: "Toilet_Price", needsPlumbing: true },
    { key: "Sink_Quantity", label: "Sink", plural: "Sinks", priceKey: "Sink_Price", needsPlumbing: true },
    { key: "Bathtub_Quantity", label: "Bathtub", plural: "Bathtubs", derivedPrice: bathtubPrice, needsPlumbing: true },
    { key: "Shower_Quantity", label: "Shower", plural: "Showers", priceKey: "Shower_Price", needsPlumbing: true },
    { key: "Shower_Door_Quantity", label: "Shower door", plural: "Shower doors", priceKey: "Shower_Door_Price" },
    { key: "Door_Quantity", label: "Entry door", plural: "Entry doors", priceKey: "Door_Price" },
    { key: "Vanity_Quantity", label: "Vanity", plural: "Vanities", priceKey: "Vanity_Price" },
    { key: "Cabinet_Quantity", label: "Cabinet", plural: "Cabinets", priceKey: "Cabinet_Price" },
    { key: "Mirror_Quantity", label: "Mirror (standard)", plural: "Standard mirrors", priceKey: "Mirror_Price" },
    { key: "Mirror_Huge_Quantity", label: "Mirror (huge)", plural: "Huge mirrors", priceKey: "Mirror_Huge_Price" },
    {
      key: "Shower_Shelf_Quantity",
      label: "Shower shelf",
      plural: "Shower shelves",
      priceKey: "Shower_Shelf_Price",
    },
  ];

  var YES_NO = [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ];

  // The work questions, asked the same way in the public chat and the admin
  // quote. Nothing is pre-selected; every question must be answered.
  var SCOPE_QUESTIONS = [
    { key: "demolition", label: "Remove the existing bathroom first (demolition)?", options: YES_NO },
    {
      key: "floorFinish",
      label: "New floor?",
      options: [
        { value: "tile", label: "Tile" },
        { value: "flooring", label: "Other flooring" },
        { value: "none", label: "None" },
      ],
    },
    {
      // One choice per wall surface, so the same walls can never be charged
      // for both tile and paint.
      key: "walls",
      label: "Walls?",
      options: [
        { value: "tile", label: "Tile (full height)" },
        { value: "paint", label: "Paint" },
        { value: "none", label: "Neither" },
      ],
    },
    { key: "paintCeiling", label: "Paint the ceiling?", options: YES_NO },
  ];

  var DIMENSIONS = [
    { key: "Bathroom_Width_Ft", label: "Width", max: 50 },
    { key: "Bathroom_Length_Ft", label: "Length", max: 50 },
    { key: "Bathroom_Height_Ft", label: "Ceiling height", max: 20 },
  ];

  var MAX_FIXTURE_COUNT = 20;
  var MAX_ELECTRICAL_POINTS = 50;

  function roundCents(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function money(value) {
    var n = Number(value) || 0;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Whole dollars when there are no cents ($60), otherwise cents ($1.79).
  function shortMoney(value) {
    var n = Number(value) || 0;
    return n % 1 === 0 ? "$" + n.toLocaleString("en-US") : money(n);
  }

  function formatQty(n) {
    return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
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

  // Parses a room measurement in feet. Accepts a plain number (5, 5.5, and
  // 5,5 with a decimal comma), feet with a unit (5ft, 5 ft, 5', 5 feet),
  // feet and inches (5'6", 5' 6", 5 ft 6 in, 5 feet 6 inches) or inches
  // alone (66", 66 in). Returns feet, null for blank, or NaN when the entry
  // can't be read (see FEET_FORMAT_HINT).
  var NUM = "(\\d+(?:[.,]\\d+)?|\\.\\d+)";
  var FEET_UNIT = "\\s*(?:'|ft\\.?|foot|feet)";
  var INCH_UNIT = '\\s*(?:"|in\\.?|inch|inches)';
  var FEET_AND_INCHES = new RegExp(
    "^" + NUM + FEET_UNIT + "(?:\\s*,?\\s*(?:and\\s*)?" + NUM + "(?:" + INCH_UNIT + ")?)?$",
  );
  var INCHES_ONLY = new RegExp("^" + NUM + INCH_UNIT + "$");
  var FEET_FORMAT_HINT = "as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6\"";

  function parseFeet(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return isFinite(value) ? value : NaN;
    var s = String(value)
      .trim()
      .toLowerCase()
      .replace(/[’‘′`´]/g, "'")
      .replace(/[”“″]|''/g, '"');
    if (s === "") return null;
    var plain = parseNumber(s.replace(/^(\d+),(\d{1,2})$/, "$1.$2"));
    if (plain !== null && !isNaN(plain)) return plain;
    function num(text) {
      return Number(String(text).replace(",", "."));
    }
    var m = FEET_AND_INCHES.exec(s);
    if (m) {
      var inches = m[2] === undefined ? 0 : num(m[2]);
      if (inches >= 12) return NaN;
      return num(m[1]) + inches / 12;
    }
    m = INCHES_ONLY.exec(s);
    if (m) return num(m[1]) / 12;
    return NaN;
  }

  // Merges any prices saved from the admin "Business Prices" screen over the
  // defaults (admin only — the public estimate always uses DEFAULT_PRICES,
  // i.e. the published prices from site-config.json).
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
    var w = parseFeet(values.Bathroom_Width_Ft) || 0;
    var l = parseFeet(values.Bathroom_Length_Ft) || 0;
    var h = parseFeet(values.Bathroom_Height_Ft) || 0;
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

  // Whether anything priced has been chosen: some work, a fixture, or (with
  // includeTrade, admin only) a plumbing surcharge or electrical point. It
  // looks at what was chosen, not at prices, so a price of 0 doesn't matter.
  function hasChosenWork(values, scope, includeTrade) {
    values = values || {};
    scope = scope || {};
    var needs = scopeNeeds(scope);
    if (needs.floorArea) return true;
    var fixture = FIXTURES.some(function (f) {
      return (parseNumber(values[f.key]) || 0) > 0;
    });
    if (fixture || !includeTrade) return fixture;
    return (
      (parseNumber(values.Electrical_Points) || 0) > 0 ||
      values.No_Stack_Surcharge_Included === true ||
      values.Bad_Valve_Surcharge_Included === true
    );
  }

  var NO_WORK_MESSAGE = {
    public:
      "There's nothing to price yet: enter how many of at least one item above, or go ← Back and choose some work.",
    admin:
      "Nothing to price yet: choose some work, or enter at least one fixture, plumbing surcharge or electrical point, before saving.",
  };

  // Field-level validation shared by the public chat and the admin quote.
  // Returns { valid, errors: { fieldKey: message } }.
  // options.includeTrade also checks the admin-only electrical points.
  // options.requireWork (once every answer is in): at least one priced item
  // must be chosen, so an estimate or quote can never come to $0.00; the
  // problem is reported as errors.work.
  function validateJob(values, scope, options) {
    values = values || {};
    scope = scope || {};
    options = options || {};
    var errors = {};

    SCOPE_QUESTIONS.forEach(function (q) {
      var answered = q.options.some(function (o) {
        return o.value === scope[q.key];
      });
      if (!answered) errors[q.key] = "Choose an answer.";
    });

    var needs = scopeNeeds(scope);
    DIMENSIONS.forEach(function (d) {
      var required = d.key === "Bathroom_Height_Ft" ? needs.height : needs.floorArea;
      var n = parseFeet(values[d.key]);
      var range = "more than 0 and no more than " + d.max + " ft";
      if (n === null) {
        if (required) {
          errors[d.key] =
            "Enter the " + d.label.toLowerCase() + " in feet (" + range + ") — the work you chose is priced by area.";
        }
        return;
      }
      if (isNaN(n)) {
        // The format is the problem, not the size.
        errors[d.key] = "Enter the " + d.label.toLowerCase() + " " + FEET_FORMAT_HINT + ".";
      } else if (n <= 0 || n > d.max) {
        errors[d.key] = d.label + " must be " + range + ".";
      }
    });

    FIXTURES.forEach(function (f) {
      var n = parseNumber(values[f.key]);
      if (n === null) return;
      if (isNaN(n) || n < 0 || n > MAX_FIXTURE_COUNT || Math.floor(n) !== n) {
        errors[f.key] = "Enter a whole number from 0 to " + MAX_FIXTURE_COUNT + ".";
      }
    });

    if (options.includeTrade) {
      var points = parseNumber(values.Electrical_Points);
      if (
        points !== null &&
        (isNaN(points) || points < 0 || points > MAX_ELECTRICAL_POINTS || Math.floor(points) !== points)
      ) {
        errors.Electrical_Points = "Enter a whole number from 0 to " + MAX_ELECTRICAL_POINTS + ".";
      }
    }

    if (options.requireWork && !Object.keys(errors).length && !hasChosenWork(values, scope, options.includeTrade)) {
      errors.work = options.includeTrade ? NO_WORK_MESSAGE.admin : NO_WORK_MESSAGE.public;
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
        detail: formatQty(qty) + " " + unit + " × " + money(rate),
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
        unit: "flat",
        rate: rate,
        cost: roundCents(rate),
        detail: "Flat charge",
      });
    }

    if (scope.demolition === true) {
      addLine("demolition", "Preparation", "Demolition", a.floorSqFt, "sq ft of floor", prices.Demo_Price_Per_SqFt);
    }

    FIXTURES.forEach(function (f) {
      var qty = parseNumber(values[f.key]) || 0;
      addLine(f.key, "Fixtures", f.plural, qty, qty === 1 ? "unit" : "units", fixtureRate(f, prices));
    });

    if (scope.floorFinish === "tile") {
      addLine("floorTile", "Surfaces", "Floor tile", a.floorSqFt, "sq ft", prices.Tile_Price_Per_SqFt);
    } else if (scope.floorFinish === "flooring") {
      addLine("flooring", "Surfaces", "Flooring", a.floorSqFt, "sq ft", prices.Floor_Price_Per_SqFt);
    }
    if (scope.walls === "tile") {
      addLine("wallTile", "Surfaces", "Wall tile (full height)", a.wallSqFt, "sq ft", prices.Tile_Price_Per_SqFt);
    } else if (scope.walls === "paint") {
      addLine("wallPaint", "Surfaces", "Painting (walls)", a.wallSqFt, "sq ft", prices.Painting_Price_Per_SqFt);
    }
    if (scope.paintCeiling === true) {
      addLine("ceilingPaint", "Surfaces", "Painting (ceiling)", a.floorSqFt, "sq ft", prices.Painting_Price_Per_SqFt);
    }

    var fixtureCount = plumbingFixtureCount(values);
    if (options.includeTrade) {
      addLine(
        "plumbing",
        "Plumbing",
        "Plumbing points",
        fixtureCount,
        fixtureCount === 1 ? "point" : "points",
        prices.Plumbing_Price_Per_Point,
      );
      if (values.No_Stack_Surcharge_Included === true) {
        addFlat("noStack", "Plumbing", "No existing plumbing stack", prices.No_Stack_Surcharge_Price);
      }
      if (values.Bad_Valve_Surcharge_Included === true) {
        addFlat("badValve", "Plumbing", "Bad valve replacement", prices.Bad_Valve_Surcharge_Price);
      }
      var points = parseNumber(values.Electrical_Points) || 0;
      addLine(
        "electrical",
        "Electrical",
        "Electrical points",
        points,
        points === 1 ? "point" : "points",
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
    return opt ? opt.label : "Not answered";
  }

  // One line describing the chosen work, e.g. "Demolition: No; new floor:
  // Other flooring; walls: Neither; paint ceiling: No".
  function describeScope(scope) {
    scope = scope || {};
    return (
      "Demolition: " +
      optionLabel("demolition", scope.demolition) +
      "; new floor: " +
      optionLabel("floorFinish", scope.floorFinish) +
      "; walls: " +
      optionLabel("walls", scope.walls) +
      "; paint ceiling: " +
      optionLabel("paintCeiling", scope.paintCeiling)
    );
  }

  // Plain-text list of what an estimate assumed (estimate card and PDFs).
  function estimateAssumptions(values, scope, result) {
    var needs = scopeNeeds(scope);
    var w = formatQty(parseFeet(values.Bathroom_Width_Ft) || 0);
    var l = formatQty(parseFeet(values.Bathroom_Length_Ft) || 0);
    var h = formatQty(parseFeet(values.Bathroom_Height_Ft) || 0);
    var list = [describeScope(scope) + ". Only this work is priced."];
    if (needs.floorArea) {
      list.push(
        "Floor area: " +
          w +
          " × " +
          l +
          " ft = " +
          formatQty(result.floorSqFt) +
          " sq ft (the ceiling is taken to be the same size).",
      );
    }
    if (needs.height) {
      list.push(
        "Wall area: 2 × " +
          h +
          " ft × (" +
          w +
          " + " +
          l +
          " ft) = " +
          formatQty(result.wallSqFt) +
          " sq ft — all four walls, full height, with no deduction for doors, windows, or a tub/shower.",
      );
    }
    list.push("Fixtures are priced per item at our current labor rates, which may change.");
    return list;
  }

  // Readable, editable summary of a public estimate, used to pre-fill the
  // Contact form's project details.
  function buildEstimateSummary(values, scope, result) {
    var out = ["My bathroom estimate from your website:"];
    var needs = scopeNeeds(scope);
    if (needs.floorArea) {
      var dims =
        formatQty(parseFeet(values.Bathroom_Width_Ft)) +
        " ft wide × " +
        formatQty(parseFeet(values.Bathroom_Length_Ft)) +
        " ft long";
      if (needs.height) dims += " × " + formatQty(parseFeet(values.Bathroom_Height_Ft)) + " ft high";
      out.push("- Room: " + dims);
    }
    out.push("- Work: " + describeScope(scope));
    var counts = FIXTURES.filter(function (f) {
      return (parseNumber(values[f.key]) || 0) > 0;
    }).map(function (f) {
      return f.plural + " " + formatQty(parseNumber(values[f.key]));
    });
    out.push("- Fixtures: " + (counts.length ? counts.join(", ") : "none"));
    out.push(
      "- Estimated labor total: " +
        money(result.subtotal) +
        (result.plumbingFixtureCount > 0 ? " (before plumbing)" : "") +
        " — rough and non-binding; excludes plumbing, electrical, materials, permits and taxes.",
    );
    return out.join("\n");
  }

  function isLegacyQuoteData(bathroomData) {
    return !!bathroomData && !(Number(bathroomData.calcVersion) >= CALC_VERSION);
  }

  // Only what other scripts and the tests use.
  var api = {
    CALC_VERSION: CALC_VERSION,
    RATES_KEY: RATES_KEY,
    DEFAULT_PRICES: DEFAULT_PRICES,
    PUBLISHED_PRICES: PUBLISHED_PRICES,
    validatePublishedPrices: validatePublishedPrices,
    setPublishedPrices: setPublishedPrices,
    hasPublishedPrices: hasPublishedPrices,
    PRICE_LABELS: PRICE_LABELS,
    UNPUBLISHED_PRICE_KEYS: UNPUBLISHED_PRICE_KEYS,
    FIXTURES: FIXTURES,
    SCOPE_QUESTIONS: SCOPE_QUESTIONS,
    DIMENSIONS: DIMENSIONS,
    bathtubPrice: bathtubPrice,
    money: money,
    shortMoney: shortMoney,
    formatQty: formatQty,
    parseNumber: parseNumber,
    parseFeet: parseFeet,
    roundCents: roundCents,
    getPrices: getPrices,
    fixtureRate: fixtureRate,
    areas: areas,
    scopeNeeds: scopeNeeds,
    hasChosenWork: hasChosenWork,
    validateJob: validateJob,
    computeEstimate: computeEstimate,
    computePublicEstimate: computePublicEstimate,
    estimateAssumptions: estimateAssumptions,
    buildEstimateSummary: buildEstimateSummary,
    isLegacyQuoteData: isLegacyQuoteData,
  };

  var node = typeof module === "object" && module.exports && typeof require === "function";
  if (node) {
    try {
      // (Through a variable, so the browser-side type check doesn't look for Node's modules.)
      var nodeRequire = require;
      var path = nodeRequire("path");
      var raw = JSON.parse(nodeRequire("fs").readFileSync(path.join(__dirname, "..", "site-config.json"), "utf8"));
      var check = api.validatePublishedPrices(raw.prices);
      if (check.valid) api.setPublishedPrices(check.prices);
    } catch (e) {
      /* unreadable settings: hasPublishedPrices() stays false; the unit tests say why */
    }
    module.exports = api;
  } else {
    /** @type {any} */ (root).BathroomPricing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
