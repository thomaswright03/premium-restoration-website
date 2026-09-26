"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
  // Regression: "floor tile" used to also independently match the
  // flooring pattern (only the word "tile" got stripped, not "floor"),
  // producing both prices in one reply with the flooring sentence's own
  // "tile floors are priced as tile" contradicting the flooring price
  // quoted right next to it.
  ["how much for floor tile", "offerEstimate", /Tile is \$4 per sq ft/, /Bathroom flooring is \$5/],
  ["wall tile cost", "offerEstimate", /Tile is \$4 per sq ft/, /Bathroom flooring is \$5/],
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

test("matching is whole-word: 'fire' does not match 'fireplace' as damage, 'work' does not trigger photos", () => {
  assert.doesNotMatch(Chat.reply("fireplaces", ON).text, /water, fire, smoke/);
  assert.doesNotMatch(Chat.reply("what work do you do", ON).text, /photos/);
});
