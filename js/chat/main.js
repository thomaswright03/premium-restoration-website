// Premium Restoration chat — sending messages and wiring the chat up once
// the page has loaded.
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  function showTyping() {
    var typing = C.botRow();
    typing.row.id = "ai-chat-typing-row";
    var dots = C.el("div", "ai-chat-typing");
    dots.setAttribute("aria-label", "Assistant is typing");
    dots.appendChild(C.el("span"));
    dots.appendChild(C.el("span"));
    dots.appendChild(C.el("span"));
    typing.inner.appendChild(dots);
    C.els.messages.appendChild(typing.row);
    C.scrollToEnd();
    return typing.row;
  }

  // Shows the visitor's message, then (after a short "typing" pause) the
  // scripted reply, an estimate button, or the estimate itself.
  // options.opener: the button that asked for the estimate (focus returns
  // to it when full screen is closed).
  function sendChatMessage(message, options) {
    options = options || {};
    if (!message) return;
    C.appendChatRow("user", message);
    C.els.send.disabled = true;
    var typingRow = showTyping();
    C.configReady.then(function () {
      setTimeout(
        function () {
          typingRow.remove();
          var r = window.ChatReplies.reply(message, {
            estimatorEnabled: C.estimatorEnabled(),
            leadFormEnabled: C.leadFormEnabled(),
          });
          C.els.send.disabled = false;
          C.estimateStarted();
          if (r && r.action === "startEstimate") {
            C.startEstimate(options.opener);
            return;
          }
          if (r && r.text) C.appendChatRow("bot", r.text);
          if (r && r.action === "offerEstimate") C.appendEstimateOffer();
          C.focusQuietly(C.els.input);
        },
        500 + Math.random() * 400,
      );
    });
  }

  function init() {
    if (!C.findElements()) return;
    C.initFullscreen();
    var phoneQuery = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;

    C.configReady.then(function () {
      if (C.els.starterRow) C.els.starterRow.hidden = !C.estimatorEnabled();
      C.restoreEstimate();
    });

    C.els.input.addEventListener("focus", function () {
      // Phones only: on a wider screen the chat stays part of the page.
      if (!C.isFocusingQuietly() && phoneQuery && phoneQuery.matches) C.enterFullscreen();
    });
    C.els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = C.els.input.value.trim();
      if (!message) return;
      C.els.input.value = "";
      sendChatMessage(message);
    });
    if (C.els.starter) {
      C.els.starter.addEventListener("click", function () {
        C.onEstimateButton(C.els.starter);
      });
    }
  }

  // Used by the other parts of the chat.
  C.sendChatMessage = sendChatMessage;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})((window.PRChat = window.PRChat || { state: {} }));
