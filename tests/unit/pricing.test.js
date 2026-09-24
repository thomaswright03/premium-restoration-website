"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pricing: P } = require("./test-prices.js");

const NOTHING = { demolition: false, floorFinish: "none", walls: "none", paintCeiling: false };
const ROOM_5x8x8 = { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 };

function line(result, key) {
  return result.lines.find((l) => l.key === key);
}

test("the test prices are the owner-stated prices: $60 per cabinet, $5 per sq ft of flooring", () => {
  assert.equal(P.DEFAULT_PRICES.Cabinet_Price, 60);
  assert.equal(P.DEFAULT_PRICES.Floor_Price_Per_SqFt, 5);
});

test("published prices are checked: numbers only, more than 0, cents at most, no unknown names", () => {
  const good = require("../fixtures/test-prices.json");
  assert.equal(P.validatePublishedPrices(good).valid, true);
  const bad = (change) => P.validatePublishedPrices(Object.assign({}, good, change)).errors.join(" ");
  assert.match(bad({ cabinetEach: "60" }), /cabinetEach must be a number without quotes or a \$ sign/);
  assert.match(bad({ cabinetEach: "$60" }), /cabinetEach must be a number/);
  assert.match(bad({ cabinetEach: 0 }), /cabinetEach must be more than 0/);
  assert.match(bad({ cabinetEach: -5 }), /cabinetEach must be more than 0/);
  assert.match(bad({ cabinetEach: 60000 }), /no more than 10000/);
  assert.match(bad({ paintingPerSqFt: 1.795 }), /at most 2 decimal places/);
  assert.match(bad({ cabinetEsch: 60 }), /cabinetEsch isn't a price the site knows/);
  const missing = Object.assign({}, good);
  delete missing.tilePerSqFt;
  assert.match(P.validatePublishedPrices(missing).errors.join(" "), /tilePerSqFt is missing/);
  assert.equal(P.validatePublishedPrices(undefined).valid, false);
  assert.equal(P.validatePublishedPrices(Object.assign({}, good, { _note: "comments are fine" })).valid, true);
});

test("a price changed in the settings reaches the public estimate, admin quotes and the bathtub rule together", () => {
  const good = require("../fixtures/test-prices.json");
  const values = Object.assign({ Cabinet_Quantity: 3, Bathtub_Quantity: 1 }, ROOM_5x8x8);
  const scope = Object.assign({}, NOTHING, { floorFinish: "flooring" });
  try {
    P.setPublishedPrices(
      P.validatePublishedPrices(Object.assign({}, good, { cabinetEach: 75, showerEach: 600 })).prices,
    );
    const pub = P.computePublicEstimate(values, scope);
    assert.equal(line(pub, "Cabinet_Quantity").cost, 225);
    assert.equal(line(pub, "Bathtub_Quantity").cost, 420);
    const admin = P.computeEstimate(values, scope, { includeTrade: true, prices: P.getPrices() });
    assert.equal(admin.subtotal - line(admin, "plumbing").cost, pub.subtotal);
  } finally {
    P.setPublishedPrices(P.validatePublishedPrices(good).prices);
  }
  assert.equal(P.DEFAULT_PRICES.Cabinet_Price, 60);
});

test("bathtub price is always 70% of the shower price", () => {
  assert.equal(P.bathtubPrice(P.DEFAULT_PRICES), 350);
  assert.equal(P.bathtubPrice({ Shower_Price: 1000 }), 700);
  const r = P.computePublicEstimate({ Bathtub_Quantity: 2 }, NOTHING);
  assert.equal(line(r, "Bathtub_Quantity").cost, 700);
});

test("area formulas: floor = W x L, walls = 2 x H x (W + L)", () => {
  assert.deepEqual(P.areas(ROOM_5x8x8), { floorSqFt: 40, wallSqFt: 208 });
  assert.deepEqual(P.areas({ Bathroom_Width_Ft: "4", Bathroom_Length_Ft: "8", Bathroom_Height_Ft: "" }), {
    floorSqFt: 32,
    wallSqFt: 0,
  });
});

test("nothing is priced from dimensions alone", () => {
  const r = P.computeEstimate(ROOM_5x8x8, NOTHING, { includeTrade: true });
  assert.equal(r.lines.length, 0);
  assert.equal(r.total, 0);
});

test("5 x 8 x 8 room, 3 cabinets, other flooring, everything else no = $380.00", () => {
  const values = Object.assign({ Cabinet_Quantity: 3 }, ROOM_5x8x8);
  const scope = Object.assign({}, NOTHING, { floorFinish: "flooring" });
  const admin = P.computeEstimate(values, scope, { includeTrade: true, prices: P.DEFAULT_PRICES });
  assert.equal(admin.total, 380);
  assert.equal(line(admin, "flooring").cost, 200);
  assert.equal(line(admin, "Cabinet_Quantity").cost, 180);
  assert.equal(line(admin, "floorTile"), undefined);
  assert.equal(P.computePublicEstimate(values, scope).subtotal, 380);
});

test("switching the floor to tile replaces flooring with $160.00 of floor tile", () => {
  const values = Object.assign({ Cabinet_Quantity: 3 }, ROOM_5x8x8);
  const scope = Object.assign({}, NOTHING, { floorFinish: "tile" });
  const r = P.computeEstimate(values, scope, { includeTrade: true });
  assert.equal(line(r, "flooring"), undefined);
  assert.equal(line(r, "floorTile").cost, 160);
  assert.equal(r.total, 340);
});

test("the floor is never charged twice and walls are never both tiled and painted", () => {
  const scopes = [];
  for (const floorFinish of ["tile", "flooring", "none"]) {
    for (const walls of ["tile", "paint", "none"]) {
      scopes.push({ demolition: true, floorFinish, walls, paintCeiling: true });
    }
  }
  for (const scope of scopes) {
    const r = P.computeEstimate(ROOM_5x8x8, scope, { includeTrade: true });
    const keys = r.lines.map((l) => l.key);
    assert.ok(!(keys.includes("floorTile") && keys.includes("flooring")), JSON.stringify(scope));
    assert.ok(!(keys.includes("wallTile") && keys.includes("wallPaint")), JSON.stringify(scope));
  }
});

test("admin and public totals match across a table of inputs (admin adds only plumbing, electrical, surcharges)", () => {
  const table = [
    [{}, NOTHING],
    [ROOM_5x8x8, { demolition: true, floorFinish: "tile", walls: "tile", paintCeiling: true }],
    [ROOM_5x8x8, { demolition: false, floorFinish: "flooring", walls: "paint", paintCeiling: false }],
    [
      { Bathroom_Width_Ft: 4, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 9, Vanity_Quantity: 1, Mirror_Quantity: 2 },
      NOTHING,
    ],
    [
      {
        Bathroom_Width_Ft: 6.5,
        Bathroom_Length_Ft: 10,
        Bathroom_Height_Ft: 8,
        Toilet_Quantity: 1,
        Sink_Quantity: 2,
        Shower_Quantity: 1,
      },
      { demolition: true, floorFinish: "flooring", walls: "none", paintCeiling: true },
    ],
    [
      {
        Bathroom_Width_Ft: 12,
        Bathroom_Length_Ft: 14,
        Bathroom_Height_Ft: 10,
        Bathtub_Quantity: 1,
        Shower_Door_Quantity: 1,
        Door_Quantity: 1,
        Cabinet_Quantity: 6,
        Mirror_Huge_Quantity: 1,
        Shower_Shelf_Quantity: 2,
      },
      { demolition: true, floorFinish: "tile", walls: "paint", paintCeiling: true },
    ],
  ];
  const tradeKeys = ["plumbing", "noStack", "badValve", "electrical"];
  for (const [values, scope] of table) {
    const pub = P.computePublicEstimate(values, scope);
    const withTrade = Object.assign({}, values, {
      Electrical_Points: 3,
      No_Stack_Surcharge_Included: true,
      Bad_Valve_Surcharge_Included: true,
    });
    const admin = P.computeEstimate(withTrade, scope, { includeTrade: true, prices: P.DEFAULT_PRICES });
    const adminWithoutTrade = admin.lines.filter((l) => !tradeKeys.includes(l.key)).reduce((s, l) => s + l.cost, 0);
    assert.equal(P.roundCents(adminWithoutTrade), pub.subtotal, JSON.stringify(values));
    assert.deepEqual(
      admin.lines.filter((l) => !tradeKeys.includes(l.key)),
      pub.lines,
      "same lines, same order: " + JSON.stringify(values),
    );
    // With no trade work at all, the totals are identical.
    const plainAdmin = P.computeEstimate(
      Object.assign({}, values, { Toilet_Quantity: 0, Sink_Quantity: 0, Shower_Quantity: 0, Bathtub_Quantity: 0 }),
      scope,
      { includeTrade: true },
    );
    const plainPublic = P.computePublicEstimate(
      Object.assign({}, values, { Toilet_Quantity: 0, Sink_Quantity: 0, Shower_Quantity: 0, Bathtub_Quantity: 0 }),
      scope,
    );
    assert.equal(plainAdmin.total, plainPublic.subtotal);
  }
});

test("admin prices plumbing per point from toilets, sinks, showers and bathtubs, plus surcharges and electrical", () => {
  const values = {
    Toilet_Quantity: 1,
    Sink_Quantity: 2,
    Shower_Quantity: 1,
    Bathtub_Quantity: 1,
    Electrical_Points: 4,
    No_Stack_Surcharge_Included: true,
    Bad_Valve_Surcharge_Included: false,
  };
  const r = P.computeEstimate(values, NOTHING, { includeTrade: true });
  assert.equal(line(r, "plumbing").qty, 5);
  assert.equal(line(r, "plumbing").cost, 1500);
  assert.equal(line(r, "noStack").cost, 1000);
  assert.equal(line(r, "badValve"), undefined);
  assert.equal(line(r, "electrical").cost, 400);
  // The public estimate never prices that work.
  const pub = P.computePublicEstimate(values, NOTHING);
  assert.ok(!pub.lines.some((l) => ["plumbing", "noStack", "badValve", "electrical"].includes(l.key)));
  assert.equal(pub.plumbingFixtureCount, 5);
});

test("tax only applies to admin quotes, at the saved rate", () => {
  const prices = Object.assign({}, P.DEFAULT_PRICES, { Labor_Tax_Rate_Percent: 10 });
  const admin = P.computeEstimate({ Cabinet_Quantity: 1 }, NOTHING, { includeTrade: true, prices });
  assert.equal(admin.taxAmount, 6);
  assert.equal(admin.total, 66);
  const pub = P.computePublicEstimate({ Cabinet_Quantity: 1 }, NOTHING);
  assert.equal(pub.taxAmount, 0);
});

test("painting uses $1.79 per sq ft of wall or ceiling", () => {
  const r = P.computePublicEstimate(ROOM_5x8x8, {
    demolition: false,
    floorFinish: "none",
    walls: "paint",
    paintCeiling: true,
  });
  assert.equal(line(r, "wallPaint").cost, P.roundCents(208 * 1.79));
  assert.equal(line(r, "ceilingPaint").cost, P.roundCents(40 * 1.79));
  assert.equal(line(r, "wallPaint").detail, "208 sq ft × $1.79");
});

test("validation: area work needs a realistic width and length; wall work needs a height", () => {
  const scope = { demolition: true, floorFinish: "none", walls: "none", paintCeiling: false };
  let v = P.validateJob({}, scope);
  assert.equal(v.valid, false);
  assert.ok(v.errors.Bathroom_Width_Ft);
  assert.ok(v.errors.Bathroom_Length_Ft);
  assert.equal(v.errors.Bathroom_Height_Ft, undefined);

  v = P.validateJob({ Bathroom_Width_Ft: "1e200", Bathroom_Length_Ft: "8" }, scope);
  assert.match(v.errors.Bathroom_Width_Ft, /^Enter the width as a number of feet/);
  v = P.validateJob({ Bathroom_Width_Ft: "51", Bathroom_Length_Ft: "8" }, scope);
  assert.equal(v.errors.Bathroom_Width_Ft, "Width must be more than 0 and no more than 50 ft.");
  v = P.validateJob({ Bathroom_Width_Ft: "-3", Bathroom_Length_Ft: "8" }, scope);
  assert.ok(v.errors.Bathroom_Width_Ft);
  v = P.validateJob({ Bathroom_Width_Ft: "5", Bathroom_Length_Ft: "8" }, scope);
  assert.equal(v.valid, true);

  const walls = Object.assign({}, scope, { walls: "paint" });
  v = P.validateJob({ Bathroom_Width_Ft: "5", Bathroom_Length_Ft: "8" }, walls);
  assert.ok(v.errors.Bathroom_Height_Ft);
  v = P.validateJob({ Bathroom_Width_Ft: "5", Bathroom_Length_Ft: "8", Bathroom_Height_Ft: "8" }, walls);
  assert.equal(v.valid, true);
});

test("room sizes accept feet and inches, and a format mistake is not reported as out of range", () => {
  const cases = {
    5: 5,
    5.5: 5.5,
    "5,5": 5.5,
    "5ft": 5,
    "5 ft": 5,
    "5'": 5,
    "5'6\"": 5.5,
    "5' 6\"": 5.5,
    "5’6”": 5.5,
    "5'6": 5.5,
    "5 ft 6 in": 5.5,
    "5 feet 6 inches": 5.5,
    '66"': 5.5,
    "66 in": 5.5,
    "": null,
  };
  for (const [text, feet] of Object.entries(cases)) assert.equal(P.parseFeet(text), feet, text);
  for (const bad of ["abc", "1e200", "5'13\"", "five", "5 by 8"]) assert.ok(Number.isNaN(P.parseFeet(bad)), bad);

  const scope = { demolition: false, floorFinish: "flooring", walls: "none", paintCeiling: false };
  let v = P.validateJob({ Bathroom_Width_Ft: "5'6\"", Bathroom_Length_Ft: "8 ft" }, scope);
  assert.equal(v.valid, true);
  const r = P.computePublicEstimate({ Bathroom_Width_Ft: "5'6\"", Bathroom_Length_Ft: "8 ft" }, scope);
  assert.equal(r.floorSqFt, 44);
  assert.equal(r.subtotal, 220);
  v = P.validateJob({ Bathroom_Width_Ft: "5 by 8", Bathroom_Length_Ft: "60" }, scope);
  assert.equal(
    v.errors.Bathroom_Width_Ft,
    "Enter the width as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6\".",
  );
  assert.equal(v.errors.Bathroom_Length_Ft, "Length must be more than 0 and no more than 50 ft.");
  const summary = P.buildEstimateSummary({ Bathroom_Width_Ft: "5'6\"", Bathroom_Length_Ft: "8" }, scope, r);
  assert.match(summary, /5\.5 ft wide × 8 ft long/);
});

test("validation: dimensions are not required when no area work is chosen", () => {
  assert.equal(P.validateJob({ Cabinet_Quantity: 2 }, NOTHING).valid, true);
});

test("validation: every work question must be answered", () => {
  const v = P.validateJob({}, { demolition: true });
  assert.ok(v.errors.floorFinish);
  assert.ok(v.errors.walls);
  assert.ok(v.errors.paintCeiling);
});

test("validation: fixture counts are whole numbers with a sensible maximum", () => {
  assert.ok(P.validateJob({ Toilet_Quantity: "2.5" }, NOTHING).errors.Toilet_Quantity);
  assert.ok(P.validateJob({ Toilet_Quantity: "21" }, NOTHING).errors.Toilet_Quantity);
  assert.ok(P.validateJob({ Toilet_Quantity: "abc" }, NOTHING).errors.Toilet_Quantity);
  assert.ok(P.validateJob({ Toilet_Quantity: "-1" }, NOTHING).errors.Toilet_Quantity);
  assert.equal(P.validateJob({ Toilet_Quantity: "2" }, NOTHING).valid, true);
  assert.ok(P.validateJob({ Electrical_Points: "1.5" }, NOTHING, { includeTrade: true }).errors.Electrical_Points);
});

test("old saved quotes are recognised so they can be flagged for review", () => {
  assert.equal(P.isLegacyQuoteData({ jobValues: {}, totalPrice: 3315.92 }), true);
  assert.equal(P.isLegacyQuoteData({ calcVersion: P.CALC_VERSION }), false);
});

test("estimate summary for the contact form lists room, work, fixtures and total", () => {
  const values = Object.assign({ Cabinet_Quantity: 3, Toilet_Quantity: 1 }, ROOM_5x8x8);
  const scope = Object.assign({}, NOTHING, { floorFinish: "flooring" });
  const r = P.computePublicEstimate(values, scope);
  const text = P.buildEstimateSummary(values, scope, r);
  assert.match(text, /5 ft wide × 8 ft long/);
  assert.match(text, /new floor: Other flooring/);
  assert.match(text, /Toilets 1, Cabinets 3/);
  assert.match(text, /\$580\.00 \(before plumbing\)/);
});

test("money formatting", () => {
  assert.equal(P.money(3315.92), "$3,315.92");
  assert.equal(P.shortMoney(60), "$60");
  assert.equal(P.shortMoney(37.5), "$37.50");
});
