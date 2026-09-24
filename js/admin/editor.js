// Premium Restoration admin tool — The quote screen: property and customer details, and the bathroom
// calculator. Every row shows its own cost in one right-hand column; the
// numbers all come from Pricing.computeEstimate.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // Job-value thresholds for Utah's small-project exemption from contractor
  // licensing (Utah Code 58-55-305(1)(h); Utah is assumed, not confirmed).
  // They only show a warning on the quote and never change a price. Change
  // them only on a lawyer's advice.
  var JOB_VALUE_CHECKPOINTS = { affirmation: 3000, exemptionCap: 7000 };

  var LICENCE_NOTES = {
    Fixtures:
      "No contractor licence is currently held. Toilets, sinks, showers and bathtubs also need plumbing work: agree who will do it with the customer before any work is agreed.",
    Plumbing:
      "No contractor licence is currently held. Get legal advice on who may do plumbing work before quoting it, and tell the customer who will do it before any work is agreed.",
    Electrical:
      "No contractor licence is currently held. Get legal advice on who may do electrical work before quoting it, and tell the customer who will do it before any work is agreed.",
  };

  function cancelQuote() {
    (A.isDirty() ? A.confirmDiscardQuote(A.state.draft) : Promise.resolve(true)).then(function (discard) {
      if (!discard) return;
      A.clearDraft();
      A.state.currentRoute = "dashboard";
      A.navigate("dashboard");
    });
  }

  // ------------------------------------------------------------------
  // Property and customer (top of the quote screen)
  // ------------------------------------------------------------------
  var CUSTOMER_FIELDS = { name: "quote-customer-name", phone: "quote-customer-phone", email: "quote-customer-email" };

  function renderQuoteHeader() {
    document.getElementById("quote-eyebrow").textContent = A.state.draft.isNew ? "New Quote" : "Editing Quote";
    /** @type {HTMLInputElement} */ (document.getElementById("quote-address")).value = A.state.draft.address || "";
    var customer = A.cleanCustomer(A.state.draft.customer);
    Object.keys(CUSTOMER_FIELDS).forEach(function (key) {
      /** @type {HTMLInputElement} */ (document.getElementById(CUSTOMER_FIELDS[key])).value = customer[key];
    });
    ["quote-address", "quote-customer-phone", "quote-customer-email"].forEach(function (id) {
      setInputError(id, null);
    });
  }

  function setInputError(id, message) {
    var input = document.getElementById(id);
    var error = document.getElementById(id + "-error");
    if (message) error.textContent = message;
    error.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    input.closest(".form-group").classList.toggle("has-error", !!message);
  }

  // Address is required; the customer's details are optional but must look
  // right if given. Returns the id of the first field with a problem.
  function validateQuoteHeader() {
    var problems = {};
    if (!String(A.state.draft.address || "").trim()) problems["quote-address"] = "Enter the property address.";
    var c = A.cleanCustomer(A.state.draft.customer);
    var digits = c.phone.replace(/\D/g, "");
    if (c.phone && (!/^[0-9+().\-\s]+$/.test(c.phone) || digits.length < 10 || digits.length > 15)) {
      problems["quote-customer-phone"] = "Enter a phone number with 10 to 15 digits, or leave it blank.";
    }
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) {
      problems["quote-customer-email"] = "Enter an email address like name@example.com, or leave it blank.";
    }
    var first = null;
    ["quote-address", "quote-customer-phone", "quote-customer-email"].forEach(function (id) {
      setInputError(id, problems[id] || null);
      if (problems[id] && !first) first = id;
    });
    return first;
  }

  // ------------------------------------------------------------------
  // The bathroom calculator. Every row shows its own cost in one
  // right-hand column; the numbers all come from Pricing.computeEstimate.
  // ------------------------------------------------------------------
  var calc = null; // { costCells: [{ el, keys }], errorEls: {}, recompute }

  function jobValueWarning(laborSubtotal) {
    var cap = JOB_VALUE_CHECKPOINTS.exemptionCap;
    var affirmation = JOB_VALUE_CHECKPOINTS.affirmation;
    if (laborSubtotal >= cap) {
      return (
        "Labor alone is " +
        A.money(laborSubtotal) +
        ", at or above " +
        A.money(cap) +
        ". Utah's small-project exemption from contractor licensing (if Utah law applies) only covers jobs under " +
        A.money(cap) +
        " including materials. Get legal advice before quoting this job."
      );
    }
    if (laborSubtotal >= affirmation) {
      return (
        "Labor alone is " +
        A.money(laborSubtotal) +
        ", at or above " +
        A.money(affirmation) +
        ", before materials. Above " +
        A.money(affirmation) +
        " (labor plus materials), Utah's small-project exemption needs an insurance affirmation filed, and it ends at " +
        A.money(cap) +
        ". Get legal advice before quoting this job."
      );
    }
    return (
      "Labor only. Add the cost of materials before comparing this job with the " +
      A.money(affirmation) +
      " and " +
      A.money(cap) +
      " licensing thresholds."
    );
  }

  var uid = 0;

  function calcRow(labelText, control, costKeys, hint) {
    var row = A.el("div", "calc-row");
    var labelWrap = A.el("div", "calc-label");
    var id = "calc-" + ++uid;
    var label = A.el(control.isGroup ? "p" : "label", "calc-label-text", labelText);
    label.id = id + "-label";
    if (!control.isGroup) label.htmlFor = id;
    labelWrap.appendChild(label);
    if (hint) labelWrap.appendChild(A.el("span", "calc-hint", hint));
    row.appendChild(labelWrap);

    var controlWrap = A.el("div", "calc-control");
    if (control.isGroup) control.node.setAttribute("aria-labelledby", label.id);
    else control.node.id = id;
    controlWrap.appendChild(control.node);
    var error = A.el("p", "calc-error");
    error.hidden = true;
    error.id = id + "-error";
    control.node.setAttribute("aria-describedby", error.id);
    controlWrap.appendChild(error);
    row.appendChild(controlWrap);

    var cost = A.el("div", "calc-cost");
    cost.setAttribute("aria-live", "off");
    row.appendChild(cost);
    if (costKeys) calc.costCells.push({ el: cost, keys: costKeys });
    else cost.classList.add("is-empty");
    return { row: row, error: error };
  }

  function numberInput(key, inputmode) {
    var input = A.el("input", "calc-input");
    input.type = "text";
    input.inputMode = inputmode || "numeric";
    input.autocomplete = "off";
    input.placeholder = "0";
    input.name = key;
    input.value = A.state.draft.values[key] !== undefined ? A.state.draft.values[key] : "";
    input.addEventListener("input", function () {
      A.state.draft.values[key] = input.value.trim();
      if (A.state.draft.values[key] === "") delete A.state.draft.values[key];
      onChange(key);
    });
    return { node: input };
  }

  function choiceGroup(question) {
    var group = A.el("div", "calc-choices");
    group.setAttribute("role", "radiogroup");
    var name = "scope-" + question.key;
    question.options.forEach(function (option, i) {
      var label = A.el("label", "calc-choice");
      var input = A.el("input");
      input.type = "radio";
      input.name = name;
      input.value = String(i);
      input.checked = A.state.draft.scope[question.key] === option.value;
      input.addEventListener("change", function () {
        A.state.draft.scope[question.key] = option.value;
        onChange(question.key);
      });
      label.appendChild(input);
      label.appendChild(A.el("span", null, option.label));
      group.appendChild(label);
    });
    return { node: group, isGroup: true };
  }

  function checkbox(key, text) {
    var label = A.el("label", "calc-check");
    var input = A.el("input");
    input.type = "checkbox";
    input.checked = A.state.draft.values[key] === true;
    input.addEventListener("change", function () {
      if (input.checked) A.state.draft.values[key] = true;
      else delete A.state.draft.values[key];
      onChange(key);
    });
    label.appendChild(input);
    label.appendChild(A.el("span", null, text));
    return { node: label, isGroup: true };
  }

  function section(title, note) {
    var wrap = A.el("section", "calc-section");
    wrap.appendChild(A.el("h2", "calc-section-title", title));
    if (note) wrap.appendChild(A.el("p", "admin-warning-inline", note));
    return wrap;
  }

  function onChange(key) {
    if (calc.errorEls[key]) setFieldError(key, null);
    refreshErrorSummary();
    A.persistDraft();
    calc.recompute();
  }

  // "Fix the N highlighted answers" counts only what is still highlighted,
  // and goes away once every answer has been fixed.
  function errorSummaryText(count) {
    return "Fix the " + (count === 1 ? "highlighted answer" : count + " highlighted answers") + " before saving.";
  }

  // "Nothing to price yet" goes as soon as some work is chosen.
  function refreshErrorSummary() {
    var box = document.getElementById("quote-error");
    if (box.hidden) return;
    var kind = box.getAttribute("data-kind");
    if (kind === "work") {
      if (A.Pricing.hasChosenWork(A.state.draft.values, A.state.draft.scope, true)) box.hidden = true;
      return;
    }
    if (kind !== "validation") return;
    var count = document.querySelectorAll("#screen-quote .has-error").length;
    if (count) box.textContent = errorSummaryText(count);
    else box.hidden = true;
  }

  function setFieldError(key, message) {
    var e = calc.errorEls[key];
    if (!e) return;
    e.error.textContent = message || "";
    e.error.hidden = !message;
    e.row.classList.toggle("has-error", !!message);
    var input = e.row.querySelector(".calc-input");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function legacyNotice() {
    var legacy = A.state.draft.legacy;
    var legacyBox = A.el("div", "admin-warning");
    legacyBox.setAttribute("data-testid", "legacy-notice");
    var text =
      "This quote was saved with the old calculator, which charged demolition, tile, flooring and painting for every room" +
      (legacy.total ? " (it came to " + A.money(legacy.total) + ")" : "") +
      ". The work it included wasn't recorded, so choose the work below. The saved total only changes when you save.";
    if (!legacy.hadDimensions && (legacy.floorSqFt || legacy.wallSqFt)) {
      text +=
        " It had no room dimensions — only " +
        A.Pricing.formatQty(legacy.floorSqFt) +
        " sq ft of floor and " +
        A.Pricing.formatQty(legacy.wallSqFt) +
        " sq ft of wall — so enter the width, length and height.";
    }
    legacyBox.appendChild(A.el("p", null, text));
    return legacyBox;
  }

  // Room size: width, length and height, with the areas they give.
  function roomSizeSection() {
    var dims = section("Room size");
    dims.appendChild(
      A.el(
        "p",
        "calc-help",
        "Only needed for work priced by area (demolition, floor, walls, ceiling). Feet (5.5) or feet and inches (5' 6\") both work. Floor area = width × length; wall area = 2 × height × (width + length).",
      ),
    );
    var dimGrid = A.el("div", "calc-dims");
    A.Pricing.DIMENSIONS.forEach(function (d) {
      var field = A.el("div", "calc-dim");
      var id = "calc-" + ++uid;
      var label = A.el("label", "calc-label-text", d.label + " (ft)");
      label.htmlFor = id;
      var input = numberInput(d.key, "text").node;
      input.id = id;
      input.placeholder = "e.g. 5' 6\"";
      var error = A.el("p", "calc-error");
      error.hidden = true;
      error.id = id + "-error";
      input.setAttribute("aria-describedby", error.id);
      field.appendChild(label);
      field.appendChild(input);
      field.appendChild(error);
      dimGrid.appendChild(field);
      calc.errorEls[d.key] = { row: field, error: error };
    });
    dims.appendChild(dimGrid);
    var areaText = A.el("p", "calc-areas");
    areaText.setAttribute("aria-live", "polite");
    dims.appendChild(areaText);
    return { section: dims, areaText: areaText };
  }

  function workSection() {
    var work = section("Work");
    var workCosts = {
      demolition: ["demolition"],
      floorFinish: ["floorTile", "flooring"],
      walls: ["wallTile", "wallPaint"],
      paintCeiling: ["ceilingPaint"],
    };
    A.Pricing.SCOPE_QUESTIONS.forEach(function (q) {
      var r = calcRow(q.label, choiceGroup(q), workCosts[q.key]);
      calc.errorEls[q.key] = r;
      work.appendChild(r.row);
    });
    return work;
  }

  function fixturesSection(prices) {
    var fixtures = section("Fixtures", LICENCE_NOTES.Fixtures);
    A.Pricing.FIXTURES.forEach(function (f) {
      var r = calcRow(
        f.plural,
        numberInput(f.key),
        [f.key],
        A.Pricing.shortMoney(A.Pricing.fixtureRate(f, prices)) + " each",
      );
      calc.errorEls[f.key] = r;
      fixtures.appendChild(r.row);
    });
    return fixtures;
  }

  function plumbingSection(prices) {
    var plumbing = section("Plumbing", LICENCE_NOTES.Plumbing);
    var pointsOut = A.el("output", "calc-readout");
    var pointsRow = calcRow(
      "Plumbing points",
      { node: pointsOut },
      ["plumbing"],
      "One per toilet, sink, shower and bathtub above — " +
        A.Pricing.shortMoney(prices.Plumbing_Price_Per_Point) +
        " each",
    );
    plumbing.appendChild(pointsRow.row);
    plumbing.appendChild(
      calcRow(
        "No existing plumbing stack",
        checkbox("No_Stack_Surcharge_Included", "Add surcharge"),
        ["noStack"],
        A.Pricing.shortMoney(prices.No_Stack_Surcharge_Price) + " flat",
      ).row,
    );
    plumbing.appendChild(
      calcRow(
        "Bad valve needs replacing",
        checkbox("Bad_Valve_Surcharge_Included", "Add surcharge"),
        ["badValve"],
        A.Pricing.shortMoney(prices.Bad_Valve_Surcharge_Price) + " flat",
      ).row,
    );
    return { section: plumbing, pointsOut: pointsOut };
  }

  function electricalSection(prices) {
    var electrical = section("Electrical", LICENCE_NOTES.Electrical);
    var er = calcRow(
      "Electrical points",
      numberInput("Electrical_Points"),
      ["electrical"],
      "Lamps, outlets, fans, switches, electric toilet — " +
        A.Pricing.shortMoney(prices.Electrical_Price_Per_Point) +
        " each",
    );
    calc.errorEls.Electrical_Points = er;
    electrical.appendChild(er.row);
    return electrical;
  }

  // Subtotal → Tax → Total, and the licensing-threshold note under it.
  function totalsBanner(root) {
    var banner = A.el("div", "bathroom-total-banner");
    banner.setAttribute("aria-live", "polite");
    function totalLine(labelText, role, main) {
      var line = A.el("div", "bathroom-total-line" + (main ? " main" : ""));
      var label = A.el("span", "label", labelText);
      var value = A.el("span", "value", "$0.00");
      value.setAttribute("data-role", role);
      line.appendChild(label);
      line.appendChild(value);
      banner.appendChild(line);
      return { label: label, value: value };
    }
    var totals = {
      subtotal: totalLine("Subtotal", "subtotal"),
      tax: totalLine("Tax", "tax"),
      total: totalLine("Total Bathroom Price", "price", true),
      note: A.el("p", "admin-warning-inline"),
    };
    root.appendChild(banner);
    root.appendChild(totals.note);
    return totals;
  }

  // Refreshes every row's cost, the areas, the plumbing points and the totals.
  function recompute(prices, parts) {
    var result = A.Pricing.computeEstimate(A.state.draft.values, A.state.draft.scope, {
      prices: prices,
      includeTrade: true,
    });
    var byKey = {};
    result.lines.forEach(function (l) {
      byKey[l.key] = l;
    });
    calc.costCells.forEach(function (cell) {
      /** @type {PricingLine | null} */
      var line = null;
      cell.keys.forEach(function (k) {
        if (byKey[k]) line = byKey[k];
      });
      cell.el.innerHTML = "";
      cell.el.appendChild(A.el("span", "calc-cost-value", line ? A.money(line.cost) : "—"));
      if (line) cell.el.appendChild(A.el("span", "calc-cost-detail", line.detail));
      cell.el.classList.toggle("is-zero", !line);
    });
    parts.pointsOut.textContent = A.Pricing.formatQty(result.plumbingFixtureCount);
    var needs = A.Pricing.scopeNeeds(A.state.draft.scope);
    parts.areaText.textContent =
      "Floor / ceiling: " +
      A.Pricing.formatQty(result.floorSqFt) +
      " sq ft · Walls: " +
      A.Pricing.formatQty(result.wallSqFt) +
      " sq ft" +
      (needs.floorArea ? "" : " (not used by the work chosen so far)");
    parts.totals.subtotal.value.textContent = A.money(result.subtotal);
    parts.totals.tax.label.textContent = "Tax (" + result.taxRatePercent + "%)";
    parts.totals.tax.value.textContent = A.money(result.taxAmount);
    parts.totals.total.value.textContent = A.money(result.total);
    parts.totals.note.textContent = jobValueWarning(result.subtotal);
    return result;
  }

  function renderEditor() {
    var prices = A.Pricing.getPrices();
    calc = { costCells: [], errorEls: {}, recompute: null };
    renderQuoteHeader();
    document.getElementById("quote-error").hidden = true;
    var saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("save-quote-btn"));
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Quote";

    var container = document.getElementById("quote-sections");
    container.innerHTML = "";
    var root = A.el("div", "bathroom-calculator");
    if (A.state.draft.legacy) root.appendChild(legacyNotice());
    var drift = A.buildPriceDriftNotice();
    if (drift) root.appendChild(drift);

    var room = roomSizeSection();
    root.appendChild(room.section);
    root.appendChild(workSection());
    root.appendChild(fixturesSection(prices));
    var plumbing = plumbingSection(prices);
    root.appendChild(plumbing.section);
    root.appendChild(electricalSection(prices));
    var parts = { areaText: room.areaText, pointsOut: plumbing.pointsOut, totals: totalsBanner(root) };

    calc.recompute = function () {
      return recompute(prices, parts);
    };
    container.appendChild(root);
    calc.recompute();
  }

  var saving = false;

  function handleQuoteSubmit(e) {
    e.preventDefault();
    if (saving || !A.state.draft) return;
    var errorBox = document.getElementById("quote-error");
    var firstHeaderProblem = validateQuoteHeader();
    // A quote with no work chosen is refused rather than saved at $0.00.
    var validation = A.Pricing.validateJob(A.state.draft.values, A.state.draft.scope, {
      includeTrade: true,
      requireWork: true,
    });
    Object.keys(calc.errorEls).forEach(function (key) {
      setFieldError(key, validation.errors[key] || null);
    });
    if (firstHeaderProblem || !validation.valid) {
      var highlighted = document.querySelectorAll("#screen-quote .has-error").length;
      errorBox.textContent = highlighted ? errorSummaryText(highlighted) : validation.errors.work;
      errorBox.setAttribute("data-kind", highlighted ? "validation" : "work");
      errorBox.hidden = false;
      if (firstHeaderProblem) {
        document.getElementById(firstHeaderProblem).focus();
        return;
      }
      var firstKey = Object.keys(calc.errorEls).filter(function (k) {
        return validation.errors[k];
      })[0];
      var first = firstKey
        ? calc.errorEls[firstKey].row.querySelector("input")
        : document.querySelector("#quote-sections .calc-choices input");
      if (first) first.focus();
      return;
    }
    errorBox.hidden = true;

    saving = true;
    var saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("save-quote-btn"));
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    var prices = A.Pricing.getPrices();
    var now = new Date().toISOString();
    // Measurements are stored in feet (5' 6" is saved as 5.5), and the total
    // is worked out from exactly what is stored, so the PDF always matches.
    var jobValues = {};
    A.VALUE_KEYS.forEach(function (key) {
      var v = A.state.draft.values[key];
      if (typeof v === "boolean") jobValues[key] = v;
      else if (A.DIMENSION_KEYS.indexOf(key) !== -1)
        jobValues[key] = Math.round((A.Pricing.parseFeet(v) || 0) * 1e4) / 1e4;
      else jobValues[key] = A.Pricing.parseNumber(v) || 0;
    });
    var result = A.Pricing.computeEstimate(jobValues, A.state.draft.scope, { prices: prices, includeTrade: true });
    var bathroom = {
      calcVersion: A.Pricing.CALC_VERSION,
      jobValues: jobValues,
      scope: Object.assign({}, A.state.draft.scope),
      prices: prices,
      lines: result.lines,
      subtotal: result.subtotal,
      taxRatePercent: result.taxRatePercent,
      taxAmount: result.taxAmount,
      totalPrice: result.total,
    };

    // Insert or update by the draft's id, so pressing Save twice can never
    // create two quotes.
    var quotes = A.getQuotes();
    var existing = quotes.filter(function (q) {
      return q.id === A.state.draft.id;
    })[0];
    var record = Object.assign({}, existing || {}, {
      id: A.state.draft.id,
      address: A.state.draft.address.trim(),
      customer: A.cleanCustomer(A.state.draft.customer),
      data: { bathroom: bathroom },
      createdAt: (existing && existing.createdAt) || A.state.draft.createdAt || now,
      updatedAt: now,
    });
    if (existing) {
      quotes = quotes.map(function (q) {
        return q.id === A.state.draft.id ? record : q;
      });
    } else {
      quotes.push(record);
    }

    var address = A.state.draft.address.trim();
    if (!A.saveQuotes(quotes)) {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Quote";
      errorBox.setAttribute("data-kind", "storage");
      errorBox.textContent =
        "Couldn't save this quote in this browser. " +
        A.STORAGE_ERROR.replace(/^Couldn't save in this browser — /, "The browser's storage is ");
      errorBox.hidden = false;
      A.alertError(A.STORAGE_ERROR);
      return;
    }
    A.clearDraft();
    saving = false;
    A.state.currentRoute = "dashboard";
    A.navigate("dashboard", { replace: true });
    A.toast("Quote for " + address + " saved.");
  }

  // Used by the other parts of the admin tool.
  A.cancelQuote = cancelQuote;
  A.CUSTOMER_FIELDS = CUSTOMER_FIELDS;
  A.setInputError = setInputError;
  A.refreshErrorSummary = refreshErrorSummary;
  A.renderEditor = renderEditor;
  A.handleQuoteSubmit = handleQuoteSubmit;
})((window.PRAdmin = window.PRAdmin || { state: {} }));
