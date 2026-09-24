// Premium Restoration — shared bathroom pricing model.
//
// Single source of truth for the bathroom labor calculator's prices and
// line items, used by BOTH the admin quoting tool (js/admin.js) and the
// public site's chat quote assistant (js/script.js), so the two can never
// drift apart. This list is intentionally limited to exactly the charges
// the business owner gave — do not add line items back in without new
// pricing info from the owner.
//
// Labor only. Materials, permits, and profit margin are never included.

(function (global) {
  "use strict";

  var RATES_KEY = "pr_business_rates";

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
    // Owner-confirmed: $5 per sq ft of bathroom floor (replaces the old
    // flat $500 / $700 tiers, which contradicted the owner's stated price).
    Floor_Price_Per_SqFt: 5,
    Painting_Price_Per_SqFt: 1.79,

    Plumbing_Price_Per_Point: 300,
    No_Stack_Surcharge_Price: 1000,
    Bad_Valve_Surcharge_Price: 400,

    Electrical_Price_Per_Point: 100,

    Tax_Rate_Percent: 7.45,
  };

  var PRICE_LABELS = {
    Demo_Price_Per_SqFt: "Demolition price (per sq ft of bathroom floor)",

    Toilet_Price: "Toilet install price (each)",
    Sink_Price: "Sink install price (each)",
    Shower_Price: "Shower install price (each)",
    Shower_Door_Price: "Shower door install price (each)",
    Door_Price: "Bathroom entry door install price (each)",
    Vanity_Price: "Vanity install price (each)",
    Cabinet_Price: "Cabinet price (each)",
    Mirror_Price: "Mirror install price (each, standard size)",
    Mirror_Huge_Price: "Mirror install price (each, huge/oversized)",
    Shower_Shelf_Price: "Built-in shower shelf price (each)",

    Tile_Price_Per_SqFt: "Tile install price (per sq ft — floor + walls combined, no ceiling)",
    Floor_Price_Per_SqFt: "Flooring price (per sq ft of bathroom floor)",
    Painting_Price_Per_SqFt: "Painting price (per sq ft — ceiling + walls combined, no floor)",

    Plumbing_Price_Per_Point: "Plumbing price (per point of entry — one per toilet, sink, shower, and bathtub)",
    No_Stack_Surcharge_Price: "Surcharge: no existing plumbing stack (flat, added on top)",
    Bad_Valve_Surcharge_Price: "Surcharge: bad valve needs replacing (flat, added on top)",

    Electrical_Price_Per_Point: "Electrical price (per point of entry — lamps, outlets, fans, fan switches, light switches, electric toilet)",

    Tax_Rate_Percent: "Sales tax rate (%)",
  };

  // Bathtub price isn't set directly — it's always 30% less than the
  // current shower price, per the business owner.
  function bathtubPrice(prices) {
    return (prices.Shower_Price || 0) * 0.7;
  }

  // pattern "flat" = qty x flat price (or item.derivedPrice(prices) when set)
  // pattern "flatToggle" = a single yes/no inclusion x flat price
  // pattern "flatSum" = sum of shared quantities x flat price
  // pattern "flatTier" = one shared quantity picks between two flat prices at a threshold
  var BATHROOM_LINE_ITEMS = [
    { section: "A. Preparation", label: "Demolition", pattern: "flat",
      qtyVar: "Bathroom_SqFt", qtyLabel: "Bathroom sq ft (floor, being demolished)", unit: "sq ft",
      priceKey: "Demo_Price_Per_SqFt" },

    { section: "B. Fixtures", label: "Toilet", pattern: "flat",
      qtyVar: "Toilet_Quantity", qtyLabel: "Toilets to install", unit: "units",
      priceKey: "Toilet_Price" },
    { section: "B. Fixtures", label: "Sink", pattern: "flat",
      qtyVar: "Sink_Quantity", qtyLabel: "Sinks to install", unit: "units",
      priceKey: "Sink_Price" },
    { section: "B. Fixtures", label: "Bathtub", pattern: "flat",
      qtyVar: "Bathtub_Quantity", qtyLabel: "Bathtubs to install", unit: "units",
      derivedPrice: bathtubPrice },
    { section: "B. Fixtures", label: "Shower", pattern: "flat",
      qtyVar: "Shower_Quantity", qtyLabel: "Showers to install", unit: "units",
      priceKey: "Shower_Price" },
    { section: "B. Fixtures", label: "Shower Door", pattern: "flat",
      qtyVar: "Shower_Door_Quantity", qtyLabel: "Shower doors to install", unit: "units",
      priceKey: "Shower_Door_Price" },
    { section: "B. Fixtures", label: "Entry Door", pattern: "flat",
      qtyVar: "Door_Quantity", qtyLabel: "Entry doors to install", unit: "doors",
      priceKey: "Door_Price" },
    { section: "B. Fixtures", label: "Vanity", pattern: "flat",
      qtyVar: "Vanity_Quantity", qtyLabel: "Vanities to install", unit: "units",
      priceKey: "Vanity_Price" },
    { section: "B. Fixtures", label: "Cabinets", pattern: "flat",
      qtyVar: "Cabinet_Quantity", qtyLabel: "Cabinets to install", unit: "units",
      priceKey: "Cabinet_Price" },
    { section: "B. Fixtures", label: "Mirror (standard)", pattern: "flat",
      qtyVar: "Mirror_Quantity", qtyLabel: "Standard mirrors to install", unit: "units",
      priceKey: "Mirror_Price" },
    { section: "B. Fixtures", label: "Mirror (huge)", pattern: "flat",
      qtyVar: "Mirror_Huge_Quantity", qtyLabel: "Huge/oversized mirrors to install", unit: "units",
      priceKey: "Mirror_Huge_Price" },
    { section: "B. Fixtures", label: "Shower Shelf", pattern: "flat",
      qtyVar: "Shower_Shelf_Quantity", qtyLabel: "Built-in shower shelves", unit: "units",
      priceKey: "Shower_Shelf_Price" },

    { section: "C. Surfaces", label: "Tile", pattern: "flatSum",
      qtyVars: [
        { varName: "Bathroom_SqFt", label: "Bathroom sq ft (floor, for tile)", unit: "sq ft" },
        { varName: "Wall_SqFt", label: "Wall sq ft (for tile)", unit: "sq ft" },
      ],
      priceKey: "Tile_Price_Per_SqFt" },
    { section: "C. Surfaces", label: "Floor", pattern: "flat",
      qtyVar: "Bathroom_SqFt", qtyLabel: "Bathroom sq ft (floor)", unit: "sq ft",
      priceKey: "Floor_Price_Per_SqFt" },
    { section: "C. Surfaces", label: "Painting", pattern: "flatSum",
      qtyVars: [
        { varName: "Bathroom_SqFt", label: "Bathroom sq ft (ceiling, for paint)", unit: "sq ft" },
        { varName: "Wall_SqFt", label: "Wall sq ft (for paint)", unit: "sq ft" },
      ],
      priceKey: "Painting_Price_Per_SqFt" },

    { section: "D. Plumbing", label: "Plumbing", pattern: "flatSum",
      qtyVars: [
        { varName: "Toilet_Quantity", label: "Toilets", unit: "units" },
        { varName: "Sink_Quantity", label: "Sinks", unit: "units" },
        { varName: "Shower_Quantity", label: "Showers", unit: "units" },
        { varName: "Bathtub_Quantity", label: "Bathtubs", unit: "units" },
      ],
      priceKey: "Plumbing_Price_Per_Point" },
    { section: "D. Plumbing", label: "No Existing Stack", pattern: "flatToggle",
      toggleVar: "No_Stack_Surcharge_Included", toggleLabel: "No existing plumbing stack (add surcharge)",
      priceKey: "No_Stack_Surcharge_Price" },
    { section: "D. Plumbing", label: "Bad Valve", pattern: "flatToggle",
      toggleVar: "Bad_Valve_Surcharge_Included", toggleLabel: "Bad valve needs replacing (add surcharge)",
      priceKey: "Bad_Valve_Surcharge_Price" },

    { section: "E. Electrical", label: "Electrical", pattern: "flat",
      qtyVar: "Electrical_Points", qtyLabel: "Points of electrical entry (lamps, outlets, fans, fan switches, light switches, electric toilet)", unit: "points",
      priceKey: "Electrical_Price_Per_Point" },
  ];

  function money(value) {
    var n = Number(value) || 0;
    return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Merges any prices saved from the admin "Business Prices" screen (same
  // localStorage key, same origin) over the defaults above.
  function getPrices() {
    var prices = Object.assign({}, DEFAULT_PRICES);
    try {
      var saved = JSON.parse(localStorage.getItem(RATES_KEY));
      if (saved) Object.assign(prices, saved.prices || {});
    } catch (e) {
      /* fall back to defaults */
    }
    return prices;
  }

  // Given raw width/length/height (feet), fills in the derived
  // Bathroom_SqFt (floor/ceiling) and Wall_SqFt values on jobValues.
  function deriveDimensions(jobValues) {
    var w = parseFloat(jobValues.Bathroom_Width_Ft) || 0;
    var l = parseFloat(jobValues.Bathroom_Length_Ft) || 0;
    var h = parseFloat(jobValues.Bathroom_Height_Ft) || 0;
    jobValues.Bathroom_SqFt = w * l;
    jobValues.Wall_SqFt = 2 * h * (w + l);
    return jobValues;
  }

  function computeLineItemCost(item, jobValues, prices) {
    if (item.pattern === "flat") {
      var qty = parseFloat(jobValues[item.qtyVar]) || 0;
      var price = item.derivedPrice ? item.derivedPrice(prices) : prices[item.priceKey] || 0;
      return qty * price;
    }
    if (item.pattern === "flatSum") {
      var total = item.qtyVars.reduce(function (sum, v) {
        return sum + (parseFloat(jobValues[v.varName]) || 0);
      }, 0);
      return total * (prices[item.priceKey] || 0);
    }
    if (item.pattern === "flatTier") {
      var q = parseFloat(jobValues[item.qtyVar]) || 0;
      if (q <= 0) return 0;
      return q > item.tierThreshold ? prices[item.tierHighKey] || 0 : prices[item.tierLowKey] || 0;
    }
    if (item.pattern === "flatToggle") {
      return jobValues[item.toggleVar] ? prices[item.priceKey] || 0 : 0;
    }
    return 0;
  }

  // Pure calculator: given plain job values (and optionally prices, else
  // getPrices() is used), returns the full itemized breakdown.
  function computeBathroomTotal(jobValues, prices) {
    prices = prices || getPrices();
    var lineResults = [];
    var subtotal = 0;
    BATHROOM_LINE_ITEMS.forEach(function (item) {
      var cost = computeLineItemCost(item, jobValues, prices);
      lineResults.push({ section: item.section, label: item.label, cost: cost });
      subtotal += cost;
    });
    var taxRatePercent = prices.Tax_Rate_Percent || 0;
    var taxAmount = subtotal * (taxRatePercent / 100);
    return {
      lineResults: lineResults,
      subtotal: subtotal,
      taxRatePercent: taxRatePercent,
      taxAmount: taxAmount,
      total: subtotal + taxAmount,
    };
  }

  global.BathroomPricing = {
    DEFAULT_PRICES: DEFAULT_PRICES,
    PRICE_LABELS: PRICE_LABELS,
    BATHROOM_LINE_ITEMS: BATHROOM_LINE_ITEMS,
    bathtubPrice: bathtubPrice,
    money: money,
    getPrices: getPrices,
    deriveDimensions: deriveDimensions,
    computeLineItemCost: computeLineItemCost,
    computeBathroomTotal: computeBathroomTotal,
  };
})(window);
