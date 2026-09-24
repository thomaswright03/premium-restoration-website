// Premium Restoration chat — one step of the estimate: a small grouped form
// (the work questions, the room's measurements, or the fixture counts) with
// field messages, Back, Cancel and Continue.
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  var fieldCounter = 0;

  // A question answered with buttons (nothing pre-selected). Returns the
  // field's parts and a reader that copies the answer into the estimate.
  function choiceField(field, ctx, wrap, labelEl, errorEl) {
    var q = C.state.quoteState;
    var choiceWrap = C.el("div", "ai-chat-choices");
    choiceWrap.setAttribute("role", "group");
    choiceWrap.setAttribute("aria-labelledby", labelEl.id);
    choiceWrap.setAttribute("aria-describedby", errorEl.id);
    // An answer given before (Back, or after a reload) is shown again.
    var chosen = field.options.filter(function (option) {
      return option.value === q.scope[field.key];
    })[0];
    var buttons = [];
    field.options.forEach(function (option) {
      var btn = C.el("button", "ai-chat-choice" + (option === chosen ? " selected" : ""), option.label);
      btn.type = "button";
      btn.setAttribute("aria-pressed", option === chosen ? "true" : "false");
      btn.addEventListener("click", function () {
        chosen = option;
        buttons.forEach(function (other) {
          other.classList.toggle("selected", other === btn);
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        ctx.showFieldError(field.key, null);
        C.state.quoteState.scope[field.key] = option.value;
        C.persistEstimate();
      });
      buttons.push(btn);
      choiceWrap.appendChild(btn);
    });
    wrap.appendChild(choiceWrap);
    ctx.fieldEls[field.key] = { wrap: wrap, error: errorEl, focus: buttons[0] };
    ctx.readers.push(function () {
      if (chosen) C.state.quoteState.scope[field.key] = chosen.value;
      else delete C.state.quoteState.scope[field.key];
    });
  }

  // A typed answer (a measurement or a count).
  function inputField(field, ctx, wrap, labelEl, errorEl) {
    var input = C.el("input");
    input.type = "text";
    input.inputMode = field.inputmode;
    input.autocomplete = "off";
    input.placeholder = field.placeholder || "0";
    input.id = labelEl.id.replace(/-label$/, "");
    input.name = field.key;
    input.value = C.state.quoteState.values[field.key] || "";
    input.setAttribute("aria-describedby", errorEl.id);
    labelEl.htmlFor = input.id;
    wrap.appendChild(input);
    input.addEventListener("input", function () {
      ctx.showFieldError(field.key, null);
      C.state.quoteState.values[field.key] = input.value.trim();
      C.persistEstimate();
    });
    ctx.fieldEls[field.key] = { wrap: wrap, error: errorEl, focus: input, input: input };
    ctx.readers.push(function () {
      C.state.quoteState.values[field.key] = input.value.trim();
    });
  }

  function buildField(field, ctx) {
    var isChoice = field.type === "choice";
    var wrap = C.el("div", "ai-chat-group-field" + (isChoice ? " is-choice" : ""));
    var fieldId = "ai-chat-field-" + ++fieldCounter;
    var labelEl = C.el(isChoice ? "p" : "label", "ai-chat-field-label", field.label);
    labelEl.id = fieldId + "-label";
    wrap.appendChild(labelEl);
    var errorEl = C.el("p", "ai-chat-field-error");
    errorEl.id = fieldId + "-error";
    errorEl.hidden = true;
    if (isChoice) choiceField(field, ctx, wrap, labelEl, errorEl);
    else inputField(field, ctx, wrap, labelEl, errorEl);
    wrap.appendChild(errorEl);
    return wrap;
  }

  function actionButton(className, text, onClick, type) {
    var btn = C.el("button", className, text);
    btn.type = type || "button";
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  // Back (after the first step), Cancel and Continue / Get My Estimate.
  function buildActions(group, disableForm) {
    var q = C.state.quoteState;
    var actionsWrap = C.el("div", "ai-chat-group-actions");
    if (q.index > 0) {
      actionsWrap.appendChild(
        actionButton("ai-chat-group-back", "← Back", function () {
          disableForm();
          C.goBack();
        }),
      );
    }
    actionsWrap.appendChild(
      actionButton("ai-chat-group-cancel", "Cancel", function () {
        disableForm();
        C.cancelEstimate();
      }),
    );
    var isLast = q.index === q.groups.length - 1 && group.id !== "scope";
    actionsWrap.appendChild(
      actionButton("ai-chat-group-continue", isLast ? "Get My Estimate →" : "Continue →", null, "submit"),
    );
    return actionsWrap;
  }

  // Checks this step's answers; shows field messages and returns false if
  // any need fixing.
  function checkStep(group, ctx, summaryError) {
    ctx.readers.forEach(function (read) {
      read();
    });
    var q = C.state.quoteState;
    var result = window.BathroomPricing.validateJob(q.values, q.scope);
    var firstBad = null;
    group.fields.forEach(function (field) {
      var message = result.errors[field.key] || null;
      ctx.showFieldError(field.key, message);
      if (message && !firstBad) firstBad = field.key;
    });
    summaryError.hidden = !firstBad;
    summaryError.textContent = firstBad ? "Please fix the highlighted answers above." : "";
    if (firstBad) ctx.fieldEls[firstBad].focus.focus();
    return !firstBad;
  }

  // Adds the current step's form to the chat.
  // options.restored: shown after a reload, so focus isn't moved.
  function appendGroupForm(options) {
    options = options || {};
    var q = C.state.quoteState;
    var group = q.groups[q.index];
    var parts = C.botRow();
    parts.row.setAttribute("data-estimate", String(q.id));
    parts.row.setAttribute("data-step", String(q.index));
    var content = C.el("div", "ai-chat-text");
    content.appendChild(C.el("p", "ai-chat-group-intro", group.intro));

    var formEl = C.el("form", "ai-chat-group-form");
    formEl.noValidate = true;
    formEl.setAttribute("data-group", group.id);

    var ctx = {
      fieldEls: {},
      readers: [],
      showFieldError: function (key, message) {
        var f = ctx.fieldEls[key];
        if (!f) return;
        f.error.textContent = message || "";
        f.error.hidden = !message;
        f.wrap.classList.toggle("has-error", !!message);
        if (f.input) f.input.setAttribute("aria-invalid", message ? "true" : "false");
      },
    };
    group.fields.forEach(function (field) {
      formEl.appendChild(buildField(field, ctx));
    });

    var summaryError = C.el("p", "ai-chat-group-error");
    summaryError.setAttribute("role", "alert");
    summaryError.hidden = true;
    formEl.appendChild(summaryError);

    function disableForm() {
      formEl.classList.add("is-done");
      Array.prototype.forEach.call(formEl.querySelectorAll("input, button"), function (node) {
        node.disabled = true;
      });
    }
    formEl.appendChild(buildActions(group, disableForm));

    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!checkStep(group, ctx, summaryError)) return;
      disableForm();
      C.advance();
    });

    content.appendChild(formEl);
    parts.inner.appendChild(content);
    C.els.messages.appendChild(parts.row);
    C.scrollToEnd();
    if (options.restored) return; // don't move focus or scroll the page on load
    var first = formEl.querySelector("input, .ai-chat-choice");
    if (first) first.focus({ preventScroll: true });
  }

  // Used by the other parts of the chat.
  C.appendGroupForm = appendGroupForm;
})((window.PRChat = window.PRChat || { state: {} }));
