// Keeps the repeated parts of every page in step with ONE definition:
//
//   <!-- chrome:head -->   … <!-- /chrome:head -->     from scripts/partials/head.html
//   <!-- chrome:header --> … <!-- /chrome:header -->   from scripts/partials/[<lang>/]header.html
//   <!-- chrome:footer --> … <!-- /chrome:footer -->   from scripts/partials/[<lang>/]footer.html
//   <span data-price="Cabinet_Price">$60</span>        from DEFAULT_PRICES in js/bathroom-pricing.js
//
// The pages are committed already filled in, so the site needs no build step:
// this only has to be run after editing a partial or a price.
//
// Translations (see README "Languages"): every public page also exists in
// Spanish (es/<page>) and Brazilian Portuguese (pt/<page>). Those are
// hand-translated copies of the English page. This script fills their chrome
// from the translated partials, and refuses to pass --check when a
// translation has fallen behind its English page:
//   - its tags and attributes must match the English page's, so an added or
//     removed paragraph, link or field can't go missing in one language;
//   - it carries the fingerprint of the English text it was translated from
//     (<!-- i18n-source: … -->), so a reworded English sentence gets flagged
//     too. Once a translation is updated, record that with --translated.
//
//   node scripts/sync-pages.mjs               rewrite the pages
//   node scripts/sync-pages.mjs --check       exit 1 if any page is out of date (CI)
//   node scripts/sync-pages.mjs --translated  also mark every translation as up to date
//   node scripts/sync-pages.mjs --files es/about.html,pt/about.html   only these pages

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as prettier from "prettier";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const Pricing = require(join(root, "js/bathroom-pricing.js"));
const I18n = require(join(root, "js/i18n.js"));

// The live site, for the hreflang links search engines use to find each
// page's other languages (they must be full URLs).
export const SITE_URL = "https://premium-restoration.vercel.app";

// dir: where that language's pages live. Order = order in the switcher.
export const LANGS = [
  { code: "en", dir: "", htmlLang: "en", name: "English" },
  { code: "es", dir: "es/", htmlLang: "es", name: "Español" },
  { code: "pt", dir: "pt/", htmlLang: "pt-BR", name: "Português" },
];

// base: prefix for page links; root: prefix for assets (css, js, icons).
// 404.html is served for any missing URL (at any depth), so it uses
// root-absolute links. The admin tool is staff-only and stays English.
const ENGLISH_PAGES = [
  { file: "index.html", base: "" },
  { file: "about.html", base: "" },
  { file: "faq.html", base: "" },
  { file: "contact.html", base: "" },
  { file: "privacy.html", base: "" },
  { file: "terms.html", base: "" },
  { file: "gallery.html", base: "" },
  { file: "404.html", base: "/" },
  { file: "admin/index.html", base: "../", translated: false },
];

function translatedPage(page, lang) {
  const absolute = page.base === "/";
  return {
    file: lang.dir + page.file,
    source: page.file,
    lang: lang.code,
    base: absolute ? "/" + lang.dir : "",
    root: absolute ? "/" : "../",
  };
}

export const PAGES = ENGLISH_PAGES.flatMap((page) => {
  const english = { ...page, lang: "en", root: page.base };
  if (page.translated === false) return [english];
  return [english, ...LANGS.filter((l) => l.code !== "en").map((l) => translatedPage(page, l))];
});

const BLOCKS = ["head", "header", "footer"];

async function partial(name, lang) {
  const dir = lang && lang !== "en" && name !== "head" ? lang + "/" : "";
  return readFile(join(root, "scripts/partials", dir + name + ".html"), "utf8");
}

function englishFile(page) {
  return page.source || page.file;
}

// Where `page` is in language `code`, as a link from `page` itself.
function pageIn(page, code) {
  const lang = LANGS.find((l) => l.code === code);
  const file = englishFile(page);
  if (page.root === "/") return "/" + lang.dir + file;
  return page.root + lang.dir + file;
}

