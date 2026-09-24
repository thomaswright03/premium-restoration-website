"use strict";

// npm run check:deploy compares a deployed site with this checkout. Here it
// runs against the local server (which serves this checkout exactly).

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PORT = 4391;

test("check:deploy passes for a server that serves this checkout, and needs a URL", async () => {
  const env = Object.assign({}, process.env);
  delete env.SITE_CONFIG_PRICES;
  const server = spawn(process.execPath, [path.join(ROOT, "scripts/serve.mjs"), String(PORT)], { env });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
    });
    const ok = spawnSync(process.execPath, [path.join(ROOT, "scripts/check-deploy.mjs"), `http://localhost:${PORT}`], {
      encoding: "utf8",
    });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /serves exactly this checkout/);
  } finally {
    server.kill();
  }
  const usage = spawnSync(process.execPath, [path.join(ROOT, "scripts/check-deploy.mjs")], { encoding: "utf8" });
  assert.equal(usage.status, 2);
});
