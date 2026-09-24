// Keeps the repeated parts of every page in step with ONE definition:
//
//   <!-- chrome:head -->   … <!-- /chrome:head -->     from scripts/partials/head.html
//   <!-- chrome:header --> … <!-- /chrome:header -->   from scripts/partials/header.html
//   <!-- chrome:footer --> … <!-- /chrome:footer -->   from scripts/partials/footer.html
//   <span data-price="Cabinet_Price">$60</span>        from DEFAULT_PRICES in js/bathroom-pricing.js
//
// The pages are committed already filled in, so the site needs no build step:
// this only has to be run after editing a partial or a price.
//
//   node scripts/sync-pages.mjs          rewrite the pages
//   node scripts/sync-pages.mjs --check  exit 1 if any page is out of date (CI)

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as prettier from "prettier";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const Pricing = require(join(root, "js/bathroom-pricing.js"));

// base: prefix for links/assets. 404.html is served for any missing URL
// (at any depth), so it uses root-absolute links.
export const PAGES = [
  { file: "index.html", base: "" },
  { file: "about.html", base: "" },
  { file: "faq.html", base: "" },
  { file: "contact.html", base: "" },
  { file: "privacy.html", base: "" },
  { file: "terms.html", base: "" },
  { file: "gallery.html", base: "" },
  { file: "404.html", base: "/" },
  { file: "admin/index.html", base: "../" },
];

const BLOCKS = ["head", "header", "footer"];

async function partial(name) {
  return readFile(join(root, "scripts/partials", name + ".html"), "utf8");
}

function renderHeader(html, page) {
  const name = page.file.split("/").pop();
  return html.replace(/<a ([^>]*?)data-nav="([^"]+)"([^>]*)>/g, (match, before, target, after) => {
    let attrs = (before + after).replace(/\s+/g, " ").trim();
    if (target === name) {
      if (/class="/.test(attrs)) attrs = attrs.replace(/class="([^"]*)"/, 'class="$1 current"');
      else attrs += ' class="current"';
      attrs += ' aria-current="page"';
    }
    return "<a " + attrs + ">";
  });
}

export async function renderPage(source, page) {
  let html = source;
  for (const block of BLOCKS) {
    const re = new RegExp(`(<!-- chrome:${block} -->)[\\s\\S]*?(<!-- /chrome:${block} -->)`);
    if (!re.test(html)) continue;
    let body = (await partial(block)).trim().replaceAll("{{base}}", page.base);
    if (block === "header") body = renderHeader(body, page);
    html = html.replace(re, (m, open, close) => `${open}\n${body}\n${close}`);
  }
  html = html.replace(/(<span[^>]*\bdata-price="(\w+)"[^>]*>)([^<]*)(<\/span>)/g, (m, open, key, text, close) => {
    if (!(key in Pricing.DEFAULT_PRICES)) throw new Error(`${page.file}: unknown data-price key ${key}`);
    return open + Pricing.shortMoney(Pricing.DEFAULT_PRICES[key]) + close;
  });
  const options = (await prettier.resolveConfig(join(root, page.file))) || {};
  return prettier.format(html, { ...options, parser: "html" });
}

async function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const page of PAGES) {
    const path = join(root, page.file);
    const source = await readFile(path, "utf8");
    const output = await renderPage(source, page);
    if (output !== source) {
      stale.push(page.file);
      if (!check) await writeFile(path, output);
    }
  }
  if (check && stale.length) {
    console.error("These pages are out of date with scripts/partials or DEFAULT_PRICES:\n  " + stale.join("\n  "));
    console.error("Run: npm run pages");
    process.exit(1);
  }
  console.log(check ? "Pages are up to date." : stale.length ? "Updated: " + stale.join(", ") : "No changes.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
