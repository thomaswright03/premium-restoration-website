"use strict";

// Spanish and Portuguese: every piece of JavaScript text exists in all three
// languages, and the estimate, chat and number formats work in each.

const test = require("node:test");
const assert = require("node:assert/strict");
const I18n = require("../../js/i18n.js");
const P = require("../../js/bathroom-pricing.js");
const Chat = require("../../js/chat-replies.js");
const M = require("../../js/materials-pricing.js");

function tokens(text) {
  return (text.match(/\{\w+\}|\[[a-z]+/g) || []).sort().join(" ");
}

// Each case runs with the page "in" that language, then puts English back.
function inLang(lang, fn) {
  I18n.setLang(lang);
  try {
    fn();
  } finally {
    I18n.setLang("en");
  }
}

test("every text has English, Spanish and Portuguese, with the same placeholders", () => {
  for (const [key, entry] of Object.entries(I18n.STRINGS)) {
    assert.equal(entry.length, 3, key);
    entry.forEach((text) => assert.ok(typeof text === "string" && text.trim(), `${key} has an empty translation`));
    assert.equal(tokens(entry[1]), tokens(entry[0]), `${key}: Spanish placeholders differ from English`);
    assert.equal(tokens(entry[2]), tokens(entry[0]), `${key}: Portuguese placeholders differ from English`);
  }
});

test("t() fills placeholders and falls back to English for an unknown language", () => {
  assert.equal(I18n.t("pdf.page", { i: 1, n: 2 }, "es"), "Página 1 de 2");
  assert.equal(I18n.t("pdf.page", { i: 1, n: 2 }, "fr"), "Page 1 of 2");
  assert.throws(() => I18n.t("no.such.key"));
});

test("prices stay in US dollars, written the way each language writes numbers", () => {
  assert.equal(P.money(1234.5, "en-US"), "$1,234.50");
  assert.equal(P.money(1234.5, "es-US"), "$1,234.50");
  assert.equal(P.money(1234.5, "pt-BR").replace(/\s/g, " "), "US$ 1.234,50");
  assert.equal(P.shortMoney(60, "pt-BR").replace(/\s/g, " "), "US$ 60");
  assert.equal(P.shortMoney(1.79, "pt-BR").replace(/\s/g, " "), "US$ 1,79");
  inLang("pt", () => {
    assert.equal(P.formatQty(7.5), "7,5");
    assert.equal(M.money(10).replace(/\s/g, " "), "US$ 10,00");
  });
});

test("the estimate's questions, lines and summary follow the page's language", () => {
  const scope = { demolition: true, floorFinish: "tile", walls: "paint", paintCeiling: false };
  const values = { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8, Toilet_Quantity: 1 };
  inLang("es", () => {
    assert.equal(P.SCOPE_QUESTIONS[0].label, "¿Quitar primero el baño actual (demolición)?");
    assert.equal(P.FIXTURES[0].plural, "Inodoros");
    const r = P.computePublicEstimate(values, scope);
    assert.equal(r.total, P.computePublicEstimate(values, scope).total);
    assert.equal(r.lines.find((l) => l.key === "floorTile").label, "Azulejo de piso");
    assert.equal(r.lines.find((l) => l.key === "Toilet_Quantity").detail, "1 unidad × $200.00");
    assert.match(P.buildEstimateSummary(values, scope, r), /^Mi estimación del baño/);
    assert.match(P.estimateAssumptions(values, scope, r)[1], /^Área del piso: 5 × 8 pies = 40 pies²/);
    assert.match(P.validateJob({}, scope).errors.Bathroom_Width_Ft, /^Escriba el ancho en pies/);
  });
  inLang("pt", () => {
    const r = P.computePublicEstimate(values, scope);
    assert.equal(r.lines.find((l) => l.key === "wallPaint").label, "Pintura (paredes)");
    assert.match(r.lines.find((l) => l.key === "wallPaint").detail, /^208 pés² × US\$\s1,79$/);
    assert.equal(P.validateJob({}, {}).errors.demolition, "Escolha uma resposta.");
  });
  // Same prices in every language.
  const en = P.computePublicEstimate(values, scope).total;
  inLang("es", () => assert.equal(P.computePublicEstimate(values, scope).total, en));
  inLang("pt", () => assert.equal(P.computePublicEstimate(values, scope).total, en));
});

const ON = { estimatorEnabled: true };

// [language, question, expected action, regex the reply must match (or null)]
const CHAT_CASES = [
  ["es", "¿Qué servicios ofrecen?", "offerEstimate", /^Hacemos remodelaciones de baños/],
  ["es", "¿Hacen cocinas?", null, /solo hacemos remodelaciones de baños/],
  ["es", "Tengo una llave que gotea en el baño", null, /trabajo de plomería/],
  ["es", "Tuvimos daños por agua en el baño", null, /no hacemos restauración de daños/],
  ["es", "¿cuánto cuesta el azulejo?", "offerEstimate", /El azulejo cuesta \$4 por pie cuadrado/],
  ["es", "precio del piso de azulejo", "offerEstimate", /El azulejo cuesta/],
  ["es", "un tocador y dos espejos", "offerEstimate", /\$150 por mueble.*\$100 por espejo estándar/],
  ["es", "¿Instalan inodoros?", "offerEstimate", /\$200 por inodoro.*plomería/],
  ["es", "how much for a vanity", "offerEstimate", /mueble de lavabo cuesta \$150/],
  ["es", "cotización del baño", "startEstimate", null],
  ["es", "¿Cuánto costaría mi baño?", "startEstimate", null],
  ["es", "Quisiera una estimación del precio de mi baño", "startEstimate", null],
  ["es", "¿Cuánto tiempo tarda un baño?", null, /plazo estimado/],
  ["es", "¿Eres una persona real?", null, /no soy una persona/],
  ["es", "¿Tienen licencia?", null, /no tenemos licencia de contratista/],
  ["es", "Olá, quanto custa?", null, /também fala português/],
  ["es", "hola", "offerEstimate", /^¡Hola!/],
  ["es", "asdfgh", "offerEstimate", /no entendí.*\(385\) 356-8733/],
  ["pt", "O que vocês fazem?", "offerEstimate", /^Fazemos reformas de banheiros/],
  ["pt", "Minha torneira está pingando", null, /serviço de encanamento/],
  ["pt", "Tive infiltração no banheiro", null, /não fazemos restauração de danos/],
  ["pt", "quanto custa o porcelanato?", "offerEstimate", /US\$\s4 por pé quadrado/],
  ["pt", "porta do box preço", "offerEstimate", /porta de box custa US\$\s300/],
  ["pt", "Vocês instalam vaso sanitário?", "offerEstimate", /US\$\s200 por vaso.*encanamento/],
  ["pt", "orçamento do banheiro", "startEstimate", null],
  ["pt", "Quanto custaria meu banheiro?", "startEstimate", null],
  ["pt", "Quero uma estimativa de preço do meu banheiro", "startEstimate", null],
  ["pt", "Quanto tempo demora?", null, /prazo estimado/],
  ["pt", "Hola, cuánto cuesta?", null, /también habla español/],
  ["pt", "oi", "offerEstimate", /^Olá!/],
  ["pt", "quote", "startEstimate", null],
];

for (const [lang, question, action, match] of CHAT_CASES) {
  test(`chat (${lang}): ${question}`, () => {
    const r = Chat.reply(question, { ...ON, lang });
    assert.ok(r, "a reply");
    assert.equal(r.action, action, `action for "${question}" (got text: ${r.text})`);
    if (match) assert.match(r.text, match);
  });
}

test("the chat's own estimate button message starts the estimate in every language", () => {
  for (const lang of I18n.LANGS) {
    const r = Chat.reply(I18n.t("chat.estimateRequest", null, lang), { ...ON, lang });
    assert.equal(r.action, "startEstimate", lang);
  }
});

test("the chat answers in the page's language when none is passed", () => {
  inLang("pt", () => assert.match(Chat.reply("obrigado", ON).text, /^De nada!/));
  assert.match(Chat.reply("thanks", ON).text, /^You're welcome!/);
});
