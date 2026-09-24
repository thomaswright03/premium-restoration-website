// Premium Restoration chat — full-screen mode.
//
// On a phone the chat opens full screen as soon as the visitor starts
// typing; on any screen it opens full screen while an estimate is being
// worked out. Full screen behaves like a dialog: it has a title, the page
// behind it can't be reached with the keyboard, Escape or the X closes it,
// and focus goes back to where the visitor was.
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  var returnFocus = null;
  var inertElements = [];
  var focusingQuietly = false;

  function isFullscreen() {
    return C.els.section.classList.contains("is-fullscreen");
  }

  function updateToolbar() {
    if (C.els.toolbar) C.els.toolbar.hidden = C.els.progress.hidden && C.els.close.hidden;
  }

  function setBackgroundInert(on) {
    inertElements.forEach(function (node) {
      node.inert = false;
      node.removeAttribute("aria-hidden");
    });
    inertElements = [];
    if (!on) return;
    for (var node = C.els.section; node && node.parentNode && node !== document.body; node = node.parentNode) {
      Array.prototype.forEach.call(node.parentNode.children, function (sibling) {
        if (sibling === node || sibling.tagName === "SCRIPT" || sibling.inert) return;
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
        inertElements.push(sibling);
      });
    }
  }

  // opener: the control that asked for full screen, to get focus back when
  // it closes (by default whatever has focus now).
  function enterFullscreen(opener) {
    if (isFullscreen()) return;
    var section = C.els.section;
    returnFocus = opener || document.activeElement;
    section.classList.add("is-fullscreen");
    section.setAttribute("role", "dialog");
    section.setAttribute("aria-modal", "true");
    section.setAttribute("aria-labelledby", "ai-chat-fs-title");
    document.body.classList.add("ai-chat-locked");
    C.els.fsTitle.hidden = false;
    C.els.close.hidden = false;
    setBackgroundInert(true);
    updateToolbar();
    C.els.messages.scrollTop = C.els.messages.scrollHeight;
  }

  function focusQuietly(node) {
    focusingQuietly = true;
    node.focus({ preventScroll: true });
    focusingQuietly = false;
  }

  function isFocusingQuietly() {
    return focusingQuietly;
  }

  function usable(node) {
    return !!(
      node &&
      node !== document.body &&
      document.contains(node) &&
      !node.disabled &&
      node.getClientRects().length > 0
    );
  }

  function exitFullscreen() {
    if (!isFullscreen()) return;
    var section = C.els.section;
    section.classList.remove("is-fullscreen");
    section.removeAttribute("role");
    section.removeAttribute("aria-modal");
    section.setAttribute("aria-labelledby", "ai-chat-title");
    document.body.classList.remove("ai-chat-locked");
    C.els.fsTitle.hidden = true;
    C.els.close.hidden = true;
    setBackgroundInert(false);
    updateToolbar();
    var target = returnFocus;
    returnFocus = null;
    if (!usable(target)) target = C.els.form.hidden ? firstFocusableInChat() : C.els.input;
    if (target) focusQuietly(target);
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
  }

  function focusableInChat() {
    return Array.prototype.filter.call(
      C.els.section.querySelectorAll("button, input, a[href], select, textarea, [tabindex]:not([tabindex='-1'])"),
      function (node) {
        return !node.disabled && node.getClientRects().length > 0;
      },
    );
  }

  function firstFocusableInChat() {
    var active = C.els.messages.querySelector(
      ".ai-chat-group-form:not(.is-done) input, .ai-chat-group-form:not(.is-done) button",
    );
    return active || focusableInChat()[0] || null;
  }

  // Escape closes full screen; Tab stays inside it.
  function onKeydown(e) {
    if (!isFullscreen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      exitFullscreen();
      return;
    }
    if (e.key !== "Tab") return;
    var items = focusableInChat();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var inside = C.els.section.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  function initFullscreen() {
    C.els.close.addEventListener("click", exitFullscreen);
    document.addEventListener("keydown", onKeydown);
  }

  // Used by the other parts of the chat.
  C.isFullscreen = isFullscreen;
  C.updateToolbar = updateToolbar;
  C.enterFullscreen = enterFullscreen;
  C.exitFullscreen = exitFullscreen;
  C.focusQuietly = focusQuietly;
  C.isFocusingQuietly = isFocusingQuietly;
  C.initFullscreen = initFullscreen;
})((window.PRChat = window.PRChat || { state: {} }));
