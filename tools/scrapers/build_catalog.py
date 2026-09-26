#!/usr/bin/env python3
"""
Builds the real CATALOG for js/materials-pricing.js from Home Depot search
results — the curation half of the "scrape offline, commit JSON, regenerate
the JS file" pipeline (see the README's "Materials picker" section).

Pipeline:
  1. This script scrapes all 16 materials categories and writes the
     curated, unit-normalized result to
     tools/scrapers/materials-catalog.json (committed — unlike the raw
     per-run dumps homedepot_scraper.py itself produces, which are
     gitignored).
  2. `node scripts/generate-materials-catalog.mjs` reads that JSON and
     rewrites the CATALOG/TILE_OPTIONS block in js/materials-pricing.js.

Run this (then the Node step) whenever you want to refresh live prices.
Nothing runs this automatically — see homedepot_scraper.py's own SCRAPING
RISK note for why this stays a manual/offline tool, not a live pipeline.

UNIT NORMALIZATION — why this isn't just "take the scraped price":
computeMaterialCost() in materials-pricing.js expects one price PER UNIT —
per item for most categories, per gallon for wallPaint/ceilingPaint, per
sq ft for floorTile/wallTile/flooring. Home Depot's raw scraped price is
for whatever package size that particular listing happens to be (a
1-gallon can vs. a 5-gallon pail; a box of tile covering some number of
sq ft) — not already a per-unit price. Verified by actually scraping these
categories while building this: "interior wall paint" search results mix
1-gallon and 5-gallon listings (e.g. a "5 gal." pail at $125 is $25/gal,
NOT $125/gal), and every tile/flooring listing is priced per box/case
(e.g. "$11.75" for a box covering "10.89 sq. ft."  is about $1.08/sq ft,
not $11.75/sq ft). Blindly using the raw price would misprice these
categories by whatever multiple the package happens to be — a real
under-quoting risk for a live cost estimator, not just a display glitch.
This script parses the pack size/coverage out of each title and divides
to get a true per-unit price; listings where that can't be parsed are
dropped rather than guessed at.

DATA-QUALITY FILTERING — also verified by inspecting real scraped results
while building this, not assumed:
  - A broad search term occasionally returns a multi-fixture bundle (e.g.
    "bathtub" search returning an $8,869 bathtub+sink+bidet+toilet
    package) or a novelty outlier (a $1,219 hidden-bookcase "door"). These
    are real products, just not representative of installing ONE of the
    fixture being priced, and would badly skew a "cheapest/mid/priciest"
    spread. Filtered by dropping anything priced over 4x that category's
    own median (after unit normalization) — a generic outlier guard, not
    a per-category guess.
  - Some search terms return an adjacent-but-wrong product type: "shower
    kit" also returns standalone shower faucets/valves (not a shower
    enclosure — the labor estimate's Shower_Quantity line prices
    installing an enclosure), and "shower door" occasionally returns a
    full bathing system with no door at all. Both filtered with a small,
    targeted keyword check per category (see CATEGORY_FILTERS below) —
    deliberately narrow and specific to the mismatches actually observed,
    not a general content-classification attempt.
"""

import json
import os
import re
import sys

from homedepot_scraper import BathroomProductScraper

# Same category keys/search terms as CATEGORY_SEARCH_TERMS in
# api/materials-options.js, so results line up with what the materials
# picker already expects. Third element is how that category is priced —
# must match GALLON_CATEGORIES / the sq-ft categories in
# js/materials-pricing.js.
CATEGORIES = [
    ("Toilet_Quantity", "toilet", "each"),
    ("Sink_Quantity", "bathroom sink", "each"),
    ("Bathtub_Quantity", "bathtub", "each"),
    ("Shower_Quantity", "shower kit", "each"),
    ("Shower_Door_Quantity", "shower door", "each"),
    ("Door_Quantity", "interior door", "each"),
    ("Vanity_Quantity", "bathroom vanity", "each"),
    ("Cabinet_Quantity", "bathroom cabinet", "each"),
    ("Mirror_Quantity", "bathroom mirror", "each"),
    ("Mirror_Huge_Quantity", "large bathroom mirror", "each"),
    ("Shower_Shelf_Quantity", "shower shelf", "each"),
    ("floorTile", "floor tile", "sqft"),
    ("wallTile", "wall tile", "sqft"),
    ("flooring", "vinyl plank flooring", "sqft"),
    ("wallPaint", "interior wall paint", "gallon"),
    ("ceilingPaint", "ceiling paint", "gallon"),
]

COVERAGE_RE = re.compile(r"\(([\d.]+)\s*sq\.?\s*ft\.?\s*/\s*case\)", re.I)
# Not anchored to the title's start: a "N gal." pack-size mention can sit
# anywhere (e.g. "KILZ ... 5 gal. Primer Sealer and ... 5 gal. Flat..." —
# verified against real scraped titles while building this).
GALLON_PACK_RE = re.compile(r"(\d+(?:\.\d+)?)\s*gal\.?\s+", re.I)
GALLON_STRIP_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*gal\.?\s+", re.I)

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "materials-catalog.json")

