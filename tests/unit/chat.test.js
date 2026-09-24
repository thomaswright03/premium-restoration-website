"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("./test-prices.js");
const Chat = require("../../js/chat-replies.js");

const ON = { estimatorEnabled: true };
const OFF = { estimatorEnabled: false };

// [question, expected action, regex the reply text must match (or null), regex it must NOT match]
const CASES = [
  ["What work do you do?", "offerEstimate", /We do bathroom restorations: demolition/, /photos/],
  ["What services do you offer?", "offerEstimate", /bathroom restorations/, null],
  ["Do you do fireplaces?", null, /only take on bathroom restorations/, /damage restoration \(such as water/],
  ["Can you redo my kitchen?", null, /only take on bathroom restorations/, null],
  ["I need a new roof", null, /only take on bathroom/, null],
  ["I have a leaky faucet in my bathroom", null, /leaking or broken faucet/, /can't help with that/],
  ["My toilet is leaking", null, /plumbing work/, /can't help with that/],
  ["We had water damage in the bathroom", null, /don't take on damage restoration/, null],
  ["There's mold behind my shower", null, /don't take on damage restoration/, null],
  ["The basement flooded", null, /damage restoration/, null],
  ["how much for tile?", "offerEstimate", /Tile is \$4 per sq ft/, null],
  ["How much do you charge for painting?", "offerEstimate", /Painting is \$1\.79 per sq ft/, null],
  ["What does demolition cost?", "offerEstimate", /Demolition is \$37\.50 per sq ft/, null],
  ["price for flooring", "offerEstimate", /\$5 per sq ft of bathroom floor/, null],
  ["cabinet price?", "offerEstimate", /\$60 per cabinet/, null],
  ["Do you install toilets?", "offerEstimate", /\$200 per toilet.*plumbing work/, null],
  ["how much is a bathtub", "offerEstimate", /\$350 per bathtub/, null],
  ["shower door install cost", "offerEstimate", /Shower door installation is \$300/, /Shower installation/],
  ["how much for a vanity and two mirrors", "offerEstimate", /\$150 per vanity.*\$100 per standard mirror/, null],
  ["bathroom quote", "startEstimate", null, null],
  ["How much would my bathroom cost?", "startEstimate", null, null],
  ["Can I get an estimate?", "startEstimate", null, null],
  ["Are you a real person?", null, /not a person, and not AI/, null],
  ["Hola, ¿cuánto cuesta remodelar un baño?", null, /only understands English/, null],
  ["Do you do electrical work?", null, /don't include plumbing or electrical/, null],
  ["Are you licensed?", null, /do not currently hold a contractor licence/, null],
  ["Do you have photos of your work?", null, /don't have photos/, null],
  ["What is your phone number?", null, /\(385\) 356-8733/, null],
  ["How long does a bathroom take?", null, /expected timeline/, null],
  ["asdfgh qwerty", "offerEstimate", /didn't understand.*\(385\) 356-8733/, null],
  ["hello", "offerEstimate", /Hello!/, null],
  // A bathroom is never refused because another room is named.
  ["Do you do basement bathrooms?", "offerEstimate", /We do bathroom restorations/, /can't help with that/],
  ["I need a quote for the bathroom in my basement", "startEstimate", null, null],
  ["Can you redo our master bedroom bathroom?", "offerEstimate", /bathroom restorations/, /can't help with that/],
  // Bathroom plus other work: the bathroom can be quoted, the rest can't.
  [
    "quote for my bathroom and kitchen",
    "offerEstimate",
    /We can help with the bathroom.*can't quote the kitchen part.*rough estimate of the bathroom/,
    /can't help with that/,
  ],
  ["Can I get a quote for my bathroom and kitchen?", "offerEstimate", /can't quote the kitchen part/, null],
  ["Bathroom and roof repairs please", "offerEstimate", /can't quote the roof part/, null],
  ["Do you do kitchens?", null, /only take on bathroom restorations.*can't help with that/, /help with the bathroom/],
  ["Can you finish my basement?", null, /only take on bathroom restorations/, null],
  // Timeline, warranty and licence questions win over the item they name.
  ["How long does a tile job take?", null, /expected timeline/, /Tile is/],
  ["Is there a warranty on the tile?", null, /don't advertise a standard warranty/, /Tile is/],
  ["Are you licensed to install toilets?", null, /do not currently hold a contractor licence/, /Toilet installation/],
  ["How much for tile and how long will it take?", "offerEstimate", /Tile is \$4 per sq ft.*expected timeline/, null],
  // Identity: only real questions about who is answering (report #5).
  ["I need a person to look at my shower", "offerEstimate", /Shower installation is \$500/, /not a person/],
  ["Is this a bot?", null, /not a person, and not AI/, null],
  ["Am I talking to a real human?", null, /not a person, and not AI/, null],
  ["are u a robot", null, /not a person, and not AI/, null],
  ["Can a human install my vanity?", "offerEstimate", /\$150 per vanity/, /not a person/],
  ["We want a person who does tile", "offerEstimate", /Tile is \$4 per sq ft/, /not a person/],
  ["Can I talk to a human?", null, /To talk to a person, call \(385\) 356-8733/, null],
  ["I'd like to speak with someone", null, /To talk to a person, call/, null],
  // Spanish and French, including everyday phrasing (report #11).
  ["hablas ingles", null, /only understands English.*solo entiende inglés/, null],
  ["Hablas inglés?", null, /only understands English/, null],
  ["buenos dias", null, /only understands English/, null],
  ["necesito arreglar mi ducha", null, /only understands English/, null],
  ["Parlez-vous anglais ?", null, /only understands English.*ne comprend que l'anglais/, null],
  ["Bonjour, combien coûte une salle de bain ?", null, /only understands English/, null],
  ["je voudrais un devis s'il vous plaît", null, /only understands English/, null],
  ["Do you speak Spanish?", null, /only understands English/, null],
  // Common bathroom questions get a specific answer, not "didn't understand" (report #12).
  [
    "Can you install a jacuzzi",
    "offerEstimate",
    /jetted tub.*installed as a bathtub: \$350.*jets/,
    /didn't understand/,
  ],
  ["I want a whirlpool tub", "offerEstimate", /installed as a bathtub/, /Bathtub installation/],
  ["what about grout repair", "offerEstimate", /Grout and caulk are part of our tile work.*\$4 per sq ft/, null],
  ["Do you re-caulk bathtubs?", "offerEstimate", /Grout and caulk/, null],
  ["can you come tomorrow", null, /can't check dates or book a visit.*\(385\) 356-8733/, null],
  ["Are you available next week?", null, /can't check dates/, null],
  ["When can you start?", null, /can't check dates/, /expected timeline/],
  ["water heater replacement", null, /don't take on water heater.*plumbing/, /didn't understand/],
  ["Can you replace my tankless water heater?", null, /don't take on water heater/, null],
  ["my bathroom and the water heater", "offerEstimate", /can't quote the water heater part/, null],
  // Every message gets a reply, even emoji only.
  ["😀👍", "offerEstimate", /didn't understand.*\(385\) 356-8733/, null],
  ["🛁🚿", "offerEstimate", /didn't understand/, null],
];

for (const [question, action, match, notMatch] of CASES) {
  test(`chat: ${question}`, () => {
    const r = Chat.reply(question, ON);
    assert.ok(r, "a reply");
    assert.equal(r.action, action, `action for "${question}" (got text: ${r.text})`);
    if (match) assert.match(r.text, match);
    if (notMatch) assert.doesNotMatch(r.text, notMatch);
  });
}

test("at least 20 sample questions are covered", () => {
  assert.ok(CASES.length >= 20);
});

test("with the estimator switched off, price questions get the call-us reply and nothing starts", () => {
  for (const q of ["bathroom quote", "how much for tile?", "Can I get an estimate?", "cabinet price?"]) {
    const r = Chat.reply(q, OFF);
    assert.equal(r.action, null, q);
    assert.equal(r.text, "Call (385) 356-8733 or use the Contact page for a price.", q);
  }
  const fallback = Chat.reply("asdfgh", OFF);
  assert.equal(fallback.action, null);
  assert.match(fallback.text, /\(385\) 356-8733/);
});

test("a mixed request with the estimator off still names the bathroom and gives the phone number", () => {
  const r = Chat.reply("quote for my bathroom and kitchen", OFF);
  assert.equal(r.action, null);
  assert.match(r.text, /We can help with the bathroom.*kitchen part.*\(385\) 356-8733/);
});

test("emoji-only messages get the did-not-understand reply with the estimator off too; blank gets nothing", () => {
  assert.match(Chat.reply("🙂", OFF).text, /didn't understand.*\(385\) 356-8733/);
  assert.equal(Chat.reply("   ", ON), null);
});

test("matching is whole-word: 'fire' does not match 'fireplace' as damage, 'work' does not trigger photos", () => {
  assert.doesNotMatch(Chat.reply("fireplaces", ON).text, /water, fire, smoke/);
  assert.doesNotMatch(Chat.reply("what work do you do", ON).text, /photos/);
});

test("chat price answers follow the published prices in the settings", () => {
  const Pricing = require("../../js/bathroom-pricing.js");
  const good = require("../fixtures/test-prices.json");
  try {
    Pricing.setPublishedPrices(Pricing.validatePublishedPrices(Object.assign({}, good, { cabinetEach: 75 })).prices);
    assert.match(Chat.reply("cabinet price?", ON).text, /\$75 per cabinet/);
  } finally {
    Pricing.setPublishedPrices(Pricing.validatePublishedPrices(good).prices);
  }
  assert.match(Chat.reply("cabinet price?", ON).text, /\$60 per cabinet/);
});
