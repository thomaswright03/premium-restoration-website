// Premium Restoration — materials picker data layer.
//
// CATALOG (between the catalog:generated markers below) holds real Home
// Depot prices, generated — not hand-written — by a two-step offline
// pipeline, since this site has no live retailer API access:
//   1. tools/scrapers/build_catalog.py scrapes Home Depot search results
//      and curates/normalizes them into tools/scrapers/materials-catalog.json
//      (committed). See that script's own docstring for why this is a
//      manual/offline tool, not something run live from the site, and for
//      the real unit-normalization issues it corrects for (tile/flooring
//      priced per box vs. per sq ft, paint priced per pail vs. per gallon).
//   2. `node scripts/generate-materials-catalog.mjs` reads that JSON and
//      rewrites the CATALOG block below, in place — the same
//      generate-and-commit pattern npm run pages already uses for the
//      HTML partials and published prices.
// Nothing else in this file is generated. Re-run step 1 then step 2
// whenever prices should be refreshed; nothing does this automatically.
//
// IS_MOCK_DATA still exists for the ZIP-based regional adjustment below
// (mockRegionalFactor is NOT real market data — see its own comment) and
// as a fallback this file can be flipped back to by hand if the live
// catalog is ever pulled. It no longer drives a "sample prices" UI notice:
// once CATALOG holds real prices, showing that notice would be wrong.
//
// Loads as a plain browser script (window.MaterialsPricing) and as a Node
// module (for the unit tests).

