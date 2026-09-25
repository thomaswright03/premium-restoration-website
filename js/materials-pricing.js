// Premium Restoration — materials picker data layer.
//
// MOCK DATA. Every product name, retailer, price and URL below is
// illustrative, not fetched from anywhere real. This file exists so the
// whole materials flow (categories derived from the labor estimate, the
// cheaper-of-two-retailers logic, the ZIP-based regional adjustment, the
// shopping-list summary) can be built and exercised end to end before real
// accounts exist for a live pricing source. IS_MOCK_DATA below drives a
// visible "sample prices" notice in the UI — never remove that notice
// without also replacing the data it warns about.
//
// To go live later:
//   1. Sign up for the Home Depot and/or Lowe's affiliate/data-feed
//      programs (self-serve, free) for real current product + price data.
//   2. Replace getOptionsForCategory() below with a real server-side lookup
//      (a Vercel serverless function, so any retailer API key is never
//      exposed in this public file) returning the same shape: an array of
//      { id, name, retailers: [{ name, price, url }] }.
//   3. Replace mockRegionalFactor() with a real location adjustment (e.g.
//      BEA Regional Price Parities keyed off the ZIP's metro area) or with
//      real per-store pricing if the retailer API supports it.
//   4. Set IS_MOCK_DATA to false.
// Nothing else needs to change — js/script.js only calls the functions
// exposed at the bottom of this file.
//
// Loads as a plain browser script (window.MaterialsPricing) and as a Node
// module (for the unit tests).

