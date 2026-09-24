// Premium Restoration admin tool — The quote being created or edited. Each quote has its own draft in this
// browser ("pr_quote_draft:<id>"), and each tab remembers which one it is
// editing, so two tabs never overwrite or discard each other's changes.
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  /** @param {Draft | null} d */
  function confirmDiscardQuote(d) {
    return A.confirmAction(
      "Discard unsaved changes?",
      "Your changes to " + describeDraft(d) + " haven't been saved. Discarding them can't be undone.",
      "Discard changes",
    );
  }

  /** @param {Draft | null} d */
  function describeDraft(d) {
    return d && d.address ? "the quote for " + d.address : "a new quote";
  }

  // ------------------------------------------------------------------
  // Draft (the quote being created or edited)
  // ------------------------------------------------------------------
  A.state.draft = null;

  // What is compared to tell whether a draft has unsaved changes.
  /** @param {Pick<Draft, "address" | "values" | "scope"> & { customer?: Partial<Customer> | null }} d */
  function snapshot(d) {
    return JSON.stringify({
      address: d.address,
      customer: cleanCustomer(d.customer),
      values: d.values,
      scope: d.scope,
    });
  }

  // Optional customer details kept with a quote.
  /**
   * @param {Partial<Customer> | null} [c]
   * @returns {Customer}
   */
  function cleanCustomer(c) {
    var given = c || {};
    /** @param {unknown} v */
    function text(v) {
      return typeof v === "string" ? v.trim() : "";
    }
    return { name: text(given.name), phone: text(given.phone), email: text(given.email) };
  }

  /** @param {Partial<Customer> | undefined} customer */
  function customerSummary(customer) {
    var c = cleanCustomer(customer);
    return [c.name, c.phone, c.email].filter(Boolean).join(" · ");
  }

  /** @param {Draft | null} stored */
  function hasUnsavedDraft(stored) {
    return !!(stored && stored.id && snapshot(stored) !== stored.baseline);
  }

  function isDirty() {
    return !!A.state.draft && snapshot(A.state.draft) !== A.state.draft.baseline;
  }

  var draftWarned = false;

  /** @param {string} id */
  function draftKey(id) {
    return A.DRAFT_PREFIX + id;
  }

  /** @param {string | null} id */
  function setTabDraft(id) {
    try {
      if (id) sessionStorage.setItem(A.TAB_DRAFT_KEY, id);
      else sessionStorage.removeItem(A.TAB_DRAFT_KEY);
    } catch (e) {
      /* this tab just won't reopen the quote after a reload */
    }
  }

  function tabDraftId() {
    try {
      return sessionStorage.getItem(A.TAB_DRAFT_KEY);
    } catch (e) {
      return null;
    }
  }

  function persistDraft() {
    if (!A.state.draft) return;
    setTabDraft(A.state.draft.id);
    if (!A.writeJson(draftKey(A.state.draft.id), A.state.draft) && !draftWarned) {
      draftWarned = true;
      A.alertError(
        "This browser isn't letting us keep a backup of this quote while you work, so don't reload the page until you've saved it.",
      );
    }
  }

  // A draft saved before customer details existed: compare like with like.
  /**
   * @param {Draft | null} d
   * @returns {Draft | null}
   */
  function upgradeDraft(d) {
    if (!d || !d.id) return null;
    if (!d.customer) {
      d.customer = cleanCustomer();
      try {
        var base = JSON.parse(String(d.baseline));
        d.baseline = snapshot({ address: base.address, customer: null, values: base.values, scope: base.scope });
      } catch (e) {
        /* no usable baseline: treated as changed */
      }
    }
    return d;
  }

  // The unsaved copy of one quote kept in this browser, if any.
  /** @param {string} id */
  function readDraft(id) {
    return id ? upgradeDraft(A.readJson(draftKey(id), null)) : null;
  }

  // Every quote with unsaved changes in this browser (from any tab), oldest first.
  /** @returns {Draft[]} */
  function unsavedDrafts() {
    /** @type {Draft[]} */
    var list = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(A.DRAFT_PREFIX) === 0) {
          var d = readDraft(key.slice(A.DRAFT_PREFIX.length));
          if (d && hasUnsavedDraft(d)) list.push(d);
        }
      }
    } catch (e) {
      /* storage blocked: nothing to list */
    }
    return list.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });
  }

  // The single draft key used before drafts were kept per quote.
  function migrateOldDraft() {
    var old = upgradeDraft(A.readJson(A.OLD_DRAFT_KEY, null));
    if (!old) return;
    if (!A.readJson(draftKey(old.id), null) && !A.writeJson(draftKey(old.id), old)) return;
    A.removeKey(A.OLD_DRAFT_KEY);
  }

  /** @param {string | null | undefined} id */
  function removeDraft(id) {
    if (id) A.removeKey(draftKey(id));
  }

  function clearDraft() {
    if (A.state.draft) removeDraft(A.state.draft.id);
    A.state.draft = null;
    setTabDraft(null);
  }

  /** @returns {Draft} */
  function newDraft() {
    /** @type {Draft} */
    var d = {
      id: "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      isNew: true,
      address: "",
      customer: cleanCustomer(),
      values: {},
      scope: {},
    };
    d.baseline = snapshot(d);
    return d;
  }

  var VALUE_KEYS = ["Bathroom_Width_Ft", "Bathroom_Length_Ft", "Bathroom_Height_Ft", "Electrical_Points"]
    .concat(
      window.BathroomPricing.FIXTURES.map(function (f) {
        return f.key;
      }),
    )
    .concat(["No_Stack_Surcharge_Included", "Bad_Valve_Surcharge_Included"]);

  var DIMENSION_KEYS = window.BathroomPricing.DIMENSIONS.map(function (d) {
    return d.key;
  });

  /**
   * @param {Quote} quote
   * @returns {Draft}
   */
  function draftFromQuote(quote) {
    /** @type {BathroomData} */
    var bathroom = (quote.data && quote.data.bathroom) || {};
    var jobValues = bathroom.jobValues || {};
    /** @type {JobValues} */
    var values = {};
    VALUE_KEYS.forEach(function (key) {
      var v = jobValues[key];
      if (typeof v === "boolean") values[key] = v;
      else if (v !== undefined && v !== null && v !== "" && v !== 0) values[key] = String(v);
    });
    var legacy = A.Pricing.isLegacyQuoteData(bathroom);
    /** @type {Draft} */
    var d = {
      id: quote.id,
      isNew: false,
      address: quote.address || "",
      customer: cleanCustomer(quote.customer),
      values: values,
      scope: legacy ? {} : Object.assign({}, bathroom.scope || {}),
      createdAt: quote.createdAt,
      legacy: legacy
        ? {
            total: Number(bathroom.totalPrice) || 0,
            floorSqFt: Number(jobValues.Bathroom_SqFt) || 0,
            wallSqFt: Number(jobValues.Wall_SqFt) || 0,
            hadDimensions: !!(jobValues.Bathroom_Width_Ft || jobValues.Bathroom_Length_Ft),
          }
        : null,
    };
    d.baseline = snapshot(d);
    return d;
  }

  // When a quote last changed: an edit, or marking it as a booked job.
  /** @param {Pick<Quote, "updatedAt" | "statusChangedAt">} q */
  function lastChanged(q) {
    return Math.max(new Date(q.updatedAt).getTime() || 0, new Date(q.statusChangedAt || 0).getTime() || 0);
  }

  // Used by the other parts of the admin tool.
  A.confirmDiscardQuote = confirmDiscardQuote;
  A.describeDraft = describeDraft;
  A.cleanCustomer = cleanCustomer;
  A.customerSummary = customerSummary;
  A.hasUnsavedDraft = hasUnsavedDraft;
  A.isDirty = isDirty;
  A.tabDraftId = tabDraftId;
  A.persistDraft = persistDraft;
  A.readDraft = readDraft;
  A.unsavedDrafts = unsavedDrafts;
  A.migrateOldDraft = migrateOldDraft;
  A.removeDraft = removeDraft;
  A.clearDraft = clearDraft;
  A.newDraft = newDraft;
  A.VALUE_KEYS = VALUE_KEYS;
  A.DIMENSION_KEYS = DIMENSION_KEYS;
  A.draftFromQuote = draftFromQuote;
  A.lastChanged = lastChanged;
})((window.PRAdmin = window.PRAdmin || /** @type {AdminNamespace} */ ({ state: {} })));
