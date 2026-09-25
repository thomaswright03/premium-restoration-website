#!/usr/bin/env python3
"""
Home Depot bathroom product scraper.

STATUS: manual/offline tool only. Nothing in the live site calls this —
see the "SCRAPING RISK" note below before running it against production
traffic or scheduling it. Not wired into api/materials-options.js or
js/materials-pricing.js; that remains mock data until a decision is made
about how (or whether) to use this.

SCRAPING RISK: this uses cloudscraper specifically to get past Home
Depot's Cloudflare bot protection. That's very likely a Terms of Use
violation on their end, and is fragile in ways a real API isn't — they
can change their page structure or escalate their bot defenses at any
time with no notice, and running it from a shared/production IP (e.g. a
serverless function) risks getting that IP range flagged. Treat this as
a manual, occasional data pull, not a live pipeline, until/unless someone
makes an informed call to do otherwise. The Lowe's Developer Hub app
already in progress (see api/materials-options.js, .env.example) is the
legitimate alternative once it's approved.

WHAT WAS ACTUALLY BROKEN: the original script scraped Home Depot's
category "browse" URLs (/b/Category-Path/N-xxxxxxx) and parsed prices out
of the rendered HTML by guessing at CSS class names (sui-text-3xl, etc.).
Both parts were wrong for reasons unrelated to the price regex it kept
trying to patch:
  1. Those specific N-xxxxxxx category ids are stale — Home Depot serves
     its own soft-404 shell page for them (HTTP 404, but real HTML, so
     the old code's "if status == 404: break" silently produced zero
     results without ever surfacing an error).
  2. Home Depot's product grid isn't in the static server HTML at all on
     that soft-404 shell — but even on a real page, guessing at utility
     CSS class names (the sui-* classes are Tailwind-style, auto-
     generated, and churn constantly) is inherently brittle.
Fix: use the search endpoint (/s/<keyword>) instead of guessed category
ids, and read products from the JSON Home Depot itself embeds in the page
(window.__APOLLO_STATE__ — its Apollo GraphQL cache) rather than parsing
rendered HTML/CSS at all. That JSON has typed fields (numeric price, not
a string to regex out of a <span>), and search endpoints appear to be
far more stable than the browse/category ids.

KNOWN LIMITATION — dimensions: the search-results JSON has no structured
width/height/depth fields, only the product title (e.g. "...12 in. Rough
In 2-Piece..."). extract_dimensions() below still regexes the title as a
best-effort label, exactly like the original script, but this is NOT
reliable enough to feed into anything that needs real physical fit (e.g.
the 3D room layout's clearance checks) — titles often describe a rough-in
spec, not the product's actual footprint. Real per-product dimensions
live in a "specificationGroup" block that's only populated on each
product's own detail page (one extra request per product — not done
here, to keep this pass's request volume and block risk down).
"""

import cloudscraper
import json
import re
import time
import random
from datetime import datetime
from urllib.parse import quote


