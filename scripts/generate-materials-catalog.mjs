// Rewrites the CATALOG block in js/materials-pricing.js (between the
// `// catalog:generated-start` / `// catalog:generated-end` markers) from
// tools/scrapers/materials-catalog.json — the curated, unit-normalized
// output of tools/scrapers/build_catalog.py. See that script's own
// docstring for how the data is scraped/curated, and why it's a manual,
// offline step rather than something run live from the site.
//
// This is the second half of the "go live" pipeline described at the top
// of js/materials-pricing.js:
//   python3 tools/scrapers/build_catalog.py   (writes materials-catalog.json)
//   node scripts/generate-materials-catalog.mjs
//
// Same generate-and-commit pattern as npm run pages (scripts/sync-pages.mjs)
// — nothing runs this automatically; run it, review the diff, commit it.
//
//   node scripts/generate-materials-catalog.mjs          rewrite the file
//   node scripts/generate-materials-catalog.mjs --check   exit 1 if stale (CI)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as prettier from "prettier";

const root = fileURLToPath(new URL("..", import.meta.url));
const CATALOG_JSON_PATH = join(root, "tools/scrapers/materials-catalog.json");
const TARGET_PATH = join(root, "js/materials-pricing.js");

// Explanatory comments live OUTSIDE these markers (see js/materials-pricing.js)
// so regeneration can safely replace everything BETWEEN them without needing
// to parse/preserve any commentary that happened to be in that span.
const START_MARKER = "// catalog:generated-start";
const END_MARKER = "// catalog:generated-end";
const MARKER_RE = new RegExp(`(${START_MARKER}\\n)[\\s\\S]*?(\\n\\s*${END_MARKER})`);

export function renderCatalogBlock(catalog) {
  return "  var IS_MOCK_DATA = false;\n\n" + "  var CATALOG = " + JSON.stringify(catalog, null, 2) + ";";
}

async function main() {
  const check = process.argv.includes("--check");

  const catalogRaw = await readFile(CATALOG_JSON_PATH, "utf8");
  const catalog = JSON.parse(catalogRaw);

  const emptyCategories = Object.entries(catalog)
    .filter(([, options]) => !Array.isArray(options) || options.length === 0)
    .map(([key]) => key);
  if (emptyCategories.length) {
    throw new Error(
      "materials-catalog.json has no options for: " +
        emptyCategories.join(", ") +
        " — re-run tools/scrapers/build_catalog.py rather than committing a partial catalog.",
    );
  }

  const source = await readFile(TARGET_PATH, "utf8");
  const match = source.match(MARKER_RE);
  if (!match) {
    throw new Error(`Could not find catalog:generated-start/end markers in ${TARGET_PATH}`);
  }

  const [, markerStart, markerEnd] = match;
  const updated = source.replace(MARKER_RE, markerStart + renderCatalogBlock(catalog) + markerEnd);

  const options = (await prettier.resolveConfig(TARGET_PATH)) || {};
  const formatted = await prettier.format(updated, { ...options, filepath: TARGET_PATH });

  if (formatted === source) {
    console.log(check ? "materials-pricing.js is up to date." : "No changes.");
    return;
  }

  if (check) {
    console.error("js/materials-pricing.js is out of date with tools/scrapers/materials-catalog.json.");
    console.error("Run: node scripts/generate-materials-catalog.mjs");
    process.exit(1);
  }

  await writeFile(TARGET_PATH, formatted);
  console.log(`Updated ${TARGET_PATH} from ${CATALOG_JSON_PATH} (${Object.keys(catalog).length} categories).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