# Small, targeted keyword requirements for the specific category/search-term
# mismatches actually observed (see the DATA-QUALITY FILTERING note above) —
# a title must contain at least one of these substrings (case-insensitive)
# to be kept. Most categories have no filter at all.
CATEGORY_FILTERS = {
    # "shower kit" also returns standalone faucets/valves, not enclosures.
    "Shower_Quantity": ["kit", "enclosure", "stall", "alcove", "surround", "base"],
    # "shower door" occasionally returns a full bathing system, no door.
    "Shower_Door_Quantity": ["door"],
}

# Outlier guard: drop anything priced over this multiple of the category's
# own median (after unit normalization) — catches multi-fixture bundles and
# novelty one-offs a broad search term occasionally pulls in.
OUTLIER_MULTIPLE = 4


def normalize(raw_product, unit_kind):
    """Returns (unit_price, display_name, image_url) for one scraped
    product, or None if it can't be safely reduced to a real per-unit
    price. image_url is whatever homedepot_scraper.py's own image_url
    field found — not re-validated here, just passed through."""
    title = raw_product.get("title")
    price = raw_product.get("price_value")
    brand = raw_product.get("brand")
    image_url = raw_product.get("image_url")
    if not title or not isinstance(price, (int, float)) or price <= 0:
        return None

    display_name = f"{brand} {title}" if brand and not title.lower().startswith(brand.lower()) else title

    if unit_kind == "each":
        return price, display_name, image_url

    if unit_kind == "sqft":
        match = COVERAGE_RE.search(title)
        if not match:
            return None  # no parseable coverage — too risky to guess
        coverage = float(match.group(1))
        if coverage <= 0:
            return None
        name = COVERAGE_RE.sub("", display_name).strip().rstrip(",").strip()
        return round(price / coverage, 2), name, image_url

    if unit_kind == "gallon":
        match = GALLON_PACK_RE.search(title)
        gallons = float(match.group(1)) if match else 1.0
        name = GALLON_STRIP_RE.sub("", display_name).strip() or display_name
        return round(price / gallons, 2), f"{name} (per gallon)", image_url

    return None


def median(values):
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    return ordered[mid] if n % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def curate(category_key, products, unit_kind, max_options=3):
    """Normalizes every product, applies the category's keyword filter (if
    any) and drops title-only dupes, then the outlier guard, then spreads
    the picks across the price range (cheapest / mid / priciest) instead of
    just taking the first few — mirrors the mock catalog's own budget-vs-
    premium spread."""
    required_keywords = CATEGORY_FILTERS.get(category_key)

    normalized = []
    seen_names = set()
    for product in products:
        title = product.get("title") or ""
        if required_keywords and not any(kw in title.lower() for kw in required_keywords):
            continue
        result = normalize(product, unit_kind)
        if not result:
            continue
        unit_price, name, image_url = result
        if name in seen_names:
            continue
        seen_names.add(name)
        normalized.append(
            {
                "name": name,
                "price": unit_price,
                "item_id": product.get("item_id"),
                "url": product.get("product_url"),
                "imageUrl": image_url,
            }
        )

    if not normalized:
        return []

    # Outlier guard: a bundle/novelty listing priced far past everything
    # else for this category (see the DATA-QUALITY FILTERING note above).
    # Only applied with enough samples for "median" to mean anything.
    if len(normalized) >= 4:
        typical = median([n["price"] for n in normalized])
        if typical > 0:
            normalized = [n for n in normalized if n["price"] <= typical * OUTLIER_MULTIPLE]

    normalized.sort(key=lambda n: n["price"])

    if len(normalized) <= max_options:
        picks = normalized
    else:
        picks = [normalized[0], normalized[len(normalized) // 2], normalized[-1]]

    return [
        {
            "id": f"hd-{p['item_id']}",
            "name": p["name"],
            "imageUrl": p["imageUrl"],
            "retailers": [{"name": "Home Depot", "price": p["price"], "url": p["url"]}],
        }
        for p in picks
    ]


def main():
    catalog = {}

    for category_key, search_term, unit_kind in CATEGORIES:
        print(f"\n=== {category_key} (\"{search_term}\", priced {unit_kind}) ===", file=sys.stderr)
        scraper = BathroomProductScraper()
        scraper.scrape_homedepot_category(category_key, search_term, pages=1)
        options = curate(category_key, scraper.results, unit_kind)
        print(f"  -> {len(options)} curated option(s)", file=sys.stderr)
        for opt in options:
            print(f"     {opt['name'][:70]:70} {opt['retailers'][0]['price']}", file=sys.stderr)
        catalog[category_key] = options

    with open(OUT_PATH, "w") as f:
        json.dump(catalog, f, indent=2)
    print(f"\nWrote {OUT_PATH}", file=sys.stderr)

    empty = [k for k, v in catalog.items() if not v]
    if empty:
        print(f"\nWARNING: no usable options for: {', '.join(empty)}", file=sys.stderr)


if __name__ == "__main__":
    main()
