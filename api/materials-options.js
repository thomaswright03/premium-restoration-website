/* eslint-disable no-unused-vars -- buildOption() and the zip param are wired
   in once the real Lowe's fetch() call below is implemented; unused until then. */
// Vercel serverless function (Node runtime, zero-config: anything under /api
// is deployed automatically, no build step). Runs on the server only, so this
// is the one place a real Lowe's API key is allowed to be used or read.
//
// NOT WIRED UP YET. js/materials-pricing.js still serves mock data and
// js/script.js still calls it directly — nothing on the live site calls this
// endpoint. This is scaffolding for the "go live" step described in the
// README's "Materials picker" section, written ahead of time so the actual
// integration is a fast, contained change once real API access exists.
//
// TODO once the Lowe's Developer Hub app is approved and its interactive
// docs are visible, fill in (do not guess at any of this):
//   1. LOWES_API_BASE_URL / the exact Product Catalog search or lookup path.
//   2. The auth scheme Lowe's actually issues (Azure API Management usually
//      means an `Ocp-Apim-Subscription-Key` header, but confirm from the
//      portal rather than assuming).
//   3. The real query parameters for finding products by category/keyword,
//      and whether it supports paging/filtering by price.
//   4. The real response field names for product id, name, price, image URL,
//      and product page URL, so buildOption() below can map them correctly.
//   5. CATEGORY_SEARCH_TERMS below are provisional guesses at search
//      keywords per internal category key — verify each one actually returns
//      the right kind of product before relying on it.

const CATEGORY_SEARCH_TERMS = {
  Toilet_Quantity: "toilet",
  Sink_Quantity: "bathroom sink",
  Bathtub_Quantity: "bathtub",
  Shower_Quantity: "shower kit",
  Shower_Door_Quantity: "shower door",
  Door_Quantity: "interior door",
  Vanity_Quantity: "bathroom vanity",
  Cabinet_Quantity: "bathroom cabinet",
  Mirror_Quantity: "bathroom mirror",
  Mirror_Huge_Quantity: "large bathroom mirror",
  Shower_Shelf_Quantity: "shower shelf",
  floorTile: "floor tile",
  wallTile: "wall tile",
  flooring: "vinyl plank flooring",
  wallPaint: "interior wall paint",
  ceilingPaint: "ceiling paint",
};

function buildOption(rawProduct) {
  // PLACEHOLDER field names — replace with the real Lowe's response shape.
  return {
    id: rawProduct.id,
    name: rawProduct.name,
    best: {
      name: "Lowe's",
      price: rawProduct.price,
      url: rawProduct.url,
      compareNote: null, // no second retailer wired up yet
    },
    imageUrl: rawProduct.imageUrl || null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const category = typeof req.query.category === "string" ? req.query.category : "";
  const zip = typeof req.query.zip === "string" ? req.query.zip : "";

  if (!CATEGORY_SEARCH_TERMS[category]) {
    res.status(400).json({ error: "Unknown or missing category" });
    return;
  }

  const apiKey = process.env.LOWES_API_KEY;
  const baseUrl = process.env.LOWES_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    // Deliberately fails instead of serving fake data — nothing on this
    // endpoint pretends to be live until it actually is.
    res.status(503).json({
      error: "Live materials pricing is not configured yet (missing LOWES_API_KEY/LOWES_API_BASE_URL).",
    });
    return;
  }

  try {
    // NOT IMPLEMENTED: the real fetch() call to Lowe's Product Catalog API
    // goes here once its endpoint/auth/response shape are known. It should
    // use CATEGORY_SEARCH_TERMS[category] as the search keyword, zip for any
    // location-based pricing the API supports, and map results through
    // buildOption().
    res.status(501).json({ error: "Lowe's Product Catalog integration not implemented yet." });
  } catch {
    res.status(502).json({ error: "Could not reach the live pricing source." });
  }
};
