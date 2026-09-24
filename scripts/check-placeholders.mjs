// Fails if a bracketed placeholder such as [OWNER LEGAL NAME] appears
// anywhere a visitor could see it: in page HTML or site JavaScript outside
// comments. Placeholders kept inside HTML or JS comments are allowed (they
// document what to add once the owner supplies a value).
//
//   node scripts/check-placeholders.mjs

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".git", "vendor", "tests", "test-results", "playwright-report", "scripts"]);
const PLACEHOLDER = /\[[A-Z][A-Z0-9 #/-]*[A-Z#]\]/g;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.(html|js|json)$/.test(entry.name) && !/package(-lock)?\.json$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Replace comments with spaces (keeping line numbers).
function blank(text, re) {
  return text.replace(re, (m) => m.replace(/[^\n]/g, " "));
}

function stripComments(file, text) {
  if (file.endsWith(".html")) {
    text = blank(text, /<!--[\s\S]*?-->/g);
    // Inline <script> blocks may contain JS comments too.
    return text.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, body, c) => a + stripJs(body) + c);
  }
  if (file.endsWith(".js")) return stripJs(text);
  return text;
}

function stripJs(text) {
  text = blank(text, /\/\*[\s\S]*?\*\//g);
  return blank(text, /^\s*\/\/.*$/gm);
}

const problems = [];
for (const file of await walk(root)) {
  const text = stripComments(file, await readFile(file, "utf8"));
  text.split("\n").forEach((line, i) => {
    const found = line.match(PLACEHOLDER);
    if (found) problems.push(`${relative(root, file)}:${i + 1}: ${found.join(", ")}`);
  });
}

if (problems.length) {
  console.error("Visible placeholders found (remove the sentence or fill in the value):\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("No visible placeholders.");
