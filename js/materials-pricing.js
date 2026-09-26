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
        imageUrl:
          "https://images.thdstatic.com/productImages/c85317bf-09ed-407a-b7a5-3856a70bffd9/svn/white-glacier-bay-two-piece-toilets-n2428r-17-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 94,
            url: "https://www.homedepot.com/p/Glacier-Bay-12-in-Rough-In-2-Piece-1-28-GPF-Single-Flush-Round-Toilet-in-White-Seat-Included-N2428R-17/336961024",
          },
        ],
      },
      {
        id: "hd-312442216",
        name: "American Standard Champion Two-Piece 1.28 GPF Single Flush Elongated Chair Height Toilet with Slow-Close Seat in White",
        imageUrl:
          "https://images.thdstatic.com/productImages/a8cd7f4f-440a-41ac-a474-7449c68e3f1b/svn/white-american-standard-two-piece-toilets-747aa107sc-020-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 249,
            url: "https://www.homedepot.com/p/American-Standard-Champion-Two-Piece-1-28-GPF-Single-Flush-Elongated-Chair-Height-Toilet-with-Slow-Close-Seat-in-White-747AA107SC-020/312442216",
          },
        ],
      },
      {
        id: "hd-313789704",
        name: "KOHLER Cimarron 12 in. Rough In 2-Piece 1.28 GFP Single Flush Elongated Toilet in White with Soft Close Seat",
        imageUrl:
          "https://images.thdstatic.com/productImages/e2040f45-bd28-4da2-9c1e-76f9571c70d0/svn/white-kohler-two-piece-toilets-k-31648-0-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/f4b02798-819f-4efc-830e-9e8f322d4a33/svn/white-glacier-bay-drop-in-bathroom-sinks-13-0013-4whd-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/665e5b48-5b43-44a1-851d-7122c45c6575/svn/white-kohler-undermount-bathroom-sinks-k-r2210-0-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/c7d916f1-3601-45ea-9324-e162bba65dc1/svn/glacier-bay-bathroom-vanity-tops-hu3722r-wh-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/86749641-8d99-4e11-86cc-d187513c02a3/svn/white-bootz-industries-alcove-bathtubs-011-3365-00-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 249,
            url: "https://www.homedepot.com/p/314614191",
          },
        ],
      },
      {
        id: "hd-311699666",
        name: "KOHLER Elmbrook 60 in. x 30.25 in. Alcove Deep Soaking Bathtub with Right-Hand Drain in White",
        imageUrl:
          "https://images.thdstatic.com/productImages/c130c408-963c-4c29-887a-4ad1980d44a2/svn/white-kohler-alcove-bathtubs-k-r23217-ra-0-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 439,
            url: "https://www.homedepot.com/p/311699666",
          },
        ],
      },
      {
        id: "hd-340209365",
        name: "Bootz Industries Aloha 60 in. x 30 in. Bathtub, 60 in. x 30 in. x 60 in. NexTile Surround and 56-60 in. Shower Door Combo",
        imageUrl:
          "https://images.thdstatic.com/productImages/e02c9295-5f3e-44a4-ba02-4ae75da4ac3d/svn/bootz-industries-tub-shower-combos-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 1187.99,
            url: "https://www.homedepot.com/p/340209365",
          },
        ],
      },
    ],
    Shower_Quantity: [
      {
        id: "hd-202899038",
        name: "Durastall 32 in. x 32 in. x 75 in. Shower Stall with Standard Base in White",
        imageUrl:
          "https://images.thdstatic.com/productImages/20abd2a7-90a8-478a-8613-9c81e527ab73/svn/white-durastall-shower-stall-kits-68-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/823977a3-3d49-427c-a550-c0f2d92c969e/svn/white-subway-tile-american-standard-alcove-shower-walls-surrounds-p2969swt-375-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/920bae9a-a025-4d22-aeb2-67d67968a996/svn/carrara-graphite-castico-shower-stall-kits-k1b1s3260grcaca-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/48c611a5-89ba-49a2-a5bc-b7d9dad239fd/svn/toolkiss-alcove-shower-doors-tk19118mb-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/ecd53799-4d20-4016-89bf-566b726f158b/svn/home-decorators-collection-alcove-shower-doors-gbsh169-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/3d6666a5-142a-48ea-bcd9-e7bc884b6328/svn/kohler-alcove-shower-doors-k-r706851-8l-bl-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/3f8474e3-ffba-4e38-871f-737cd1f43580/svn/unfinished-johnson-hardware-door-frames-153068pf-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 125,
            url: "https://www.homedepot.com/p/202091529",
          },
        ],
      },
      {
        id: "hd-310969636",
        name: "eightdoors 30 in. x 80 in. x 1-3/8 in. Shaker White Primed 2-Panel Solid Core Wood Interior Slab Door",
        imageUrl:
          "https://images.thdstatic.com/productImages/afa0a80d-0daa-4272-a751-6b43a6d400fa/svn/triple-coat-white-primer-eightdoors-slab-doors-70288014803035sh-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 229.61,
            url: "https://www.homedepot.com/p/310969636",
          },
        ],
      },
      {
        id: "hd-202089889",
        name: "Contractors Wardrobe Raised 6-Panel Colonial Painted Steel Interior Sliding Door",
        imageUrl:
          "https://images.thdstatic.com/catalog/productImages/600/56/566e4925-375a-464d-a381-1b99d43d9880_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 474.8,
            url: "https://www.homedepot.com/p/202089889",
          },
        ],
      },
    ],
    Vanity_Quantity: [
      {
        id: "hd-203486514",
        name: "Glacier Bay 19 in. Single Sink White Freestanding Bath Vanity with White Cultured Marble Top (Assembled)",
        imageUrl:
          "https://images.thdstatic.com/productImages/b3780075-bcb1-4a4b-8ae3-b959f999f062/svn/glacier-bay-bathroom-vanities-with-tops-gb18p2-wh-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/b8a0bbe2-2b2f-480b-9563-8abcadc21ec7/svn/home-decorators-collection-bathroom-vanities-with-tops-pplnkwht36d-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/47097b14-5e42-4b36-8bd9-e4c401a8c368/svn/ariel-bathroom-vanities-with-tops-t048scqrvowht-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/9b695bd7-e976-44f5-843b-ec83156f8777/svn/nickel-glacier-bay-linen-cabinets-3458nnhd-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/4e909f61-e079-469e-ae14-cda3debb97b1/svn/white-glacier-bay-bathroom-wall-cabinets-laoj25-wh-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/19bd0869-f2f2-4911-9731-3072874f1893/svn/white-home-decorators-collection-bathroom-wall-cabinets-nawo2633-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/fbad623d-8881-4656-a23e-7fef4e0dde17/svn/22-w-x-30-h-relyblo-vanity-mirrors-yk-2230-bk-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/35ec4433-91a5-44c0-9551-51a73f7c42b2/svn/black-toolkiss-vanity-mirrors-b10080-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/1ab26656-4b37-42b3-90b3-181bf3984202/svn/bulit-in-double-led-light-strip-toolkiss-vanity-mirrors-tk19068-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/a1d1e36a-92c9-488d-8af2-8b5dda1f8b4c/svn/silver-glacier-bay-vanity-mirrors-81180-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/db410f4c-b873-4913-8f62-754bb5907c21/svn/matte-black-apmir-vanity-mirrors-b18191-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/114d885b-1cb1-48b5-ab44-79f56287481f/svn/silver-vanity-mirrors-thdbm6036fbvc2v1-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/ccd652a3-3c34-43bc-953d-f5742717d041/svn/grey-bath-bliss-shower-caddies-10000-grey-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/d975f2f7-cee6-4dee-8c2a-fb13ae70da23/svn/black-tile-redi-shower-niches-rn1620d-bi-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/1f64afab-d812-410a-80be-b664b2a15096/svn/brushed-nickel-shower-caddies-8fc8tvyy-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/1a6280c5-e0c5-4f8e-811f-88a8833104b9/svn/vigo-gris-trafficmaster-ceramic-tile-nhdvigri1224-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/e0de4409-2500-4157-a51a-a786b505c19d/svn/walnut-daltile-porcelain-tile-bk10624hd1pr-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/dc103de7-19e8-4d10-8859-1a011bdd6036/svn/zenzibar-msi-porcelain-tile-nzan8x8-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/fa0b3b2e-40a0-4b5f-8ed4-f059dc9ad902/svn/bright-white-daltile-ceramic-tile-re1544hd1p4-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/873d7877-c14a-5282-b6cf-abcc6a359124/svn/graphite-matte-corso-italia-porcelain-tile-610010002399-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/7c927ef8-3f18-4b52-a903-13f057391f19/svn/antique-white-daltile-ceramic-tile-ak01312hd1p2-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/ee8d380a-1f0a-4b77-a8fb-6b96a15d3659/svn/breaksea-island-trafficmaster-vinyl-plank-flooring-vtrhdbreais6x36-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/bcd22c39-3623-4830-b3e1-263f59ff1731/svn/sterling-oak-lifeproof-vinyl-plank-flooring-i966106lp-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/f5c347df-afdf-407e-8ebc-acacc6030c8b/svn/nakan-flooret-vinyl-plank-flooring-fl-mr-naka-c-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/bdcb331f-bb58-4c8b-a85b-964ee8b86cd5/svn/white-glidden-maintenance-paint-colors-920-05-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 8,
            url: "https://www.homedepot.com/p/Glidden-Maintenance-5-gal-White-Flat-Interior-and-Exterior-Paint-920-05/100141333",
          },
        ],
      },
      {
        id: "hd-205853475",
        name: "BEHR PRO 5 gal. i100 White Base Semi-Gloss Interior Paint (per gallon)",
        imageUrl:
          "https://images.thdstatic.com/productImages/1c5b67c3-5de3-4eec-a035-22007fb1ff88/svn/white-behr-pro-paint-colors-pr17005-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 23.2,
            url: "https://www.homedepot.com/p/BEHR-PRO-5-gal-i100-White-Base-Semi-Gloss-Interior-Paint-PR17005/205853475",
          },
        ],
      },
      {
        id: "hd-206755810",
        name: "Glidden Premium 5 gal. Pure White Base 1 Semi-Gloss Interior Paint (per gallon)",
        imageUrl:
          "https://images.thdstatic.com/productImages/4f605649-e45d-417a-becb-07d698b9f956/svn/white-glidden-premium-paint-colors-gln6411n-05-64_600.jpg",
        retailers: [
          {
            name: "Home Depot",
            price: 32,
            url: "https://www.homedepot.com/p/Glidden-Premium-5-gal-Pure-White-Base-1-Semi-Gloss-Interior-Paint-GLN6411N-05/206755810",
          },
        ],
      },
    ],
    ceilingPaint: [
      {
        id: "hd-202246803",
        name: "Glidden Ceiling 1 gal. High-Hiding White Interior Dead-Flat Ceiling Paint (per gallon)",
        imageUrl:
          "https://images.thdstatic.com/productImages/b2aad817-b076-4fb5-84a0-2ad7e7632b90/svn/white-glidden-ceiling-ceiling-paint-gpl-0000-01-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/783e1c28-55ca-478f-931a-cb23a079c3a1/svn/white-glidden-diamond-ceiling-paint-ppg83-610-64_600.jpg",
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
        imageUrl:
          "https://images.thdstatic.com/productImages/ab8a94a8-2de1-482a-88d1-9f2306a424f8/svn/flat-zinsser-ceiling-paint-260967-64_600.jpg",
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

  // Best-effort guess at a product's real finish color, parsed from its
  // retail title (e.g. "... in White", "... Matte Black ..."). This is NOT
  // a real spec field — Home Depot's search results don't expose one — just
  // a heuristic over free-text titles, used to retint the 3D preview's
  // generic fixture proxy toward roughly the right color once a real
  // product is picked. Returns null when nothing recognizable matches,
  // which is expected and fine: the 3D proxy just keeps its default color.
  // Ordered most-specific phrase first (checked in order, first match
  // wins) so "matte black" doesn't fall through to a generic "black".
  var FINISH_COLOR_WORDS = [
    { match: /matte black/i, hex: 0x1c1c1c },
    { match: /oil.rubbed bronze/i, hex: 0x3d2b1f },
    { match: /brushed gold|champagne bronze/i, hex: 0xc9a227 },
    { match: /brushed nickel|satin nickel|\bnickel\b/i, hex: 0xb8b3ab },
    { match: /polished chrome|\bchrome\b|\bsilver\b/i, hex: 0xd8dadb },
    { match: /\bespresso\b/i, hex: 0x3b2a1f },
    { match: /\bwalnut\b/i, hex: 0x5a3a26 },
    { match: /\b(oak|maple|natural wood)\b/i, hex: 0x8a6239 },
    { match: /\bgraphite\b/i, hex: 0x4a4a4a },
    { match: /\bgray\b|\bgrey\b/i, hex: 0x8a8d90 },
    { match: /\bblack\b/i, hex: 0x1c1c1c },
    { match: /\bbone\b|\balmond\b|\bbiscuit\b/i, hex: 0xf0e4d0 },
    { match: /\bwhite\b/i, hex: 0xfdfcf9 },
  ];

  function guessFinishColor(productName) {
    if (!productName) return null;
    for (var i = 0; i < FINISH_COLOR_WORDS.length; i++) {
      if (FINISH_COLOR_WORDS[i].match.test(productName)) return FINISH_COLOR_WORDS[i].hex;
    }
    return null;
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
  // retailer already resolved per option. A malformed catalog entry (no
  // retailers, so nothing to price) is dropped here rather than handed on
  // with best: null — every caller can then trust opt.best is always a real
  // object, instead of each one needing its own null guard.
  function getOptionsForCategory(categoryKey, zip) {
    var options = CATALOG[categoryKey] || [];
    var factor = mockRegionalFactor(zip);
    return options
      .map(function (opt) {
        var adjusted = (opt.retailers || []).map(function (r) {
          return { name: r.name, price: round2(r.price * factor), url: r.url };
        });
        return { id: opt.id, name: opt.name, imageUrl: opt.imageUrl || null, best: bestRetailer(adjusted) };
      })
      .filter(function (opt) {
        return opt.best !== null;
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
    guessFinishColor: guessFinishColor,
  };
});
