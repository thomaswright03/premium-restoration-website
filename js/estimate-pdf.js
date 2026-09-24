// Premium Restoration — estimate PDF builder, shared by the public chat
// estimate (js/chat/estimate-card.js) and the admin quote export
// (js/admin/pdf.js).
//
// jsPDF is self-hosted (js/vendor/jspdf.umd.min.js, MIT licence) and only
// loaded when someone asks for a PDF, so normal page views never load it and
// no third-party server is contacted.
//
// Fonts: the PDF uses the website's own typefaces — Playfair Display for the
// business name, Inter for everything else — as fixed-weight TrueType copies
// in fonts/pdf/ (made from the site's web fonts by scripts/make-pdf-fonts.py;
// jsPDF can't embed the variable .woff2 files). They add about 185 KB, so,
// like jsPDF, they are fetched only when a PDF is made, never with the page;
// jsPDF embeds only the letters used. If they can't be fetched, the PDF is
// still made, in the standard Helvetica and Times fonts.
//
// Layout: US Letter, consistent margins, pages added as needed; a header
// with the business name, the document's reference, its issue date and (if
// the owner has set one in site-config.json) the date its prices are held
// until; a footer (phone, email, reference, page number, business name) on
// every page.
//
// The reference and date helpers also load in Node for the unit tests.

