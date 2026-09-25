// Minimal static file server for local testing. Behaves like Vercel's static
// hosting for this site: serves files from the repo root, and answers any
// missing path with 404.html and a 404 status.
//
//   node scripts/serve.mjs [port]      (default 8000)

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
  const body = await readFile(file);
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(body);
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