class BathroomProductScraper:
    BASE_URL = "https://www.homedepot.com"

    def __init__(self):
        self.scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'darwin', 'desktop': True},
            delay=10
        )
        self.results = []

    def random_delay(self, min_sec=3, max_sec=6):
        time.sleep(random.uniform(min_sec, max_sec))

    def print_product(self, data, count):
        print(f"\n{'='*75}")
        print(f"PRODUCT #{count} | {data.get('retailer')} | {data.get('category').upper()}")
        print(f"{'='*75}")
        print(f"Title:  {(data.get('title') or 'N/A')[:65]}")
        print(f"Price:  {data.get('price', 'N/A')}")
        print(f"Dims:   {data.get('dimensions', 'N/A')}")
        print(f"Brand:  {data.get('brand', 'N/A')}")
        print(f"Image:  {(data.get('image_url') or 'N/A')[:65]}...")
        print(f"Link:   {(data.get('product_url') or 'N/A')[:65]}...")
        print(f"{'='*75}\n")

    def scrape_homedepot_category(self, category_name, search_term, pages=3):
        print(f"\n[Home Depot] Scraping {category_name} (search: \"{search_term}\")...")

        for page in range(pages):
            try:
                offset = page * 24
                url = f"{self.BASE_URL}/s/{quote(search_term)}"
                params = {"Nao": str(offset)} if offset else {}

                print(f"  Page {page + 1}: {url} {params or ''}")

                response = self.scraper.get(url, params=params, timeout=30)

                if response.status_code != 200:
                    print(f"  Status {response.status_code} — stopping this category")
                    break

                products = self.extract_apollo_products(response.text)

                if not products and page == 0:
                    print("  No products found on the first page — search term likely needs adjusting")
                if not products:
                    break

                print(f"  Found {len(products)} products")

                for raw_product in products:
                    data = self.parse_homedepot_product(raw_product)
                    if data and data.get('title'):
                        data['category'] = category_name
                        data['retailer'] = 'Home Depot'
                        data['scraped_at'] = datetime.now().isoformat()
                        self.results.append(data)
                        self.print_product(data, len(self.results))

                self.random_delay(4, 7)

            except Exception as e:
                print(f"  Error: {e}")
                continue

    def extract_apollo_products(self, html_text):
        """Home Depot embeds its Apollo GraphQL client cache as a plain JS
        object literal assigned to window.__APOLLO_STATE__ — a real,
        already-hydrated snapshot of every product shown on the page, not
        just what got server-rendered into visible HTML. Pull it out with a
        regex (it's always the first statement in its own <script> block,
        terminated by ";\n") and json.loads() it directly; every entry
        whose __typename is BaseProduct is one search result."""
        match = re.search(r"window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*\n", html_text, re.S)
        if not match:
            return []
        try:
            state = json.loads(match.group(1))
        except json.JSONDecodeError:
            return []
        return [v for v in state.values() if isinstance(v, dict) and v.get('__typename') == 'BaseProduct']

    def parse_homedepot_product(self, raw_product):
        identifiers = raw_product.get('identifiers') or {}
        media = raw_product.get('media') or {}
        images = media.get('images') or []

        title = identifiers.get('productLabel')

        price = None
        # The pricing field's key is parameterized by store id
        # (`pricing({"isBrandPricingPolicyCompliant":false,"storeId":"121"})`),
        # which varies by which store Home Depot defaulted to for this
        # request — match by prefix instead of hardcoding a store id.
        for key, value in raw_product.items():
            if key.startswith('pricing(') and isinstance(value, dict):
                price = value.get('value')
                break

        image_url = None
        if images:
            primary = next((img for img in images if img.get('subType') == 'PRIMARY'), images[0])
            url = primary.get('url')
            if url:
                # Home Depot templates the pixel size into the filename via
                # a literal "<SIZE>" token; pick a reasonably large size.
                image_url = url.replace('<SIZE>', '600')

        canonical = identifiers.get('canonicalUrl')
        product_url = f"{self.BASE_URL}{canonical}" if canonical else None

        return {
            'title': title,
            'price': f"${price:,.2f}" if isinstance(price, (int, float)) else None,
            'price_value': price,
            'item_id': identifiers.get('itemId'),
            'model_number': identifiers.get('modelNumber'),
            'brand': identifiers.get('brandName'),
            'image_url': image_url,
            'product_url': product_url,
            'dimensions': self.extract_dimensions(title),
        }

    def extract_dimensions(self, text):
        """Best-effort label parsed from the title — see the KNOWN
        LIMITATION note at the top of this file. Not reliable enough for
        anything that needs the product's real physical footprint."""
        if not text:
            return None
        patterns = [
            r'(\d+(?:\.\d+)?)\s*["\']?\s*[xX]\s*(\d+(?:\.\d+)?)\s*["\']?(?:\s*[xX]\s*(\d+(?:\.\d+)?)\s*["\']?)?\s*(?:in|inch)?',
            r'(\d+(?:\.\d+)?)-in(?:ch)?\s*[xX]\s*(\d+(?:\.\d+)?)-in(?:ch)?',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                groups = [g for g in match.groups() if g]
                return ' x '.join(groups) + '"'
        return None

    def print_summary(self):
        print("\n" + "=" * 75)
        print("SCRAPING COMPLETE")
        print("=" * 75)
        print(f"Total Products Scraped: {len(self.results)}")

        if self.results:
            print("\n--- By Category ---")
            cats = {}
            for r in self.results:
                cats[r['category']] = cats.get(r['category'], 0) + 1
            for cat, count in sorted(cats.items()):
                print(f"  {cat:20}: {count:3} products")

            print("\n--- Sample Prices (first 5) ---")
            for r in self.results[:5]:
                price = r.get('price') or 'N/A'
                print(f"  {price:10} | {(r.get('title') or 'N/A')[:40]}...")
        print("=" * 75)

    def save_json(self, path):
        with open(path, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\nSaved {len(self.results)} products to {path}")


# Same category keys/search terms as CATEGORY_SEARCH_TERMS in
# api/materials-options.js, so results from this tool line up with the
# categories the materials picker already uses.
CATEGORIES = [
    ("Toilet_Quantity", "toilet"),
    ("Sink_Quantity", "bathroom sink"),
    ("Bathtub_Quantity", "bathtub"),
    ("Shower_Quantity", "shower kit"),
    ("Shower_Door_Quantity", "shower door"),
    ("Vanity_Quantity", "bathroom vanity"),
]


def main():
    scraper = BathroomProductScraper()

    print("=" * 75)
    print("HOME DEPOT BATHROOM PRODUCTS SCRAPER")
    print("=" * 75)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 75)

    for cat_name, search_term in CATEGORIES:
        scraper.scrape_homedepot_category(cat_name, search_term, pages=2)
        time.sleep(random.uniform(3, 6))

    scraper.print_summary()
    scraper.save_json(f"homedepot-products-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    return scraper.results


if __name__ == '__main__':
    results = main()
