// Premium Restoration — public page behaviour shared by every page: the
// year in the footer, the mobile menu, the header shadow on scroll,
// scroll-reveal and the FAQ accordion.
//
// The chat assistant lives in js/chat/ (home page) and the Get a Quote form
// in js/lead-form.js. Settings come from site-config.json via
// js/site-config.js — see README "Site settings".

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
      el.textContent = String(new Date().getFullYear());
    });

    var toggle = /** @type {HTMLElement | null} */ (document.querySelector(".nav-toggle"));
    var links = document.querySelector(".nav-links");
    if (toggle && links) initMenu(toggle, links);

    var header = document.querySelector(".site-header");
    if (header) initHeaderShadow(header);

    // Scroll-reveal (skipped when the visitor prefers reduced motion).
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var revealTargets = document.querySelectorAll(
      ".card, .value-item, .faq-item, .about-copy, .contact-info-card, #lead-form, .scope-note",
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
  });

  // The mobile menu: the toggle opens and closes it; choosing a link or
  // pressing Escape closes it.
  /**
   * @param {HTMLElement} toggle
   * @param {Element} links
   */
  function initMenu(toggle, links) {
    /** @param {boolean} open */
    function setMenu(open) {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () {
      setMenu(!links.classList.contains("open"));
    });
    links.addEventListener("click", function (e) {
      if (/** @type {Element} */ (e.target).closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  // A shadow under the header once the page has scrolled.
  /** @param {Element} header */
  function initHeaderShadow(header) {
    function onScroll() {
      header.classList.toggle("scrolled", window.scrollY > 40);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
})();