(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MaterialsPricing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Categories priced by the gallon (coverage in sq ft per gallon) instead
  // of directly by quantity x price. Everything else in CATALOG is priced
  // qty x unit price, whether qty means "each" or "sq ft".
  var GALLON_CATEGORIES = {
    wallPaint: { coverageSqFtPerGallon: 400 },
    ceilingPaint: { coverageSqFtPerGallon: 400 },
  };

  // Real data below (IS_MOCK_DATA and CATALOG), rewritten by
  // `node scripts/generate-materials-catalog.mjs` from
  // tools/scrapers/materials-catalog.json. Do not hand-edit anything
  // between the catalog:generated-start/-end markers — edit the generator
  // or re-run the upstream scrape/curation instead
  // (tools/scrapers/build_catalog.py), then re-run the generator. Keyed by
  // the same line `key` the labor estimate already produces
  // (js/bathroom-pricing.js FIXTURES keys, or "floorTile" / "flooring" /
  // "wallTile" / "wallPaint" / "ceilingPaint").
  // catalog:generated-start
  var IS_MOCK_DATA = false;

  var CATALOG = {
    Toilet_Quantity: [
      {
        id: "hd-336961024",
        name: "Glacier Bay 12 in. Rough In 2-Piece 1.28 GPF Single Flush Round Toilet in White, Seat Included",
        retailers: [
          {
            name: "Home Depot",
            price: 94,
            url: "https://www.homedepot.com/p/Glacier-Bay-12-in-Rough-In-2-Piece-1-28-GPF-Single-Flush-Round-Toilet-in-White-Seat-Included-N2428R-17/336961024",
          },
        ],
      },
      {
        id: "hd-303338365",
        name: "Swiss Madison St. Tropez 1-Piece 1.1/1.6 GPF Dual Flush Elongated Toilet in Glossy White, White Hardware",
        retailers: [
          {
            name: "Home Depot",
            price: 254.6,
            url: "https://www.homedepot.com/p/Swiss-Madison-St-Tropez-1-Piece-1-1-1-6-GPF-Dual-Flush-Elongated-Toilet-in-Glossy-White-White-Hardware-SM-1T254/303338365",
          },
        ],
      },
      {
        id: "hd-313789704",
        name: "KOHLER Cimarron 12 in. Rough In 2-Piece 1.28 GFP Single Flush Elongated Toilet in White with Soft Close Seat",
        retailers: [
          {
            name: "Home Depot",
            price: 369.22,
            url: "https://www.homedepot.com/p/KOHLER-Cimarron-12-in-Rough-In-2-Piece-1-28-GFP-Single-Flush-Elongated-Toilet-in-White-with-Soft-Close-Seat-K-31648-0/313789704",
          },
        ],
      },
    ],
    Sink_Quantity: [
      {
        id: "hd-100090789",
        name: "Glacier Bay 19 in. Drop-In Round Vitreous China Bathroom Sink in White",
        retailers: [
          {
            name: "Home Depot",
            price: 49.96,
            url: "https://www.homedepot.com/p/Glacier-Bay-19-in-Drop-In-Round-Vitreous-China-Bathroom-Sink-in-White-13-0013-4WHD/100090789",
          },
        ],
      },
      {
        id: "hd-202493974",
        name: "KOHLER Caxton 19.3x16.25in. Undermount Bathroom Sink in White Vitreous China with Overflow Drain",
        retailers: [
          {
            name: "Home Depot",
            price: 94.37,
            url: "https://www.homedepot.com/p/KOHLER-Caxton-19-3x16-25in-Undermount-Bathroom-Sink-in-White-Vitreous-China-with-Overflow-Drain-K-R2210-0/202493974",
          },
        ],
      },
      {
        id: "hd-207058591",
        name: "Glacier Bay 37 in. W x 22 in. D Cultured Marble White Rectangular Single Sink Vanity Top in White",
        retailers: [
          {
            name: "Home Depot",
            price: 286,
            url: "https://www.homedepot.com/p/Glacier-Bay-37-in-W-x-22-in-D-Cultured-Marble-White-Rectangular-Single-Sink-Vanity-Top-in-White-HU3722R-WH/207058591",
          },
        ],
      },
    ],
    Bathtub_Quantity: [
      {
        id: "hd-314614191",
        name: "Bootz Industries Aloha 60 in. x 30 in. Alcove Soaking Bathtub with Left Drain in White",
        retailers: [
          {
            name: "Home Depot",
            price: 249,
            url: null,
          },
        ],
      },
      {
        id: "hd-311699666",
        name: "KOHLER Elmbrook 60 in. x 30.25 in. Alcove Deep Soaking Bathtub with Right-Hand Drain in White",
        retailers: [
          {
            name: "Home Depot",
            price: 439,
            url: null,
          },
        ],
      },
      {
        id: "hd-340209365",
        name: "Bootz Industries Aloha 60 in. x 30 in. Bathtub, 60 in. x 30 in. x 60 in. NexTile Surround and 56-60 in. Shower Door Combo",
        retailers: [
          {
            name: "Home Depot",
            price: 1187.99,
            url: null,
          },
        ],
      },
    ],
    Shower_Quantity: [
      {
        id: "hd-202899038",
        name: "Durastall 32 in. x 32 in. x 75 in. Shower Stall with Standard Base in White",
        retailers: [
          {
            name: "Home Depot",
            price: 229.99,
            url: "https://www.homedepot.com/p/Durastall-32-in-x-32-in-x-75-in-Shower-Stall-with-Standard-Base-in-White-68/202899038",
          },
        ],
      },
      {
        id: "hd-341782460",
        name: "American Standard Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set in White Subway Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 829,
            url: "https://www.homedepot.com/p/American-Standard-Passage-32-in-W-x-72-in-H-Four-piece-Glue-Up-Acrylic-Alcove-Shower-Wall-Set-in-White-Subway-Tile-P2969SWT-375/341782460",
          },
        ],
      },
      {
        id: "hd-330250438",
        name: "CASTICO Carrara 32 in. x 60 in. x 84 in. Solid Composite Stone Alcove Shower Kit with Walls and Graphite Pan Base L/R Drain",
        retailers: [
          {
            name: "Home Depot",
            price: 1799,
            url: "https://www.homedepot.com/p/CASTICO-Carrara-32-in-x-60-in-x-84-in-Solid-Composite-Stone-Alcove-Shower-Kit-with-Walls-and-Graphite-Pan-Base-L-R-Drain-K1B1S3260GRCACA/330250438",
          },
        ],
      },
    ],
    Shower_Door_Quantity: [
      {
        id: "hd-318474663",
        name: "TOOLKISS 56 in. - 60 in. W x 72 in. H Sliding Framed Shower Door in Matte Black with Clear Glass",
        retailers: [
          {
            name: "Home Depot",
            price: 339,
            url: "https://www.homedepot.com/p/TOOLKISS-56-in-60-in-W-x-72-in-H-Sliding-Framed-Shower-Door-in-Matte-Black-with-Clear-Glass-TK19118MB/318474663",
          },
        ],
      },
      {
        id: "hd-325978612",
        name: "Home Decorators Collection Waverly 58 1/2 in. - 60 in. W x 76 in. H Sliding Frameless Shower Door in Matte Black Finish with Clear Glass",
        retailers: [
          {
            name: "Home Depot",
            price: 699,
            url: "https://www.homedepot.com/p/Home-Decorators-Collection-Waverly-58-1-2-in-60-in-W-x-76-in-H-Sliding-Frameless-Shower-Door-in-Matte-Black-Finish-with-Clear-Glass-GBSH169/325978612",
          },
        ],
      },
      {
        id: "hd-316808409",
        name: "KOHLER Elmbrook 55-60 in. W x 74 in. H Sliding Frameless Shower Door in Matte Black with 5/16 in. Thick Tempered Glass",
        retailers: [
          {
            name: "Home Depot",
            price: 819,
            url: "https://www.homedepot.com/p/KOHLER-Elmbrook-55-60-in-W-x-74-in-H-Sliding-Frameless-Shower-Door-in-Matte-Black-with-5-16-in-Thick-Tempered-Glass-K-R706851-8L-BL/316808409",
          },
        ],
      },
    ],
    Door_Quantity: [
      {
        id: "hd-202091529",
        name: "Johnson Hardware 1500 Series 24 in. to 36 in. x 80 in. Universal Pocket Door Frame for 2x4 Stud Wall",
        retailers: [
          {
            name: "Home Depot",
            price: 125,
            url: null,
          },
        ],
      },
      {
        id: "hd-310969636",
        name: "eightdoors 30 in. x 80 in. x 1-3/8 in. Shaker White Primed 2-Panel Solid Core Wood Interior Slab Door",
        retailers: [
          {
            name: "Home Depot",
            price: 229.61,
            url: null,
          },
        ],
      },
      {
        id: "hd-202089889",
        name: "Contractors Wardrobe Raised 6-Panel Colonial Painted Steel Interior Sliding Door",
        retailers: [
          {
            name: "Home Depot",
            price: 474.8,
            url: null,
          },
        ],
      },
    ],
    Vanity_Quantity: [
      {
        id: "hd-203486514",
        name: "Glacier Bay 19 in. Single Sink White Freestanding Bath Vanity with White Cultured Marble Top (Assembled)",
        retailers: [
          {
            name: "Home Depot",
            price: 139,
            url: "https://www.homedepot.com/p/Glacier-Bay-19-in-Single-Sink-White-Freestanding-Bath-Vanity-with-White-Cultured-Marble-Top-Assembled-GB18P2-WH/203486514",
          },
        ],
      },
      {
        id: "hd-306307816",
        name: "Home Decorators Collection Sedgewood 37 in. Single Sink Freestanding White Bathroom Vanity with Arctic Solid Surface Top (Assembled)",
        retailers: [
          {
            name: "Home Depot",
            price: 499,
            url: "https://www.homedepot.com/p/Home-Decorators-Collection-Sedgewood-37-in-Single-Sink-Freestanding-White-Bathroom-Vanity-with-Arctic-Solid-Surface-Top-Assembled-PPLNKWHT36D/306307816",
          },
        ],
      },
      {
        id: "hd-328794815",
        name: "ARIEL Hepburn 48 in. Single Sink Freestanding Bathroom Vanity in White with Carrara White Quartz Top",
        retailers: [
          {
            name: "Home Depot",
            price: 1927,
            url: "https://www.homedepot.com/p/ARIEL-Hepburn-48-in-Single-Sink-Freestanding-Bathroom-Vanity-in-White-with-Carrara-White-Quartz-Top-T048SCQRVOWHT/328794815",
          },
        ],
      },
    ],
    Cabinet_Quantity: [
      {
        id: "hd-308061907",
        name: "Glacier Bay Slat Style 14 in. W x 11 in. D x 58.5 in. H Towel Tower in Nickel",
        retailers: [
          {
            name: "Home Depot",
            price: 50,
            url: "https://www.homedepot.com/p/Glacier-Bay-Slat-Style-14-in-W-x-11-in-D-x-58-5-in-H-Towel-Tower-in-Nickel-3458NNHD/308061907",
          },
        ],
      },
      {
        id: "hd-204089752",
        name: "Glacier Bay Lancaster 21 in. W x 8 in. D x 26 in. H Surface-Mount Raised panel Bathroom Storage Wall Cabinet in White",
        retailers: [
          {
            name: "Home Depot",
            price: 132,
            url: "https://www.homedepot.com/p/Glacier-Bay-Lancaster-21-in-W-x-8-in-D-x-26-in-H-Surface-Mount-Raised-panel-Bathroom-Storage-Wall-Cabinet-in-White-LAOJ25-WH/204089752",
          },
        ],
      },
      {
        id: "hd-203985030",
        name: "Home Decorators Collection Naples 26.5 in. W x 8 in. D x 32.8 in. H Bathroom Storage Wall Cabinet in White",
        retailers: [
          {
            name: "Home Depot",
            price: 320,
            url: "https://www.homedepot.com/p/Home-Decorators-Collection-Naples-26-5-in-W-x-8-in-D-x-32-8-in-H-Bathroom-Storage-Wall-Cabinet-in-White-NAWO2633/203985030",
          },
        ],
      },
    ],
    Mirror_Quantity: [
      {
        id: "hd-331646373",
        name: "Relyblo 22 in. W x 30 in. H Rounded Rectangle Framed Wall Bathroom Vanity Mirror for Over Sink Wall in Matte Black",
        retailers: [
          {
            name: "Home Depot",
            price: 33.07,
            url: "https://www.homedepot.com/p/Relyblo-22-in-W-x-30-in-H-Rounded-Rectangle-Framed-Wall-Bathroom-Vanity-Mirror-for-Over-Sink-Wall-in-Matte-Black-YK-2230-BK/331646373",
          },
        ],
      },
      {
        id: "hd-322929700",
        name: "TOOLKISS 40 in. W x 32 in. H Rectangular Aluminum Framed Wall Bathroom Vanity Mirror in Matte Black",
        retailers: [
          {
            name: "Home Depot",
            price: 107,
            url: "https://www.homedepot.com/p/TOOLKISS-40-in-W-x-32-in-H-Rectangular-Aluminum-Framed-Wall-Bathroom-Vanity-Mirror-in-Matte-Black-B10080/322929700",
          },
        ],
      },
      {
        id: "hd-317583429",
        name: "TOOLKISS 48 in. W x 36 in. H Large Rectangular Frameless LED Light Anti-Fog Wall Bathroom Vanity Mirror Super Bright",
        retailers: [
          {
            name: "Home Depot",
            price: 318,
            url: "https://www.homedepot.com/p/TOOLKISS-48-in-W-x-36-in-H-Large-Rectangular-Frameless-LED-Light-Anti-Fog-Wall-Bathroom-Vanity-Mirror-Super-Bright-TK19068/317583429",
          },
        ],
      },
    ],
    Mirror_Huge_Quantity: [
      {
        id: "hd-316331995",
        name: "Glacier Bay 36 in. W x 48 in. H Rectangular Frameless Polished Edge Wall Bathroom Vanity Mirror in Silver",
        retailers: [
          {
            name: "Home Depot",
            price: 84.97,
            url: "https://www.homedepot.com/p/Glacier-Bay-36-in-W-x-48-in-H-Rectangular-Frameless-Polished-Edge-Wall-Bathroom-Vanity-Mirror-in-Silver-81180/316331995",
          },
        ],
      },
      {
        id: "hd-326065853",
        name: "Apmir 72 in. W x 36 in. H Large Rectangular Tempered Glass & Aluminum Alloy Framed Wall Bathroom Vanity Mirror in matte Black",
        retailers: [
          {
            name: "Home Depot",
            price: 239,
            url: "https://www.homedepot.com/p/Apmir-72-in-W-x-36-in-H-Large-Rectangular-Tempered-Glass-Aluminum-Alloy-Framed-Wall-Bathroom-Vanity-Mirror-in-matte-Black-B18191/326065853",
          },
        ],
      },
      {
        id: "hd-326878062",
        name: "Derrin 60 in. W x 36 in. H Large Rectangular Frameless Anti-Fog Dimmable LED Wall Bathroom Vanity Mirror in Silver",
        retailers: [
          {
            name: "Home Depot",
            price: 330,
            url: "https://www.homedepot.com/p/Derrin-60-in-W-x-36-in-H-Large-Rectangular-Frameless-Anti-Fog-Dimmable-LED-Wall-Bathroom-Vanity-Mirror-in-Silver-THDBM6036FBVC2V1/326878062",
          },
        ],
      },
    ],
    Shower_Shelf_Quantity: [
      {
        id: "hd-314963829",
        name: "Bath Bliss 4 Tier Tension Corner Shower Organizer Caddy in Grey",
        retailers: [
          {
            name: "Home Depot",
            price: 16.18,
            url: "https://www.homedepot.com/p/Bath-Bliss-4-Tier-Tension-Corner-Shower-Organizer-Caddy-in-Grey-10000-GREY/314963829",
          },
        ],
      },
      {
        id: "hd-100677312",
        name: "Tile Redi Redi Niche 16 in. W x 20 in. H x 4 in. D Shampoo - Soap Standard Double Niche",
        retailers: [
          {
            name: "Home Depot",
            price: 69,
            url: "https://www.homedepot.com/p/Tile-Redi-Redi-Niche-16-in-W-x-20-in-H-x-4-in-D-Shampoo-Soap-Standard-Double-Niche-RN1620D-BI/100677312",
          },
        ],
      },
      {
        id: "hd-343430516",
        name: "Shower Caddy 2 Pack Brushed Nickel Corner Shower Shelf Recessed Floating Bathroom Shelf for Tiled Wall 10 in",
        retailers: [
          {
            name: "Home Depot",
            price: 233.58,
            url: "https://www.homedepot.com/p/Shower-Caddy-2-Pack-Brushed-Nickel-Corner-Shower-Shelf-Recessed-Floating-Bathroom-Shelf-for-Tiled-Wall-10-in-8FC8TVYY/343430516",
          },
        ],
      },
    ],
    floorTile: [
      {
        id: "hd-300126888",
        name: "TrafficMaster Vigo Gris 12 in. x 24 in. Matte Ceramic Stone Look Floor and Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 0.97,
            url: "https://www.homedepot.com/p/TrafficMaster-Vigo-Gris-12-in-x-24-in-Matte-Ceramic-Stone-Look-Floor-and-Wall-Tile-16-sq-ft-Case-NHDVIGRI1224/300126888",
          },
        ],
      },
      {
        id: "hd-313050938",
        name: "Daltile Baker Wood 6 in. x 24 in. Walnut Glazed Porcelain Floor and Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 1.97,
            url: "https://www.homedepot.com/p/Daltile-Baker-Wood-6-in-x-24-in-Walnut-Glazed-Porcelain-Floor-and-Wall-Tile-14-55-sq-ft-Case-BK10624HD1PR/313050938",
          },
        ],
      },
      {
        id: "hd-315506629",
        name: "MSI Kenzzi Zenzibar 8 in. x 8 in. Encaustic Matte Porcelain Floor and Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 5.18,
            url: "https://www.homedepot.com/p/MSI-Kenzzi-Zenzibar-8-in-x-8-in-Encaustic-Matte-Porcelain-Floor-and-Wall-Tile-5-16-sq-ft-Case-NZAN8X8/315506629",
          },
        ],
      },
    ],
    wallTile: [
      {
        id: "hd-302603803",
        name: "Daltile Restore Bright White 4-1/4 in. x 4-1/4 in. Ceramic Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 0.88,
            url: "https://www.homedepot.com/p/Daltile-Restore-Bright-White-4-1-4-in-x-4-1-4-in-Ceramic-Wall-Tile-12-5-sq-ft-Case-RE1544HD1P4/302603803",
          },
        ],
      },
      {
        id: "hd-308736405",
        name: "Corso Italia Alpe Graphite Matte 12 in. x 24 in. Quartzite Stone Look Porcelain Floor and Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 1.99,
            url: "https://www.homedepot.com/p/Corso-Italia-Alpe-Graphite-Matte-12-in-x-24-in-Quartzite-Stone-Look-Porcelain-Floor-and-Wall-Tile-15-50-sq-ft-Case-610010002399/308736405",
          },
        ],
      },
      {
        id: "hd-313499026",
        name: "Daltile LuxeCraft Arteko Antique White 3 in. x 12 in. Glazed Ceramic Wall Tile",
        retailers: [
          {
            name: "Home Depot",
            price: 5.99,
            url: "https://www.homedepot.com/p/Daltile-LuxeCraft-Arteko-Antique-White-3-in-x-12-in-Glazed-Ceramic-Wall-Tile-12-sq-ft-Case-AK01312HD1P2/313499026",
          },
        ],
      },
    ],
    flooring: [
      {
        id: "hd-324087709",
        name: "TrafficMaster Breaksea Island 6 MIL x 6 in. x 36 in. Waterproof Click Lock Vinyl Plank Flooring",
        retailers: [
          {
            name: "Home Depot",
            price: 1.49,
            url: "https://www.homedepot.com/p/TrafficMaster-Breaksea-Island-6-MIL-x-6-in-x-36-in-Waterproof-Click-Lock-Vinyl-Plank-Flooring-23-95-sq-ft-case-VTRHDBREAIS6X36/324087709",
          },
        ],
      },
      {
        id: "hd-309083456",
        name: "Lifeproof Sterling Oak 22 MIL x 8.7 in. W x 48 in. L Click Lock Waterproof Luxury Vinyl Plank Flooring",
        retailers: [
          {
            name: "Home Depot",
            price: 2.98,
            url: "https://www.homedepot.com/p/Lifeproof-Sterling-Oak-22-MIL-x-8-7-in-W-x-48-in-L-Click-Lock-Waterproof-Luxury-Vinyl-Plank-Flooring-20-1-sqft-case-I966106LP/309083456",
          },
        ],
      },
      {
        id: "hd-338071457",
        name: "Flooret Modin Nakan Craftsman 40 MIL x 3.35 in x 72 in Waterproof Click Lock Luxury Vinyl Plank Flooring",
        retailers: [
          {
            name: "Home Depot",
            price: 5.75,
            url: "https://www.homedepot.com/p/Flooret-Modin-Nakan-Craftsman-40-MIL-x-3-35-in-x-72-in-Waterproof-Click-Lock-Luxury-Vinyl-Plank-Flooring-20-09-sq-ft-case-FL-MR-NAKA-C/338071457",
          },
        ],
      },
    ],
    wallPaint: [
      {
        id: "hd-100141333",
        name: "Glidden Maintenance 5 gal. White Flat Interior and Exterior Paint (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 8,
            url: "https://www.homedepot.com/p/Glidden-Maintenance-5-gal-White-Flat-Interior-and-Exterior-Paint-920-05/100141333",
          },
        ],
      },
      {
        id: "hd-205853483",
        name: "BEHR PRO 5 gal. i300 White Eggshell Interior Paint (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 23.8,
            url: "https://www.homedepot.com/p/BEHR-PRO-5-gal-i300-White-Eggshell-Interior-Paint-PR33005/205853483",
          },
        ],
      },
      {
        id: "hd-204405959",
        name: "BEHR PREMIUM PLUS 12 Swiss Coffee Paint (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 43.98,
            url: "https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-12-Swiss-Coffee-Semi-Gloss-Enamel-Low-Odor-Interior-Paint-Primer-305001/204405959",
          },
        ],
      },
    ],
    ceilingPaint: [
      {
        id: "hd-202246803",
        name: "Glidden Ceiling 1 gal. High-Hiding White Interior Dead-Flat Ceiling Paint (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 23.98,
            url: "https://www.homedepot.com/p/Glidden-Ceiling-1-gal-High-Hiding-White-Interior-Dead-Flat-Ceiling-Paint-GPL-0000-01/202246803",
          },
        ],
      },
      {
        id: "hd-307298172",
        name: "Glidden Diamond 1 gal. White Flat Interior One-Coat Ceiling Paint with Primer (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 34.98,
            url: "https://www.homedepot.com/p/Glidden-Diamond-1-gal-White-Flat-Interior-One-Coat-Ceiling-Paint-with-Primer-PPG83-610/307298172",
          },
        ],
      },
      {
        id: "hd-204805213",
        name: "Zinsser 1 gal. Flat Bright White Ceiling Paint and Primer in One (2-Pack) (per gallon)",
        retailers: [
          {
            name: "Home Depot",
            price: 79.94,
            url: "https://www.homedepot.com/p/Zinsser-1-gal-Flat-Bright-White-Ceiling-Paint-and-Primer-in-One-2-Pack-260967/204805213",
          },
        ],
      },
    ],
  };
  // catalog:generated-end

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function money(value) {
    var n = Number(value) || 0;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatQty(n) {
    return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  // Deterministic placeholder "regional adjustment" so different ZIP codes
  // visibly change the price shown, demonstrating the mechanic without a
  // real location-pricing source connected yet. NOT real market data.
  function mockRegionalFactor(zip) {
    var digits = String(zip || "").replace(/\D/g, "");
    if (!digits) return 1;
    var sum = 0;
    for (var i = 0; i < digits.length; i++) sum += Number(digits[i]);
    // Spreads to roughly 0.92-1.08 based on the ZIP's digits.
    return round2(0.92 + (sum % 17) / 100);
  }

  // Given one option's retailers (already regionally adjusted), returns the
  // cheapest with a note when there was more than one to compare.
  function bestRetailer(retailers) {
    if (!retailers || !retailers.length) return null;
    var best = retailers[0];
    retailers.forEach(function (r) {
      if (r.price < best.price) best = r;
    });
    var compareNote = null;
    if (retailers.length > 1) {
      var others = retailers.filter(function (r) {
        return r !== best;
      });
      compareNote =
        "Cheaper than " +
        others
          .map(function (r) {
            return r.name + " (" + money(r.price) + ")";
          })
          .join(", ") +
        " for the same product.";
    }
    return { name: best.name, price: best.price, url: best.url, compareNote: compareNote };
  }

  // Which material categories apply to a finished labor estimate, in the
  // same order they were priced. Only categories the customer actually
  // chose get offered — this reads straight off the labor estimate's own
  // line items (js/bathroom-pricing.js computeEstimate), so it can never
  // drift from what was actually priced, and it never needs updating when
  // the scope model changes.
  function categoriesFromLines(lines) {
    return (lines || [])
      .filter(function (l) {
        return l.key !== "demolition" && Object.prototype.hasOwnProperty.call(CATALOG, l.key);
      })
      .map(function (l) {
        return { key: l.key, label: l.label, qty: l.qty, unit: l.unit };
      });
  }

  // Options for one category, regionally adjusted, with the cheapest
  // retailer already resolved per option.
  function getOptionsForCategory(categoryKey, zip) {
    var options = CATALOG[categoryKey] || [];
    var factor = mockRegionalFactor(zip);
    return options.map(function (opt) {
      var adjusted = opt.retailers.map(function (r) {
        return { name: r.name, price: round2(r.price * factor), url: r.url };
      });
      return { id: opt.id, name: opt.name, best: bestRetailer(adjusted) };
    });
  }

  // Cost for one pick: qty x unit price, except paint categories, which are
  // sold by the gallon and only priced in whole-gallon increments. `unit` is
  // the same unit string the labor line already carries (e.g. "sq ft").
  function computeMaterialCost(categoryKey, qty, unit, unitPrice) {
    var gallonInfo = GALLON_CATEGORIES[categoryKey];
    if (gallonInfo) {
      var gallons = Math.max(1, Math.ceil((Number(qty) || 0) / gallonInfo.coverageSqFtPerGallon));
      return {
        quantityLabel: gallons + (gallons === 1 ? " gallon" : " gallons"),
        cost: round2(gallons * unitPrice),
      };
    }
    var q = Number(qty) || 0;
    return { quantityLabel: formatQty(q) + " " + unit, cost: round2(q * unitPrice) };
  }

  return {
    IS_MOCK_DATA: IS_MOCK_DATA,
    CATALOG: CATALOG,
    money: money,
    formatQty: formatQty,
    mockRegionalFactor: mockRegionalFactor,
    bestRetailer: bestRetailer,
    categoriesFromLines: categoriesFromLines,
    getOptionsForCategory: getOptionsForCategory,
    computeMaterialCost: computeMaterialCost,
  };
});
