// Premium Restoration — internal quoting tool
//
// SECURITY NOTE: This password gate is client-side only (no backend exists
// yet). Anyone who views this file's source can read the password and skip
// straight to the dashboard. It only deters casual access — do not treat
// this as real authentication once the site has a backend or goes live.

(function () {
  "use strict";

  var ADMIN_PASSWORD = "templein26)";
  var AUTH_KEY = "pr_admin_authed";
  var QUOTES_KEY = "pr_quotes";
  var RATES_KEY = "pr_business_rates";

  // Retention for quotes that didn't lead to work, in days. Leave as null
  // until the business has chosen its [RETENTION PERIOD] (it must match the
  // public Privacy Notice). Once set, the dashboard flags quotes not
  // updated within that many days and offers a one-click purge.
  var QUOTE_RETENTION_DAYS = null;

  var CATEGORY_LABELS = {
    exterior: "Exterior",
    kitchen: "Kitchen",
    bathroom: "Bathroom",
    flooring: "Flooring",
  };

  var CATEGORY_ORDER = ["exterior", "kitchen", "bathroom", "flooring"];

  var EXTERIOR_OPTIONS = [
    "Siding",
    "Stucco",
    "Brick/Masonry",
    "Exterior Paint",
    "Roof",
    "Gutters",
    "Windows",
    "Doors",
    "Deck/Patio",
    "Fence",
    "Driveway/Walkway",
    "Exterior Drywall/Trim",
    "Water/Damage Restoration",
    "Other",
  ];

  // type: "toggle" (checkbox + notes), "select" (dropdown incl. N/A),
  // "number", "text", "yesno" (Yes/No/N-A select)
  var KITCHEN_FIELDS = [
    { key: "cabinets", label: "Cabinets", type: "select", options: ["Repair", "Refinish", "Repaint", "Replace"] },
    { key: "cabinetCount", label: "Number of cabinets/doors/drawers", type: "number" },
    { key: "countertops", label: "Countertops", type: "select", options: ["Repair", "Replace"] },
    { key: "backsplash", label: "Backsplash", type: "select", options: ["Repair", "Replace"] },
    { key: "flooring", label: "Flooring", type: "toggle" },
    { key: "sinkFaucet", label: "Sink/Faucet", type: "toggle" },
    { key: "appliances", label: "Appliances", type: "toggle" },
    { key: "paintingDrywall", label: "Painting/Drywall", type: "toggle" },
    { key: "plumbing", label: "Plumbing", type: "toggle" },
    { key: "electrical", label: "Electrical", type: "toggle" },
    { key: "lighting", label: "Lighting", type: "toggle" },
    { key: "demolition", label: "Demolition/Removal", type: "toggle" },
  ];

  var FLOORING_FIELDS = [
    { key: "flooringType", label: "Flooring Type", type: "text" },
    { key: "squareFootage", label: "Square Footage", type: "number" },
    { key: "existingFlooringType", label: "Existing Flooring Type", type: "text" },
    { key: "removeExisting", label: "Remove Existing Flooring?", type: "yesno" },
    { key: "subfloorCondition", label: "Subfloor Condition", type: "select", options: ["Good", "Fair", "Poor", "Unknown"] },
    { key: "repairLevelSubfloor", label: "Repair/Level Subfloor?", type: "yesno" },
    { key: "newFlooringMaterial", label: "New Flooring Material", type: "text" },
    { key: "underlayment", label: "Underlayment", type: "text" },
    { key: "trimBaseboards", label: "Trim/Baseboards", type: "toggle" },
    { key: "transitions", label: "Transitions", type: "toggle" },
    { key: "stairs", label: "Stairs", type: "toggle" },
    { key: "furnitureMoving", label: "Furniture Moving", type: "toggle" },
  ];

  var CATEGORY_FIELDS = {
    kitchen: KITCHEN_FIELDS,
    flooring: FLOORING_FIELDS,
  };

  // ---------------------------------------------------------------------
  // Bathroom labor price calculator (website version) — flat per-unit
  // prices, since that's how this business actually charges: quantity x a
  // single $ price per unit. No hours, no hourly rates. Materials are
  // never included in any of these figures.
  //
  // The actual prices and line-item list live in js/bathroom-pricing.js,
  // shared with the public site's chat quote assistant so the two can
  // never drift apart — this file only handles rendering/interaction.
  //
  // NOTE: the standalone terminal tool (quote_calculator.py) intentionally
  // keeps the original hours x rate model from labor_cost_breakdown.xlsx —
  // this website version is a separate, simpler pricing structure and the
  // two are not meant to match line-for-line.
  // ---------------------------------------------------------------------

  var DEFAULT_PRICES = BathroomPricing.DEFAULT_PRICES;
  var PRICE_LABELS = BathroomPricing.PRICE_LABELS;
  var bathtubPrice = BathroomPricing.bathtubPrice;
  var money = BathroomPricing.money;

  var RATES_SECTION_NOTES = {
    "B. Fixtures": 'Bathtub price isn’t set here — it’s automatically 30% less than the shower price above.',
    "C. Surfaces": "Tile applies to combined floor + wall sq ft (no ceiling). Painting applies to combined ceiling + wall sq ft (no floor). “Floor” is charged per sq ft of bathroom floor.",
    "D. Plumbing": "Points of plumbing entry are counted automatically from the toilets, sinks, showers, and bathtubs entered above — plus either surcharge below when it applies.",
    "E. Electrical": "Charged per point of electrical entry — lamps, outlets, fans, fan switches, light switches, and an electric toilet each count as one point.",
  };

  // The line-item list itself (which fields exist, and their formulas) also
  // lives in js/bathroom-pricing.js — see the comment above.
  var BATHROOM_LINE_ITEMS = BathroomPricing.BATHROOM_LINE_ITEMS;

  var BATHROOM_SECTION_ORDER = [];
  BATHROOM_LINE_ITEMS.forEach(function (item) {
    if (BATHROOM_SECTION_ORDER.indexOf(item.section) === -1) {
      BATHROOM_SECTION_ORDER.push(item.section);
    }
  });

  // ---------- state ----------
  var editingQuoteId = null; // set when reopening a saved quote

  // ---------- screen helpers ----------
  function showScreen(id) {
    document.querySelectorAll(".admin-screen").forEach(function (el) {
      el.hidden = el.id !== id;
    });
    window.scrollTo(0, 0);
  }

  // ---------- storage helpers ----------
  function getQuotes() {
    try {
      return JSON.parse(localStorage.getItem(QUOTES_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveQuotes(quotes) {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
  }

  function getRates() {
    return { prices: BathroomPricing.getPrices() };
  }

  function saveRates(prices) {
    localStorage.setItem(RATES_KEY, JSON.stringify({ prices: prices }));
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ---------- auth ----------
  function isAuthed() {
    return sessionStorage.getItem(AUTH_KEY) === "true";
  }

  function handleLogin(e) {
    e.preventDefault();
    var input = document.getElementById("login-password");
    var error = document.getElementById("login-error");
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "true");
      error.hidden = true;
      input.value = "";
      renderDashboard();
      showScreen("screen-dashboard");
    } else {
      error.hidden = false;
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    showScreen("screen-login");
  }

  // ---------- business rates & hours ----------
  function openRatesScreen() {
    renderRatesForm();
    showScreen("screen-rates");
  }

  // Group price fields by the same sections the bathroom form uses, so the
  // settings screen is organized the same way as the quote itself.
  var PRICE_KEYS_BY_SECTION = {};
  BATHROOM_LINE_ITEMS.forEach(function (item) {
    var keys = [];
    if (item.priceKey) keys.push(item.priceKey);
    if (item.tierLowKey) keys.push(item.tierLowKey);
    if (item.tierHighKey) keys.push(item.tierHighKey);
    if (!keys.length) return; // e.g. Bathtub, which has a derived price instead
    if (!PRICE_KEYS_BY_SECTION[item.section]) PRICE_KEYS_BY_SECTION[item.section] = [];
    keys.forEach(function (key) {
      if (PRICE_KEYS_BY_SECTION[item.section].indexOf(key) === -1) {
        PRICE_KEYS_BY_SECTION[item.section].push(key);
      }
    });
  });

  function renderRatesForm() {
    var current = getRates();
    var container = document.getElementById("rates-sections");
    container.innerHTML = "";

    BATHROOM_SECTION_ORDER.forEach(function (sectionName, idx) {
      var group = document.createElement("div");
      var heading = '<h2 class="rate-group-title"' + (idx > 0 ? ' style="margin-top:36px;"' : "") + ">" + sectionName + "</h2>";
      if (RATES_SECTION_NOTES[sectionName]) {
        heading += '<p class="rate-group-subtitle">' + RATES_SECTION_NOTES[sectionName] + "</p>";
      }
      group.innerHTML = heading;
      (PRICE_KEYS_BY_SECTION[sectionName] || []).forEach(function (key) {
        group.appendChild(buildRateRow(key, PRICE_LABELS[key], current.prices[key]));
      });
      container.appendChild(group);
    });

    // Tax isn't tied to any one line item — it applies to the whole
    // bathroom subtotal — so it gets its own section at the end.
    var taxGroup = document.createElement("div");
    taxGroup.innerHTML =
      '<h2 class="rate-group-title" style="margin-top:36px;">Tax</h2>' +
      '<p class="rate-group-subtitle">Leave at 0 unless a tax adviser has confirmed that tax applies to this labor. Any rate set here is added to the subtotal of every bathroom quote.</p>';
    taxGroup.appendChild(
      buildRateRow("Labor_Tax_Rate_Percent", PRICE_LABELS.Labor_Tax_Rate_Percent, current.prices.Labor_Tax_Rate_Percent, "%")
    );
    container.appendChild(taxGroup);
  }

  function buildRateRow(name, label, value, symbol) {
    symbol = symbol || "$";
    var isPercent = symbol === "%";
    var row = document.createElement("div");
    row.className = "rate-row";

    var labelEl = document.createElement("div");
    labelEl.className = "rate-row-label";
    labelEl.textContent = label;
    row.appendChild(labelEl);

    var controlEl = document.createElement("div");
    controlEl.className = "rate-row-control";

    var prefix = document.createElement("span");
    prefix.className = "rate-row-prefix";
    prefix.textContent = symbol;
    if (!isPercent) controlEl.appendChild(prefix);

    var input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "any";
    input.name = name;
    input.value = value !== undefined && value !== null ? value : "";
    controlEl.appendChild(input);
    if (isPercent) controlEl.appendChild(prefix);

    row.appendChild(controlEl);
    return row;
  }

  function handleRatesSubmit(e) {
    e.preventDefault();
    var current = getRates();
    var prices = Object.assign({}, current.prices);

    Object.keys(DEFAULT_PRICES).forEach(function (key) {
      var input = document.querySelector('#rates-form [name="' + key + '"]');
      prices[key] = input && input.value !== "" ? parseFloat(input.value) : prices[key];
    });

    saveRates(prices);
    renderDashboard();
    showScreen("screen-dashboard");
  }

  // ---------- retention ----------
  function isPastRetention(quote) {
    if (!QUOTE_RETENTION_DAYS) return false;
    var last = new Date(quote.updatedAt || quote.createdAt).getTime();
    if (isNaN(last)) return false;
    return Date.now() - last > QUOTE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  function renderRetentionBar(quotes) {
    var bar = document.getElementById("retention-bar");
    if (!bar) return;
    var expired = quotes.filter(isPastRetention);
    bar.innerHTML = "";
    bar.hidden = expired.length === 0;
    if (!expired.length) return;

    var text = document.createElement("p");
    text.textContent =
      expired.length + (expired.length === 1 ? " quote has" : " quotes have") +
      " not been updated in over " + QUOTE_RETENTION_DAYS + " days. Delete any that didn't lead to work.";
    bar.appendChild(text);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline-dark";
    btn.textContent = "Delete Quotes Past Retention";
    btn.addEventListener("click", function () {
      if (!confirm("Delete " + expired.length + " quote(s) not updated in over " + QUOTE_RETENTION_DAYS +
        " days? Only continue if none of them led to work. This cannot be undone.")) return;
      var expiredIds = expired.map(function (q) {
        return q.id;
      });
      saveQuotes(getQuotes().filter(function (q) {
        return expiredIds.indexOf(q.id) === -1;
      }));
      renderDashboard();
    });
    bar.appendChild(btn);
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    var quotes = getQuotes().slice().sort(function (a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    var list = document.getElementById("quote-list");
    var empty = document.getElementById("quote-list-empty");
    list.innerHTML = "";
    renderRetentionBar(quotes);

    if (quotes.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    quotes.forEach(function (quote) {
      var card = document.createElement("div");
      card.className = "quote-card";

      var main = document.createElement("div");
      main.className = "quote-card-main";

      var h3 = document.createElement("h3");
      h3.textContent = quote.address;
      main.appendChild(h3);

      var meta = document.createElement("div");
      meta.className = "quote-card-meta";
      meta.textContent =
        (quote.createdAt ? "Created " + formatDate(quote.createdAt) + " · " : "") +
        "Updated " + formatDate(quote.updatedAt);
      main.appendChild(meta);

      var chips = document.createElement("div");
      chips.className = "quote-chips";
      quote.categories.forEach(function (cat) {
        var chip = document.createElement("span");
        chip.className = "quote-chip";
        chip.textContent = CATEGORY_LABELS[cat] || cat;
        chips.appendChild(chip);
      });
      if (quote.data && quote.data.bathroom && quote.data.bathroom.totalPrice > 0) {
        var priceChip = document.createElement("span");
        priceChip.className = "quote-chip quote-price-chip";
        priceChip.textContent = "Bathroom: " + money(quote.data.bathroom.totalPrice);
        chips.appendChild(priceChip);
      }
      if (isPastRetention(quote)) {
        var retentionChip = document.createElement("span");
        retentionChip.className = "quote-chip quote-retention-chip";
        retentionChip.textContent = "Past retention period";
        chips.appendChild(retentionChip);
      }
      main.appendChild(chips);

      var actions = document.createElement("div");
      actions.className = "quote-card-actions";

      var viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.textContent = "View / Edit";
      viewBtn.addEventListener("click", function () {
        openQuoteForEdit(quote.id);
      });

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        if (confirm('Delete the quote for "' + quote.address + '"? This cannot be undone.')) {
          saveQuotes(getQuotes().filter(function (q) {
            return q.id !== quote.id;
          }));
          renderDashboard();
        }
      });

      actions.appendChild(viewBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(main);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  // ---------- step 1: address + categories ----------
  function resetStep1() {
    editingQuoteId = null;
    document.getElementById("quote-address").value = "";
    document.querySelectorAll('input[name="category"]').forEach(function (cb) {
      cb.checked = false;
    });
    document.getElementById("step1-error").hidden = true;
  }

  function openNewQuote() {
    resetStep1();
    showScreen("screen-step1");
  }

  function openQuoteForEdit(id) {
    var quote = getQuotes().find(function (q) {
      return q.id === id;
    });
    if (!quote) return;
    editingQuoteId = id;
    document.getElementById("quote-address").value = quote.address;
    document.querySelectorAll('input[name="category"]').forEach(function (cb) {
      cb.checked = quote.categories.indexOf(cb.value) !== -1;
    });
    buildStep2(quote.address, quote.categories, quote.data);
    showScreen("screen-step2");
  }

  function handleStep1Submit(e) {
    e.preventDefault();
    var address = document.getElementById("quote-address").value.trim();
    var categories = Array.prototype.slice
      .call(document.querySelectorAll('input[name="category"]:checked'))
      .map(function (cb) {
        return cb.value;
      });
    // Keep a stable, predictable order regardless of checkbox click order
    categories = CATEGORY_ORDER.filter(function (c) {
      return categories.indexOf(c) !== -1;
    });

    if (!address || categories.length === 0) {
      document.getElementById("step1-error").hidden = false;
      return;
    }
    document.getElementById("step1-error").hidden = true;

    var existingData = {};
    if (editingQuoteId) {
      var quote = getQuotes().find(function (q) {
        return q.id === editingQuoteId;
      });
      if (quote) existingData = quote.data || {};
    }

    buildStep2(address, categories, existingData);
    showScreen("screen-step2");
  }

  // ---------- step 2: category detail fields ----------
  function fieldControlHtml(category, field, savedValue) {
    var name = category + "__" + field.key;

    if (field.type === "select") {
      var opts = ['<option value="">N/A</option>']
        .concat(
          field.options.map(function (o) {
            var sel = savedValue === o ? " selected" : "";
            return '<option value="' + o + '"' + sel + ">" + o + "</option>";
          })
        )
        .join("");
      return '<select name="' + name + '">' + opts + "</select>";
    }

    if (field.type === "yesno") {
      var yn = ["Yes", "No"];
      var ynOpts = ['<option value="">N/A</option>']
        .concat(
          yn.map(function (o) {
            var sel = savedValue === o ? " selected" : "";
            return '<option value="' + o + '"' + sel + ">" + o + "</option>";
          })
        )
        .join("");
      return '<select name="' + name + '">' + ynOpts + "</select>";
    }

    if (field.type === "number") {
      var numVal = savedValue !== undefined && savedValue !== null ? savedValue : "";
      return '<input type="number" min="0" name="' + name + '" value="' + numVal + '" />';
    }

    if (field.type === "text") {
      var textVal = savedValue || "";
      return '<input type="text" name="' + name + '" value="' + escapeHtml(textVal) + '" />';
    }

    // toggle: checkbox handled in row label; here we render the notes input
    var notesVal = (savedValue && savedValue.notes) || "";
    var included = !!(savedValue && savedValue.included);
    return (
      '<input type="text" name="' +
      name +
      '__notes" placeholder="Notes (optional)" value="' +
      escapeHtml(notesVal) +
      '"' +
      (included ? "" : " hidden") +
      " />"
    );
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildBathroomLineItemRow(item, jobValues, renderedVars, lineItemEls, config) {
    var wrapper = document.createElement("div");

    var row = document.createElement("div");
    row.className = "line-item-row";
    wrapper.appendChild(row);

    var labelEl = document.createElement("div");
    labelEl.className = "line-item-label";
    labelEl.textContent = item.label;
    row.appendChild(labelEl);

    var inputsWrap = document.createElement("div");
    inputsWrap.className = "line-item-inputs";
    row.appendChild(inputsWrap);

    var costEl = document.createElement("div");
    costEl.className = "line-item-cost zero";
    costEl.textContent = "—";
    row.appendChild(costEl);

    function getOrCreateVarInput(varName, labelText, unit, defaultVal) {
      if (renderedVars[varName]) {
        var note = document.createElement("span");
        note.className = "reused-note";
        note.textContent = "same " + labelText.toLowerCase() + " as above";
        inputsWrap.appendChild(note);
        return renderedVars[varName];
      }
      var input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.placeholder = "0";
      var savedVal = jobValues[varName];
      input.value = savedVal !== undefined && savedVal !== null ? savedVal : defaultVal !== undefined ? defaultVal : "";
      var unitEl = document.createElement("span");
      unitEl.className = "unit-label";
      unitEl.textContent = labelText + (unit ? " (" + unit + ")" : "");
      inputsWrap.appendChild(unitEl);
      inputsWrap.appendChild(input);
      renderedVars[varName] = input;
      return input;
    }

    var inputs = [];
    var compute;
    var getExtra;

    if (item.pattern === "flat") {
      // Fixed labor price per unit -- quantity x a single flat $ price
      // (or item.derivedPrice(prices) for a price computed from another one).
      var flatQtyInput = getOrCreateVarInput(item.qtyVar, item.qtyLabel, item.unit);
      inputs.push(flatQtyInput);
      compute = function () {
        var qty = parseFloat(flatQtyInput.value) || 0;
        var price = item.derivedPrice ? item.derivedPrice(config.prices) : config.prices[item.priceKey] || 0;
        return { cost: qty * price };
      };
    } else if (item.pattern === "flatSum") {
      // Two shared quantities (e.g. floor sq ft + wall sq ft) added together,
      // x a single flat $ price.
      var sumInputs = item.qtyVars.map(function (v) {
        return getOrCreateVarInput(v.varName, v.label, v.unit);
      });
      inputs = inputs.concat(sumInputs);
      compute = function () {
        var total = sumInputs.reduce(function (sum, inp) {
          return sum + (parseFloat(inp.value) || 0);
        }, 0);
        var price = config.prices[item.priceKey] || 0;
        return { cost: total * price };
      };
    } else if (item.pattern === "flatTier") {
      // A shared quantity picks between two flat $ prices at a threshold
      // (e.g. bathroom sq ft over/under 50 picks the small/large flat price).
      var tierQtyInput = getOrCreateVarInput(item.qtyVar, item.qtyLabel, item.unit);
      inputs.push(tierQtyInput);
      compute = function () {
        var qty = parseFloat(tierQtyInput.value) || 0;
        if (qty <= 0) return { cost: 0 };
        var price = qty > item.tierThreshold ? config.prices[item.tierHighKey] : config.prices[item.tierLowKey];
        return { cost: price || 0 };
      };
    } else if (item.pattern === "flatToggle") {
      // A single yes/no inclusion x a flat $ price -- there's only ever
      // one of these per job (e.g. final cleanup), not a countable quantity.
      var savedToggle = jobValues[item.toggleVar];
      var toggleLabel = document.createElement("label");
      toggleLabel.className = "wiring-status-option";
      var toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = !!savedToggle;
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(document.createTextNode(item.toggleLabel));
      inputsWrap.appendChild(toggleLabel);
      inputs.push(toggleInput);
      compute = function () {
        var price = config.prices[item.priceKey] || 0;
        return { cost: toggleInput.checked ? price : 0 };
      };
      getExtra = function () {
        var extra = {};
        extra[item.toggleVar] = toggleInput.checked;
        return extra;
      };
    }

    lineItemEls.push({ costEl: costEl, compute: compute, inputs: inputs, getExtra: getExtra });
    return wrapper;
  }

  // Type the room's width/length/height once and every line item that needs
  // floor (=ceiling) sq ft or wall sq ft reuses the calculated value, via the
  // same renderedVars sharing mechanism used elsewhere in this calculator.
  function renderBathroomDimensions(jobValues, renderedVars) {
    var wrap = document.createElement("div");
    wrap.className = "bathroom-subsection bathroom-dimensions";

    var title = document.createElement("h3");
    title.className = "bathroom-subsection-title";
    title.textContent = "Bathroom Dimensions";
    wrap.appendChild(title);

    var hint = document.createElement("p");
    hint.className = "rate-group-subtitle";
    hint.textContent =
      "Enter the room's width, length, and height once — floor/ceiling and wall square footage below are calculated automatically and reused everywhere they're needed.";
    wrap.appendChild(hint);

    var inputRow = document.createElement("div");
    inputRow.className = "line-item-row";

    function dimInput(varName, labelText) {
      var savedVal = jobValues[varName];
      var input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.placeholder = "0";
      input.value = savedVal !== undefined && savedVal !== null ? savedVal : "";
      var unitEl = document.createElement("span");
      unitEl.className = "unit-label";
      unitEl.textContent = labelText + " (ft)";
      inputRow.appendChild(unitEl);
      inputRow.appendChild(input);
      renderedVars[varName] = input;
      return input;
    }

    var widthInput = dimInput("Bathroom_Width_Ft", "Width");
    var lengthInput = dimInput("Bathroom_Length_Ft", "Length");
    var heightInput = dimInput("Bathroom_Height_Ft", "Height");
    wrap.appendChild(inputRow);

    var computedRow = document.createElement("div");
    computedRow.className = "line-item-row";

    function computedInput(labelText) {
      var unitEl = document.createElement("span");
      unitEl.className = "unit-label";
      unitEl.textContent = labelText;
      var input = document.createElement("input");
      input.type = "number";
      input.readOnly = true;
      input.tabIndex = -1;
      input.className = "computed-input";
      computedRow.appendChild(unitEl);
      computedRow.appendChild(input);
      return input;
    }

    var sqftInput = computedInput("Floor / ceiling sq ft (auto)");
    var wallInput = computedInput("Wall sq ft (auto)");
    wrap.appendChild(computedRow);

    renderedVars["Bathroom_SqFt"] = sqftInput;
    renderedVars["Wall_SqFt"] = wallInput;

    function recomputeDims() {
      var w = parseFloat(widthInput.value) || 0;
      var l = parseFloat(lengthInput.value) || 0;
      var h = parseFloat(heightInput.value) || 0;
      sqftInput.value = w * l || "";
      wallInput.value = 2 * h * (w + l) || "";
      sqftInput.dispatchEvent(new Event("input", { bubbles: true }));
      wallInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Back-compat: an older saved quote may have a manually-entered
    // Bathroom_SqFt/Wall_SqFt with no dimensions behind it yet.
    if (jobValues.Bathroom_Width_Ft || jobValues.Bathroom_Length_Ft || jobValues.Bathroom_Height_Ft) {
      recomputeDims();
    } else {
      sqftInput.value = jobValues.Bathroom_SqFt !== undefined ? jobValues.Bathroom_SqFt : "";
      wallInput.value = jobValues.Wall_SqFt !== undefined ? jobValues.Wall_SqFt : "";
    }

    [widthInput, lengthInput, heightInput].forEach(function (input) {
      input.addEventListener("input", recomputeDims);
      input.addEventListener("change", recomputeDims);
    });

    return wrap;
  }

  function renderBathroomCalculator(savedData) {
    savedData = savedData || {};
    var jobValues = savedData.jobValues || {};
    var config = getRates();

    var wrap = document.createElement("div");
    wrap.className = "bathroom-calculator";

    var renderedVars = {};
    var lineItemEls = [];

    wrap.appendChild(renderBathroomDimensions(jobValues, renderedVars));

    BATHROOM_SECTION_ORDER.forEach(function (sectionName) {
      var subsection = document.createElement("div");
      subsection.className = "bathroom-subsection";

      var title = document.createElement("h3");
      title.className = "bathroom-subsection-title";
      title.textContent = sectionName;
      subsection.appendChild(title);

      BATHROOM_LINE_ITEMS.filter(function (i) {
        return i.section === sectionName;
      }).forEach(function (item) {
        subsection.appendChild(buildBathroomLineItemRow(item, jobValues, renderedVars, lineItemEls, config));
      });

      wrap.appendChild(subsection);
    });

    var banner = document.createElement("div");
    banner.className = "bathroom-total-banner";
    banner.innerHTML =
      '<div class="bathroom-total-line">' +
        '<span class="label">Subtotal</span><span class="value" data-role="subtotal">$0.00</span>' +
      '</div>' +
      '<div class="bathroom-total-line">' +
        '<span class="label" data-role="tax-label">Tax</span><span class="value" data-role="tax">$0.00</span>' +
      '</div>' +
      '<div class="bathroom-total-line main">' +
        '<span class="label">Total Bathroom Price</span><span class="value" data-role="price">$0.00</span>' +
      '</div>';
    wrap.appendChild(banner);

    var subtotalEl = banner.querySelector('[data-role="subtotal"]');
    var taxLabelEl = banner.querySelector('[data-role="tax-label"]');
    var taxEl = banner.querySelector('[data-role="tax"]');
    var priceEl = banner.querySelector('[data-role="price"]');

    function recomputeAll() {
      var subtotal = 0;
      lineItemEls.forEach(function (entry) {
        var r = entry.compute();
        entry.costEl.textContent = r.cost > 0 ? money(r.cost) : "—";
        entry.costEl.classList.toggle("zero", r.cost <= 0);
        subtotal += r.cost;
      });
      var taxRatePercent = config.prices.Labor_Tax_Rate_Percent || 0;
      var taxAmount = subtotal * (taxRatePercent / 100);
      subtotalEl.textContent = money(subtotal);
      taxLabelEl.textContent = "Tax (" + taxRatePercent + "%)";
      taxEl.textContent = money(taxAmount);
      priceEl.textContent = money(subtotal + taxAmount);
    }

    lineItemEls.forEach(function (entry) {
      entry.inputs.forEach(function (input) {
        input.addEventListener("input", recomputeAll);
        input.addEventListener("change", recomputeAll);
      });
    });

    wrap.getData = function () {
      var jobValuesOut = {};
      Object.keys(renderedVars).forEach(function (varName) {
        jobValuesOut[varName] = parseFloat(renderedVars[varName].value) || 0;
      });
      lineItemEls.forEach(function (entry) {
        if (entry.getExtra) Object.assign(jobValuesOut, entry.getExtra());
      });
      var lineResults = [];
      var subtotal = 0;
      BATHROOM_LINE_ITEMS.forEach(function (item, idx) {
        var r = lineItemEls[idx].compute();
        lineResults.push({ section: item.section, label: item.label, cost: r.cost });
        subtotal += r.cost;
      });
      var taxRatePercent = config.prices.Labor_Tax_Rate_Percent || 0;
      var taxAmount = subtotal * (taxRatePercent / 100);
      return {
        jobValues: jobValuesOut,
        lineResults: lineResults,
        subtotal: subtotal,
        taxRatePercent: taxRatePercent,
        taxAmount: taxAmount,
        totalPrice: subtotal + taxAmount,
      };
    };

    recomputeAll();
    return wrap;
  }

  function renderCategorySection(category, savedData) {
    savedData = savedData || {};
    var label = CATEGORY_LABELS[category];
    var section = document.createElement("div");
    section.className = "category-section";
    section.dataset.category = category;

    var h2 = document.createElement("h2");
    h2.textContent = label;
    section.appendChild(h2);

    if (category === "exterior") {
      var savedTypes = savedData.types || [];
      var savedOther = savedData.otherText || "";

      var row = document.createElement("div");
      row.className = "field-row";
      row.style.flexDirection = "column";
      row.style.alignItems = "stretch";

      var rowLabel = document.createElement("div");
      rowLabel.className = "field-row-label";
      rowLabel.style.marginBottom = "12px";
      rowLabel.textContent = "Type of Exterior Work (select one or multiple)";
      row.appendChild(rowLabel);

      var grid = document.createElement("div");
      grid.className = "exterior-options";
      EXTERIOR_OPTIONS.forEach(function (opt) {
        var optLabel = document.createElement("label");
        optLabel.className = "exterior-option";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.name = "exterior__types";
        cb.value = opt;
        cb.checked = savedTypes.indexOf(opt) !== -1;
        optLabel.appendChild(cb);
        optLabel.appendChild(document.createTextNode(opt));
        grid.appendChild(optLabel);
      });
      row.appendChild(grid);

      var otherWrap = document.createElement("div");
      otherWrap.className = "exterior-other-input";
      var otherInput = document.createElement("input");
      otherInput.type = "text";
      otherInput.name = "exterior__otherText";
      otherInput.placeholder = "Describe “Other” exterior work";
      otherInput.value = savedOther;
      otherWrap.appendChild(otherInput);
      row.appendChild(otherWrap);

      section.appendChild(row);
      return section;
    }

    if (category === "bathroom") {
      section.appendChild(renderBathroomCalculator(savedData));
      return section;
    }

    var fields = CATEGORY_FIELDS[category] || [];
    fields.forEach(function (field) {
      var fieldRow = document.createElement("div");
      fieldRow.className = "field-row";

      var rowLabel = document.createElement("div");
      rowLabel.className = "field-row-label";

      if (field.type === "toggle") {
        var savedVal = savedData[field.key];
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.name = field.key + "__included";
        cb.dataset.category = category;
        cb.dataset.key = field.key;
        cb.checked = !!(savedVal && savedVal.included);
        rowLabel.appendChild(cb);
        rowLabel.appendChild(document.createTextNode(field.label));
      } else {
        rowLabel.textContent = field.label;
      }
      fieldRow.appendChild(rowLabel);

      var controlWrap = document.createElement("div");
      controlWrap.className = "field-row-control";
      controlWrap.innerHTML = fieldControlHtml(category, field, savedData[field.key]);
      fieldRow.appendChild(controlWrap);

      section.appendChild(fieldRow);
    });

    return section;
  }

  function buildStep2(address, categories, savedData) {
    savedData = savedData || {};
    document.getElementById("step2-address-label").textContent = address;
    var container = document.getElementById("step2-sections");
    container.innerHTML = "";
    container.dataset.address = address;
    container.dataset.categories = JSON.stringify(categories);

    categories.forEach(function (cat) {
      container.appendChild(renderCategorySection(cat, savedData[cat]));
    });

    // Wire up toggle checkboxes to show/hide their notes input
    container.querySelectorAll('input[type="checkbox"][data-key]').forEach(function (cb) {
      cb.addEventListener("change", function () {
        var row = cb.closest(".field-row");
        var notesInput = row.querySelector('input[name$="__notes"]');
        if (notesInput) notesInput.hidden = !cb.checked;
      });
    });
  }

  function collectStep2Data() {
    var container = document.getElementById("step2-sections");
    var categories = JSON.parse(container.dataset.categories || "[]");
    var data = {};

    categories.forEach(function (category) {
      if (category === "exterior") {
        var types = Array.prototype.slice
          .call(container.querySelectorAll('input[name="exterior__types"]:checked'))
          .map(function (cb) {
            return cb.value;
          });
        var otherText = container.querySelector('input[name="exterior__otherText"]').value.trim();
        data.exterior = { types: types, otherText: otherText };
        return;
      }

      if (category === "bathroom") {
        var bathroomEl = container.querySelector(".bathroom-calculator");
        data.bathroom = bathroomEl && bathroomEl.getData
          ? bathroomEl.getData()
          : { jobValues: {}, lineResults: [], totalHours: 0, totalPrice: 0 };
        return;
      }

      var fields = CATEGORY_FIELDS[category] || [];
      var catData = {};
      fields.forEach(function (field) {
        var name = category + "__" + field.key;
        if (field.type === "toggle") {
          var cb = container.querySelector('input[name="' + field.key + '__included"][data-category="' + category + '"]');
          var notesInput = container.querySelector('input[name="' + name + '__notes"]');
          catData[field.key] = {
            included: !!(cb && cb.checked),
            notes: notesInput ? notesInput.value.trim() : "",
          };
        } else {
          var el = container.querySelector('[name="' + name + '"]');
          catData[field.key] = el ? el.value : "";
        }
      });
      data[category] = catData;
    });

    return data;
  }

  function handleStep2Submit(e) {
    e.preventDefault();
    var container = document.getElementById("step2-sections");
    var address = container.dataset.address;
    var categories = JSON.parse(container.dataset.categories || "[]");
    var data = collectStep2Data();
    var now = new Date().toISOString();

    var quotes = getQuotes();

    if (editingQuoteId) {
      quotes = quotes.map(function (q) {
        if (q.id !== editingQuoteId) return q;
        return Object.assign({}, q, { address: address, categories: categories, data: data, updatedAt: now });
      });
    } else {
      quotes.push({
        id: "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        address: address,
        categories: categories,
        data: data,
        createdAt: now,
        updatedAt: now,
      });
    }

    saveQuotes(quotes);
    editingQuoteId = null;
    renderDashboard();
    showScreen("screen-dashboard");
  }

  // ---------- wire up ----------
  document.addEventListener("DOMContentLoaded", function () {
    if (isAuthed()) {
      renderDashboard();
      showScreen("screen-dashboard");
    } else {
      showScreen("screen-login");
    }

    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
    document.getElementById("create-quote-btn").addEventListener("click", openNewQuote);
    document.getElementById("open-rates-btn").addEventListener("click", openRatesScreen);
    document.getElementById("rates-form").addEventListener("submit", handleRatesSubmit);
    document.getElementById("step1-form").addEventListener("submit", handleStep1Submit);
    document.getElementById("step2-form").addEventListener("submit", handleStep2Submit);

    document.querySelectorAll('[data-action="back-to-dashboard"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderDashboard();
        showScreen("screen-dashboard");
      });
    });

    document.querySelectorAll('[data-action="back-to-step1"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        showScreen("screen-step1");
      });
    });
  });
})();
