// Minimal static file server for local testing. Behaves like Vercel's static
// hosting for this site: serves files from the repo root, and answers any
// missing path with 404.html and a 404 status.
//
//   node scripts/serve.mjs [port]      (default 8000)
//
// For the browser tests, SITE_CONFIG_PRICES=<file> serves site-config.json
// with its "prices" replaced by that file's (tests/fixtures/test-prices.json),
// so the tests don't depend on the prices the owner has set.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const full = normalize(join(root, decoded));
  if (full !== root && !full.startsWith(root + sep)) return null;
  try {
    const info = await stat(full);
    if (info.isDirectory()) {
      const index = join(full, "index.html");
      await stat(index);
      return index;
    }
    return full;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url || "/");
  const blocked = file && /[\\/](node_modules|\.git|tests|test-results|playwright-report)[\\/]/.test(file);
  if (!file || blocked) {
    const body = await readFile(join(root, "404.html"));
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end(body);
    return;
  }
  let body = await readFile(file);
  if (process.env.SITE_CONFIG_PRICES && file === join(root, "site-config.json")) {
    const config = JSON.parse(body.toString("utf8"));
    config.prices = JSON.parse(await readFile(resolve(root, process.env.SITE_CONFIG_PRICES), "utf8"));
    body = Buffer.from(JSON.stringify(config, null, 2));
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(body);
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