(function (/** @type {any} */ root) {
  "use strict";

  /** @typedef {any} JsPdfDocument jsPDF's document (the self-hosted library has no type declarations) */
  /** @typedef {Record<string, string>} FontFiles font file name -> its bytes as a binary string */

  var node = typeof module === "object" && module.exports && typeof require === "function";

  // ------------------------------------------------------------------
  // References and dates
  // ------------------------------------------------------------------
  // No 0/O or 1/I, so a reference read out over the phone is unambiguous.
  var CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /** @param {Date} date */
  function ymd(date) {
    /** @param {number} n */
    var pad = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate());
  }

  /** @param {number} length */
  function randomCode(length) {
    var bytes = new Uint8Array(length);
    var cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
    else for (var i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map
      .call(bytes, function (b) {
        return CODE_LETTERS[b % CODE_LETTERS.length];
      })
      .join("");
  }

  // A new, random reference for a visitor's estimate: "PR-E-20260924-7K3F".
  // It is made in the browser and identifies that document only; it is not
  // recorded anywhere unless the visitor sends it with a quote request.
  /** @param {Date} [date] */
  function estimateReference(date) {
    return "PR-E-" + ymd(date || new Date()) + "-" + randomCode(4);
  }

  // An admin quote's reference comes from the quote itself (the date it was
  // created and its id), so every PDF of the same quote carries the same
  // one: "PR-Q-20260924-K3M9QX".
  /** @param {Pick<Quote, "id" | "createdAt"> & Partial<Quote>} quote */
  function quoteReference(quote) {
    var created = new Date(quote.createdAt || quote.updatedAt || Date.now());
    if (isNaN(created.getTime())) created = new Date();
    var id = String(quote.id || "");
    var tail = /_([a-z0-9]+)$/i.exec(id);
    var code = tail ? tail[1].toUpperCase().slice(-6) : "";
    if (!code) {
      // Any other id: a short fixed code worked out from it.
      var hash = 0;
      for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
      for (var j = 0; j < 6; j++) {
        code += CODE_LETTERS[hash % CODE_LETTERS.length];
        hash = Math.floor(hash / CODE_LETTERS.length);
      }
    }
    return "PR-Q-" + ymd(created) + "-" + code;
  }

  /** @param {Date} date */
  function longDate(date) {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  // The last day prices are held: `days` calendar days after the issue date,
  // or null when the owner hasn't set a period (estimates.validForDays in
  // site-config.json), in which case no date is printed.
  /**
   * @param {Date} issued
   * @param {number | null | undefined} days
   * @returns {Date | null}
   */
  function heldUntil(issued, days) {
    if (!(typeof days === "number" && days > 0)) return null;
    return new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() + days);
  }

  // The disclaimer's sentence about prices, with the date they are held
  // until when the owner has set a period.
  var PRICES_MAY_CHANGE = "Prices are current as of the date generated and may change.";

  /** @param {Date | null} until */
  function pricesSentence(until) {
    return until
      ? "Prices are current as of the date generated and are held until " +
          longDate(until) +
          "; after that they may change."
      : PRICES_MAY_CHANGE;
  }

  // Replaces the "may change" sentence of a disclaimer with pricesSentence().
  /**
   * @param {string} text
   * @param {Date | null} until
   */
  function withHeldUntil(text, until) {
    return String(text).replace(PRICES_MAY_CHANGE, pricesSentence(until));
  }

  var helpers = {
    estimateReference: estimateReference,
    quoteReference: quoteReference,
    heldUntil: heldUntil,
    withHeldUntil: withHeldUntil,
  };

  if (node) {
    module.exports = helpers;
    return;
  }

  // ------------------------------------------------------------------
  // Loading jsPDF and the fonts (only when a PDF is asked for)
  // ------------------------------------------------------------------
  var script = /** @type {HTMLScriptElement | null} */ (document.currentScript);
  var base = script && script.src ? script.src : new URL("js/estimate-pdf.js", location.href).href;
  var JSPDF_SRC = new URL("vendor/jspdf.umd.min.js", base).href;
  // File -> [font name, style] as registered with jsPDF.
  /** @type {Record<string, [string, string]>} */
  var FONT_FILES = {
    "inter-regular.ttf": ["Inter", "normal"],
    "inter-semibold.ttf": ["Inter", "bold"],
    "playfair-display-bold.ttf": ["PlayfairDisplay", "bold"],
  };
  /** @type {Promise<unknown> | null} */
  var loading = null;
  /** @type {Promise<FontFiles | null> | null} */
  var fontsLoading = null;

  function loadLibrary() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = JSPDF_SRC;
      el.async = true;
      el.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf);
        else reject(new Error("PDF library did not load"));
      };
      el.onerror = function () {
        el.remove();
        reject(new Error("PDF library could not be downloaded"));
      };
      document.head.appendChild(el);
    });
  }

  /** @param {ArrayBuffer} buffer */
  function binaryString(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000));
    }
    return out;
  }

  // Resolves to { file: binary string } for every font, or null if any
  // can't be fetched (the PDF then uses the standard fonts).
  function loadFonts() {
    if (fontsLoading) return fontsLoading;
    var names = Object.keys(FONT_FILES);
    fontsLoading = Promise.all(
      names.map(function (name) {
        return fetch(new URL("../fonts/pdf/" + name, base).href).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.arrayBuffer();
        });
      }),
    ).then(
      function (buffers) {
        /** @type {FontFiles} */
        var files = {};
        names.forEach(function (name, i) {
          files[name] = binaryString(buffers[i]);
        });
        return files;
      },
      function () {
        fontsLoading = null; // try again next time
        return null;
      },
    );
    return fontsLoading;
  }

  /** @type {FontFiles | null} */
  var fonts = null;

  function load() {
    if (loading) return loading;
    loading = Promise.all([loadLibrary(), loadFonts()])
      .then(function (results) {
        fonts = results[1];
        return results[0];
      })
      .catch(function (err) {
        loading = null; // allow Retry
        throw err;
      });
    return loading;
  }

  // ------------------------------------------------------------------
  // Building the PDF
  // ------------------------------------------------------------------
  var PAGE = { margin: 56, top: 62, footerHeight: 64 };
  // The site's colours, as RGB.
  var INK = [28, 26, 23];
  var SOFT = [74, 69, 61];
  var MUTED = [104, 98, 89];
  var ACCENT_TEXT = [135, 101, 47];
  var ACCENT = [179, 135, 74];
  var LINE = [216, 208, 196];

  // Registers the embedded fonts with this document, and returns how to set
  // each text style (with the standard fonts if the site's didn't load).
  /** @param {JsPdfDocument} doc */
  function setUpFonts(doc) {
    if (fonts) {
      var names = Object.keys(FONT_FILES);
      for (var i = 0; i < names.length; i++) {
        doc.addFileToVFS(names[i], fonts[names[i]]);
        doc.addFont(names[i], FONT_FILES[names[i]][0], FONT_FILES[names[i]][1], "Identity-H");
      }
      return { text: "Inter", display: "PlayfairDisplay", displayStyle: "bold", embedded: true };
    }
    return { text: "helvetica", display: "times", displayStyle: "bold", embedded: false };
  }

  // Lays out a PdfSpec (types/globals.d.ts) and returns the jsPDF document.
  /**
   * @param {PdfSpec} spec
   * @returns {JsPdfDocument}
   */
  function build(spec) {
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var face = setUpFonts(doc);
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var left = PAGE.margin;
    var right = pageWidth - PAGE.margin;
    var width = right - left;
    var bottom = pageHeight - PAGE.footerHeight;
    var y = PAGE.top;
    var issued = spec.issued || new Date();

    // Letters the font doesn't have (e.g. in a customer's name) are written
    // without their accents rather than as empty boxes.
    /** @param {string} text */
    function safe(text) {
      text = String(text).replace(/→/g, "->").replace(/←/g, "<-");
      if (!face.embedded) return text;
      var meta = doc.getFont().metadata;
      if (!meta || typeof meta.characterToGlyph !== "function") return text;
      return text.replace(/[^\x20-\x7e]/g, function (ch) {
        if (meta.characterToGlyph(ch.charCodeAt(0))) return ch;
        var plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return plain && plain !== ch && meta.characterToGlyph(plain.charCodeAt(0)) ? plain : "?";
      });
    }

    /**
     * @param {string} kind "normal", "strong" or "display"
     * @param {number} size
     * @param {number[]} color
     */
    function style(kind, size, color) {
      if (kind === "display") doc.setFont(face.display, face.displayStyle);
      else doc.setFont(face.text, kind === "strong" ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
    }

    /**
     * @param {string} text
     * @param {number} maxWidth
     * @returns {string[]}
     */
    function lines(text, maxWidth) {
      return doc.splitTextToSize(safe(text), maxWidth);
    }

    /** @param {number} height */
    function ensure(height) {
      if (y + height > bottom) {
        doc.addPage();
        y = PAGE.top;
      }
    }

    /**
     * @param {string} text
     * @param {number} size
     * @param {number[]} color
     * @param {string} kind
     * @param {number} [gap]
     */
    function paragraph(text, size, color, kind, gap) {
      style(kind || "normal", size, color);
      var lineHeight = size * 1.4;
      lines(text, width).forEach(function (line) {
        ensure(lineHeight);
        doc.text(line, left, y);
        y += lineHeight;
      });
      y += gap === undefined ? 6 : gap;
    }

    /**
     * @param {number[]} color
     * @param {number} [thickness]
     */
    function rule(color, thickness) {
      ensure(12);
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(thickness || 0.75);
      doc.line(left, y, right, y);
      y += 18;
    }

    // Header: the business name on the left; reference, issue date and how
    // long prices hold on the right.
    style("display", 22, ACCENT_TEXT);
    doc.text(safe(window.BusinessInfo.NAME), left, y);
    var meta = [
      ["strong", "Reference " + spec.reference],
      ["normal", "Issued " + longDate(issued)],
    ];
    if (spec.heldUntil) meta.push(["normal", "Prices held until " + longDate(spec.heldUntil)]);
    var metaY = y - 10;
    meta.forEach(function (m) {
      style(m[0], 9, m[0] === "strong" ? INK : MUTED);
      doc.text(safe(m[1]), right, metaY, { align: "right" });
      metaY += 12;
    });
    y = Math.max(y + 14, metaY + 2);
    rule(ACCENT, 1.25);

    paragraph(spec.title, 14, INK, "strong", 4);
    if (spec.preparedFor) paragraph("Prepared for: " + spec.preparedFor, 10.5, SOFT, "normal", 2);
    if (spec.contact) paragraph(spec.contact, 10.5, SOFT, "normal", 2);
    y += 6;
    if (spec.intro) paragraph(spec.intro, 10.5, MUTED, "normal", 10);

    // Line items: label | quantity x rate | amount
    var labelWidth = 170;
    var detailX = left + labelWidth + 12;
    var detailWidth = right - 90 - detailX;
    (spec.lines || []).forEach(function (l) {
      style("strong", 10.5, INK);
      var labelLines = lines(l.label, labelWidth);
      style("normal", 9.5, MUTED);
      var detailLines = lines(l.detail || "", detailWidth);
      var rowHeight = Math.max(labelLines.length * 14, detailLines.length * 13) + 7;
      ensure(rowHeight);
      style("strong", 10.5, INK);
      doc.text(labelLines, left, y);
      style("normal", 10.5, INK);
      doc.text(safe(l.amount), right, y, { align: "right" });
      style("normal", 9.5, MUTED);
      doc.text(detailLines, detailX, y);
      y += rowHeight;
    });

    if (spec.excluded && spec.excluded.length) {
      y += 2;
      spec.excluded.forEach(function (x) {
        style("normal", 9.5, SOFT);
        var labelLines = lines(x.label, width - 150);
        ensure(labelLines.length * 13 + 4);
        doc.text(labelLines, left, y);
        doc.text(safe(x.value), right, y, { align: "right" });
        y += labelLines.length * 13 + 4;
      });
    }

    y += 4;
    rule(LINE);
    (spec.totals || []).forEach(function (t) {
      var size = t.strong ? 13 : 10.5;
      style("strong", size, INK);
      var labelLines = lines(t.label, width - 150);
      var height = labelLines.length * (size + 4) + (t.strong ? 8 : 4);
      ensure(height);
      doc.text(labelLines, left, y);
      if (t.strong) style("strong", 15, INK);
      doc.text(safe(t.value), right, y, { align: "right" });
      y += height;
    });
    y += 6;

    (spec.afterTotal || []).forEach(function (text) {
      paragraph(text, 9.5, SOFT, "normal", 6);
    });

    (spec.sections || []).forEach(function (section) {
      y += 6;
      ensure(40);
      paragraph(section.title, 10.5, INK, "strong", 3);
      section.items.forEach(function (item) {
        style("normal", 9.5, SOFT);
        lines(item, width - 14).forEach(function (line, i) {
          ensure(13);
          if (i === 0) doc.text("•", left, y);
          doc.text(line, left + 14, y);
          y += 13;
        });
        y += 3;
      });
    });

    var total = doc.getNumberOfPages();
    var f = spec.footer || { phone: window.BusinessInfo.PHONE, email: window.BusinessInfo.EMAIL };
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.75);
      doc.line(left, pageHeight - 52, right, pageHeight - 52);
      style("normal", 8.5, MUTED);
      doc.text(safe(f.phone + "  •  " + f.email), left, pageHeight - 38);
      doc.text(safe(spec.reference + "  •  Page " + i + " of " + total), right, pageHeight - 38, { align: "right" });
      doc.text(lines(f.business || window.BusinessInfo.NAME, width)[0], left, pageHeight - 26);
    }
    return doc;
  }

  window.EstimatePdf = {
    load: load,
    build: build,
    estimateReference: estimateReference,
    quoteReference: quoteReference,
    heldUntil: heldUntil,
    withHeldUntil: withHeldUntil,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
