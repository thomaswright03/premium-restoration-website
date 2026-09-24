"use strict";

// The shared scripts export only what another script or a test uses, so an
// export can't be left behind after the code that needed it is gone.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

function filesIn(dir, pattern) {
  return fs
    .readdirSync(path.join(ROOT, dir), { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => pattern.test(f) && !f.includes("vendor"));
}

const SOURCES = [...filesIn("js", /\.js$/), ...filesIn("scripts", /\.mjs$/), ...filesIn("tests", /\.js$/)]
  .filter((f) => !f.endsWith("exports.test.js"))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(ROOT, f), "utf8") }));

const MODULES = [
  "js/bathroom-pricing.js",
  "js/chat-replies.js",
  "js/business-info.js",
  "js/site-config.js",
  "js/admin/dates.js",
];

for (const mod of MODULES) {
  test(`${mod} exports only what is used elsewhere`, () => {
    require("./test-prices.js");
    const api = require(path.join(ROOT, mod));
    const unused = Object.keys(api).filter((name) => {
      const use = new RegExp("\\." + name + "\\b");
      return !SOURCES.some((s) => s.file !== mod && use.test(s.text));
    });
    assert.deepEqual(unused, [], `${mod}: remove these exports or use them: ${unused.join(", ")}`);
  });
}