function renderLangSwitch(page) {
  if (page.translated === false) return "";
  const current = LANGS.find((l) => l.code === page.lang);
  const label = I18n.t("lang.label", null, page.lang);
  const items = LANGS.map((l) => {
    const attrs = [
      `href="${pageIn(page, l.code)}?lang=${l.code}"`,
      `hreflang="${l.htmlLang}"`,
      `lang="${l.htmlLang}"`,
      `data-lang-choice="${l.code}"`,
    ];
    if (l.code === page.lang) attrs.push('aria-current="true"');
    return `<li><a ${attrs.join(" ")}>${l.name}</a></li>`;
  }).join("\n");
  return `<li class="nav-lang">
  <details class="lang-menu">
    <summary>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
      <span class="visually-hidden">${label}: </span>${current.code.toUpperCase()}<span class="visually-hidden"> ${current.name}</span>
    </summary>
    <ul class="lang-menu-list" aria-label="${label}">
${items}
    </ul>
  </details>
</li>`;
}

// hreflang links, plus the early redirect that takes a visitor to the
// language they picked before (the switcher adds ?lang= and saves it) or,
// on their first visit to an English page, to their browser's language.
// Pages kept out of search results (404, the unlinked gallery) get no
// hreflang links.
function renderLangHead(page, indexed) {
  if (page.translated === false) return "";
  const links = indexed
    ? LANGS.map((l) => {
        const href = SITE_URL + "/" + l.dir + englishFile(page);
        return `<link rel="alternate" hreflang="${l.htmlLang}" href="${href}" />`;
      })
    : [];
  if (indexed) links.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}/${englishFile(page)}" />`);
  const paths = Object.fromEntries(LANGS.map((l) => ["/" + l.dir + englishFile(page), l.code]));
  const targets = JSON.stringify(Object.fromEntries(Object.entries(paths).map(([p, c]) => [c, p])));
  return `${links.join("\n")}${links.length ? "\n" : ""}<script>
  (function () {
    var here = "${page.lang}";
    var pages = ${targets};
    try {
      var chosen = /[?&]lang=(en|es|pt)\\b/.exec(location.search);
      if (chosen) {
        localStorage.setItem("pr_lang", chosen[1]);
        var rest = location.search.replace(/([?&])lang=[a-z]+&?/, "$1").replace(/[?&]$/, "");
        history.replaceState(null, "", location.pathname + rest + location.hash);
        return;
      }
      var want = localStorage.getItem("pr_lang");
      if (!want && here === "en") {
        var prefs = navigator.languages || [navigator.language || ""];
        for (var i = 0; i < prefs.length; i++) {
          var code = String(prefs[i]).slice(0, 2).toLowerCase();
          if (code === "en" || code === "es" || code === "pt") {
            want = code;
            break;
          }
        }
      }
      if (want && want !== here && pages[want]) location.replace(pages[want] + location.search + location.hash);
    } catch (e) {}
  })();
</script>`;
}

function renderHeader(html, page) {
  const name = englishFile(page).split("/").pop();
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
  const indexed = !/<meta name="robots" content="noindex"/.test(source);
  for (const block of BLOCKS) {
    const re = new RegExp(`(<!-- chrome:${block} -->)[\\s\\S]*?(<!-- /chrome:${block} -->)`);
    if (!re.test(html)) continue;
    let body = (await partial(block, page.lang))
      .trim()
      .replaceAll("{{base}}", page.base)
      .replaceAll("{{root}}", page.root)
      .replace("{{langHead}}", renderLangHead(page, indexed))
      .replace("{{langSwitch}}", renderLangSwitch(page));
    if (block === "header") body = renderHeader(body, page);
    html = html.replace(re, (m, open, close) => `${open}\n${body}\n${close}`);
  }
  html = html.replace(/(<span[^>]*\bdata-price="(\w+)"[^>]*>)([^<]*)(<\/span>)/g, (m, open, key, text, close) => {
    if (!(key in Pricing.DEFAULT_PRICES)) throw new Error(`${page.file}: unknown data-price key ${key}`);
    return open + Pricing.shortMoney(Pricing.DEFAULT_PRICES[key], I18n.locale(page.lang)) + close;
  });
  const options = (await prettier.resolveConfig(join(root, page.file))) || {};
  return prettier.format(html, { ...options, parser: "html" });
}

// ---------- translation checks ----------

// Attributes whose values are translated text (or differ per language by
// design), left out when comparing a translation's markup with English.
const TEXT_ATTRS = new Set([
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "content",
  "lang",
  "hreflang",
  "aria-current",
]);

function stripNonMarkup(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, "$1$2");
}

