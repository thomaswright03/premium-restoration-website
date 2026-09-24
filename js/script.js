// Premium Restoration — public site behaviour: navigation, FAQ, the chat
// assistant and its bathroom price estimate, and the Get a Quote form.
//
// Settings (price estimator on/off, lead-form endpoint, owner details) come
// from site-config.json via js/site-config.js — see README "Site settings".

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var Business = window.BusinessInfo;
  var PHONE = Business.PHONE;
  var EMAIL = Business.EMAIL;
  var PHONE_HREF = Business.PHONE_HREF;
  var configReady = window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null);
  var siteConfig = null;
  configReady.then(function (c) {
    siteConfig = c;
  });

  // ---------- page chrome ----------
  Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    var setMenu = function (open) {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", function () {
      setMenu(!links.classList.contains("open"));
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Scroll-reveal (skipped when the visitor prefers reduced motion).
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealTargets = document.querySelectorAll(
    ".card, .value-item, .faq-item, .about-photo, .about-copy, .contact-info-card, #lead-form, .scope-note",
  );
  if (!reduceMotion && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );
    revealTargets.forEach(function (el) {
      el.classList.add("reveal");
      observer.observe(el);
    });
    // Never leave content invisible if the observer doesn't fire.
    setTimeout(function () {
      revealTargets.forEach(function (el) {
        el.classList.add("visible");
      });
    }, 1500);
  }

  // FAQ accordion
  Array.prototype.forEach.call(document.querySelectorAll(".faq-item"), function (item, index) {
    var question = item.querySelector(".faq-question");
    var answer = item.querySelector(".faq-answer");
    if (!question || !answer) return;
    answer.id = answer.id || "faq-answer-" + (index + 1);
    question.setAttribute("aria-controls", answer.id);
    question.setAttribute("aria-expanded", "false");
    question.addEventListener("click", function () {
      var isOpen = item.classList.toggle("open");
      question.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  initChat();
  initLeadForm();

  // =====================================================================
  // Chat assistant (front-end only — scripted replies from
  // js/chat-replies.js, plus a guided bathroom price estimate). It is NOT AI
  // and must not be described as AI or as a person.
  // =====================================================================
  function initChat() {
    var chatForm = document.getElementById("ai-chat-form");
    var chatInput = document.getElementById("ai-chat-input");
    var chatMessages = document.getElementById("ai-chat-messages");
    var chatSend = document.getElementById("ai-chat-send");
    if (!chatForm || !chatInput || !chatMessages || !window.BathroomPricing || !window.ChatReplies) return;

    var Pricing = window.BathroomPricing;
    var chatSection = document.querySelector(".ai-chat-section");
    var toolbar = document.getElementById("ai-chat-toolbar");
    var closeBtn = document.getElementById("ai-chat-close");
    var progress = document.getElementById("ai-chat-progress");
    var progressBar = document.getElementById("ai-chat-progress-bar");
    var progressFill = document.getElementById("ai-chat-progress-fill");
    var progressLabel = document.getElementById("ai-chat-progress-label");
    var starterRow = document.getElementById("ai-chat-quote-starter-row");
    var starter = document.getElementById("ai-chat-quote-starter");

    function estimatorEnabled() {
      return !!(siteConfig && siteConfig.priceEstimator.enabled);
    }

    configReady.then(function () {
      if (starterRow) starterRow.hidden = !estimatorEnabled();
    });

    // ---------- layout helpers ----------
    function updateToolbar() {
      if (toolbar) toolbar.hidden = progress.hidden && closeBtn.hidden;
    }

    function scrollToEnd() {
      chatMessages.scrollTop = chatMessages.scrollHeight;
      if (!chatSection.classList.contains("is-fullscreen")) {
        var last = chatMessages.lastElementChild;
        if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
      }
    }

    function botRow() {
      var row = document.createElement("div");
      row.className = "ai-chat-row bot";
      var inner = document.createElement("div");
      inner.className = "ai-chat-row-inner";
      var avatar = document.createElement("div");
      avatar.className = "ai-chat-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "PR";
      inner.appendChild(avatar);
      row.appendChild(inner);
      return { row: row, inner: inner };
    }

    function appendChatRow(role, text) {
      var parts = botRow();
      parts.row.className = "ai-chat-row " + role;
      parts.inner.firstChild.textContent = role === "user" ? "YOU" : "PR";
      var textEl = document.createElement("div");
      textEl.className = "ai-chat-text";
      textEl.textContent = text;
      parts.inner.appendChild(textEl);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      return parts.row;
    }

    function appendEstimateOffer() {
      if (!estimatorEnabled() || quoteState) return;
      var parts = botRow();
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-chat-suggestion";
      btn.textContent = "Get a bathroom price estimate →";
      btn.addEventListener("click", function () {
        parts.row.remove();
        enterFullscreen();
        sendChatMessage("I'd like a bathroom price estimate");
      });
      parts.inner.appendChild(btn);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
    }

    // ---------- fullscreen ----------
    function enterFullscreen() {
      if (chatSection.classList.contains("is-fullscreen")) return;
      chatSection.classList.add("is-fullscreen");
      document.body.classList.add("ai-chat-locked");
      closeBtn.hidden = false;
      updateToolbar();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function exitFullscreen() {
      chatSection.classList.remove("is-fullscreen");
      document.body.classList.remove("ai-chat-locked");
      closeBtn.hidden = true;
      updateToolbar();
    }

    closeBtn.addEventListener("click", exitFullscreen);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && chatSection.classList.contains("is-fullscreen")) exitFullscreen();
    });

    // ---------- progress bar ----------
    function setProgress(pct) {
      progress.hidden = false;
      progressFill.style.width = pct + "%";
      progressBar.setAttribute("aria-valuenow", String(pct));
      progressLabel.textContent = pct + "% complete";
      updateToolbar();
    }

    function hideProgress() {
      progress.hidden = true;
      updateToolbar();
    }

    // ---------- guided bathroom estimate ----------
    // Asks what work is needed FIRST, then only the measurements that work
    // needs, then fixture counts. Every step is validated before moving on,
    // so no chosen work can be silently dropped from the estimate.
    var quoteState = null; // { groups, index, values, scope }

    function buildGroups(scope) {
      var needs = Pricing.scopeNeeds(scope || {});
      var groups = [
        {
          id: "scope",
          intro:
            "Sure! Let's get you a rough, non-binding bathroom labor estimate. Nothing you enter here is sent to us. First, which work does the job need? Only what you choose is priced.",
          fields: Pricing.SCOPE_QUESTIONS.map(function (q) {
            return { key: q.key, label: q.label, type: "choice", options: q.options, target: "scope" };
          }),
        },
      ];
      if (scope && needs.floorArea) {
        groups.push({
          id: "dimensions",
          intro: needs.height
            ? "Now the room's size, in feet. The wall work you chose needs the ceiling height too."
            : "Now the room's floor size, in feet.",
          fields: Pricing.DIMENSIONS.filter(function (d) {
            return d.key !== "Bathroom_Height_Ft" || needs.height;
          }).map(function (d) {
            return { key: d.key, label: d.label + " (ft)", type: "number", inputmode: "decimal", target: "values" };
          }),
        });
      }
      groups.push({
        id: "fixtures",
        intro: "Last step — how many of each should we install? Leave blank or enter 0 for any that don't apply.",
        fields: Pricing.FIXTURES.map(function (f) {
          return { key: f.key, label: f.plural, type: "number", inputmode: "numeric", target: "values" };
        }),
      });
      return groups;
    }

    function startEstimate() {
      quoteState = { groups: buildGroups(null), index: 0, values: {}, scope: {} };
      chatForm.hidden = true;
      setProgress(0);
      appendGroupForm();
    }

    function cancelEstimate() {
      quoteState = null;
      hideProgress();
      chatForm.hidden = false;
      appendChatRow(
        "bot",
        "No problem, I've stopped the estimate. Ask me anything else, or say “bathroom quote” to start over.",
      );
      chatInput.focus();
    }

    function advance() {
      if (quoteState.index === 0) {
        // The scope decides which measurements are asked for.
        quoteState.groups = buildGroups(quoteState.scope);
      }
      quoteState.index++;
      if (quoteState.index < quoteState.groups.length) {
        setProgress(Math.round((quoteState.index / quoteState.groups.length) * 100));
        appendGroupForm();
        return;
      }
      setProgress(100);
      var state = quoteState;
      quoteState = null;
      chatForm.hidden = false;
      appendEstimateCard(state.values, state.scope);
      setTimeout(hideProgress, 1200);
    }

    var fieldCounter = 0;

    function appendGroupForm() {
      var group = quoteState.groups[quoteState.index];
      var parts = botRow();
      var content = document.createElement("div");
      content.className = "ai-chat-text";

      var introEl = document.createElement("p");
      introEl.className = "ai-chat-group-intro";
      introEl.textContent = group.intro;
      content.appendChild(introEl);

      var formEl = document.createElement("form");
      formEl.className = "ai-chat-group-form";
      formEl.noValidate = true;
      formEl.setAttribute("data-group", group.id);

      var fieldEls = {};
      var readers = [];

      group.fields.forEach(function (field) {
        var fieldWrap = document.createElement("div");
        fieldWrap.className = "ai-chat-group-field" + (field.type === "choice" ? " is-choice" : "");
        var fieldId = "ai-chat-field-" + ++fieldCounter;
        var labelEl = document.createElement(field.type === "choice" ? "p" : "label");
        labelEl.className = "ai-chat-field-label";
        labelEl.textContent = field.label;
        labelEl.id = fieldId + "-label";
        fieldWrap.appendChild(labelEl);

        var errorEl = document.createElement("p");
        errorEl.className = "ai-chat-field-error";
        errorEl.id = fieldId + "-error";
        errorEl.hidden = true;

        if (field.type === "choice") {
          // Nothing is pre-selected: the visitor must pick every answer.
          var choiceWrap = document.createElement("div");
          choiceWrap.className = "ai-chat-choices";
          choiceWrap.setAttribute("role", "group");
          choiceWrap.setAttribute("aria-labelledby", fieldId + "-label");
          choiceWrap.setAttribute("aria-describedby", errorEl.id);
          var chosen;
          var buttons = [];
          field.options.forEach(function (option) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ai-chat-choice";
            btn.textContent = option.label;
            btn.setAttribute("aria-pressed", "false");
            btn.addEventListener("click", function () {
              chosen = option;
              buttons.forEach(function (other) {
                var isThis = other === btn;
                other.classList.toggle("selected", isThis);
                other.setAttribute("aria-pressed", isThis ? "true" : "false");
              });
              showFieldError(field.key, null);
            });
            buttons.push(btn);
            choiceWrap.appendChild(btn);
          });
          fieldWrap.appendChild(choiceWrap);
          fieldEls[field.key] = { wrap: fieldWrap, error: errorEl, focus: buttons[0] };
          readers.push(function () {
            if (chosen) quoteState.scope[field.key] = chosen.value;
            else delete quoteState.scope[field.key];
          });
        } else {
          var input = document.createElement("input");
          input.type = "text";
          input.inputMode = field.inputmode;
          input.autocomplete = "off";
          input.placeholder = "0";
          input.id = fieldId;
          input.name = field.key;
          input.setAttribute("aria-describedby", errorEl.id);
          labelEl.htmlFor = fieldId;
          fieldWrap.appendChild(input);
          input.addEventListener("input", function () {
            showFieldError(field.key, null);
          });
          fieldEls[field.key] = { wrap: fieldWrap, error: errorEl, focus: input, input: input };
          readers.push(function () {
            quoteState.values[field.key] = input.value.trim();
          });
        }
        fieldWrap.appendChild(errorEl);
        formEl.appendChild(fieldWrap);
      });

      function showFieldError(key, message) {
        var f = fieldEls[key];
        if (!f) return;
        f.error.textContent = message || "";
        f.error.hidden = !message;
        f.wrap.classList.toggle("has-error", !!message);
        if (f.input) f.input.setAttribute("aria-invalid", message ? "true" : "false");
      }

      var summaryError = document.createElement("p");
      summaryError.className = "ai-chat-group-error";
      summaryError.setAttribute("role", "alert");
      summaryError.hidden = true;
      formEl.appendChild(summaryError);

      var actionsWrap = document.createElement("div");
      actionsWrap.className = "ai-chat-group-actions";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "ai-chat-group-cancel";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", function () {
        disableForm();
        cancelEstimate();
      });
      var continueBtn = document.createElement("button");
      continueBtn.type = "submit";
      continueBtn.className = "ai-chat-group-continue";
      var isLast = quoteState.index === quoteState.groups.length - 1 && group.id !== "scope";
      continueBtn.textContent = isLast ? "Get My Estimate →" : "Continue →";
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);

      function disableForm() {
        Array.prototype.forEach.call(formEl.querySelectorAll("input, button"), function (el) {
          el.disabled = true;
        });
      }

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        readers.forEach(function (read) {
          read();
        });
        var result = Pricing.validateJob(quoteState.values, quoteState.scope);
        var firstBad = null;
        group.fields.forEach(function (field) {
          var message = result.errors[field.key] || null;
          showFieldError(field.key, message);
          if (message && !firstBad) firstBad = field.key;
        });
        summaryError.hidden = !firstBad;
        summaryError.textContent = firstBad ? "Please fix the highlighted answers above." : "";
        if (firstBad) {
          fieldEls[firstBad].focus.focus();
          return;
        }
        disableForm();
        advance();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      var first = formEl.querySelector("input, .ai-chat-choice");
      if (first) first.focus({ preventScroll: true });
    }

    // ---------- estimate card ----------
    var PLUMBING_NOTE =
      "Plumbing and electrical work is not included. Toilets, sinks, showers, and bathtubs also need plumbing work, " +
      "so if you listed any, or your job needs other plumbing or electrical work, expect it to add to the cost. " +
      "We'll tell you how it will be handled and priced before any work is agreed.";

    var ESTIMATE_DISCLAIMER =
      "This is an automated, non-binding estimate of labor only, based only on the measurements, counts, and " +
      "choices you entered and the assumptions listed with it. It is not a quote, offer, or contract. It excludes " +
      "plumbing and electrical work (including the plumbing any toilets, sinks, showers, or bathtubs need), " +
      "materials, permits, and any applicable taxes, which will add to the cost where your job needs them. " +
      "Prices are current as of the date generated and may change. Your actual price is set only in a " +
      "written agreement after we review your project in person.";

    function totalLabel(fixtureCount) {
      return fixtureCount > 0 ? "Estimated Labor Total, before plumbing" : "Estimated Labor Total";
    }

    function plumbingTotalNote(fixtureCount) {
      return (
        "This is not the full cost of your job: plumbing work for the " +
        Pricing.formatQty(fixtureCount) +
        " toilet/sink/shower/bathtub item(s) you listed will be added on top of this total."
      );
    }

    function excludedLines(fixtureCount) {
      var list = [];
      if (fixtureCount > 0) {
        list.push({
          label:
            "Plumbing for the " + Pricing.formatQty(fixtureCount) + " toilet/sink/shower/bathtub item(s) you listed",
          value: "Extra — not included",
        });
      }
      list.push({
        label: (fixtureCount > 0 ? "Any other plumbing" : "Plumbing") + " & electrical work",
        value: "Extra — not included",
      });
      list.push({ label: "Materials, permits & any applicable taxes", value: "Not included" });
      return list;
    }

    function allAssumptions(values, scope, result) {
      return Pricing.estimateAssumptions(values, scope, result).concat([
        PLUMBING_NOTE,
        "Also not included: materials, permits, and any applicable taxes.",
      ]);
    }

    function businessLine() {
      return Business.businessLine(siteConfig && siteConfig.owner.legalName);
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function appendEstimateCard(values, scope) {
      var result = Pricing.computePublicEstimate(values, scope);
      var fixtureCount = result.plumbingFixtureCount;
      var assumptions = allAssumptions(values, scope, result);

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      var card = el("div", "ai-chat-estimate");
      card.setAttribute("data-testid", "estimate-card");

      var head = el("div", "ai-chat-estimate-header");
      head.appendChild(el("p", "eyebrow", "Your Estimate"));
      head.appendChild(el("h3", null, "Bathroom Restoration"));
      head.appendChild(el("p", "ai-chat-estimate-lede", "Rough, non-binding labor estimate — details below."));
      card.appendChild(head);

      var lines = el("div", "ai-chat-estimate-lines");
      result.lines.forEach(function (r) {
        var line = el("div", "ai-chat-estimate-line");
        var labelWrap = el("span", null, r.label + " ");
        labelWrap.appendChild(el("small", "ai-chat-estimate-detail", r.detail));
        line.appendChild(labelWrap);
        line.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(r.cost)));
        lines.appendChild(line);
      });
      if (!result.lines.length) {
        var empty = el("div", "ai-chat-estimate-line");
        empty.appendChild(el("span", null, "No priced work selected"));
        empty.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(0)));
        lines.appendChild(empty);
      }
      card.appendChild(lines);

      var excluded = el("div", "ai-chat-estimate-excluded");
      excludedLines(fixtureCount).forEach(function (x) {
        var line = el("div", "ai-chat-estimate-line muted");
        line.appendChild(el("span", null, x.label));
        line.appendChild(el("span", null, x.value));
        excluded.appendChild(line);
      });
      card.appendChild(excluded);

      var totalWrap = el("div", "ai-chat-estimate-total");
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-label", totalLabel(fixtureCount)));
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-value", Pricing.money(result.subtotal)));
      card.appendChild(totalWrap);

      if (fixtureCount > 0) card.appendChild(el("p", "ai-chat-estimate-total-note", plumbingTotalNote(fixtureCount)));

      card.appendChild(el("p", "ai-chat-estimate-disclaimer", ESTIMATE_DISCLAIMER));

      var assumptionsWrap = el("div", "ai-chat-estimate-assumptions");
      assumptionsWrap.appendChild(el("p", "ai-chat-estimate-assumptions-title", "What this estimate assumes"));
      var list = el("ul");
      assumptions.forEach(function (a) {
        list.appendChild(el("li", null, a));
      });
      assumptionsWrap.appendChild(list);
      card.appendChild(assumptionsWrap);

      var actions = el("div", "ai-chat-estimate-actions");
      var exportBtn = el("button", "ai-chat-estimate-export", "Export as PDF");
      exportBtn.type = "button";
      var pdfStatus = el("p", "ai-chat-estimate-pdf-status");
      pdfStatus.setAttribute("role", "status");
      pdfStatus.hidden = true;
      exportBtn.addEventListener("click", function () {
        exportPdf(exportBtn, pdfStatus, values, scope, result, assumptions);
      });
      actions.appendChild(exportBtn);

      var cta = el("a", "ai-chat-estimate-cta", "Contact Us About This →");
      cta.href = "contact.html?from=estimate";
      cta.addEventListener("click", function () {
        try {
          sessionStorage.setItem("pr_estimate_summary", Pricing.buildEstimateSummary(values, scope, result));
        } catch (e) {
          /* storage blocked: the contact form just starts empty */
        }
      });
      actions.appendChild(cta);
      card.appendChild(actions);
      card.appendChild(pdfStatus);

      content.appendChild(card);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      chatInput.focus({ preventScroll: true });
    }

    function exportPdf(button, status, values, scope, result, assumptions) {
      if (button.disabled) return;
      var label = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing PDF…";
      status.hidden = true;
      status.textContent = "";
      window.EstimatePdf.load()
        .then(function () {
          var fixtureCount = result.plumbingFixtureCount;
          var doc = window.EstimatePdf.build({
            title: "Bathroom Restoration — Labor Estimate",
            intro: "Rough, non-binding labor estimate.",
            lines: result.lines.map(function (r) {
              return { label: r.label, detail: r.detail, amount: Pricing.money(r.cost) };
            }),
            excluded: excludedLines(fixtureCount),
            totals: [{ label: totalLabel(fixtureCount), value: Pricing.money(result.subtotal), strong: true }],
            afterTotal: (fixtureCount > 0 ? [plumbingTotalNote(fixtureCount)] : []).concat([ESTIMATE_DISCLAIMER]),
            sections: [{ title: "What this estimate assumes", items: assumptions }],
            footer: {
              business: businessLine(),
              phone: PHONE,
              email: EMAIL,
              date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
            },
          });
          doc.save("premium-restoration-bathroom-estimate.pdf");
          button.disabled = false;
          button.textContent = label;
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = "Retry PDF";
          status.hidden = false;
          status.textContent = "Sorry, the PDF couldn't be prepared. Check your connection and press Retry PDF.";
          status.classList.add("is-error");
        });
    }

    // ---------- messages ----------
    function sendChatMessage(message) {
      if (!message) return;
      appendChatRow("user", message);
      chatSend.disabled = true;

      var typing = botRow();
      typing.row.id = "ai-chat-typing-row";
      var dots = el("div", "ai-chat-typing");
      dots.setAttribute("aria-label", "Assistant is typing");
      dots.appendChild(el("span"));
      dots.appendChild(el("span"));
      dots.appendChild(el("span"));
      typing.inner.appendChild(dots);
      chatMessages.appendChild(typing.row);
      scrollToEnd();

      configReady.then(function () {
        setTimeout(
          function () {
            typing.row.remove();
            var r = window.ChatReplies.reply(message, { estimatorEnabled: estimatorEnabled() });
            chatSend.disabled = false;
            if (r && r.action === "startEstimate") {
              if (starterRow && starterRow.parentNode) starterRow.remove();
              startEstimate();
              return;
            }
            if (r && r.text) appendChatRow("bot", r.text);
            if (r && r.action === "offerEstimate") appendEstimateOffer();
            chatInput.focus({ preventScroll: true });
          },
          500 + Math.random() * 400,
        );
      });
    }

    chatInput.addEventListener("focus", enterFullscreen);
    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = chatInput.value.trim();
      if (!message) return;
      chatInput.value = "";
      sendChatMessage(message);
    });

    if (starter) {
      starter.addEventListener("click", function () {
        enterFullscreen();
        if (starterRow) starterRow.remove();
        sendChatMessage("I'd like a bathroom price estimate");
      });
    }
  }

  // =====================================================================
  // Get a Quote form. With leadForm.endpoint set in site-config.json, the
  // request is sent there (Formspree-style: POST, JSON reply, 2xx = sent).
  // Without it, the visitor's own email app opens with the request filled in.
  // =====================================================================
  function initLeadForm() {
    var form = document.getElementById("lead-form");
    if (!form) return;
    var status = document.getElementById("form-status");
    var submit = document.getElementById("lead-submit");
    var message = document.getElementById("message");
    var SUMMARY_KEY = "pr_estimate_summary";

    // Pre-fill the project details from "Contact Us About This".
    if (/[?&]from=estimate\b/.test(window.location.search)) {
      var summary = null;
      try {
        summary = sessionStorage.getItem(SUMMARY_KEY);
      } catch (e) {
        summary = null;
      }
      if (summary && message && !message.value.trim()) {
        message.value = summary;
        var note = document.getElementById("estimate-prefill-note");
        if (note) note.hidden = false;
      }
    }

    function value(id) {
      var el = document.getElementById(id);
      if (!el) return "";
      if (el.tagName === "SELECT") return el.options[el.selectedIndex].text;
      return el.value.trim();
    }

    function setError(id, text) {
      var input = document.getElementById(id);
      var err = document.getElementById(id + "-error");
      if (err) {
        err.textContent = text || "";
        err.hidden = !text;
      }
      if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
    }

    function validate() {
      var errors = {};
      if (!value("name")) errors.name = "Enter your name.";
      var phone = value("phone");
      var digits = phone.replace(/\D/g, "");
      if (!phone) errors.phone = "Enter a phone number we can call you on.";
      else if (!/^[0-9+().\-\s]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
        errors.phone = "Enter a valid phone number, e.g. " + PHONE + ".";
      }
      var email = value("email");
      if (!email) errors.email = "Enter your email address.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        errors.email = "Enter a valid email address, e.g. name@example.com.";
      ["name", "phone", "email"].forEach(function (id) {
        setError(id, errors[id]);
      });
      return errors;
    }

    ["name", "phone", "email"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", function () {
          setError(id, null);
        });
      }
    });

    function showStatus(kind, nodes) {
      status.className = "form-status is-" + kind;
      status.innerHTML = "";
      nodes.forEach(function (n) {
        status.appendChild(typeof n === "string" ? document.createTextNode(n) : n);
      });
      status.hidden = false;
      status.focus({ preventScroll: false });
    }

    function link(href, text) {
      var a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      return a;
    }

    function strong(text) {
      var s = document.createElement("strong");
      s.textContent = text;
      return s;
    }

    function body() {
      return (
        "Name: " +
        value("name") +
        "\n" +
        "Phone: " +
        value("phone") +
        "\n" +
        "Email: " +
        value("email") +
        "\n" +
        "Service: " +
        value("service") +
        "\n\n" +
        "Project details:\n" +
        value("message")
      );
    }

    function sendByEmailApp() {
      var href =
        "mailto:" +
        EMAIL +
        "?subject=" +
        encodeURIComponent("Bathroom quote request from " + value("name")) +
        "&body=" +
        encodeURIComponent(body());
      var again = link(href, "open it again");
      again.id = "mailto-link";
      showStatus("info", [
        "Your email app should now open with your request filled in. ",
        strong("Please press Send in your email app"),
        " — we don't receive anything until you do. If nothing opened, ",
        again,
        ", email us at ",
        link("mailto:" + EMAIL, EMAIL),
        " or call ",
        link(PHONE_HREF, PHONE),
        ".",
      ]);
      window.location.href = href;
    }

    var sending = false;

    function sendToEndpoint(endpoint) {
      if (sending) return;
      sending = true;
      var original = submit.innerHTML;
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Sending…";
      showStatus("info", ["Sending your request…"]);

      var data = new FormData(form);
      data.set("service", value("service"));
      data.set("_subject", "Bathroom quote request from " + value("name"));
      var controller = "AbortController" in window ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
      }, 15000);

      var honeypot = document.getElementById("company-website");
      var request =
        honeypot && honeypot.value
          ? Promise.resolve({ ok: true })
          : fetch(endpoint, {
              method: "POST",
              body: data,
              headers: { Accept: "application/json" },
              signal: controller ? controller.signal : undefined,
            });

      request
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          form.reset();
          try {
            sessionStorage.removeItem(SUMMARY_KEY);
          } catch (e) {
            /* ignore */
          }
          var note = document.getElementById("estimate-prefill-note");
          if (note) note.hidden = true;
          showStatus("success", [
            strong("Request sent."),
            " Thank you — we've received your request and will get back to you as soon as we can. If it's urgent, call ",
            link(PHONE_HREF, PHONE),
            ".",
          ]);
        })
        .catch(function () {
          showStatus("error", [
            strong("Sorry, your request wasn't sent."),
            " Nothing you entered has been lost — please try again, or call us at ",
            link(PHONE_HREF, PHONE),
            " or email ",
            link("mailto:" + EMAIL, EMAIL),
            ".",
          ]);
        })
        .then(function () {
          clearTimeout(timer);
          sending = false;
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
          submit.innerHTML = original;
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var errors = validate();
      var first = ["name", "phone", "email"].filter(function (id) {
        return errors[id];
      })[0];
      if (first) {
        document.getElementById(first).focus();
        return;
      }
      configReady.then(function (config) {
        var endpoint = config && config.leadForm.endpoint;
        if (endpoint) sendToEndpoint(endpoint);
        else sendByEmailApp();
      });
    });
  }
});
