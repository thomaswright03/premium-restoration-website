"use strict";

// The type check (npm run typecheck) stays strict and covers every site
// script: it can't be weakened, or a script left out, without a test failing.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

function readTsconfig() {
  const text = fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

function siteScripts() {
  return fs
    .readdirSync(path.join(ROOT, "js"), { recursive: true })
    .map((f) => path.posix.join("js", String(f).split(path.sep).join("/")))
    .filter((f) => f.endsWith(".js") && !f.includes("vendor"));
}

test("the type check is strict", () => {
  const options = readTsconfig().compilerOptions;
  assert.equal(options.strict, true);
  assert.equal(options.checkJs, true);
  for (const loosened of ["noImplicitAny", "strictNullChecks", "strictFunctionTypes", "noImplicitThis"]) {
    assert.notEqual(options[loosened], false, loosened + " is switched off");
  }
});

test("every site script is type-checked", () => {
  const dirs = readTsconfig()
    .include.filter((glob) => glob.endsWith("/*.js"))
    .map((glob) => glob.slice(0, -"/*.js".length));
  const missed = siteScripts().filter((f) => !dirs.includes(path.posix.dirname(f)));
  assert.deepEqual(missed, []);
});

test("no site script switches the type check off", () => {
  const offenders = siteScripts().filter((f) =>
    /@ts-(nocheck|ignore|expect-error)/.test(fs.readFileSync(path.join(ROOT, f), "utf8")),
  );
  assert.deepEqual(offenders, []);
});
