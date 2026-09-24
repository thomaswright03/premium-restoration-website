"use strict";

// Reads the text of a PDF made by js/estimate-pdf.js, so the tests can check
// what a customer sees. The PDFs embed the site's fonts, which store text as
// glyph numbers; each font's ToUnicode map turns them back into letters.
// Handles what jsPDF writes (uncompressed page streams, <hex> and (literal)
// strings shown with Tj); it is not a general PDF reader.

const fs = require("node:fs");

function objects(pdf) {
  const out = new Map();
  for (const m of pdf.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) out.set(m[1], m[2]);
  return out;
}

function streamOf(body) {
  const m = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
  return m ? m[1] : "";
}

// Glyph number (4 hex digits) -> text, from a ToUnicode CMap.
function toUnicodeMap(cmap) {
  const map = new Map();
  const hexToText = (hex) =>
    String.fromCodePoint(...(hex.match(/.{4}/g) || []).map((h) => parseInt(h, 16)).filter((n) => n > 0));
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) map.set(m[1].toLowerCase(), hexToText(m[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      const from = parseInt(m[1], 16);
      const to = parseInt(m[2], 16);
      const start = parseInt(m[3], 16);
      for (let g = from; g <= to; g++) map.set(g.toString(16).padStart(4, "0"), String.fromCodePoint(start + g - from));
    }
  }
  return map;
}

function literal(text) {
  return text.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => {
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[e] || e;
  });
}

// The PDF's text: one line per text object, in drawing order.
function pdfText(buffer) {
  const pdf = Buffer.from(buffer).toString("latin1");
  const objs = objects(pdf);
  // Font resource name (/F15) -> its ToUnicode map, if it has one.
  const fonts = new Map();
  for (const m of pdf.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const font = objs.get(m[2]) || "";
    const ref = /\/ToUnicode (\d+) 0 R/.exec(font);
    fonts.set(m[1], ref ? toUnicodeMap(streamOf(objs.get(ref[1]) || "")) : null);
  }
  const lines = [];
  for (const body of objs.values()) {
    const stream = streamOf(body);
    if (!/\bBT\b/.test(stream)) continue;
    let font = null;
    for (const block of stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let line = "";
      // A font change, a <hex> or (literal) string, or T* (next line of a multi-line text).
      const ops = /\/(F\d+) [\d.]+ Tf|<([0-9a-f]*)> Tj|\(((?:\\.|[^\\)])*)\) Tj|(T\*)/gi;
      for (const op of block[1].matchAll(ops)) {
        if (op[1]) font = fonts.get(op[1]) || null;
        else if (op[4]) line += "\n";
        else if (op[2] !== undefined) {
          line += (op[2].match(/.{4}/g) || []).map((g) => (font && font.get(g.toLowerCase())) || "�").join("");
        } else line += literal(op[3]);
      }
      if (line) lines.push(line);
    }
  }
  return lines.join("\n");
}

// The text of a Playwright download, with every run of spaces and line
// breaks as one space (so a sentence reads the same wherever it wraps).
async function downloadText(download) {
  return pdfText(fs.readFileSync(await download.path())).replace(/\s+/g, " ");
}

module.exports = { pdfText, downloadText };
