// Premium Restoration — public site behaviour: navigation, FAQ, the chat
// assistant and its bathroom price estimate, and the Get a Quote form.
//
// Settings (price estimator on/off, lead-form endpoint, owner details) come
// from site-config.json via js/site-config.js — see README "Site settings".

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var PHONE = "(385) 356-8733";
  var EMAIL = "eduardo.moroni77@gmail.com";
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
      // Room shape — which wall(s) carry the plumbing stack and where the
      // entry point(s) are — comes before fixture counts, not after: these
      // are basic facts about the room itself (like its dimensions), not
      // something derived from what fixtures end up chosen. Both steps are
      // skippable, so asking before fixtures are picked is harmless even if
      // the job turns out to need no plumbing fixtures at all. Only offered
      // when the 3D preview is actually up and running (room3dInteractive())
      // — otherwise there is nothing to click.
      if (scope && room3dInteractive()) {
        groups.push({ id: "plumbing-walls" });
        groups.push({ id: "entry-points" });
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
      if (window.BathroomRoom3D) {
        window.BathroomRoom3D.reset();
        if (bathroomRoom3dEnabled()) window.BathroomRoom3D.show();
        else window.BathroomRoom3D.hide();
      }
      appendGroupForm();
    }

    function cancelEstimate() {
      quoteState = null;
      if (window.BathroomRoom3D) window.BathroomRoom3D.hide();
      hideProgress();
      chatForm.hidden = false;
      appendChatRow(
        "bot",
        "No problem, I've stopped the estimate. Ask me anything else, or say “bathroom quote” to start over.",
      );
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
            if (group.id === "dimensions") window.BathroomRoom3D.setDimension(field.key, input.value);
            else window.BathroomRoom3D.setFixtureCount(field.key, input.value);
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
      introEl.textContent =
        "Which wall(s) carry the plumbing stack? Click them directly in the 3D preview — pick as many as apply. " +
        "The toilet, sink, tub, and shower will only be placed on the wall(s) you choose.";
      content.appendChild(introEl);

      var statusEl = document.createElement("p");
      statusEl.className = "ai-chat-group-intro";
      statusEl.textContent = "No walls selected yet.";
      content.appendChild(statusEl);

      var actionsWrap = document.createElement("div");
      actionsWrap.className = "ai-chat-group-actions";
      var skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "ai-chat-group-cancel";
      skipBtn.textContent = "Skip";
      var continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "ai-chat-group-continue";
      continueBtn.textContent = "Continue →";
      continueBtn.disabled = true;
      actionsWrap.appendChild(skipBtn);
      actionsWrap.appendChild(continueBtn);
      content.appendChild(actionsWrap);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();

      var selectedIds = [];
      function finish(ids) {
        skipBtn.disabled = true;
        continueBtn.disabled = true;
        window.BathroomRoom3D.endWallPicking();
        window.BathroomRoom3D.setPlumbingWalls(ids);
        advance();
      }
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
          ids.length === 0
            ? "No walls selected yet."
            : ids.length + " wall" + (ids.length === 1 ? "" : "s") + " selected.";
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
      introEl.textContent = "How many entry points (doors or openings) does this bathroom have?";
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
      var skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "ai-chat-group-cancel";
      skipBtn.textContent = "Skip";
      var continueBtn = document.createElement("button");
      continueBtn.type = "submit";
      continueBtn.className = "ai-chat-group-continue";
      continueBtn.textContent = "Continue →";
      actionsWrap.appendChild(skipBtn);
      actionsWrap.appendChild(continueBtn);
      formEl.appendChild(actionsWrap);
      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();

      function disableAll(root) {
        Array.prototype.forEach.call(root.querySelectorAll("input, button"), function (el) {
          el.disabled = true;
        });
      }

      skipBtn.addEventListener("click", function () {
        disableAll(content);
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

      function collectEntryPoint(total, i) {
        if (i >= total) {
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
        epIntro.textContent =
          (total > 1 ? "Entry point " + (i + 1) + " of " + total + ": " : "") + "click its wall in the 3D preview.";
        epContent.appendChild(epIntro);

        var wallStatus = document.createElement("p");
        wallStatus.className = "ai-chat-group-intro";
        wallStatus.textContent = "No wall selected yet.";
        epContent.appendChild(wallStatus);

        var detailsWrap = document.createElement("div");
        detailsWrap.hidden = true;

        var nudgeWrap = document.createElement("div");
        nudgeWrap.className = "ai-chat-group-actions";
        var leftBtn = document.createElement("button");
        leftBtn.type = "button";
        leftBtn.className = "ai-chat-group-cancel";
        leftBtn.textContent = "← Move left";
        var rightBtn = document.createElement("button");
        rightBtn.type = "button";
        rightBtn.className = "ai-chat-group-cancel";
        rightBtn.textContent = "Move right →";
        nudgeWrap.appendChild(leftBtn);
        nudgeWrap.appendChild(rightBtn);
        detailsWrap.appendChild(nudgeWrap);

        var doorLabel = document.createElement("p");
        doorLabel.className = "ai-chat-field-label";
        doorLabel.textContent = "Does this entry point have a door?";
        detailsWrap.appendChild(doorLabel);

        var doorChoices = document.createElement("div");
        doorChoices.className = "ai-chat-choices";
        var hasDoor = true;
        var chosenWallId = null;
        var doorButtons = [];
        [
          { label: "Yes", value: true },
          { label: "No — open archway", value: false },
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
        confirmBtn.textContent = i === total - 1 ? "Confirm entry point" : "Confirm & next →";
        confirmBtn.disabled = true;
        detailsWrap.appendChild(confirmBtn);
        epContent.appendChild(detailsWrap);
        epParts.inner.appendChild(epContent);
        chatMessages.appendChild(epParts.row);
        scrollToEnd();

        leftBtn.addEventListener("click", function () {
          window.BathroomRoom3D.nudgeEntryPoint(i, -0.5);
        });
        rightBtn.addEventListener("click", function () {
          window.BathroomRoom3D.nudgeEntryPoint(i, 0.5);
        });
        confirmBtn.addEventListener("click", function () {
          disableAll(epContent);
          collectEntryPoint(total, i + 1);
        });

        window.BathroomRoom3D.beginWallPicking("single", function (ids, justClicked) {
          chosenWallId = justClicked;
          wallStatus.textContent = "Wall selected — nudge it into place and confirm below.";
          detailsWrap.hidden = false;
          confirmBtn.disabled = false;
          window.BathroomRoom3D.setEntryPoint(i, { wallId: chosenWallId, hasDoor: hasDoor });
        });
      }
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
      var name = siteConfig && siteConfig.owner.legalName;
      return (
        "Premium Restoration, operated by " + (name ? name + ", " : "") + "an individual (not a registered company)"
      );
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

      if (materialsEstimatorEnabled() && window.MaterialsPricing) {
        var materialCategories = window.MaterialsPricing.categoriesFromLines(result.lines);
        if (materialCategories.length) {
          var materialsBtn = el("button", "ai-chat-estimate-export", "Pick Your Materials →");
          materialsBtn.type = "button";
          materialsBtn.addEventListener("click", function () {
            startMaterialsFlow(values, scope, result);
          });
          actions.appendChild(materialsBtn);
        }
      }

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

    // =====================================================================
    // Materials picker — real Home Depot prices (js/materials-pricing.js,
    // see its own header comment for how they're kept up to date). Starts
    // only after the labor estimate is finished, from the "Pick Your
    // Materials" button on its card. Reuses the same fullscreen/progress-
    // bar/group-form UI as the labor estimate.
    // =====================================================================

    // Generic category glyphs, not real product photos. The scraped Home
    // Depot data (see tools/scrapers/build_catalog.py) does carry a real
    // image URL per product, but CATALOG in js/materials-pricing.js
    // doesn't currently keep it — wiring up real per-product <img> tags is
    // a follow-up, not done here. Single-stroke, currentColor so they
    // follow the button's text colour (and the site's dark theme) for free.
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

    var materialsState = null; // null when inactive, else { categories, categoryIndex, zip, picks, laborResult }

    function startMaterialsFlow(values, scope, laborResult) {
      if (materialsState || !window.MaterialsPricing) return;
      var categories = window.MaterialsPricing.categoriesFromLines(laborResult.lines);
      if (!categories.length) return;
      materialsState = { categories: categories, categoryIndex: -1, zip: "", picks: {}, laborResult: laborResult };
      chatForm.hidden = true;
      setProgress(0);
      appendMaterialsZipForm();
    }

    function cancelMaterialsFlow() {
      materialsState = null;
      hideProgress();
      chatForm.hidden = false;
      appendChatRow("bot", "No problem, I've stopped the materials picker. Ask me anything else.");
      chatInput.focus();
    }

    function advanceMaterialsCategory() {
      materialsState.categoryIndex++;
      var totalSteps = materialsState.categories.length + 1; // +1 for the ZIP step
      if (materialsState.categoryIndex < materialsState.categories.length) {
        setProgress(Math.round(((materialsState.categoryIndex + 1) / totalSteps) * 100));
        appendMaterialCategoryForm(materialsState.categoryIndex);
        return;
      }
      setProgress(100);
      var state = materialsState;
      materialsState = null;
      chatForm.hidden = false;
      appendMaterialsCard(state);
      setTimeout(hideProgress, 1200);
      chatInput.focus();
    }

    function appendMaterialsZipForm() {
      var parts = botRow();
      var content = el("div", "ai-chat-text");
      content.appendChild(
        el(
          "p",
          "ai-chat-group-intro",
          "Now let's pick your materials. What ZIP code is the job in? (Prices can vary a little by area.)",
        ),
      );

      var formEl = document.createElement("form");
      formEl.className = "ai-chat-group-form";

      var fieldWrap = el("div", "ai-chat-group-field");
      fieldWrap.appendChild(el("label", "ai-chat-field-label", "ZIP code"));
      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = "postal-code";
      input.placeholder = "84101";
      input.maxLength = 5;
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
      var cancelBtn = el("button", "ai-chat-group-cancel", "Cancel");
      cancelBtn.type = "button";
      var continueBtn = el("button", "ai-chat-group-continue", "Continue →");
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
        cancelMaterialsFlow();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        var zip = input.value.trim();
        if (!/^\d{5}$/.test(zip)) {
          errorEl.textContent = "Enter a 5-digit ZIP code.";
          errorEl.hidden = false;
          fieldWrap.classList.add("has-error");
          input.focus();
          return;
        }
        materialsState.zip = zip;
        disableForm();
        advanceMaterialsCategory();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      input.focus({ preventScroll: true });
    }

    function appendMaterialCategoryForm(index) {
      var category = materialsState.categories[index];
      var options = window.MaterialsPricing.getOptionsForCategory(category.key, materialsState.zip);

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      content.appendChild(
        el(
          "p",
          "ai-chat-group-intro",
          "Which " +
            category.label.toLowerCase() +
            " would you like? (" +
            Pricing.formatQty(category.qty) +
            " " +
            category.unit +
            ")",
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
        if (iconSvg) {
          var icon = el("span", "ai-chat-material-icon");
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = iconSvg;
          btn.appendChild(icon);
        }
        var textWrap = el("span", "ai-chat-material-text");
        textWrap.appendChild(el("span", "ai-chat-material-name", opt.name));
        textWrap.appendChild(
          el("span", "ai-chat-material-price", Pricing.money(opt.best.price) + " at " + opt.best.name),
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
        });
        buttons.push(btn);
        choicesWrap.appendChild(btn);
      });
      fieldWrap.appendChild(choicesWrap);
      formEl.appendChild(fieldWrap);
      formEl.appendChild(errorEl);

      var actionsWrap = el("div", "ai-chat-group-actions");
      var cancelBtn = el("button", "ai-chat-group-cancel", "Cancel");
      cancelBtn.type = "button";
      var isLast = index === materialsState.categories.length - 1;
      var continueBtn = el("button", "ai-chat-group-continue", isLast ? "See My Materials Total →" : "Continue →");
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
        cancelMaterialsFlow();
      });

      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!chosen) {
          errorEl.textContent = "Pick one option to continue.";
          errorEl.hidden = false;
          return;
        }
        var costInfo = window.MaterialsPricing.computeMaterialCost(
          category.key,
          category.qty,
          category.unit,
          chosen.best.price,
        );
        materialsState.picks[category.key] = {
          categoryLabel: category.label,
          productName: chosen.name,
          retailer: chosen.best.name,
          url: chosen.best.url,
          quantityLabel: costInfo.quantityLabel,
          cost: costInfo.cost,
        };
        disableForm();
        advanceMaterialsCategory();
      });

      content.appendChild(formEl);
      parts.inner.appendChild(content);
      chatMessages.appendChild(parts.row);
      scrollToEnd();
      var first = formEl.querySelector(".ai-chat-choice");
      if (first) first.focus({ preventScroll: true });
    }

    function buildMaterialsSummary(pickList, materialsSubtotal, combinedTotal) {
      var out = ["My bathroom materials picks from your website:"];
      pickList.forEach(function (p) {
        out.push("- " + p.categoryLabel + ": " + p.productName + " (" + p.retailer + ") — " + Pricing.money(p.cost));
      });
      out.push("- Materials subtotal: " + Pricing.money(materialsSubtotal));
      out.push("- Labor + materials (before plumbing/electrical, permits and taxes): " + Pricing.money(combinedTotal));
      return out.join("\n");
    }

    function exportMaterialsPdf(button, status, pickList, materialsSubtotal, combinedTotal) {
      if (button.disabled) return;
      var label = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing PDF…";
      status.hidden = true;
      status.textContent = "";
      window.EstimatePdf.load()
        .then(function () {
          var doc = window.EstimatePdf.build({
            title: "Bathroom Restoration — Materials List",
            lines: pickList.map(function (p) {
              return {
                label: p.categoryLabel + ": " + p.productName,
                detail: p.quantityLabel + " · " + p.retailer,
                amount: Pricing.money(p.cost),
              };
            }),
            excluded: [],
            totals: [
              { label: "Materials Subtotal", value: Pricing.money(materialsSubtotal), strong: true },
              {
                label: "Labor + Materials (before plumbing/electrical, permits, taxes)",
                value: Pricing.money(combinedTotal),
              },
            ],
            sections: [
              {
                title: "Where to buy",
                items: pickList.map(function (p) {
                  return (
                    p.categoryLabel +
                    ": " +
                    p.productName +
                    " — " +
                    p.retailer +
                    " (" +
                    p.url +
                    ") — " +
                    Pricing.money(p.cost)
                  );
                }),
              },
            ],
            footer: {
              business: businessLine(),
              phone: PHONE,
              email: EMAIL,
              date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
            },
          });
          doc.save("premium-restoration-materials-list.pdf");
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

    function appendMaterialsCard(state) {
      var pickList = state.categories
        .map(function (c) {
          return state.picks[c.key];
        })
        .filter(Boolean);
      var materialsSubtotal = Pricing.roundCents(
        pickList.reduce(function (sum, p) {
          return sum + p.cost;
        }, 0),
      );
      var combinedTotal = Pricing.roundCents(state.laborResult.subtotal + materialsSubtotal);

      var parts = botRow();
      var content = el("div", "ai-chat-text");
      var card = el("div", "ai-chat-estimate ai-chat-materials");

      var head = el("div", "ai-chat-estimate-header");
      head.appendChild(el("p", "eyebrow", "Materials Pricing"));
      head.appendChild(el("h3", null, "Bathroom Materials"));
      head.appendChild(el("p", "ai-chat-estimate-lede", "Based on the items you picked above."));
      card.appendChild(head);

      var lines = el("div", "ai-chat-estimate-lines");
      pickList.forEach(function (p) {
        var line = el("div", "ai-chat-estimate-line");
        var labelWrap = el("span", null, p.categoryLabel + ": " + p.productName + " ");
        labelWrap.appendChild(el("small", "ai-chat-estimate-detail", p.quantityLabel + " · " + p.retailer));
        line.appendChild(labelWrap);
        line.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(p.cost)));
        lines.appendChild(line);
      });
      if (!pickList.length) {
        var empty = el("div", "ai-chat-estimate-line");
        empty.appendChild(el("span", null, "No materials selected"));
        empty.appendChild(el("span", "ai-chat-estimate-amount", Pricing.money(0)));
        lines.appendChild(empty);
      }
      card.appendChild(lines);

      var totalWrap = el("div", "ai-chat-estimate-total");
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-label", "Materials Subtotal"));
      totalWrap.appendChild(el("span", "ai-chat-estimate-total-value", Pricing.money(materialsSubtotal)));
      card.appendChild(totalWrap);

      var combinedWrap = el("div", "ai-chat-estimate-line muted");
      combinedWrap.appendChild(el("span", null, "Labor + materials, before plumbing/electrical, permits & taxes"));
      combinedWrap.appendChild(el("span", null, Pricing.money(combinedTotal)));
      card.appendChild(combinedWrap);

      if (pickList.length) {
        var shoppingWrap = el("div", "ai-chat-estimate-assumptions ai-chat-materials-shopping");
        shoppingWrap.appendChild(el("p", "ai-chat-estimate-assumptions-title", "Where to buy these"));
        var list = document.createElement("ul");
        pickList.forEach(function (p) {
          var item = document.createElement("li");
          item.appendChild(document.createTextNode(p.categoryLabel + ": " + p.productName + " — "));
          var link = document.createElement("a");
          link.href = p.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = p.retailer;
          item.appendChild(link);
          item.appendChild(document.createTextNode(" — " + Pricing.money(p.cost)));
          list.appendChild(item);
        });
        shoppingWrap.appendChild(list);
        card.appendChild(shoppingWrap);
      }

      var actions = el("div", "ai-chat-estimate-actions");
      var exportBtn = el("button", "ai-chat-estimate-export", "Export as PDF");
      exportBtn.type = "button";
      var pdfStatus = el("p", "ai-chat-estimate-pdf-status");
      pdfStatus.setAttribute("role", "status");
      pdfStatus.hidden = true;
      exportBtn.addEventListener("click", function () {
        exportMaterialsPdf(exportBtn, pdfStatus, pickList, materialsSubtotal, combinedTotal);
      });
      actions.appendChild(exportBtn);

      var cta = el("a", "ai-chat-estimate-cta", "Contact Us About This →");
      cta.href = "contact.html?from=materials";
      cta.addEventListener("click", function () {
        try {
          sessionStorage.setItem(
            "pr_materials_summary",
            buildMaterialsSummary(pickList, materialsSubtotal, combinedTotal),
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
    var MATERIALS_SUMMARY_KEY = "pr_materials_summary";

    // Pre-fill the project details from "Contact Us About This" (labor
    // estimate or materials picker — whichever the visitor came from).
    if (/[?&]from=(estimate|materials)\b/.test(window.location.search)) {
      var fromMaterials = /[?&]from=materials\b/.test(window.location.search);
      var summary = null;
      try {
        summary = sessionStorage.getItem(fromMaterials ? MATERIALS_SUMMARY_KEY : SUMMARY_KEY);
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
        errors.phone = "Enter a valid phone number, e.g. (385) 356-8733.";
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
        link("tel:+13853568733", PHONE),
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
            sessionStorage.removeItem(MATERIALS_SUMMARY_KEY);
          } catch (e) {
            /* ignore */
          }
          var note = document.getElementById("estimate-prefill-note");
          if (note) note.hidden = true;
          showStatus("success", [
            strong("Request sent."),
            " Thank you — we've received your request and will get back to you as soon as we can. If it's urgent, call ",
            link("tel:+13853568733", PHONE),
            ".",
          ]);
        })
        .catch(function () {
          showStatus("error", [
            strong("Sorry, your request wasn't sent."),
            " Nothing you entered has been lost — please try again, or call us at ",
            link("tel:+13853568733", PHONE),
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
