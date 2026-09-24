// Premium Restoration admin tool — Business Prices: the admin-only prices and tax rate saved in this browser.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // ------------------------------------------------------------------
  // Business prices
  // ------------------------------------------------------------------
  var RATE_SECTIONS = [
    { title: "Preparation", keys: ["Demo_Price_Per_SqFt"] },
    {
      title: "Fixtures",
      note: "The bathtub price isn't set here — it's always 30% less than the shower price.",
      keys: [
        "Toilet_Price",
        "Sink_Price",
        "Shower_Price",
        "Shower_Door_Price",
        "Door_Price",
        "Vanity_Price",
        "Cabinet_Price",
        "Mirror_Price",
        "Mirror_Huge_Price",
        "Shower_Shelf_Price",
      ],
    },
    {
      title: "Surfaces",
      note: "Tile is charged on the floor and/or walls you choose to tile; painting on the walls and/or ceiling you choose to paint; flooring on the floor area.",
      keys: ["Tile_Price_Per_SqFt", "Floor_Price_Per_SqFt", "Painting_Price_Per_SqFt"],
    },
    {
      title: "Plumbing",
      note: "Plumbing points are counted automatically from the toilets, sinks, showers and bathtubs on the quote.",
      keys: ["Plumbing_Price_Per_Point", "No_Stack_Surcharge_Price", "Bad_Valve_Surcharge_Price"],
    },
    { title: "Electrical", keys: ["Electrical_Price_Per_Point"] },
    {
      title: "Tax",
      note: "Leave at 0 unless a tax adviser has confirmed that tax applies to this labor. Any rate set here is added to every bathroom quote.",
      keys: ["Labor_Tax_Rate_Percent"],
    },
  ];

  // What the price fields held when the screen opened, to know whether
  // leaving would throw edits away.
  A.state.ratesBaseline = null;

  function ratesSnapshot() {
    return JSON.stringify(
      Array.prototype.map.call(document.querySelectorAll("#rates-form input[name]"), function (input) {
        return [input.name, input.value.trim()];
      }),
    );
  }

  function ratesDirty() {
    return A.state.ratesBaseline !== null && ratesSnapshot() !== A.state.ratesBaseline;
  }

  function confirmDiscardPrices() {
    return A.confirmAction(
      "Discard price changes?",
      "Your changes to Business Prices haven't been saved.",
      "Discard changes",
    );
  }

  function leavePrices() {
    (ratesDirty() ? confirmDiscardPrices() : Promise.resolve(true)).then(function (discard) {
      if (!discard) return;
      A.state.ratesBaseline = null;
      A.navigate("dashboard");
    });
  }

  function renderRatesForm() {
    var prices = A.Pricing.getPrices();
    var container = document.getElementById("rates-sections");
    container.innerHTML = "";
    RATE_SECTIONS.forEach(function (s) {
      var group = A.el("section", "rate-group");
      group.appendChild(A.el("h2", "rate-group-title", s.title));
      if (s.note) group.appendChild(A.el("p", "rate-group-subtitle", s.note));
      s.keys.forEach(function (key) {
        var isPercent = key === "Labor_Tax_Rate_Percent";
        var row = A.el("div", "rate-row");
        var id = "rate-" + key;
        var label = A.el("label", "rate-row-label", A.Pricing.PRICE_LABELS[key]);
        label.htmlFor = id;
        row.appendChild(label);
        var control = A.el("div", "rate-row-control");
        if (!isPercent) control.appendChild(A.el("span", "rate-row-prefix", "$"));
        var input = A.el("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.id = id;
        input.name = key;
        input.value = prices[key];
        control.appendChild(input);
        if (isPercent) control.appendChild(A.el("span", "rate-row-prefix", "%"));
        row.appendChild(control);
        group.appendChild(row);
      });
      container.appendChild(group);
    });
    A.state.ratesBaseline = ratesSnapshot();
  }

  function handleRatesSubmit(e) {
    e.preventDefault();
    var prices = A.Pricing.getPrices();
    var bad = [];
    Object.keys(A.Pricing.DEFAULT_PRICES).forEach(function (key) {
      var input = /** @type {HTMLInputElement} */ (document.querySelector('#rates-form [name="' + key + '"]'));
      if (!input) return;
      var n = A.Pricing.parseNumber(input.value);
      var invalid = n === null || isNaN(n) || n < 0 || (key === "Labor_Tax_Rate_Percent" && n > 100);
      input.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid) bad.push(input);
      else prices[key] = n;
    });
    if (bad.length) {
      A.alertError("Some prices aren't valid numbers (0 or more). Fix the highlighted fields and save again.");
      bad[0].focus();
      return;
    }
    if (!A.writeJson(A.Pricing.RATES_KEY, { prices: prices })) return A.alertError(A.STORAGE_ERROR);
    A.state.ratesBaseline = null;
    A.toast("Business prices saved.", "dashboard");
    A.navigate("dashboard");
  }

  // Used by the other parts of the admin tool.
  A.ratesDirty = ratesDirty;
  A.confirmDiscardPrices = confirmDiscardPrices;
  A.leavePrices = leavePrices;
  A.renderRatesForm = renderRatesForm;
  A.handleRatesSubmit = handleRatesSubmit;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