(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MaterialsPricing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var IS_MOCK_DATA = true;

  // Categories priced by the gallon (coverage in sq ft per gallon) instead
  // of directly by quantity x price. Everything else in CATALOG is priced
  // qty x unit price, whether qty means "each" or "sq ft".
  var GALLON_CATEGORIES = {
    wallPaint: { coverageSqFtPerGallon: 400 },
    ceilingPaint: { coverageSqFtPerGallon: 400 },
  };

  // The mock catalog, keyed by the same line `key` the labor estimate
  // already produces (js/bathroom-pricing.js FIXTURES keys, or "floorTile" /
  // "flooring" / "wallTile" / "wallPaint" / "ceilingPaint"). Options with
  // more than one entry in `retailers` represent the SAME manufacturer
  // model sold at both stores (e.g. one specific Kohler or American
  // Standard SKU) — the only case where "cheaper of two" is a valid
  // comparison. A single-retailer option represents a store-exclusive
  // private-label product with no equivalent to compare against.
  var TILE_OPTIONS = [
    {
      id: "tile-ceramic-white",
      name: "12x24 white ceramic tile",
      retailers: [{ name: "Home Depot", price: 1.98, url: "https://www.homedepot.com/" }],
    },
    {
      id: "tile-porcelain-wood",
      name: "Wood-look porcelain tile",
      retailers: [{ name: "Lowe's", price: 3.49, url: "https://www.lowes.com/" }],
    },
    {
      id: "tile-marble-look",
      name: "Marble-look porcelain tile",
      retailers: [{ name: "Home Depot", price: 5.98, url: "https://www.homedepot.com/" }],
    },
  ];

  var CATALOG = {
    Toilet_Quantity: [
      {
        id: "toilet-cadet3",
        name: "American Standard Cadet 3 two-piece 1.28 GPF toilet",
        retailers: [
          { name: "Home Depot", price: 228.0, url: "https://www.homedepot.com/" },
          { name: "Lowe's", price: 219.0, url: "https://www.lowes.com/" },
        ],
      },
      {
        id: "toilet-glacier",
        name: "Glacier Bay dual-flush two-piece toilet",
        retailers: [{ name: "Home Depot", price: 148.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "toilet-project-source",
        name: "Project Source round two-piece toilet",
        retailers: [{ name: "Lowe's", price: 138.0, url: "https://www.lowes.com/" }],
      },
    ],
    Sink_Quantity: [
      {
        id: "sink-kohler-caxton",
        name: "Kohler Caxton drop-in bathroom sink",
        retailers: [
          { name: "Home Depot", price: 159.0, url: "https://www.homedepot.com/" },
          { name: "Lowe's", price: 164.0, url: "https://www.lowes.com/" },
        ],
      },
      {
        id: "sink-glacier-oval",
        name: "Glacier Bay oval drop-in sink",
        retailers: [{ name: "Home Depot", price: 69.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "sink-allen-roth",
        name: "allen + roth undermount sink",
        retailers: [{ name: "Lowe's", price: 89.0, url: "https://www.lowes.com/" }],
      },
    ],
    Bathtub_Quantity: [
      {
        id: "tub-american-standard",
        name: "American Standard Cambridge 60 in. alcove tub",
        retailers: [{ name: "Home Depot", price: 449.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "tub-sterling",
        name: "Sterling Ensemble 60 in. alcove tub",
        retailers: [{ name: "Lowe's", price: 399.0, url: "https://www.lowes.com/" }],
      },
    ],
    Shower_Quantity: [
      {
        id: "shower-delta-base",
        name: "Delta 60 in. x 32 in. shower base",
        retailers: [{ name: "Home Depot", price: 329.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "shower-sterling-kit",
        name: "Sterling Advantage shower kit",
        retailers: [{ name: "Lowe's", price: 599.0, url: "https://www.lowes.com/" }],
      },
    ],
    Shower_Door_Quantity: [
      {
        id: "shower-door-delta",
        name: "Delta Classic 400 sliding shower door",
        retailers: [
          { name: "Home Depot", price: 279.0, url: "https://www.homedepot.com/" },
          { name: "Lowe's", price: 289.0, url: "https://www.lowes.com/" },
        ],
      },
      {
        id: "shower-door-basic",
        name: "Basic framed sliding shower door",
        retailers: [{ name: "Home Depot", price: 189.0, url: "https://www.homedepot.com/" }],
      },
    ],
    Door_Quantity: [
      {
        id: "door-6panel",
        name: "6-panel solid core interior door, 32 in.",
        retailers: [{ name: "Home Depot", price: 129.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "door-shaker",
        name: "Shaker flush interior door, 32 in.",
        retailers: [{ name: "Lowe's", price: 145.0, url: "https://www.lowes.com/" }],
      },
    ],
    Vanity_Quantity: [
      {
        id: "vanity-glacier-24",
        name: "24 in. single-sink vanity with cultured marble top",
        retailers: [
          { name: "Home Depot", price: 349.0, url: "https://www.homedepot.com/" },
          { name: "Lowe's", price: 359.0, url: "https://www.lowes.com/" },
        ],
      },
      {
        id: "vanity-allen-roth-30",
        name: "30 in. vanity with quartz top",
        retailers: [{ name: "Lowe's", price: 549.0, url: "https://www.lowes.com/" }],
      },
    ],
    Cabinet_Quantity: [
      {
        id: "cabinet-shaker-white",
        name: "Shaker white bathroom wall cabinet",
        retailers: [{ name: "Home Depot", price: 179.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "cabinet-linen-tower",
        name: "Linen tower storage cabinet",
        retailers: [{ name: "Lowe's", price: 219.0, url: "https://www.lowes.com/" }],
      },
    ],
    Mirror_Quantity: [
      {
        id: "mirror-frameless-24",
        name: "24 in. frameless rectangular mirror",
        retailers: [{ name: "Home Depot", price: 59.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "mirror-framed-oval",
        name: "Framed oval vanity mirror",
        retailers: [{ name: "Lowe's", price: 79.0, url: "https://www.lowes.com/" }],
      },
    ],
    Mirror_Huge_Quantity: [
      {
        id: "mirror-huge-led",
        name: "48 in. LED backlit rectangular mirror",
        retailers: [{ name: "Home Depot", price: 219.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "mirror-huge-framed",
        name: "48 in. framed rectangular mirror",
        retailers: [{ name: "Lowe's", price: 189.0, url: "https://www.lowes.com/" }],
      },
    ],
    Shower_Shelf_Quantity: [
      {
        id: "shelf-niche",
        name: "Recessed tile-in shower niche shelf",
        retailers: [{ name: "Home Depot", price: 45.0, url: "https://www.homedepot.com/" }],
      },
      {
        id: "shelf-corner",
        name: "Corner shower caddy shelf",
        retailers: [{ name: "Lowe's", price: 32.0, url: "https://www.lowes.com/" }],
      },
    ],
    floorTile: TILE_OPTIONS,
    wallTile: TILE_OPTIONS,
    flooring: [
      {
        id: "flooring-vinyl-plank",
        name: "Luxury vinyl plank flooring",
        retailers: [{ name: "Home Depot", price: 3.29, url: "https://www.homedepot.com/" }],
      },
      {
        id: "flooring-laminate",
        name: "Water-resistant laminate flooring",
        retailers: [{ name: "Lowe's", price: 2.79, url: "https://www.lowes.com/" }],
      },
    ],
    wallPaint: [
      {
        id: "paint-behr-eggshell",
        name: "Behr Premium Plus eggshell interior paint (1 gal)",
        retailers: [{ name: "Home Depot", price: 34.98, url: "https://www.homedepot.com/" }],
      },
      {
        id: "paint-valspar-semigloss",
        name: "Valspar Signature semi-gloss interior paint (1 gal)",
        retailers: [{ name: "Lowe's", price: 39.98, url: "https://www.lowes.com/" }],
      },
    ],
    ceilingPaint: [
      {
        id: "paint-ceiling-flat-white",
        name: "Flat white ceiling paint (1 gal)",
        retailers: [{ name: "Home Depot", price: 27.98, url: "https://www.homedepot.com/" }],
      },
      {
        id: "paint-ceiling-stainblock",
        name: "Stain-blocking flat ceiling paint (1 gal)",
        retailers: [{ name: "Lowe's", price: 31.98, url: "https://www.lowes.com/" }],
      },
    ],
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function money(value) {
    var n = Number(value) || 0;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatQty(n) {
    return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  // Deterministic placeholder "regional adjustment" so different ZIP codes
  // visibly change the price shown, demonstrating the mechanic without a
  // real location-pricing source connected yet. NOT real market data.
  function mockRegionalFactor(zip) {
    var digits = String(zip || "").replace(/\D/g, "");
    if (!digits) return 1;
    var sum = 0;
    for (var i = 0; i < digits.length; i++) sum += Number(digits[i]);
    // Spreads to roughly 0.92-1.08 based on the ZIP's digits.
    return round2(0.92 + (sum % 17) / 100);
  }

  // Given one option's retailers (already regionally adjusted), returns the
  // cheapest with a note when there was more than one to compare.
  function bestRetailer(retailers) {
    if (!retailers || !retailers.length) return null;
    var best = retailers[0];
    retailers.forEach(function (r) {
      if (r.price < best.price) best = r;
    });
    var compareNote = null;
    if (retailers.length > 1) {
      var others = retailers.filter(function (r) {
        return r !== best;
      });
      compareNote =
        "Cheaper than " +
        others
          .map(function (r) {
            return r.name + " (" + money(r.price) + ")";
          })
          .join(", ") +
        " for the same product.";
    }
    return { name: best.name, price: best.price, url: best.url, compareNote: compareNote };
  }

  // Which material categories apply to a finished labor estimate, in the
  // same order they were priced. Only categories the customer actually
  // chose get offered — this reads straight off the labor estimate's own
  // line items (js/bathroom-pricing.js computeEstimate), so it can never
  // drift from what was actually priced, and it never needs updating when
  // the scope model changes.
  function categoriesFromLines(lines) {
    return (lines || [])
      .filter(function (l) {
        return l.key !== "demolition" && Object.prototype.hasOwnProperty.call(CATALOG, l.key);
      })
      .map(function (l) {
        return { key: l.key, label: l.label, qty: l.qty, unit: l.unit };
      });
  }

  // Options for one category, regionally adjusted, with the cheapest
  // retailer already resolved per option.
  function getOptionsForCategory(categoryKey, zip) {
    var options = CATALOG[categoryKey] || [];
    var factor = mockRegionalFactor(zip);
    return options.map(function (opt) {
      var adjusted = opt.retailers.map(function (r) {
        return { name: r.name, price: round2(r.price * factor), url: r.url };
      });
      return { id: opt.id, name: opt.name, best: bestRetailer(adjusted) };
    });
  }

  // Cost for one pick: qty x unit price, except paint categories, which are
  // sold by the gallon and only priced in whole-gallon increments. `unit` is
  // the same unit string the labor line already carries (e.g. "sq ft").
  function computeMaterialCost(categoryKey, qty, unit, unitPrice) {
    var gallonInfo = GALLON_CATEGORIES[categoryKey];
    if (gallonInfo) {
      var gallons = Math.max(1, Math.ceil((Number(qty) || 0) / gallonInfo.coverageSqFtPerGallon));
      return {
        quantityLabel: gallons + (gallons === 1 ? " gallon" : " gallons"),
        cost: round2(gallons * unitPrice),
      };
    }
    var q = Number(qty) || 0;
    return { quantityLabel: formatQty(q) + " " + unit, cost: round2(q * unitPrice) };
  }

  return {
    IS_MOCK_DATA: IS_MOCK_DATA,
    CATALOG: CATALOG,
    money: money,
    formatQty: formatQty,
    mockRegionalFactor: mockRegionalFactor,
    bestRetailer: bestRetailer,
    categoriesFromLines: categoriesFromLines,
    getOptionsForCategory: getOptionsForCategory,
    computeMaterialCost: computeMaterialCost,
  };
});
