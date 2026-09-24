// Mobile nav toggle
document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
  }

  // Header goes from transparent-over-hero to solid+blurred on scroll
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Scroll-reveal: fade/rise elements into view as the page is scrolled
  var revealTargets = document.querySelectorAll(
    ".card, .gallery-item, .value-item, .faq-item, .about-hero, .about-photo, .about-copy, .contact-info-card, #lead-form, .section-title, .section-subtitle"
  );
  revealTargets.forEach(function (el) {
    el.classList.add("reveal");
  });

  var revealAll = function () {
    revealTargets.forEach(function (el) {
      el.classList.add("visible");
    });
  };

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    revealTargets.forEach(function (el) {
      observer.observe(el);
    });
    // Safety net: never let content stay invisible if the observer fails
    // to fire (unsupported edge cases, throttled background tabs, etc.)
    setTimeout(revealAll, 1500);
  } else {
    revealAll();
  }

  // FAQ accordion
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var question = item.querySelector(".faq-question");
    if (!question) return;
    question.addEventListener("click", function () {
      item.classList.toggle("open");
    });
  });

  // AI chat widget (front-end only — keyword-matched canned responses, plus
  // a scripted guided flow for bathroom price estimates. No real AI/backend
  // wired up; the bathroom math comes from js/bathroom-pricing.js, the same
  // model the admin quoting tool uses, so the two never drift apart.
  var chatForm = document.getElementById("ai-chat-form");
  var chatInput = document.getElementById("ai-chat-input");
  var chatMessages = document.getElementById("ai-chat-messages");
  var chatSend = document.getElementById("ai-chat-send");

  // ---------- guided bathroom quote flow ----------
  // Fields are grouped into a few small fillable forms (dimensions,
  // fixtures/electrical, plumbing conditions) instead of one question at a
  // time, so the visitor fills several fields per turn.
  var BATHROOM_QUOTE_GROUPS = [
    {
      intro: "Sure! Let's get you a rough bathroom price estimate — labor only, materials aren't included. First, the room's dimensions:",
      fields: [
        { key: "Bathroom_Width_Ft", label: "Width (ft)" },
        { key: "Bathroom_Length_Ft", label: "Length (ft)" },
        { key: "Bathroom_Height_Ft", label: "Height (ft)" },
      ],
    },
    {
      intro: "Got it. Now, how many of each of these does the job need? (0 for any that don't apply)",
      fields: [
        { key: "Toilet_Quantity", label: "Toilets" },
        { key: "Sink_Quantity", label: "Sinks" },
        { key: "Bathtub_Quantity", label: "Bathtubs" },
        { key: "Shower_Quantity", label: "Showers" },
        { key: "Shower_Door_Quantity", label: "Shower doors" },
        { key: "Door_Quantity", label: "Entry doors" },
        { key: "Vanity_Quantity", label: "Vanities" },
        { key: "Cabinet_Quantity", label: "Cabinets" },
        { key: "Mirror_Quantity", label: "Standard mirrors" },
        { key: "Mirror_Huge_Quantity", label: "Huge mirrors" },
        { key: "Shower_Shelf_Quantity", label: "Shower shelves" },
        { key: "Electrical_Points", label: "Electrical points (lamps, outlets, fans, switches, etc.)" },
      ],
    },
    {
      intro: "Almost done — two quick plumbing questions:",
      fields: [
        { key: "No_Stack_Surcharge_Included", label: "Is there already a plumbing stack in place?", type: "yesno", invert: true },
        { key: "Bad_Valve_Surcharge_Included", label: "Does a valve need to be replaced?", type: "yesno" },
      ],
    },
  ];

  var bathroomQuoteState = null; // null when inactive, else { groupIndex, answers }

  function totalBathroomQuoteFields() {
    return BATHROOM_QUOTE_GROUPS.reduce(function (sum, g) {
      return sum + g.fields.length;
    }, 0);
  }

  function fieldsCompletedThrough(groupIndex) {
    var sum = 0;
    for (var i = 0; i < groupIndex; i++) sum += BATHROOM_QUOTE_GROUPS[i].fields.length;
    return sum;
  }

  // Generates a downloadable PDF of the estimate using jsPDF (loaded via
  // CDN in index.html). Mirrors the on-screen card's content and totals.
  function exportEstimateAsPdf(result) {
    if (!window.jspdf) {
      alert("Sorry, PDF export isn't available right now — please try again in a moment.");
      return;
    }

    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var pageWidth = doc.internal.pageSize.getWidth();
    var margin = 56;
    var y = 64;

    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.text("Premium Restoration", margin, y);
    y += 24;

    doc.setFont("times", "normal");
    doc.setFontSize(13);
    doc.setTextColor(90);
    doc.text("Bathroom Restoration — Labor Estimate", margin, y);
    y += 8;

    doc.setDrawColor(210);
    doc.line(margin, y, pageWidth - margin, y);
    y += 24;

    doc.setFontSize(10);
    doc.setTextColor(130);
    doc.text("Labor only — materials, permits, and a final walkthrough can change this.", margin, y);
    y += 28;

    doc.setFontSize(11);
    doc.setTextColor(30);
    result.lineResults.forEach(function (r) {
      if (r.cost <= 0) return;
      doc.text(r.label, margin, y);
      doc.text(BathroomPricing.money(r.cost), pageWidth - margin, y, { align: "right" });
      y += 20;
    });

    y += 6;
    doc.setDrawColor(225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 22;

    doc.setTextColor(110);
    doc.text("Subtotal", margin, y);
    doc.text(BathroomPricing.money(result.subtotal), pageWidth - margin, y, { align: "right" });
    y += 18;
    doc.text("Tax (" + result.taxRatePercent + "%)", margin, y);
    doc.text(BathroomPricing.money(result.taxAmount), pageWidth - margin, y, { align: "right" });
    y += 30;

    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text("Estimated Total", margin, y);
    doc.text(BathroomPricing.money(result.total), pageWidth - margin, y, { align: "right" });
    y += 44;

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(
      "Generated " + new Date().toLocaleDateString() + "  •  (385) 356-8733  •  eduardo.moroni77@gmail.com",
      margin,
      y
    );

    doc.save("premium-restoration-bathroom-estimate.pdf");
  }

  // Builds the finished estimate as a styled card (not plain text) inside a
  // bot chat bubble: itemized lines, subtotal/tax, a bold total, and a CTA.
  function appendEstimateCard(rawAnswers) {
    var jobValues = BathroomPricing.deriveDimensions(Object.assign({}, rawAnswers));
    var result = BathroomPricing.computeBathroomTotal(jobValues);

    var row = document.createElement("div");
    row.className = "ai-chat-row bot";

    var inner = document.createElement("div");
    inner.className = "ai-chat-row-inner";

    var avatar = document.createElement("div");
    avatar.className = "ai-chat-avatar";
    avatar.textContent = "PR";
    inner.appendChild(avatar);

    var content = document.createElement("div");
    content.className = "ai-chat-text";

    var card = document.createElement("div");
    card.className = "ai-chat-estimate";

    var header = document.createElement("div");
    header.className = "ai-chat-estimate-header";
    header.innerHTML =
      '<span class="eyebrow">Your Estimate</span>' +
      '<h3>Bathroom Restoration</h3>' +
      '<p>Labor only — materials, permits, and a final walkthrough can change this.</p>';
    card.appendChild(header);

    var lines = document.createElement("div");
    lines.className = "ai-chat-estimate-lines";
    result.lineResults.forEach(function (r) {
      if (r.cost <= 0) return;
      var line = document.createElement("div");
      line.className = "ai-chat-estimate-line";
      line.innerHTML = "<span>" + r.label + "</span><span>" + BathroomPricing.money(r.cost) + "</span>";
      lines.appendChild(line);
    });
    card.appendChild(lines);

    var subtotalWrap = document.createElement("div");
    subtotalWrap.className = "ai-chat-estimate-subtotal";
    subtotalWrap.innerHTML =
      '<div class="ai-chat-estimate-line muted"><span>Subtotal</span><span>' + BathroomPricing.money(result.subtotal) + "</span></div>" +
      '<div class="ai-chat-estimate-line muted"><span>Tax (' + result.taxRatePercent + '%)</span><span>' + BathroomPricing.money(result.taxAmount) + "</span></div>";
    card.appendChild(subtotalWrap);

    var totalWrap = document.createElement("div");
    totalWrap.className = "ai-chat-estimate-total";
    totalWrap.innerHTML =
      '<span class="ai-chat-estimate-total-label">Estimated Total</span>' +
      '<span class="ai-chat-estimate-total-value">' + BathroomPricing.money(result.total) + "</span>";
    card.appendChild(totalWrap);

    var actions = document.createElement("div");
    actions.className = "ai-chat-estimate-actions";

    var exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "ai-chat-estimate-export";
    exportBtn.textContent = "Export as PDF ↓";
    exportBtn.addEventListener("click", function () {
      exportEstimateAsPdf(result);
    });
    actions.appendChild(exportBtn);

    var cta = document.createElement("a");
    cta.className = "ai-chat-estimate-cta";
    cta.href = "contact.html";
    cta.textContent = "Get This Confirmed →";
    actions.appendChild(cta);

    card.appendChild(actions);

    content.appendChild(card);
    inner.appendChild(content);
    row.appendChild(inner);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function startBathroomQuote() {
    bathroomQuoteState = { groupIndex: 0, answers: {} };
    if (chatForm) chatForm.hidden = true;
    setChatProgress(0);
    appendGroupForm(0);
  }

  function cancelBathroomQuote() {
    bathroomQuoteState = null;
    hideChatProgress();
    if (chatForm) chatForm.hidden = false;
    appendChatRow("bot", "No problem, I've stopped the estimate. Ask me anything else, or say “bathroom quote” to start over.");
    if (chatInput) chatInput.focus();
  }

  function advanceBathroomQuoteGroup() {
    bathroomQuoteState.groupIndex++;
    if (bathroomQuoteState.groupIndex < BATHROOM_QUOTE_GROUPS.length) {
      setChatProgress(Math.round((fieldsCompletedThrough(bathroomQuoteState.groupIndex) / totalBathroomQuoteFields()) * 100));
      appendGroupForm(bathroomQuoteState.groupIndex);
      return;
    }
    setChatProgress(100);
    var answers = bathroomQuoteState.answers;
    bathroomQuoteState = null;
    if (chatForm) chatForm.hidden = false;
    appendEstimateCard(answers);
    setTimeout(hideChatProgress, 1200);
    if (chatInput) chatInput.focus();
  }

  // Renders one group as a small fillable form inside a bot chat bubble.
  function appendGroupForm(groupIndex) {
    var group = BATHROOM_QUOTE_GROUPS[groupIndex];

    var row = document.createElement("div");
    row.className = "ai-chat-row bot";

    var inner = document.createElement("div");
    inner.className = "ai-chat-row-inner";

    var avatar = document.createElement("div");
    avatar.className = "ai-chat-avatar";
    avatar.textContent = "PR";
    inner.appendChild(avatar);

    var content = document.createElement("div");
    content.className = "ai-chat-text";

    var introEl = document.createElement("p");
    introEl.className = "ai-chat-group-intro";
    introEl.textContent = group.intro;
    content.appendChild(introEl);

    var formEl = document.createElement("form");
    formEl.className = "ai-chat-group-form";

    var getters = [];
    group.fields.forEach(function (field) {
      var fieldWrap = document.createElement("div");
      fieldWrap.className = "ai-chat-group-field";

      var labelEl = document.createElement("label");
      labelEl.textContent = field.label;
      fieldWrap.appendChild(labelEl);

      if (field.type === "yesno") {
        var yesnoWrap = document.createElement("div");
        yesnoWrap.className = "ai-chat-yesno";
        var selected = true; // matches "Yes" being pre-selected below

        var yesBtn = document.createElement("button");
        yesBtn.type = "button";
        yesBtn.className = "ai-chat-yesno-btn selected";
        yesBtn.textContent = "Yes";

        var noBtn = document.createElement("button");
        noBtn.type = "button";
        noBtn.className = "ai-chat-yesno-btn";
        noBtn.textContent = "No";

        yesBtn.addEventListener("click", function () {
          selected = true;
          yesBtn.classList.add("selected");
          noBtn.classList.remove("selected");
        });
        noBtn.addEventListener("click", function () {
          selected = false;
          noBtn.classList.add("selected");
          yesBtn.classList.remove("selected");
        });

        yesnoWrap.appendChild(yesBtn);
        yesnoWrap.appendChild(noBtn);
        fieldWrap.appendChild(yesnoWrap);

        getters.push(function () {
          var value = selected;
          if (field.invert) value = !value;
          bathroomQuoteState.answers[field.key] = value;
        });
      } else {
        var input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "any";
        input.placeholder = "0";
        fieldWrap.appendChild(input);

        getters.push(function () {
          bathroomQuoteState.answers[field.key] = parseFloat(input.value) || 0;
        });
      }

      formEl.appendChild(fieldWrap);
    });

    var actionsWrap = document.createElement("div");
    actionsWrap.className = "ai-chat-group-actions";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "ai-chat-group-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", cancelBathroomQuote);

    var continueBtn = document.createElement("button");
    continueBtn.type = "submit";
    continueBtn.className = "ai-chat-group-continue";
    continueBtn.textContent = groupIndex === BATHROOM_QUOTE_GROUPS.length - 1 ? "Get My Estimate →" : "Continue →";

    actionsWrap.appendChild(cancelBtn);
    actionsWrap.appendChild(continueBtn);
    formEl.appendChild(actionsWrap);

    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      getters.forEach(function (getValue) {
        getValue();
      });
      Array.prototype.forEach.call(formEl.querySelectorAll("input, button"), function (el) {
        el.disabled = true;
      });
      advanceBathroomQuoteGroup();
    });

    content.appendChild(formEl);
    inner.appendChild(content);
    row.appendChild(inner);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    var firstInput = formEl.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  // ---------- progress bar ----------
  var chatProgress = document.getElementById("ai-chat-progress");
  var chatProgressFill = document.getElementById("ai-chat-progress-fill");
  var chatProgressLabel = document.getElementById("ai-chat-progress-label");

  function setChatProgress(pct) {
    if (!chatProgress) return;
    chatProgress.hidden = false;
    if (chatProgressFill) chatProgressFill.style.width = pct + "%";
    if (chatProgressLabel) chatProgressLabel.textContent = pct + "% complete";
  }

  function hideChatProgress() {
    if (chatProgress) chatProgress.hidden = true;
  }

  var CHAT_RESPONSES = [
    { keywords: ["quote", "price", "cost", "estimate"],
      reply: "For an accurate price, our team puts together a free quote based on your project — head to the Contact page and tell us a bit about it, and we'll follow up personally. Or if it's a bathroom, just say “bathroom quote” and I can run the numbers with you right now." },
    { keywords: ["bathroom"],
      reply: "We handle full bathroom restorations — demolition, fixtures, tile, plumbing, electrical, and finishing work. Want a rough price estimate? Just say “bathroom quote.”" },
    { keywords: ["kitchen"],
      reply: "Our kitchen restoration work covers cabinets, countertops, backsplash, flooring, appliances, and more." },
    { keywords: ["floor", "flooring"],
      reply: "We install and restore all kinds of flooring, including matching to existing floors and full replacements." },
    { keywords: ["exterior", "roof", "siding", "stucco", "deck", "fence", "gutter"],
      reply: "Exterior restoration is one of our specialties — siding, stucco, roofing, decks, fences, and more." },
    { keywords: ["water damage", "fire damage", "mold", "sewage", "flood"],
      reply: "We handle water, fire, mold, and storm damage restoration, from initial cleanup through full repair." },
    { keywords: ["contact", "phone", "call", "email", "reach"],
      reply: "You can reach us at (385) 356-8733 or eduardo.moroni77@gmail.com, or submit the form on our Contact page." },
    { keywords: ["hour", "open", "available"],
      reply: "Reach out through the Contact page or give us a call, and we'll get back to you as soon as we can." },
    { keywords: ["gallery", "work", "photo", "example", "portfolio"],
      reply: "Take a look at the “Our Work” page for photos from past restoration projects." },
  ];

  function chatReplyFor(message) {
    var lower = message.toLowerCase();
    for (var i = 0; i < CHAT_RESPONSES.length; i++) {
      var entry = CHAT_RESPONSES[i];
      for (var j = 0; j < entry.keywords.length; j++) {
        if (lower.indexOf(entry.keywords[j]) !== -1) return entry.reply;
      }
    }
    return "Thanks for the message! For anything specific to your project, the best next step is requesting a free quote on our Contact page.";
  }

  // Returns a plain-text reply, OR null when the reply was already handled
  // directly (e.g. the guided quote flow appends its own form/summary rows).
  function getBotReply(message) {
    var lower = message.toLowerCase();
    if (lower.indexOf("bathroom") !== -1 && /(quote|price|cost|estimate)/.test(lower)) {
      startBathroomQuote();
      return null;
    }
    return chatReplyFor(message);
  }

  function appendChatRow(role, text) {
    var row = document.createElement("div");
    row.className = "ai-chat-row " + role;

    var inner = document.createElement("div");
    inner.className = "ai-chat-row-inner";

    var avatar = document.createElement("div");
    avatar.className = "ai-chat-avatar";
    avatar.textContent = role === "user" ? "YOU" : "PR";

    var textEl = document.createElement("div");
    textEl.className = "ai-chat-text";
    textEl.textContent = text;

    inner.appendChild(avatar);
    inner.appendChild(textEl);
    row.appendChild(inner);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return row;
  }

  function appendTypingIndicator() {
    var row = document.createElement("div");
    row.className = "ai-chat-row bot";
    row.id = "ai-chat-typing-row";

    var inner = document.createElement("div");
    inner.className = "ai-chat-row-inner";

    var avatar = document.createElement("div");
    avatar.className = "ai-chat-avatar";
    avatar.textContent = "PR";

    var typing = document.createElement("div");
    typing.className = "ai-chat-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";

    inner.appendChild(avatar);
    inner.appendChild(typing);
    row.appendChild(inner);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage(message) {
    if (!message) return;
    appendChatRow("user", message);
    chatSend.disabled = true;

    appendTypingIndicator();

    setTimeout(function () {
      var typingRow = document.getElementById("ai-chat-typing-row");
      if (typingRow) typingRow.remove();
      var reply = getBotReply(message);
      if (reply) appendChatRow("bot", reply);
      chatSend.disabled = false;
      chatInput.focus();
    }, 700 + Math.random() * 500);
  }

  // Fullscreen mode: as soon as someone starts using the chat (focuses the
  // input, or taps the quote-estimate suggestion), it takes over the whole
  // screen so the conversation is the only thing visible.
  var chatSection = document.querySelector(".ai-chat-section");
  var chatCloseBtn = document.getElementById("ai-chat-close");

  function enterChatFullscreen() {
    if (!chatSection || chatSection.classList.contains("is-fullscreen")) return;
    chatSection.classList.add("is-fullscreen");
    document.body.classList.add("ai-chat-locked");
    if (chatCloseBtn) chatCloseBtn.hidden = false;
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function exitChatFullscreen() {
    if (!chatSection) return;
    chatSection.classList.remove("is-fullscreen");
    document.body.classList.remove("ai-chat-locked");
    if (chatCloseBtn) chatCloseBtn.hidden = true;
  }

  if (chatCloseBtn) {
    chatCloseBtn.addEventListener("click", exitChatFullscreen);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && chatSection && chatSection.classList.contains("is-fullscreen")) {
      exitChatFullscreen();
    }
  });

  if (chatForm && chatInput && chatMessages) {
    chatInput.addEventListener("focus", enterChatFullscreen);

    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = chatInput.value.trim();
      if (!message) return;
      chatInput.value = "";
      sendChatMessage(message);
    });

    var quoteStarter = document.getElementById("ai-chat-quote-starter");
    if (quoteStarter) {
      quoteStarter.addEventListener("click", function () {
        enterChatFullscreen();
        quoteStarter.remove();
        sendChatMessage("I'd like a bathroom price estimate");
      });
    }
  }

  // Contact / lead form (front-end only placeholder — see README for wiring options)
  var form = document.getElementById("lead-form");
  var success = document.getElementById("form-success");

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      form.reset();
      form.style.display = "none";
      if (success) success.classList.add("visible");
    });
  }
});
