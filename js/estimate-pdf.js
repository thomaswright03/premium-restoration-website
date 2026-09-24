// Premium Restoration — estimate PDF builder, shared by the public chat
// estimate (js/script.js) and the admin quote export (js/admin.js).
//
// jsPDF is self-hosted (js/vendor/jspdf.umd.min.js, MIT licence) and only
// loaded when someone asks for a PDF, so normal page views never load it and
// no third-party server is contacted.
//
// Layout: US Letter, consistent margins, pages added as needed, and a footer
// (date, phone, email, business name, page number) on every page.

(function () {
  "use strict";

  var script = document.currentScript;
  var JSPDF_SRC =
    script && script.src ? new URL("vendor/jspdf.umd.min.js", script.src).href : "js/vendor/jspdf.umd.min.js";
  var loading = null;

  function load() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
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
    }).catch(function (err) {
      loading = null; // allow Retry
      throw err;
    });
    return loading;
  }

  var PAGE = { margin: 56, top: 60, footerHeight: 64 };

  // spec: {
  //   title, subtitle, preparedFor?, intro?,
  //   lines: [{ label, detail, amount }],
  //   excluded: [{ label, value }],
  //   totals: [{ label, value, strong? }],
  //   afterTotal: [string], sections: [{ title, items: [string] }],
  //   footer: { business, phone, email, date }
  // }
  function build(spec) {
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var left = PAGE.margin;
    var right = pageWidth - PAGE.margin;
    var width = right - left;
    var bottom = pageHeight - PAGE.footerHeight;
    var y = PAGE.top;

    function ensure(height) {
      if (y + height > bottom) {
        doc.addPage();
        y = PAGE.top;
      }
    }

    function paragraph(text, size, color, style, gap) {
      doc.setFont("times", style || "normal");
      doc.setFontSize(size);
      doc.setTextColor(color);
      var lineHeight = size * 1.3;
      doc.splitTextToSize(String(text), width).forEach(function (line) {
        ensure(lineHeight);
        doc.text(line, left, y);
        y += lineHeight;
      });
      y += gap === undefined ? 6 : gap;
    }

    function rule(shade) {
      ensure(12);
      doc.setDrawColor(shade);
      doc.line(left, y, right, y);
      y += 16;
    }

    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20);
    doc.text("Premium Restoration", left, y);
    y += 22;
    paragraph(spec.title, 13, 80, "normal", 2);
    if (spec.preparedFor) paragraph("Prepared for: " + spec.preparedFor, 11, 60, "normal", 2);
    y += 4;
    rule(200);
    if (spec.intro) paragraph(spec.intro, 11, 60, "italic", 10);

    // Line items: label | quantity x rate | amount
    var labelWidth = 170;
    var detailX = left + labelWidth + 10;
    var detailWidth = right - 90 - detailX;
    (spec.lines || []).forEach(function (l) {
      doc.setFontSize(11);
      var labelLines = doc.splitTextToSize(l.label, labelWidth);
      doc.setFontSize(10);
      var detailLines = doc.splitTextToSize(l.detail || "", detailWidth);
      var rowHeight = Math.max(labelLines.length * 14, detailLines.length * 13) + 6;
      ensure(rowHeight);
      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(labelLines, left, y);
      doc.text(l.amount, right, y, { align: "right" });
      doc.setFontSize(10);
      doc.setTextColor(95);
      doc.text(detailLines, detailX, y);
      y += rowHeight;
    });

    if (spec.excluded && spec.excluded.length) {
      y += 2;
      spec.excluded.forEach(function (x) {
        doc.setFontSize(10);
        var labelLines = doc.splitTextToSize(x.label, width - 150);
        ensure(labelLines.length * 13 + 4);
        doc.setFont("times", "normal");
        doc.setTextColor(80);
        doc.text(labelLines, left, y);
        doc.text(x.value, right, y, { align: "right" });
        y += labelLines.length * 13 + 4;
      });
    }

    y += 4;
    rule(210);
    (spec.totals || []).forEach(function (t) {
      var size = t.strong ? 15 : 11;
      doc.setFontSize(size);
      var labelLines = doc.splitTextToSize(t.label, width - 150);
      ensure(labelLines.length * (size + 4) + 4);
      doc.setFont("times", t.strong ? "bold" : "normal");
      doc.setTextColor(20);
      doc.text(labelLines, left, y);
      doc.text(t.value, right, y, { align: "right" });
      y += labelLines.length * (size + 4) + 4;
    });
    y += 6;

    (spec.afterTotal || []).forEach(function (text) {
      paragraph(text, 10, 60, "normal", 6);
    });

    (spec.sections || []).forEach(function (section) {
      y += 6;
      ensure(40);
      paragraph(section.title, 11, 30, "bold", 2);
      section.items.forEach(function (item) {
        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.setTextColor(60);
        var lines = doc.splitTextToSize(item, width - 14);
        lines.forEach(function (line, i) {
          ensure(13);
          if (i === 0) doc.text("•", left, y);
          doc.text(line, left + 14, y);
          y += 13;
        });
        y += 3;
      });
    });

    var total = doc.getNumberOfPages();
    var f = spec.footer || {};
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(220);
      doc.line(left, pageHeight - 52, right, pageHeight - 52);
      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text("Generated " + f.date + "  •  " + f.phone + "  •  " + f.email, left, pageHeight - 38);
      doc.text("Page " + i + " of " + total, right, pageHeight - 38, { align: "right" });
      doc.text(doc.splitTextToSize(f.business || "Premium Restoration", width)[0], left, pageHeight - 26);
    }
    return doc;
  }

  window.EstimatePdf = { load: load, build: build };
})();
