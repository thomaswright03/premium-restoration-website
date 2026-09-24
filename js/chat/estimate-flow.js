// Premium Restoration chat — the guided bathroom estimate.
//
// Asks what work is needed FIRST, then only the measurements that work
// needs, then fixture counts. Every step is validated before moving on, so
// no chosen work can be silently dropped from the estimate. Back shows the
// previous step again with its answers; Cancel stops; the last step shows
// the estimate card (estimate-card.js).
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  var estimateCounter = 0;

  // The steps for the work chosen so far (the measurements step depends on it).
  function buildGroups(scope) {
    var Pricing = window.BathroomPricing;
    var needs = Pricing.scopeNeeds(scope || {});
    var groups = [
      {
        id: "scope",
        intro:
          "Sure! Let's get you a rough, non-binding bathroom labor estimate. Nothing you enter here is sent to us. First, which work does the job need? Only what you choose is priced.",
        fields: Pricing.SCOPE_QUESTIONS.map(function (q) {
          return { key: q.key, label: q.label, type: "choice", options: q.options };
        }),
      },
    ];
    if (scope && needs.floorArea) {
      groups.push({
        id: "dimensions",
        intro:
          (needs.height
            ? "Now the room's size. The wall work you chose needs the ceiling height too."
            : "Now the room's floor size.") + " Feet (5.5) or feet and inches (5' 6\") both work.",
        fields: Pricing.DIMENSIONS.filter(function (d) {
          return d.key !== "Bathroom_Height_Ft" || needs.height;
        }).map(function (d) {
          return {
            key: d.key,
            label: d.label + " (ft)",
            type: "number",
            inputmode: "text",
            placeholder: "e.g. 5' 6\"",
          };
        }),
      });
    }
    groups.push({
      id: "fixtures",
      intro: "Last step — how many of each should we install? Leave blank or enter 0 for any that don't apply.",
      fields: Pricing.FIXTURES.map(function (f) {
        return { key: f.key, label: f.plural, type: "number", inputmode: "numeric" };
      }),
    });
    return groups;
  }

  function newQuoteState(values, scope, index) {
    var groups = buildGroups(scope);
    return {
      id: ++estimateCounter,
      groups: groups,
      index: Math.max(0, Math.min(index || 0, groups.length - 1)),
      values: values || {},
      scope: scope || {},
    };
  }

  // ---------- progress bar ----------
  function setProgress(pct) {
    C.els.progress.hidden = false;
    C.els.progressFill.style.width = pct + "%";
    C.els.progressBar.setAttribute("aria-valuenow", String(pct));
    C.els.progressLabel.textContent = pct + "% complete";
    C.updateToolbar();
  }

  function hideProgress() {
    C.els.progress.hidden = true;
    C.updateToolbar();
  }

  function stepProgress() {
    var q = C.state.quoteState;
    setProgress(Math.round((q.index / q.groups.length) * 100));
  }

  // ---------- steps ----------
  // The button that started the estimate (or a new one, when it was asked
  // for by typing) stays in the chat as "Continue my estimate": it reopens
  // the estimate full screen, and focus returns to it when full screen is
  // closed. It goes when the estimate is finished or cancelled.
  function continueButton(opener) {
    var btn = opener && document.contains(opener) ? opener : C.estimateButtonRow("");
    C.removeOffers(btn.closest(".ai-chat-offer-row"));
    btn.textContent = "Continue my estimate\u00a0→";
    btn.setAttribute("data-role", "continue-estimate");
    return btn;
  }

  // Reopens the estimate being worked out full screen, on its current step.
  function resumeEstimate(opener) {
    C.enterFullscreen(opener);
    var current = C.els.messages.querySelector(
      ".ai-chat-group-form:not(.is-done) input, .ai-chat-group-form:not(.is-done) .ai-chat-choice",
    );
    if (current) current.focus({ preventScroll: true });
  }

  function startEstimate(opener) {
    var btn = continueButton(opener);
    C.state.quoteState = newQuoteState({}, null, 0);
    C.els.form.hidden = true;
    // Started from a button: closing full screen goes back to it. Started by
    // typing: the chat box is hidden, so focus goes to the current step.
    C.enterFullscreen(opener ? btn : undefined);
    setProgress(0);
    C.appendGroupForm();
    C.persistEstimate();
    C.track("ESTIMATE_STARTED");
  }

  function removeStepRows(fromIndex) {
    var id = C.state.quoteState.id;
    Array.prototype.forEach.call(C.els.messages.querySelectorAll('[data-estimate="' + id + '"]'), function (row) {
      if (Number(row.getAttribute("data-step")) >= fromIndex) row.remove();
    });
  }

  function cancelEstimate() {
    C.state.quoteState = null;
    C.removeOffers();
    C.saveEstimate(null);
    hideProgress();
    C.els.form.hidden = false;
    C.appendChatRow(
      "bot",
      "No problem, I've stopped the estimate. Ask me anything else, or say “bathroom quote” to start over.",
    );
    C.els.input.focus();
  }

  // Back: show the previous step again with its answers filled in.
  function goBack() {
    var q = C.state.quoteState;
    if (!q || q.index === 0) return;
    removeStepRows(q.index - 1);
    q.index--;
    stepProgress();
    C.appendGroupForm();
    C.persistEstimate();
  }

  function advance() {
    var q = C.state.quoteState;
    // The work chosen decides which measurements are asked for.
    if (q.index === 0) q.groups = buildGroups(q.scope);
    q.index++;
    if (q.index < q.groups.length) {
      stepProgress();
      C.appendGroupForm();
      C.persistEstimate();
      return;
    }
    setProgress(100);
    C.state.quoteState = null;
    C.removeOffers();
    C.els.form.hidden = false;
    C.saveEstimate({ status: "done", values: q.values, scope: q.scope });
    C.track("ESTIMATE_COMPLETED");
    C.appendEstimateCard(q.values, q.scope);
    setTimeout(hideProgress, 1200);
  }

  // After a reload: pick up the estimate where the visitor left it, or show
  // the estimate they finished, without taking over the page.
  function restoreEstimate() {
    var saved = C.readSavedEstimate();
    if (!saved || !C.estimatorEnabled() || C.state.quoteState) return;
    if (saved.status === "done") {
      var check = window.BathroomPricing.validateJob(saved.values, saved.scope, { requireWork: true });
      if (!check.valid) return C.saveEstimate(null);
      C.appendChatRow("bot", "Here's the estimate you worked out earlier in this visit.");
      C.appendEstimateCard(saved.values, saved.scope, { restored: true });
      return;
    }
    if (saved.status !== "active") return;
    C.state.quoteState = newQuoteState(saved.values, saved.scope, saved.index);
    C.els.form.hidden = true;
    C.appendChatRow("bot", "Welcome back — your estimate is just as you left it. Carry on below.");
    continueButton(null);
    stepProgress();
    C.appendGroupForm({ restored: true });
  }

  // Used by the other parts of the chat.
  C.startEstimate = startEstimate;
  C.resumeEstimate = resumeEstimate;
  C.cancelEstimate = cancelEstimate;
  C.goBack = goBack;
  C.advance = advance;
  C.restoreEstimate = restoreEstimate;
})((window.PRChat = window.PRChat || { state: {} }));
