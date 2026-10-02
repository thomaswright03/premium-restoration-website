// Premium Restoration — public site behaviour: navigation, FAQ, the chat
// assistant and its bathroom price estimate, and the Get a Quote form.
//
// Settings (price estimator on/off, lead-form endpoint, owner details) come
// from site-config.json via js/site-config.js — see README "Site settings".

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var PHONE = "(385) 356-8733";
  var EMAIL = "eduardo.moroni77@gmail.com";
  var I18n = window.I18n;
  var T = I18n.t;
  var CONTACT = { phone: PHONE, email: EMAIL };
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

  // Language menu (a <details> in the nav): close it on a click elsewhere or
  // Escape. The chosen language is saved by the page's head script, from the
  // ?lang= its links carry.
  var langMenu = document.querySelector(".lang-menu");
  if (langMenu) {
    document.addEventListener("click", function (e) {
      if (langMenu.open && !langMenu.contains(e.target)) langMenu.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && langMenu.open) {
        langMenu.open = false;
        langMenu.querySelector("summary").focus();
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

    // Materials picker uses MOCK product/price data (js/materials-pricing.js)
    // until a real pricing source is connected — off unless the owner has
    // deliberately turned it on in site-config.json.
    function materialsEstimatorEnabled() {
      return !!(siteConfig && siteConfig.materialsEstimator && siteConfig.materialsEstimator.enabled);
    }

    // The 3D bathroom room preview (js/bathroom-room-3d.js) is off unless
    // the owner has deliberately turned it on in site-config.json.
    function bathroomRoom3dEnabled() {
      return !!(siteConfig && siteConfig.bathroomVisualizer && siteConfig.bathroomVisualizer.enabled);
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
      parts.inner.firstChild.textContent = role === "user" ? T("chat.you") : "PR";
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
      btn.textContent = T("chat.estimateButton");
      btn.addEventListener("click", function () {
        parts.row.remove();
        enterFullscreen();
        sendChatMessage(T("chat.estimateRequest"));
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
      progressLabel.textContent = T("progress.complete", { pct: pct });
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
    // Active only between "fixtures" finishing and the combined card
    // rendering — the ZIP + per-category real-product-pick steps that now
    // follow fixtures automatically, no separate button/gate. See
    // startProductPicks()/advanceProductPick() below.
    var pickState = null; // { values, scope, laborResult, groups, groupIndex, categories, categoryIndex, zip, picks, mainSteps, totalSteps }

    function buildGroups(scope) {
      var needs = Pricing.scopeNeeds(scope || {});
      var groups = [
        {
          id: "scope",
          intro: T("flow.scopeIntro"),
          fields: Pricing.SCOPE_QUESTIONS.map(function (q) {
            return { key: q.key, label: q.label, type: "choice", options: q.options, target: "scope" };
          }),
        },
      ];
      if (scope && needs.floorArea) {
        groups.push({
          id: "dimensions",
          intro: T(needs.height ? "flow.dimensionsIntroHeight" : "flow.dimensionsIntro"),
          fields: Pricing.DIMENSIONS.filter(function (d) {
            return d.key !== "Bathroom_Height_Ft" || needs.height;
          }).map(function (d) {
            return {
              key: d.key,
              label: T("flow.dimensionLabel", { label: d.label }),
              type: "number",
              inputmode: "decimal",
              target: "values",
            };
          }),
        });
      }
      // Room shape — which wall(s) carry the plumbing stack and where the
      // entry point(s) are — comes before fixture counts, not after: these
      // are basic facts about the room itself (like its dimensions), not
      // something derived from what fixtures end up chosen. Both steps are
      // skippable, so asking before fixtures are picked is harmless even if
      // the job turns out to need no plumbing fixtures at all. Only offered
      // when the 3D preview is actually up and running (room3dInteractive())
      // — otherwise there is nothing to click.
      // Whether the entry-points step runs (just above): when it does, it's
      // the source of truth for how many entry doors there are (see
      // appendEntryPointsStep()) — the "Entry doors" fixture-count field
      // would just be asking the same thing a second time, so it's left out
      // of the fixtures group below. When the 3D preview is off there's no
      // other way to say how many entry doors there are, so it stays.
      var entryPointsStepRuns = !!(scope && room3dInteractive());
      if (entryPointsStepRuns) {
        groups.push({ id: "plumbing-walls" });
        groups.push({ id: "entry-points" });
      }
      groups.push({
        id: "fixtures",
        intro: T("flow.fixturesIntro"),
        fields: Pricing.FIXTURES.filter(function (f) {
          return f.key !== "Door_Quantity" || !entryPointsStepRuns;
        }).map(function (f) {
          return { key: f.key, label: f.plural, type: "number", inputmode: "numeric", target: "values" };
        }),
      });
      return groups;
    }

    // Bumped whenever a flow starts or is cancelled, so a listener left
    // behind by an earlier run (see BathroomRoom3D.onChange()) knows to stop.
    var flowRun = 0;

    function startEstimate() {
      flowRun++;
      quoteState = { groups: buildGroups(null), index: 0, values: {}, scope: {} };
      pickState = null;
      chatForm.hidden = true;
      setProgress(0);
      if (window.BathroomRoom3D) {
        window.BathroomRoom3D.reset();
        if (bathroomRoom3dEnabled()) window.BathroomRoom3D.show();
        else window.BathroomRoom3D.hide();
      }
      appendGroupForm();
    }

    // Shared Cancel handler for every step of the one continuous flow —
    // scope/dimensions/room-shape/fixtures (quoteState) and the product-pick
    // steps that follow them (pickState). Whichever is active gets cleared;
    // the other is already null.
    function cancelFlow() {
      flowRun++;
      quoteState = null;
      pickState = null;
      if (window.BathroomRoom3D) window.BathroomRoom3D.hide();
      hideProgress();
      chatForm.hidden = false;
      appendChatRow("bot", T("flow.cancelled"));
      chatInput.focus();
    }

    // Whether the room-interaction steps (wall-click plumbing walls / entry
    // points) make sense to offer: the 3D preview must be on AND actually
    // up and running (ensureScene() succeeded) — otherwise there is nothing
    // for the customer to click, and the steps would strand them on a
    // "no wall selected yet" screen that can never resolve.
    function room3dInteractive() {
      return !!(bathroomRoom3dEnabled() && window.BathroomRoom3D && window.BathroomRoom3D.available);
    }

    function advance() {
      if (quoteState.index === 0) {
        // The scope decides which measurements are asked for, and whether
        // the room-interaction steps are offered — see buildGroups().
        quoteState.groups = buildGroups(quoteState.scope);
      }
      quoteState.index++;
      if (quoteState.index < quoteState.groups.length) {
        setProgress(Math.round((quoteState.index / quoteState.groups.length) * 100));
        appendGroupForm();
        return;
      }
      // Fixtures (always the last group here) just finished — move
      // straight into per-category real-product picks, no separate
      // button/gate. startProductPicks() takes over progress tracking and
      // eventually renders the one combined estimate card.
      var state = quoteState;
      quoteState = null;
      startProductPicks(state.values, state.scope, state.groups.length);
    }

    var fieldCounter = 0;

    // Spanish and Portuguese speakers often write 7,5 for 7.5.
    function localNumber(text) {
      if (I18n.lang() === "en") return text;
      return /^\s*\d+,\d+\s*$/.test(text) ? text.replace(",", ".") : text;
    }

    function appendGroupForm() {
      var group = quoteState.groups[quoteState.index];
      if (group.id === "plumbing-walls") {
        appendPlumbingWallsStep();
        return;
      }
      if (group.id === "entry-points") {
        appendEntryPointsStep();
        return;
      }
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
              if (window.BathroomRoom3D) window.BathroomRoom3D.setScope(field.key, option.value);
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
            if (!window.BathroomRoom3D) return;
            var typed = localNumber(input.value);
            if (group.id === "dimensions") window.BathroomRoom3D.setDimension(field.key, typed);
            else window.BathroomRoom3D.setFixtureCount(field.key, typed);
          });
          fieldEls[field.key] = { wrap: fieldWrap, error: errorEl, focus: input, input: input };
          readers.push(function () {
            quoteState.values[field.key] = localNumber(input.value.trim());
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
      cancelBtn.textContent = T("flow.cancel");
      cancelBtn.addEventListener("click", function () {
        disableForm();
        cancelFlow();
      });
      var continueBtn = document.createElement("button");
      continueBtn.type = "submit";
      continueBtn.className = "ai-chat-group-continue";
      var isLast = quoteState.index === quoteState.groups.length - 1 && group.id !== "scope";
      continueBtn.textContent = T(isLast ? "flow.getEstimate" : "flow.continue");
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
        // Beyond just being valid numbers, fixture counts also have to
        // actually fit the room — the same clearance/overlap/anchor checks
        // the 3D preview's own layout always runs, just run here first so a
        // count that would just get silently dropped is blocked instead,
        // with the customer told which one and why.
        if (!firstBad && group.id === "fixtures" && room3dInteractive()) {
          var dropped = window.BathroomRoom3D.checkFit(quoteState.values);
          group.fields.forEach(function (field) {
            if (!firstBad && dropped[field.key]) {
              firstBad = field.key;
              showFieldError(field.key, T("flow.doesNotFit"));
            }
          });
        }
        summaryError.hidden = !firstBad;
        summaryError.textContent = firstBad ? T("flow.fixHighlighted") : "";
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

    // ---------- room interaction: plumbing walls ----------
    // Which wall(s) carry the plumbing stack, picked by clicking directly
    // on the 3D preview (multi-select) — restricts where toilet/sink/tub/
    // shower can be placed. Skippable: skipping (or picking nothing) just
    // leaves those fixtures unrestricted, same as before this step existed.
    function appendPlumbingWallsStep() {
      var parts = botRow();
      var content = document.createElement("div");
      content.className = "ai-chat-text";

      var introEl = document.createElement("p");
      introEl.className = "ai-chat-group-intro";
      introEl.textContent = T("walls.intro");
      content.appendChild(introEl);

      var statusEl = document.createElement("p");
      statusEl.className = "ai-chat-group-intro";
      statusEl.textContent = T("walls.none");
      content.appendChild(statusEl);

      var actionsWrap = document.createElement("div");
      actionsWrap.className = "ai-chat-group-actions";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "ai-chat-group-cancel";
      cancelBtn.textContent = T("flow.cancel");
      var skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "ai-chat-group-cancel";
      skipBtn.textContent = T("flow.skip");
      var continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "ai-chat-group-continue";
      continueBtn.textContent = T("flow.continue");
      continueBtn.disabled = true;
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(skipBtn);
      actionsWrap.appendChild(continueBtn);
      content.appendChild(actionsWrap);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();

      function disableActions() {
        cancelBtn.disabled = true;
        skipBtn.disabled = true;
        continueBtn.disabled = true;
      }

      var selectedIds = [];
      function finish(ids) {
        disableActions();
        window.BathroomRoom3D.endWallPicking();
        window.BathroomRoom3D.setPlumbingWalls(ids);
        advance();
      }
      cancelBtn.addEventListener("click", function () {
        disableActions();
        window.BathroomRoom3D.endWallPicking();
        cancelFlow();
      });
      skipBtn.addEventListener("click", function () {
        finish([]);
      });
      continueBtn.addEventListener("click", function () {
        finish(selectedIds);
      });

      window.BathroomRoom3D.beginWallPicking("multi", function (ids) {
        selectedIds = ids;
        continueBtn.disabled = ids.length === 0;
        statusEl.textContent =
          ids.length === 0 ? T("walls.none") : T(ids.length === 1 ? "walls.one" : "walls.many", { n: ids.length });
      });
    }

    // ---------- room interaction: entry points ----------
    // How many doors/openings into the bathroom, and for each: which wall
    // (click to pick), nudge left/right along it, and whether it has a
    // door. Skippable at the count step; the default (unrestricted, no
    // explicit entry point) layout still works fine without it.
    function appendEntryPointsStep() {
      var parts = botRow();
      var content = document.createElement("div");
      content.className = "ai-chat-text";

      var introEl = document.createElement("p");
      introEl.className = "ai-chat-group-intro";
      introEl.textContent = T("entry.howMany");
      content.appendChild(introEl);

      var formEl = document.createElement("form");
      formEl.noValidate = true;
      var fieldWrap = document.createElement("div");
      fieldWrap.className = "ai-chat-group-field";
      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.placeholder = "1";
      input.value = "1";
      fieldWrap.appendChild(input);
      formEl.appendChild(fieldWrap);

      var actionsWrap = document.createElement("div");
      actionsWrap.className = "ai-chat-group-actions";
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "ai-chat-group-cancel";
      cancelBtn.textContent = T("flow.cancel");
      var skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "ai-chat-group-cancel";
      skipBtn.textContent = T("flow.skip");
      var continueBtn = document.createElement("button");
      continueBtn.type = "submit";
      continueBtn.className = "ai-chat-group-continue";
      continueBtn.textContent = T("flow.continue");
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(skipBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);
      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();

      cancelBtn.addEventListener("click", function () {
        disableAll(content);
        cancelFlow();
      });

      function disableAll(root) {
        Array.prototype.forEach.call(root.querySelectorAll("input, button"), function (el) {
          el.disabled = true;
        });
      }

      skipBtn.addEventListener("click", function () {
        disableAll(content);
        quoteState.values.Door_Quantity = "0";
        advance();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        var n = Math.round(parseFloat(input.value));
        if (!isFinite(n) || n < 1) n = 1;
        if (n > 4) n = 4;
        disableAll(content);
        collectEntryPoint(n, 0);
      });

      // Entry doors are no longer asked for separately (see buildGroups()) —
      // this is now their one source of truth, read straight off what was
      // actually confirmed above (an entry point counts unless its own
      // "No — open archway" answer said otherwise).
      function recordDoorCount() {
        var points = window.BathroomRoom3D.getEntryPoints();
        var doorCount = points.filter(function (ep) {
          return ep.hasDoor !== false;
        }).length;
        quoteState.values.Door_Quantity = String(doorCount);
      }

      function collectEntryPoint(total, i) {
        if (i >= total) {
          recordDoorCount();
          window.BathroomRoom3D.endWallPicking();
          advance();
          return;
        }
        appendOneEntryPoint(total, i);
      }

      function appendOneEntryPoint(total, i) {
        var epParts = botRow();
        var epContent = document.createElement("div");
        epContent.className = "ai-chat-text";

        var epIntro = document.createElement("p");
        epIntro.className = "ai-chat-group-intro";
        epIntro.textContent = total > 1 ? T("entry.clickWallOf", { i: i + 1, n: total }) : T("entry.clickWall");
        epContent.appendChild(epIntro);

        var wallStatus = document.createElement("p");
        wallStatus.className = "ai-chat-group-intro";
        wallStatus.textContent = T("entry.noWall");
        epContent.appendChild(wallStatus);

        // Visible from the start (not nested inside detailsWrap, which
        // stays hidden until a wall is picked below) — otherwise a visitor
        // who wants out right at "click its wall" has no button at all to
        // do that with.
        var topActionsWrap = document.createElement("div");
        topActionsWrap.className = "ai-chat-group-actions";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "ai-chat-group-cancel";
        cancelBtn.textContent = T("flow.cancel");
        cancelBtn.addEventListener("click", function () {
          disableAll(epContent);
          window.BathroomRoom3D.endWallPicking();
          cancelFlow();
        });
        topActionsWrap.appendChild(cancelBtn);
        epContent.appendChild(topActionsWrap);

        var detailsWrap = document.createElement("div");
        detailsWrap.hidden = true;

        var nudgeWrap = document.createElement("div");
        nudgeWrap.className = "ai-chat-group-actions";
        var leftBtn = document.createElement("button");
        leftBtn.type = "button";
        leftBtn.className = "ai-chat-group-cancel";
        leftBtn.textContent = T("entry.left");
        var rightBtn = document.createElement("button");
        rightBtn.type = "button";
        rightBtn.className = "ai-chat-group-cancel";
        rightBtn.textContent = T("entry.right");
        nudgeWrap.appendChild(leftBtn);
        nudgeWrap.appendChild(rightBtn);
        detailsWrap.appendChild(nudgeWrap);

        var doorLabel = document.createElement("p");
        doorLabel.className = "ai-chat-field-label";
        doorLabel.textContent = T("entry.hasDoor");
        detailsWrap.appendChild(doorLabel);

        var doorChoices = document.createElement("div");
        doorChoices.className = "ai-chat-choices";
        var hasDoor = true;
        var chosenWallId = null;
        var doorButtons = [];
        [
          { label: T("choice.yes"), value: true },
          { label: T("entry.archway"), value: false },
        ].forEach(function (option) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ai-chat-choice";
          btn.textContent = option.label;
          btn.setAttribute("aria-pressed", option.value === hasDoor ? "true" : "false");
          btn.addEventListener("click", function () {
            hasDoor = option.value;
            doorButtons.forEach(function (other) {
              var isThis = other === btn;
              other.classList.toggle("selected", isThis);
              other.setAttribute("aria-pressed", isThis ? "true" : "false");
            });
            window.BathroomRoom3D.setEntryPoint(i, { wallId: chosenWallId, hasDoor: hasDoor });
          });
          btn.classList.toggle("selected", option.value === hasDoor);
          doorButtons.push(btn);
          doorChoices.appendChild(btn);
        });
        detailsWrap.appendChild(doorChoices);

        var confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "ai-chat-group-continue";
        confirmBtn.textContent = T(i === total - 1 ? "entry.confirm" : "entry.confirmNext");
        confirmBtn.disabled = true;
        detailsWrap.appendChild(confirmBtn);
        var fitError = document.createElement("p");
        fitError.className = "ai-chat-field-error";
        fitError.hidden = true;
        detailsWrap.appendChild(fitError);
        epContent.appendChild(detailsWrap);
        epParts.inner.appendChild(epContent);
        chatMessages.appendChild(epParts.row);
        scrollToEnd();

        leftBtn.addEventListener("click", function () {
          window.BathroomRoom3D.nudgeEntryPoint(i, -0.5);
          fitError.hidden = true;
        });
        rightBtn.addEventListener("click", function () {
          window.BathroomRoom3D.nudgeEntryPoint(i, 0.5);
          fitError.hidden = true;
        });
        confirmBtn.addEventListener("click", function () {
          // Same clearance/overlap check computeLayout always runs, against
          // just the entry points confirmed so far (this one included) —
          // catches a wall too narrow for the door, or a position that
          // overlaps something already placed, before it gets silently
          // dropped later.
          var dropped = window.BathroomRoom3D.checkFit({});
          if (dropped.Door_Quantity) {
            fitError.textContent = T("entry.doesNotFit");
            fitError.hidden = false;
            return;
          }
          fitError.hidden = true;
          disableAll(epContent);
          collectEntryPoint(total, i + 1);
        });

        window.BathroomRoom3D.beginWallPicking("single", function (ids, justClicked) {
          chosenWallId = justClicked;
          wallStatus.textContent = T("entry.wallSelected");
          detailsWrap.hidden = false;
          confirmBtn.disabled = false;
          window.BathroomRoom3D.setEntryPoint(i, { wallId: chosenWallId, hasDoor: hasDoor });
        });
      }
    }

    // ---------- estimate card ----------
    // hasMaterials is true once at least one real product was picked in the
    // product-pick steps that follow fixtures (see startProductPicks()) —
    // false when that never happened (materials estimator off, or no
    // category applied), in which case the total/disclaimer/etc. describe a
    // labor-only estimate exactly as before that feature existed.
    function estimateDisclaimer(hasMaterials) {
      return T(hasMaterials ? "card.disclaimerMaterials" : "card.disclaimer");
    }

    function totalLabel(fixtureCount, hasMaterials) {
      var key = hasMaterials ? "card.totalMaterials" : "card.total";
      return T(fixtureCount > 0 ? key + "BeforePlumbing" : key);
    }

    function plumbingTotalNote(fixtureCount) {
      return T("card.plumbingTotalNote", { n: Pricing.formatQty(fixtureCount) });
    }

    function excludedLines(fixtureCount, hasMaterials) {
      var list = [];
      if (fixtureCount > 0) {
        list.push({
          label: T("card.excluded.listedPlumbing", { n: Pricing.formatQty(fixtureCount) }),
          value: T("card.excluded.extra"),
        });
      }
      list.push({
        label: T(fixtureCount > 0 ? "card.excluded.otherTrades" : "card.excluded.trades"),
        value: T("card.excluded.extra"),
      });
      list.push({
        label: T(hasMaterials ? "card.excluded.permits" : "card.excluded.materialsPermits"),
        value: T("card.excluded.notIncluded"),
      });
      return list;
    }

    function allAssumptions(values, scope, result, hasMaterials) {
      return Pricing.estimateAssumptions(values, scope, result).concat([
        T("card.plumbingNote"),
        T(hasMaterials ? "card.materialsNote" : "card.alsoNotIncluded"),
      ]);
    }

    function businessLine() {
      var name = siteConfig && siteConfig.owner.legalName;
      return T(name ? "card.businessNamed" : "card.business", { name: name });
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    // The single card that ends the flow — labor lines, then (if any real
    // products were picked in the product-pick steps) material lines, one
    // grand total, and the usual disclaimers/actions. hasMaterials controls
    // which copy/labels are used throughout (see totalLabel()/
    // excludedLines()/allAssumptions()/estimateDisclaimer() above).
    function appendCombinedCard(values, scope, result, categories, picks, notes) {
      var fixtureCount = result.plumbingFixtureCount;
      var pickList = categories
        .map(function (c) {
          return picks[c.key];
        })
        .filter(Boolean);
      var materialsSubtotal = Pricing.roundCents(
        pickList.reduce(function (sum, p) {
          return sum + p.cost;
        }, 0),
      );
      var grandTotal = Pricing.roundCents(result.subtotal + materialsSubtotal);
      var hasMaterials = pickList.length > 0;
      var assumptions = allAssumptions(values, scope, result, hasMaterials);

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      var card = el("div", "ai-chat-estimate");
      card.setAttribute("data-testid", "estimate-card");

      var head = el("div", "ai-chat-estimate-header");
      head.appendChild(el("p", "eyebrow", T("card.eyebrow")));
      head.appendChild(el("h3", null, T("card.title")));
      head.appendChild(el("p", "ai-chat-estimate-lede", T(hasMaterials ? "card.ledeMaterials" : "card.lede")));
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
        empty.appendChild(el("span", null, T("card.noWork")));
        empty.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(0)));
        lines.appendChild(empty);
      }
      card.appendChild(lines);

      if (hasMaterials) {
        var laborSubtotalWrap = el("div", "ai-chat-estimate-line muted");
        laborSubtotalWrap.appendChild(el("span", null, T("card.laborSubtotal")));
        laborSubtotalWrap.appendChild(el("span", null, Pricing.money(result.subtotal)));
        card.appendChild(laborSubtotalWrap);

        var materialLines = el("div", "ai-chat-estimate-lines");
        pickList.forEach(function (p) {
          var line = el("div", "ai-chat-estimate-line");
          // A single left-side group (photo + label) keeps the line's own
          // two-child space-between layout (left group, amount) intact —
          // appending the thumbnail as its own third flex child would
          // break that instead of sitting next to the label.
          var leftGroup = el("span", "ai-chat-estimate-line-label");
          if (p.imageUrl) {
            var thumb = document.createElement("img");
            thumb.className = "ai-chat-material-thumb";
            thumb.src = p.imageUrl;
            thumb.alt = "";
            thumb.loading = "lazy";
            leftGroup.appendChild(thumb);
          }
          var textWrap = el("span", null, p.categoryLabel + ": " + p.productName + " ");
          textWrap.appendChild(el("small", "ai-chat-estimate-detail", p.quantityLabel + " · " + p.retailer));
          leftGroup.appendChild(textWrap);
          line.appendChild(leftGroup);
          line.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(p.cost)));
          materialLines.appendChild(line);
        });
        card.appendChild(materialLines);

        var materialsSubtotalWrap = el("div", "ai-chat-estimate-line muted");
        materialsSubtotalWrap.appendChild(el("span", null, T("card.materialsSubtotal")));
        materialsSubtotalWrap.appendChild(el("span", null, Pricing.money(materialsSubtotal)));
        card.appendChild(materialsSubtotalWrap);
      }
      (notes || []).forEach(function (note) {
        card.appendChild(el("p", "ai-chat-estimate-total-note", note));
      });

      var excluded = el("div", "ai-chat-estimate-excluded");
      excludedLines(fixtureCount, hasMaterials).forEach(function (x) {
        var line = el("div", "ai-chat-estimate-line muted");
        line.appendChild(el("span", null, x.label));
        line.appendChild(el("span", null, x.value));
        excluded.appendChild(line);
      });
      card.appendChild(excluded);

      var totalWrap = el("div", "ai-chat-estimate-total");
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-label", totalLabel(fixtureCount, hasMaterials)));
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-value", Pricing.money(grandTotal)));
      card.appendChild(totalWrap);

      if (fixtureCount > 0) card.appendChild(el("p", "ai-chat-estimate-total-note", plumbingTotalNote(fixtureCount)));

      card.appendChild(el("p", "ai-chat-estimate-disclaimer", estimateDisclaimer(hasMaterials)));

      var assumptionsWrap = el("div", "ai-chat-estimate-assumptions");
      assumptionsWrap.appendChild(el("p", "ai-chat-estimate-assumptions-title", T("card.assumptions")));
      var list = el("ul");
      assumptions.forEach(function (a) {
        list.appendChild(el("li", null, a));
      });
      assumptionsWrap.appendChild(list);
      card.appendChild(assumptionsWrap);

      if (hasMaterials) {
        var shoppingWrap = el("div", "ai-chat-estimate-assumptions ai-chat-materials-shopping");
        shoppingWrap.appendChild(el("p", "ai-chat-estimate-assumptions-title", T("card.whereToBuy")));
        var shopList = document.createElement("ul");
        pickList.forEach(function (p) {
          var item = document.createElement("li");
          item.appendChild(document.createTextNode(p.categoryLabel + ": " + p.productName + " — "));
          if (p.url) {
            var link = document.createElement("a");
            link.href = p.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = p.retailer;
            item.appendChild(link);
          } else {
            item.appendChild(document.createTextNode(p.retailer));
          }
          item.appendChild(document.createTextNode(" — " + Pricing.money(p.cost)));
          shopList.appendChild(item);
        });
        shoppingWrap.appendChild(shopList);
        card.appendChild(shoppingWrap);
      }

      var actions = el("div", "ai-chat-estimate-actions");
      var exportBtn = el("button", "ai-chat-estimate-export", T("card.exportPdf"));
      exportBtn.type = "button";
      var pdfStatus = el("p", "ai-chat-estimate-pdf-status");
      pdfStatus.setAttribute("role", "status");
      pdfStatus.hidden = true;
      exportBtn.addEventListener("click", function () {
        exportCombinedPdf(
          exportBtn,
          pdfStatus,
          result,
          assumptions,
          pickList,
          materialsSubtotal,
          grandTotal,
          hasMaterials,
        );
      });
      actions.appendChild(exportBtn);

      var cta = el("a", "ai-chat-estimate-cta", T("card.contactCta"));
      cta.href = "contact.html?from=estimate";
      cta.addEventListener("click", function () {
        try {
          sessionStorage.setItem(
            "pr_estimate_summary",
            buildCombinedSummary(values, scope, result, pickList, materialsSubtotal, grandTotal),
          );
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

    function buildCombinedSummary(values, scope, result, pickList, materialsSubtotal, grandTotal) {
      var out = [Pricing.buildEstimateSummary(values, scope, result)];
      if (pickList.length) {
        out.push("");
        out.push(T("summary.materials"));
        pickList.forEach(function (p) {
          out.push("- " + p.categoryLabel + ": " + p.productName + " (" + p.retailer + ") — " + Pricing.money(p.cost));
        });
        out.push(T("summary.materialsSubtotal", { total: Pricing.money(materialsSubtotal) }));
        out.push(T("summary.grandTotal", { total: Pricing.money(grandTotal) }));
      }
      return out.join("\n");
    }

    function exportCombinedPdf(
      button,
      status,
      result,
      assumptions,
      pickList,
      materialsSubtotal,
      grandTotal,
      hasMaterials,
    ) {
      if (button.disabled) return;
      var label = button.textContent;
      button.disabled = true;
      button.textContent = T("pdf.preparing");
      status.hidden = true;
      status.textContent = "";
      window.EstimatePdf.load()
        .then(function () {
          var fixtureCount = result.plumbingFixtureCount;
          var lines = result.lines.map(function (r) {
            return { label: r.label, detail: r.detail, amount: Pricing.money(r.cost) };
          });
          if (hasMaterials) {
            pickList.forEach(function (p) {
              lines.push({
                label: p.categoryLabel + ": " + p.productName,
                detail: p.quantityLabel + " · " + p.retailer,
                amount: Pricing.money(p.cost),
              });
            });
          }
          var totals = hasMaterials
            ? [
                { label: T("card.laborSubtotal"), value: Pricing.money(result.subtotal) },
                { label: T("card.materialsSubtotal"), value: Pricing.money(materialsSubtotal) },
                { label: totalLabel(fixtureCount, true), value: Pricing.money(grandTotal), strong: true },
              ]
            : [{ label: totalLabel(fixtureCount, false), value: Pricing.money(grandTotal), strong: true }];
          var sections = [{ title: T("card.assumptions"), items: assumptions }];
          if (hasMaterials) {
            sections.push({
              title: T("card.whereToBuy"),
              items: pickList.map(function (p) {
                return (
                  p.categoryLabel +
                  ": " +
                  p.productName +
                  " — " +
                  p.retailer +
                  (p.url ? " (" + p.url + ")" : "") +
                  " — " +
                  Pricing.money(p.cost)
                );
              }),
            });
          }
          var doc = window.EstimatePdf.build({
            title: T(hasMaterials ? "pdf.titleMaterials" : "pdf.title"),
            lines: lines,
            excluded: excludedLines(fixtureCount, hasMaterials),
            totals: totals,
            afterTotal: (fixtureCount > 0 ? [plumbingTotalNote(fixtureCount)] : []).concat([
              estimateDisclaimer(hasMaterials),
            ]),
            sections: sections,
            footer: {
              business: businessLine(),
              phone: PHONE,
              email: EMAIL,
              date: new Date().toLocaleDateString(I18n.locale(), { year: "numeric", month: "long", day: "numeric" }),
            },
          });
          doc.save("premium-restoration-bathroom-estimate.pdf");
          button.disabled = false;
          button.textContent = label;
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = T("pdf.retry");
          status.hidden = false;
          status.textContent = T("pdf.failed");
          status.classList.add("is-error");
        });
    }

    // =====================================================================
    // Product picks — real Home Depot prices (js/materials-pricing.js, see
    // its own header comment for how they're kept up to date). Runs right
    // after "fixtures" finishes, automatically — see startProductPicks()
    // above (called from advance()) — as the next steps in the same one
    // continuous flow, not a separate mode behind a button. Reuses the same
    // fullscreen/progress-bar/group-form UI as the rest of the flow.
    // =====================================================================

    // Fallback category glyph shown until a real product's photo is picked
    // (MaterialsPricing.getOptionsForCategory()'s imageUrl) — used as the
    // choice-button icon before a pick is made, and for any category whose
    // scraped options happen to have no image. Single-stroke, currentColor
    // so they follow the button's text colour (and the site's dark theme)
    // for free.
    var MATERIAL_ICON_SVG = {
      Toilet_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7v5H7z"/><path d="M6 9h9c1 0 1.6.8 1.4 1.8l-1 5.2A3 3 0 0 1 12.5 18.5h-1A3 3 0 0 1 8.6 16l-1-5.2C7.4 9.8 8 9 9 9"/><path d="M8.5 18.5 8 21m7-2.5.5 2.5"/></svg>',
      Sink_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v3M9 4h2"/><path d="M4 10h16"/><ellipse cx="12" cy="14" rx="8" ry="4"/><path d="M9 14a3 3 0 0 0 6 0"/><path d="M8 18l-1 3m10-3 1 3"/></svg>',
      Bathtub_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M4 12a2 2 0 0 1 2-2h1"/><path d="M6 19l-1 2m14-2 1 2M15 4a2 2 0 0 1 2 2v2"/></svg>',
      Shower_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a5 5 0 0 1 10 0"/><circle cx="11" cy="8" r="1.5" fill="currentColor" stroke="none"/><path d="M4 12h14M8 15v1M12 15v2M16 15v1"/></svg>',
      Shower_Door_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18"/><circle cx="9" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
      Door_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="15" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
      Vanity_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="16" height="7" rx="1"/><ellipse cx="12" cy="10" rx="7" ry="3"/><path d="M12 7v1"/></svg>',
      Cabinet_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18"/><circle cx="10" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>',
      Mirror_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="6"/><path d="M9 7l-1.5 8"/></svg>',
      Mirror_Huge_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7l-1.5 10"/></svg>',
      Shower_Shelf_Quantity:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16M6 10V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="15.5" r="1"/></svg>',
      floorTile:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
      flooring:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="4"/><rect x="3" y="14" width="10" height="4"/><rect x="15" y="14" width="6" height="4"/></svg>',
      wallPaint:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="8" height="5" rx="1"/><path d="M8 9v3a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v4"/><circle cx="13" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>',
    };
    MATERIAL_ICON_SVG.wallTile = MATERIAL_ICON_SVG.floorTile;
    MATERIAL_ICON_SVG.ceilingPaint = MATERIAL_ICON_SVG.wallPaint;

    function materialIconSvg(categoryKey) {
      return MATERIAL_ICON_SVG[categoryKey] || "";
    }

    // Called from advance() once "fixtures" finishes. Computes the labor
    // result right away (needed to know which categories even apply) and,
    // if there's anything to pick a real product for, moves straight into
    // the ZIP + per-category steps; otherwise the flow ends here exactly
    // like it always did, with a labor-only card.
    function startProductPicks(values, scope, mainSteps) {
      var result = Pricing.computePublicEstimate(values, scope);
      var categories =
        materialsEstimatorEnabled() && window.MaterialsPricing
          ? window.MaterialsPricing.categoriesFromLines(result.lines)
          : [];
      // With the 3D room up, the fixtures it has Kohler products for are
      // picked there instead (one step per fixture, the camera zoomed in on
      // it), and priced live at Home Depot for the customer's ZIP once
      // they're done. Everything else keeps the catalog picker.
      var groups = kohlerPicksEnabled() ? window.BathroomRoom3D.getProductGroups() : [];
      if (groups.length) {
        categories = categories.filter(function (c) {
          return KOHLER_PRICED_KEYS.indexOf(c.key) === -1;
        });
      }
      if (!categories.length && !groups.length) {
        finishEstimate(values, scope, result, [], {});
        return;
      }
      pickState = {
        values: values,
        scope: scope,
        laborResult: result,
        groups: groups.map(function (g) {
          return g.id;
        }),
        groupIndex: -1,
        categories: categories,
        categoryIndex: -1,
        zip: "",
        picks: {},
        mainSteps: mainSteps,
        totalSteps: mainSteps + 1 + groups.length + categories.length, // +1 for the ZIP step
      };
      setProgress(Math.round((mainSteps / pickState.totalSteps) * 100));
      appendMaterialsZipForm();
    }

    function advanceProductPick() {
      if (pickState.groupIndex + 1 < pickState.groups.length) {
        pickState.groupIndex++;
        setProgress(Math.round(((pickState.mainSteps + 1 + pickState.groupIndex) / pickState.totalSteps) * 100));
        appendKohlerGroupForm(pickState.groups[pickState.groupIndex]);
        return;
      }
      pickState.categoryIndex++;
      if (pickState.categoryIndex < pickState.categories.length) {
        var stepIndex = pickState.mainSteps + 1 + pickState.groups.length + pickState.categoryIndex;
        setProgress(Math.round((stepIndex / pickState.totalSteps) * 100));
        appendMaterialCategoryForm(pickState.categoryIndex);
        return;
      }
      var state = pickState;
      pickState = null;
      if (state.groups.length) {
        if (window.BathroomRoom3D) window.BathroomRoom3D.focusProductGroup(null);
        priceKohlerPicks(state);
        return;
      }
      finishEstimate(state.values, state.scope, state.laborResult, state.categories, state.picks);
    }

    // The one true end of the flow, reached whether or not any product
    // picks happened — renders the combined card and restores the chat
    // input, matching what advance() used to do directly before product
    // picks were folded into this same continuous flow.
    function finishEstimate(values, scope, result, categories, picks, notes) {
      setProgress(100);
      chatForm.hidden = false;
      appendCombinedCard(values, scope, result, categories, picks, notes);
      setTimeout(hideProgress, 1200);
    }

    // Catalog categories the 3D room's Kohler products stand in for. The
    // vanity's cabinet isn't a Kohler product: only its bowl or top and
    // faucet are priced, and the card says the cabinet isn't.
    var KOHLER_PRICED_KEYS = [
      "Toilet_Quantity",
      "Sink_Quantity",
      "Bathtub_Quantity",
      "Shower_Quantity",
      "Shower_Door_Quantity",
      "Vanity_Quantity",
      "Mirror_Quantity",
      "Mirror_Huge_Quantity",
      "Shower_Shelf_Quantity",
    ];

    // Without a pricing service the Kohler picks could only ever come back
    // "not priced", so the catalog picker (real scraped prices) prices those
    // fixtures instead, the same as with the 3D room off.
    function kohlerPicksEnabled() {
      return !!(
        materialsEstimatorEnabled() &&
        productPricingEndpoint() &&
        room3dInteractive() &&
        typeof window.BathroomRoom3D.getProductGroups === "function"
      );
    }

    function productPricingEndpoint() {
      return (siteConfig && siteConfig.productPricing && siteConfig.productPricing.endpoint) || "";
    }

    // One step per placed fixture: the camera zooms in on it and each of
    // its parts gets a dropdown, the same choices as the switcher above the
    // canvas (and kept in sync with it). A stand-in still showing (the
    // generic toilet, the glass enclosure) is swapped for a Kohler product
    // first, so there's something real to price.
    function appendKohlerGroupForm(groupId) {
      var room = window.BathroomRoom3D;
      room.useRealProducts(groupId);
      room.focusProductGroup(groupId);
      var group = currentGroup();

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      content.appendChild(el("p", "ai-chat-group-intro", T("products.which", { fixture: group.label })));

      var formEl = document.createElement("form");
      formEl.className = "ai-chat-group-form";
      var fieldsWrap = el("div", "ai-chat-product-fields");
      formEl.appendChild(fieldsWrap);

      function currentGroup() {
        return (
          room.getProductGroups().filter(function (g) {
            return g.id === groupId;
          })[0] || { id: groupId, label: "", slots: [] }
        );
      }

      function fieldsSignature() {
        return JSON.stringify(currentGroup().slots);
      }
      var renderedSignature = "";

      // Redrawn after every pick: one pick can change what another slot
      // offers (a 36 in. base only takes pivot doors).
      function renderFields() {
        fieldsWrap.textContent = "";
        renderedSignature = fieldsSignature();
        currentGroup().slots.forEach(function (slot) {
          var fieldWrap = el("div", "ai-chat-group-field");
          var id = "ai-chat-product-pick-" + slot.id;
          var label = el("label", "ai-chat-field-label", slot.label);
          label.htmlFor = id;
          fieldWrap.appendChild(label);
          var select = document.createElement("select");
          select.id = id;
          select.className = "ai-chat-product-select";
          slot.options.forEach(function (opt) {
            var o = document.createElement("option");
            o.value = opt.id;
            o.textContent = opt.label + (opt.reason ? " (" + opt.reason + ")" : "");
            o.disabled = !!opt.reason;
            select.appendChild(o);
          });
          select.value = slot.value;
          select.addEventListener("change", function () {
            room.setProductPick(slot.id, select.value);
            renderFields();
            var again = document.getElementById(id);
            if (again) again.focus({ preventScroll: true });
          });
          fieldWrap.appendChild(select);
          fieldsWrap.appendChild(fieldWrap);
        });
      }
      renderFields();

      // A pick made in the switcher above the room (or one the room had to
      // change because it no longer fits) shows here too, so these
      // dropdowns always match what's priced.
      var run = flowRun;
      var stopSync = room.onChange(function () {
        if (run !== flowRun || (continueBtn && continueBtn.disabled)) {
          stopSync();
          return;
        }
        if (fieldsSignature() !== renderedSignature) renderFields();
      });

      var actionsWrap = el("div", "ai-chat-group-actions");
      var cancelBtn = el("button", "ai-chat-group-cancel", T("flow.cancel"));
      cancelBtn.type = "button";
      var isLast =
        pickState.groupIndex === pickState.groups.length - 1 &&
        pickState.categoryIndex + 1 >= pickState.categories.length;
      var continueBtn = el("button", "ai-chat-group-continue", T(isLast ? "flow.seeEstimate" : "flow.continue"));
      continueBtn.type = "submit";
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);

      function disableForm() {
        Array.prototype.forEach.call(formEl.querySelectorAll("select, button"), function (elx) {
          elx.disabled = true;
        });
      }

      cancelBtn.addEventListener("click", function () {
        disableForm();
        cancelFlow();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        disableForm();
        advanceProductPick();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      var first = formEl.querySelector("select");
      if (first) first.focus({ preventScroll: true });
    }

    // Asks the pricing service (site-config.json productPricing.endpoint,
    // see tools/pricing-service/) for each model's current price at the
    // Home Depot store nearest the ZIP. Resolves to { store, results:
    // { MMN: { price, name, url } } }, or null when there's no service or
    // it didn't answer — the card then says those products aren't priced.
    function fetchProductPrices(zip, mmns) {
      var endpoint = productPricingEndpoint();
      if (!endpoint || !window.fetch) return Promise.resolve(null);
      var controller = window.AbortController ? new AbortController() : null;
      var timer = controller
        ? setTimeout(function () {
            controller.abort();
          }, 150000)
        : null;
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: zip, mmns: mmns }),
        signal: controller ? controller.signal : undefined,
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .catch(function () {
          return null;
        })
        .then(function (data) {
          if (timer) clearTimeout(timer);
          return data && data.results ? data : null;
        });
    }

    // Prices everything the Kohler steps put in the room, then shows the
    // card: a line per product with its live price (times how many of that
    // fixture there are), and a note naming anything without one.
    function priceKohlerPicks(state) {
      var items = window.BathroomRoom3D.getProductPricingItems();
      var pricedSignature = JSON.stringify(items);
      var run = flowRun;
      var mmns = [];
      items.forEach(function (item) {
        item.mmns.forEach(function (m) {
          if (mmns.indexOf(m) === -1) mmns.push(m);
        });
      });
      var waiting = botRow();
      waiting.inner.appendChild(el("div", "ai-chat-text", T("products.checking", { zip: state.zip })));
      chatMessages.appendChild(waiting.row);
      scrollToEnd();

      fetchProductPrices(state.zip, mmns).then(function (data) {
        waiting.row.remove();
        var results = (data && data.results) || {};
        var retailer = data && data.store ? T("products.retailer", { store: data.store }) : "Home Depot";
        var categories = state.categories.slice();
        var unpriced = [];
        items.forEach(function (item) {
          var prices = item.mmns.map(function (m) {
            return results[m] && typeof results[m].price === "number" ? results[m] : null;
          });
          var label = item.slotLabel + ": " + item.productLabel;
          if (prices.indexOf(null) !== -1) {
            unpriced.push(label);
            return;
          }
          var each = prices.reduce(function (sum, r) {
            return sum + r.price;
          }, 0);
          var key = "kohler:" + item.slotId;
          categories.push({ key: key, label: item.slotLabel, qty: item.qty, unit: "" });
          state.picks[key] = {
            categoryLabel: item.slotLabel,
            productName: item.productLabel + " (" + item.mmns.join(" + ") + ")",
            imageUrl: null,
            retailer: retailer,
            url: prices[0].url || null,
            quantityLabel: Pricing.formatQty(item.qty) + " " + T(item.qty === 1 ? "unit.unit" : "unit.units"),
            cost: Pricing.roundCents(each * item.qty),
          };
        });
        var notes = [];
        if (unpriced.length) notes.push(T("products.unpriced", { items: unpriced.join("; ") }));
        var hasVanity = items.some(function (item) {
          return item.groupId === "vanity";
        });
        if (hasVanity) notes.push(T("products.vanityCabinet"));
        finishEstimate(state.values, state.scope, state.laborResult, categories, state.picks, notes);
        if (run === flowRun) offerRepriceOnChange(state, pricedSignature);
      });
    }

    // The room stays live under the estimate card. If the products in it
    // change (a different pick, a fixture moved off, a fit swap), say the
    // card is out of date and offer to price the room as it is now.
    function offerRepriceOnChange(state, pricedSignature) {
      var run = flowRun;
      var stop = window.BathroomRoom3D.onChange(function () {
        if (run !== flowRun || quoteState || pickState) {
          stop();
          return;
        }
        if (JSON.stringify(window.BathroomRoom3D.getProductPricingItems()) === pricedSignature) return;
        stop();
        var parts = botRow();
        var content = el("div", "ai-chat-text");
        content.appendChild(el("p", "ai-chat-group-intro", T("products.roomChanged")));
        var btn = el("button", "ai-chat-group-continue", T("products.reprice"));
        btn.type = "button";
        btn.addEventListener("click", function () {
          btn.disabled = true;
          if (run !== flowRun || quoteState || pickState) return;
          chatForm.hidden = true;
          priceKohlerPicks(state);
        });
        content.appendChild(btn);
        parts.inner.appendChild(content);
        chatMessages.appendChild(parts.row);
        scrollToEnd();
      });
    }

    function appendMaterialsZipForm() {
      var parts = botRow();
      var content = el("div", "ai-chat-text");
      content.appendChild(el("p", "ai-chat-group-intro", T("materials.zipIntro")));

      var formEl = document.createElement("form");
      formEl.className = "ai-chat-group-form";

      var fieldWrap = el("div", "ai-chat-group-field");
      fieldWrap.appendChild(el("label", "ai-chat-field-label", T("materials.zipLabel")));
      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = "postal-code";
      input.placeholder = "84101";
      // Not 5 — a stray leading/trailing space (autofill, a pasted value
      // with whitespace) would eat one of only 5 slots and silently
      // truncate a real digit before the trim+regex check below ever runs,
      // rejecting an otherwise-valid ZIP with no obvious reason why. The
      // real validation is that check, not this attribute; this is just
      // loose headroom against pasting something absurdly long.
      input.maxLength = 10;
      fieldWrap.appendChild(input);
      var errorEl = el("p", "ai-chat-field-error");
      errorEl.hidden = true;
      fieldWrap.appendChild(errorEl);
      input.addEventListener("input", function () {
        errorEl.hidden = true;
        fieldWrap.classList.remove("has-error");
      });
      formEl.appendChild(fieldWrap);

      var actionsWrap = el("div", "ai-chat-group-actions");
      var cancelBtn = el("button", "ai-chat-group-cancel", T("flow.cancel"));
      cancelBtn.type = "button";
      var continueBtn = el("button", "ai-chat-group-continue", T("flow.continue"));
      continueBtn.type = "submit";
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);

      function disableForm() {
        Array.prototype.forEach.call(formEl.querySelectorAll("input, button"), function (elx) {
          elx.disabled = true;
        });
      }

      cancelBtn.addEventListener("click", function () {
        disableForm();
        cancelFlow();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        var zip = input.value.trim();
        if (!/^\d{5}$/.test(zip)) {
          errorEl.textContent = T("materials.zipError");
          errorEl.hidden = false;
          fieldWrap.classList.add("has-error");
          input.focus();
          return;
        }
        pickState.zip = zip;
        disableForm();
        advanceProductPick();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      input.focus({ preventScroll: true });
    }

    function appendMaterialCategoryForm(index) {
      var category = pickState.categories[index];
      var options = window.MaterialsPricing.getOptionsForCategory(category.key, pickState.zip);

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      content.appendChild(
        el(
          "p",
          "ai-chat-group-intro",
          T("materials.which", {
            label: category.label.toLowerCase(),
            qty: Pricing.formatQty(category.qty),
            unit: category.unit,
          }),
        ),
      );

      var formEl = document.createElement("form");
      formEl.className = "ai-chat-group-form";

      var fieldWrap = el("div", "ai-chat-group-field is-choice");
      var errorEl = el("p", "ai-chat-group-error");
      errorEl.hidden = true;
      var choicesWrap = el("div", "ai-chat-choices ai-chat-choices--material");
      var chosen = null;
      var buttons = [];
      var iconSvg = materialIconSvg(category.key);
      options.forEach(function (opt) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ai-chat-choice ai-chat-choice--material";
        if (opt.imageUrl) {
          // The product's own real photo — from the scraped Home Depot
          // listing (see tools/scrapers/build_catalog.py). Falls back to
          // the generic category glyph below when a listing has none.
          var photo = document.createElement("img");
          photo.className = "ai-chat-material-thumb";
          photo.src = opt.imageUrl;
          photo.alt = "";
          photo.loading = "lazy";
          btn.appendChild(photo);
        } else if (iconSvg) {
          var icon = el("span", "ai-chat-material-icon");
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = iconSvg;
          btn.appendChild(icon);
        }
        var textWrap = el("span", "ai-chat-material-text");
        textWrap.appendChild(el("span", "ai-chat-material-name", opt.name));
        textWrap.appendChild(
          el(
            "span",
            "ai-chat-material-price",
            T("materials.priceAt", { price: Pricing.money(opt.best.price), store: opt.best.name }),
          ),
        );
        if (opt.best.compareNote) textWrap.appendChild(el("span", "ai-chat-material-note", opt.best.compareNote));
        btn.appendChild(textWrap);
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", function () {
          chosen = opt;
          buttons.forEach(function (other) {
            var isThis = other === btn;
            other.classList.toggle("selected", isThis);
            other.setAttribute("aria-pressed", isThis ? "true" : "false");
          });
          errorEl.hidden = true;
          // Live-updates the 3D preview toward this product's real finish
          // (best-effort — see MaterialsPricing.guessFinishColor()), the
          // same "see it as you pick it" pattern every other live-updating
          // field in this flow already follows.
          // Floor/wall/ceiling products render as the real product itself
          // (true tile size, layout, color, sheen — see
          // js/surface-finishes.js) rather than a single tint.
          if (window.BathroomRoom3D) {
            var surfaces = window.SurfaceFinishes;
            if (surfaces && surfaces.CATEGORY_SURFACE[category.key]) {
              window.BathroomRoom3D.setSurfaceFinish(category.key, opt);
            } else {
              window.BathroomRoom3D.setFixtureFinish(category.key, window.MaterialsPricing.guessFinishColor(opt.name));
            }
          }
        });
        buttons.push(btn);
        choicesWrap.appendChild(btn);
      });
      fieldWrap.appendChild(choicesWrap);
      formEl.appendChild(fieldWrap);
      formEl.appendChild(errorEl);

      var actionsWrap = el("div", "ai-chat-group-actions");
      var cancelBtn = el("button", "ai-chat-group-cancel", T("flow.cancel"));
      cancelBtn.type = "button";
      var isLast = index === pickState.categories.length - 1;
      var continueBtn = el("button", "ai-chat-group-continue", T(isLast ? "flow.seeEstimate" : "flow.continue"));
      continueBtn.type = "submit";
      actionsWrap.appendChild(cancelBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);

      function disableForm() {
        Array.prototype.forEach.call(formEl.querySelectorAll("button"), function (elx) {
          elx.disabled = true;
        });
      }

      cancelBtn.addEventListener("click", function () {
        disableForm();
        cancelFlow();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!chosen) {
          errorEl.textContent = T("materials.pickOne");
          errorEl.hidden = false;
          return;
        }
        var costInfo = window.MaterialsPricing.computeMaterialCost(
          category.key,
          category.qty,
          category.unit,
          chosen.best.price,
        );
        pickState.picks[category.key] = {
          categoryLabel: category.label,
          productName: chosen.name,
          imageUrl: chosen.imageUrl,
          retailer: chosen.best.name,
          url: chosen.best.url,
          quantityLabel: costInfo.quantityLabel,
          cost: costInfo.cost,
        };
        disableForm();
        advanceProductPick();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      var first = formEl.querySelector(".ai-chat-choice");
      if (first) first.focus({ preventScroll: true });
    }

    // ---------- messages ----------
    function sendChatMessage(message) {
      if (!message) return;
      appendChatRow("user", message);
      chatSend.disabled = true;

      var typing = botRow();
      typing.row.id = "ai-chat-typing-row";
      var dots = el("div", "ai-chat-typing");
      dots.setAttribute("aria-label", T("chat.typing"));
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
              // In practice chatSend being disabled during this ~500-900ms
              // delay already blocks a second Enter-triggered submission
              // (a disabled default submit button stops implicit form
              // submission) — but that's an incidental side effect of
              // button state, not something this code path asserts on
              // purpose. Guard explicitly instead of relying on it, the
              // same way appendEstimateOffer() already does: never start a
              // second estimate over one that's already running.
              if (quoteState) return;
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
        sendChatMessage(T("chat.estimateRequest"));
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

    // Pre-fill the project details from "Contact Us About This" on the
    // estimate card (labor, plus any real materials picked).
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
      if (!value("name")) errors.name = T("form.error.name");
      var phone = value("phone");
      var digits = phone.replace(/\D/g, "");
      if (!phone) errors.phone = T("form.error.phone");
      else if (!/^[0-9+().\-\s]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
        errors.phone = T("form.error.phoneInvalid");
      }
      var email = value("email");
      if (!email) errors.email = T("form.error.email");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = T("form.error.emailInvalid");
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

    // Status messages mix text and links: "[b:bold text]", "[again:link
    // text]" and "[phone]" in the translation become the matching node.
    function rich(key, nodes) {
      var out = [];
      T(key, CONTACT)
        .split(/(\[[a-z]+(?::[^\]]*)?\])/)
        .forEach(function (part) {
          var m = /^\[([a-z]+)(?::([^\]]*))?\]$/.exec(part);
          if (m && nodes[m[1]]) out.push(nodes[m[1]](m[2]));
          else if (part) out.push(part);
        });
      return out;
    }

    function subject() {
      return T("form.subject", { name: value("name") });
    }

    function body() {
      var lines = [
        T("form.body.name") + ": " + value("name"),
        T("form.body.phone") + ": " + value("phone"),
        T("form.body.email") + ": " + value("email"),
        T("form.body.service") + ": " + value("service"),
      ];
      if (I18n.lang() !== "en") lines.push(T("lang.label") + ": " + I18n.name());
      return lines.join("\n") + "\n\n" + T("form.body.details") + ":\n" + value("message");
    }

    var phoneLink = function () {
      return link("tel:+13853568733", PHONE);
    };
    var emailLink = function () {
      return link("mailto:" + EMAIL, EMAIL);
    };

    function sendByEmailApp() {
      var href =
        "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject()) + "&body=" + encodeURIComponent(body());
      showStatus(
        "info",
        rich("form.status.mailto", {
          b: strong,
          again: function (text) {
            var again = link(href, text);
            again.id = "mailto-link";
            return again;
          },
          email: emailLink,
          phone: phoneLink,
        }),
      );
      window.location.href = href;
    }

    var sending = false;

    function sendToEndpoint(endpoint) {
      if (sending) return;
      sending = true;
      var original = submit.innerHTML;
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = T("form.sending");
      showStatus("info", [T("form.status.sending")]);

      var data = new FormData(form);
      data.set("service", value("service"));
      data.set("_subject", subject());
      if (I18n.lang() !== "en") data.set("language", I18n.name());
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
          showStatus("success", rich("form.status.sent", { b: strong, phone: phoneLink }));
        })
        .catch(function () {
          showStatus("error", rich("form.status.failed", { b: strong, phone: phoneLink, email: emailLink }));
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
