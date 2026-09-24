// Keeps the repeated parts of every page in step with ONE definition:
//
//   <!-- chrome:head -->   … <!-- /chrome:head -->     from scripts/partials/head.html
//   <!-- chrome:header --> … <!-- /chrome:header -->   from scripts/partials/header.html
//   <!-- chrome:footer --> … <!-- /chrome:footer -->   from scripts/partials/footer.html
//   <span data-price="Cabinet_Price">$60</span>        from "prices" in site-config.json (via js/bathroom-pricing.js)
//   <a data-contact="phone" href="tel:…">…</a>         from js/business-info.js (phone or email;
//   <span data-contact="email">…</span>                 a mailto link keeps its ?subject=…)
//
// The check also fails if a page still has the phone number, the email
// address, or a tel:/mailto: link that is NOT marked with data-contact, so
// every copy changes together.
//
// The pages are committed already filled in, so the site needs no build step:
// this only has to be run after editing a partial or a price.
//
// Prices are special: the owner changes them in site-config.json, and every
// page also fills its price text from that file when it loads (js/site-config.js),
// so visitors see a new price straight away even before this script is run.
// So in --check mode, pages whose only difference is price text are reported
// as a notice ("run npm run pages to refresh the text in the files", which
// matters only for visitors without JavaScript), not as a failure.
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
const Business = require(join(root, "js/business-info.js"));

// base: prefix for links/assets. 404.html is served for any missing URL
// (at any depth), so it uses root-absolute links.
export const PAGES = [
  { file: "index.html", base: "" },
  { file: "about.html", base: "" },
  { file: "faq.html", base: "" },
  { file: "contact.html", base: "" },
  { file: "privacy.html", base: "" },
  { file: "terms.html", base: "" },
  { file: "404.html", base: "/" },
  { file: "admin/index.html", base: "../" },
];

const BLOCKS = ["head", "header", "footer"];

if (!Pricing.hasPublishedPrices()) {
  const raw = JSON.parse(await readFile(join(root, "site-config.json"), "utf8"));
  const problems = Pricing.validatePublishedPrices(raw.prices).errors;
  throw new Error("site-config.json prices can't be used:\n  " + problems.join("\n  "));
}

// The page with every price text blanked and whitespace collapsed, to tell a
// price-only difference from any other.
export function withoutPriceText(html) {
  return html
    .replace(/(<span[^>]*\bdata-price="\w+"[^>]*>)[^<]*(<\/span>)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

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
  html = html.replace(
    /<(a|span)\b([^>]*?)\bdata-contact="(\w+)"([^>]*)>[^<]*<\/\1\s*>/g,
    (m, tag, before, kind, after) => {
      if (kind !== "phone" && kind !== "email") throw new Error(`${page.file}: unknown data-contact "${kind}"`);
      let attrs = before + `data-contact="${kind}"` + after;
      if (tag === "a") {
        attrs = attrs.replace(/href="([^"]*)"/, (h, href) => {
          if (kind === "phone") return `href="${Business.PHONE_HREF}"`;
          const query = href.indexOf("?") === -1 ? "" : href.slice(href.indexOf("?"));
          return `href="${Business.EMAIL_HREF}${query}"`;
        });
      }
      return `<${tag}${attrs}>${kind === "phone" ? Business.PHONE : Business.EMAIL}</${tag}>`;
    },
  );
  const options = (await prettier.resolveConfig(join(root, page.file))) || {};
  return prettier.format(html, { ...options, parser: "html" });
}

// Contact details or links left outside a data-contact element (they would
// not change with js/business-info.js).
export function strayContacts(html) {
  const outside = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(a|span)\b[^>]*\bdata-contact="\w+"[^>]*>[^<]*<\/\1\s*>/g, "");
  return [Business.PHONE, Business.EMAIL, 'href="tel:', 'href="mailto:'].filter((s) => outside.includes(s));
}

async function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  const priceOnly = [];
  for (const page of PAGES) {
    const path = join(root, page.file);
    const source = await readFile(path, "utf8");
    const output = await renderPage(source, page);
    const stray = strayContacts(output);
    if (stray.length) {
      console.error(`${page.file}: contact details not marked with data-contact: ${stray.join(", ")}`);
      process.exitCode = 1;
    }
    if (output !== source) {
      if (check && withoutPriceText(output) === withoutPriceText(source)) priceOnly.push(page.file);
      else stale.push(page.file);
      if (!check) await writeFile(path, output);
    }
  }
  if (check && priceOnly.length) {
    console.warn(
      "Notice: the price text written in these files is older than the prices in site-config.json:\n  " +
        priceOnly.join("\n  ") +
        "\nVisitors already see the new prices (pages fill them in when they load). " +
        "Run `npm run pages` and commit to refresh the files for visitors without JavaScript.",
    );
  }
  if (check && stale.length) {
    console.error("These pages are out of date with scripts/partials or js/business-info.js:\n  " + stale.join("\n  "));
    console.error("Run: npm run pages");
    process.exit(1);
  }
  console.log(
    check
      ? priceOnly.length
        ? "Pages are up to date apart from the price text above."
        : "Pages are up to date."
      : stale.length
        ? "Updated: " + stale.join(", ")
        : "No changes.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