// The page's tags and non-text attributes, in order, with links normalized
// so "../js/x.js", "/es/about.html?lang=es" and "js/x.js" compare equal.
function skeleton(html) {
  const out = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const attrRe = /([^\s=/]+)(?:\s*=\s*"([^"]*)")?/g;
  let m;
  html = stripNonMarkup(html);
  while ((m = tagRe.exec(html))) {
    const attrs = [];
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[3]))) {
      const name = a[1].toLowerCase();
      if (TEXT_ATTRS.has(name)) continue;
      let value = a[2] === undefined ? "" : a[2];
      if (name === "href" || name === "src") {
        value = value
          .replace(/^(\.\.\/)+/, "")
          .replace(/^\/(es|pt)\//, "/")
          .replace(/^(es|pt)\//, "")
          .replace(/\?lang=[a-z]+/, "")
          .replace(/^\/(?!\/)/, "");
      }
      if (name === "data-lang-choice") value = "";
      attrs.push(value === "" ? name : `${name}="${value}"`);
    }
    out.push(`<${m[1]}${m[2].toLowerCase()}${attrs.length ? " " + attrs.join(" ") : ""}>`);
  }
  return out;
}

// Fingerprint of an English page's translatable text: what a translator
// has to look at again when it changes. Prices and the year are filled in
// automatically, so they don't count.
export function sourceFingerprint(html) {
  const text = stripNonMarkup(html)
    .replace(/<details class="lang-menu">[\s\S]*?<\/details>/, "")
    .replace(/(<span[^>]*\bdata-(?:price|year)\b[^>]*>)[^<]*/g, "$1")
    .replace(/\s(alt|title|placeholder|aria-label|content)="([^"]*)"/g, " $2 ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

const STAMP_RE = /<!-- i18n-source: ([0-9a-f]+) -->/;

function setStamp(html, fingerprint) {
  const stamp = `<!-- i18n-source: ${fingerprint} -->`;
  if (STAMP_RE.test(html)) return html.replace(STAMP_RE, stamp);
  return html.replace(/(<html[^>]*>)/, `$1\n  ${stamp}`);
}

function checkTranslation(page, output, englishOutput) {
  const problems = [];
  const a = skeleton(englishOutput);
  const b = skeleton(output);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      problems.push(
        `${page.file}: its markup no longer matches ${page.source} (tag ${i + 1}: English has ${a[i] || "nothing"}, ` +
          `translation has ${b[i] || "nothing"}). Bring the translation in line with the English page.`,
      );
      break;
    }
  }
  const stamp = STAMP_RE.exec(output);
  if (!stamp || stamp[1] !== sourceFingerprint(englishOutput)) {
    problems.push(
      `${page.file}: the English text of ${page.source} has changed since this translation was last updated. ` +
        `Update the translation, then run: npm run pages -- --translated`,
    );
  }
  return problems;
}

async function main() {
  const check = process.argv.includes("--check");
  const markTranslated = process.argv.includes("--translated");
  const filesArg = process.argv.find((arg, i, all) => all[i - 1] === "--files");
  const only = filesArg ? new Set(filesArg.split(",")) : null;
  const stale = [];
  const problems = [];
  const english = {};
  for (const page of PAGES) {
    // English pages are always rendered: translations are checked against them.
    if (only && !only.has(page.file) && page.lang !== "en") continue;
    const path = join(root, page.file);
    const source = await readFile(path, "utf8");
    let output = await renderPage(source, page);
    if (page.lang === "en") {
      english[page.file] = output;
    } else {
      if (markTranslated) output = setStamp(output, sourceFingerprint(english[page.source]));
      problems.push(...checkTranslation(page, output, english[page.source]));
    }
    if (only && !only.has(page.file)) continue;
    if (output !== source) {
      stale.push(page.file);
      if (!check) await writeFile(path, output);
    }
  }
  if (check && stale.length) {
    console.error("These pages are out of date with scripts/partials or DEFAULT_PRICES:\n  " + stale.join("\n  "));
    console.error("Run: npm run pages");
  }
  if (problems.length) console.error("Translations need attention:\n  " + problems.join("\n  "));
  if ((check && stale.length) || problems.length) process.exit(1);
  console.log(check ? "Pages are up to date." : stale.length ? "Updated: " + stale.join(", ") : "No changes.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
