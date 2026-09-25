// Playwright end-to-end tests. Serves the site with scripts/serve.mjs (which,
// like Vercel, answers unknown paths with 404.html).
"use strict";

const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.E2E_PORT || 4317);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

module.exports = defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Each worker runs its own full Chromium instance; several rendering the
  // 3D room's shadows/PBR materials at once on a shared CI runner cause
  // enough CPU contention to blow past normal expect() timeouts on
  // completely unrelated tests (confirmed: reproduces locally under
  // contention and on GitHub's runner, and survives the retry below). CI
  // runners get few cores to begin with, so serial execution is the
  // reliable choice there; local runs keep full parallelism since dev
  // machines have never shown this problem.
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Serial execution (above) fixed the multi-worker contention, but the
  // GitHub-hosted runner's 2 shared vCPUs are still measurably slower than
  // this sandbox's for first-time WebGL context creation/shader compile —
  // confirmed: the same two 3D-adjacent expect() calls kept timing out at
  // the default 5s even running alone. Widen the default assertion timeout
  // in CI rather than keep chasing the render pipeline's startup cost.
  expect: { timeout: process.env.CI ? 15000 : 5000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: false,
  },
});
