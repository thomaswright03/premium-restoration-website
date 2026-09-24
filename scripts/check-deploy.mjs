// Checks that a deployed copy of the site (e.g. production on Vercel) serves
// exactly the files in this checkout — run it after every deploy.
//
//   npm run check:deploy -- https://premium-restoration.vercel.app
//
// It compares every public page, script, stylesheet and site-config.json with
// the local files, and checks that removed pages (gallery.html) answer 404.
// Exit code 0 = the deploy matches this commit; 1 = something differs.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PAGES } from "./sync-pages.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: npm run check:deploy -- https://your-site.vercel.app");
  process.exit(2);
}

// Every page, stylesheet and script (including js/admin/ and js/vendor/), and the settings.
const assets = (await readdir(join(root, "js"), { recursive: true }))
  .map((f) => "js/" + f)
  .concat((await readdir(join(root, "css"))).map((f) => "css/" + f))
  .filter((f) => /\.(js|css)$/.test(f))
  .sort();
const FILES = [...PAGES.map((p) => p.file), "site-config.json", ...assets];
const GONE = ["gallery.html"];

const problems = [];
for (const file of FILES) {
  const url = `${base}/${file === "admin/index.html" ? "admin/" : file}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const live = await res.text();
    const local = await readFile(join(root, file), "utf8");
    if (res.status !== 200) problems.push(`${file}: HTTP ${res.status}`);
    else if (live !== local) problems.push(`${file}: differs from this checkout`);
  } catch (err) {
    problems.push(`${file}: ${err.message}`);
  }
}
for (const file of GONE) {
  try {
    const res = await fetch(`${base}/${file}`, { cache: "no-store" });
    if (res.status !== 404) problems.push(`${file}: should be gone (404) but answers HTTP ${res.status}`);
  } catch (err) {
    problems.push(`${file}: ${err.message}`);
  }
}

if (problems.length) {
  console.error(`${base} does NOT match this checkout:\n  ` + problems.join("\n  "));
  console.error("Check the production branch and the latest deployment in the Vercel dashboard (README 'Deploying').");
  process.exit(1);
}
console.log(`${base} serves exactly this checkout (${FILES.length} files checked; removed pages answer 404).`);
