// Premium Restoration chat — shared pieces: the page's chat elements, the
// settings it depends on, and the conversation rows (messages, the
// "estimate" offer button).
//
// The chat is front-end only: scripted replies from js/chat-replies.js plus a
// guided bathroom price estimate. It is NOT AI and must not be described as
// AI or as a person.
//
// The chat is split into parts that share one namespace, window.PRChat (C),
// loaded in this order by index.html:
//   core.js           this file
//   fullscreen.js     full-screen dialog mode
//   persistence.js    keeping the estimate in this tab across reloads
//   step-form.js      one step of the estimate (a small grouped form)
//   estimate-flow.js  the steps, Back, Cancel and finishing
//   estimate-card.js  the finished estimate card and its PDF
//   main.js           sending messages and wiring it all up
// Functions from other parts are called as C.name(...), so load order only
// matters for set-up.

(function (C) {
  "use strict";

  // State shared by the parts:
  //   C.state.config      the loaded site settings (null until loaded)
  //   C.state.quoteState  the estimate being worked out, or null (estimate-flow.js)
  C.state.config = null;
  C.state.quoteState = null;

  var configReady = window.SiteConfig ? window.SiteConfig.ready : Promise.resolve(null);
  configReady.then(function (config) {
    C.state.config = config;
  });

  // Anonymous event counts, only when switched on in site-config.json
  // (js/analytics.js). That script is deferred, so it is looked up when an
  // event happens. key: a name from SiteAnalytics.EVENTS, e.g. "ESTIMATE_STARTED".
  function track(key) {
    var analytics = window.SiteAnalytics;
    if (analytics && analytics.EVENTS[key]) analytics.track(analytics.EVENTS[key]);
  }

  function estimatorEnabled() {
    return !!(C.state.config && C.state.config.priceEstimator.enabled);
  }

  // false in "please call us" mode (leadForm.enabled false): nothing in the
  // chat then sends the visitor to the Get a Quote form.
  function leadFormEnabled() {
    return !(C.state.config && C.state.config.leadForm.paused);
  }

  // The page's chat elements. Returns false when this page has no chat.
  function findElements() {
    var byId = function (id) {
      return document.getElementById(id);
    };
    C.els = {
      form: byId("ai-chat-form"),
      input: byId("ai-chat-input"),
      messages: byId("ai-chat-messages"),
      send: byId("ai-chat-send"),
      section: document.querySelector(".ai-chat-section"),
      toolbar: byId("ai-chat-toolbar"),
      close: byId("ai-chat-close"),
      progress: byId("ai-chat-progress"),
      progressBar: byId("ai-chat-progress-bar"),
      progressFill: byId("ai-chat-progress-fill"),
      progressLabel: byId("ai-chat-progress-label"),
      starterRow: byId("ai-chat-quote-starter-row"),
      starter: byId("ai-chat-quote-starter"),
      fsTitle: byId("ai-chat-fs-title"),
    };
    return !!(C.els.form && C.els.input && C.els.messages && window.BathroomPricing && window.ChatReplies);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scrollToEnd() {
    var messages = C.els.messages;
    messages.scrollTop = messages.scrollHeight;
    if (!C.isFullscreen()) {
      var last = messages.lastElementChild;
      if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
    }
  }

  function botRow() {
    var row = el("div", "ai-chat-row bot");
    var inner = el("div", "ai-chat-row-inner");
    var avatar = el("div", "ai-chat-avatar", "PR");
    avatar.setAttribute("aria-hidden", "true");
    inner.appendChild(avatar);
    row.appendChild(inner);
    return { row: row, inner: inner };
  }

  function appendChatRow(role, text) {
    var parts = botRow();
    parts.row.className = "ai-chat-row " + role;
    parts.inner.firstChild.textContent = role === "user" ? "YOU" : "PR";
    parts.inner.appendChild(el("div", "ai-chat-text", text));
    C.els.messages.appendChild(parts.row);
    scrollToEnd();
    return parts.row;
  }

  // Only the latest "estimate" button is kept, so they never pile up.
  // keep: a row to leave in place (the button that started the estimate).
  function removeOffers(keep) {
    Array.prototype.forEach.call(C.els.messages.querySelectorAll(".ai-chat-offer-row"), function (row) {
      if (row !== keep) row.remove();
    });
  }

  var estimatePending = false;

  // The "Get a bathroom price estimate" button (and the one on the page to
  // start with). While an estimate is being worked out it reads "Continue my
  // estimate" and reopens it full screen, so closing full screen can put
  // focus back on the button that opened it.
  function onEstimateButton(btn) {
    if (C.state.quoteState) {
      C.resumeEstimate(btn);
      return;
    }
    if (estimatePending) return;
    estimatePending = true;
    C.sendChatMessage("I'd like a bathroom price estimate", { opener: btn });
  }

  function estimateStarted() {
    estimatePending = false;
  }

  // A chat row holding one estimate button. Returns the button.
  function estimateButtonRow(label) {
    var parts = botRow();
    parts.row.classList.add("ai-chat-offer-row");
    var btn = el("button", "ai-chat-suggestion", label);
    btn.type = "button";
    btn.addEventListener("click", function () {
      onEstimateButton(btn);
    });
    parts.inner.appendChild(btn);
    C.els.messages.appendChild(parts.row);
    return btn;
  }

  function appendEstimateOffer() {
    if (!estimatorEnabled() || C.state.quoteState) return;
    removeOffers();
    estimateButtonRow("Get a bathroom price estimate\u00a0→");
    scrollToEnd();
  }

  // Used by the other parts of the chat.
  C.configReady = configReady;
  C.track = track;
  C.estimatorEnabled = estimatorEnabled;
  C.leadFormEnabled = leadFormEnabled;
  C.findElements = findElements;
  C.el = el;
  C.scrollToEnd = scrollToEnd;
  C.botRow = botRow;
  C.appendChatRow = appendChatRow;
  C.removeOffers = removeOffers;
  C.appendEstimateOffer = appendEstimateOffer;
  C.onEstimateButton = onEstimateButton;
  C.estimateStarted = estimateStarted;
  C.estimateButtonRow = estimateButtonRow;
})((window.PRChat = window.PRChat || { state: {} }));
