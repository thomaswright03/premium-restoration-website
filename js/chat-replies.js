// Eddys Remodeling — scripted chat replies (no AI, no backend).
//
// Pure function: reply(message, { estimatorEnabled, lang }) returns
//   { text, action }  where action is one of
//   "startEstimate"  — start the guided bathroom estimate (no text shown)
//   "offerEstimate"  — show the text, then an "estimate" button
//   null             — just show the text
//
// lang ("en", "es" or "pt"; default: the page's language, see js/i18n.js)
// picks the words the assistant understands and the language it answers
// in. The Spanish and Portuguese assistants also understand the English
// names of products and of an estimate ("vanity", "LVP", "quote"), which
// people often use in any language.
//
// Matching is on whole words only (so "work" never matches "fireplace"-style
// substrings, and "fire" does not match "fireplaces"), after lower-casing
// and removing accents ("baño" -> "bano", "preço" -> "preco"). Prices come
// from js/bathroom-pricing.js, the same published prices the estimate uses.
//
// Loads as a plain browser script (window.ChatReplies) and as a Node module.

(function (root, factory) {
  "use strict";
  var req = typeof require === "function" ? require : null;
  var api = factory(
    root.BathroomPricing || (req ? req("./bathroom-pricing.js") : null),
    root.I18n || (req ? req("./i18n.js") : null),
  );
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ChatReplies = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Pricing, I18n) {
  "use strict";

  var PHONE = "(385) 356-8733";
  var EMAIL = "eduardo.moroni77@gmail.com";
  var PRICES = Pricing.DEFAULT_PRICES;
  var CONTACT = { phone: PHONE, email: EMAIL };

  function has(text, pattern) {
    return !!pattern && new RegExp(pattern).test(text);
  }

  // Lower-case, accents removed ("baño" -> "bano"), straight apostrophes
  // removed ("don't" -> "dont"), and every other non-letter/digit turned
  // into a space.
  function normalize(message) {
    return (
      " " +
      String(message || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9$]+/g, " ")
        .trim() +
      " "
    );
  }

  // ---------- what each language's assistant understands ----------
  // One pattern per topic and language, matched against normalize()d text.

  var WORDS = {
    en: {
      identity: "\\b(human|real person|a person|robot|bot|ai|chatgpt|automated|are you real)\\b",
      damage:
        "\\b(water|fire|smoke|storm|flood|hail|wind|mold|mould)\\s+damage(d)?\\b|\\bflood(ed|ing|s)?\\b|\\bmou?ld(y)?\\b|\\bmildew\\b|\\bsewage\\b|\\basbestos\\b|\\b(damage|disaster)\\s+restoration\\b|\\bburst\\s+pipes?\\b",
      notBathroom:
        "\\b(kitchens?|exteriors?|roof(s|ing)?|siding|stucco|decks?|fences?|gutters?|basements?|garages?|fireplaces?|chimneys?|driveways?|patios?|landscaping|pools?|hvac|furnaces?|bedrooms?|living room|whole (home|house)|entire (home|house)|full (home|house)|remodel my (home|house))\\b",
      fixture: "\\b(faucets?|taps?|toilets?|sinks?|showers?|tubs?|bathtubs?|pipes?|drains?|valves?|showerheads?)\\b",
      problem: "\\b(leak(s|y|ing|ed)?|drip(s|py|ping)?|clogged|blocked|running|broken|cracked|not working)\\b",
      price: "\\b(price|prices|pricing|cost|costs|charge|charges|rate|rates|how much|fee|fees)\\b|\\$",
      trade:
        "\\b(plumb(ing|er|ers)?|electric(al|ian|ians)?|wiring|outlets?|pipes?|valves?|drains?|faucets?|lights?|lighting|fans?|switch(es)?)\\b",
      estimate: "\\b(estimate|estimates|quote|quotes|quotation|ballpark)\\b",
      bathroom: "\\bbathrooms?\\b",
      services:
        "\\b(what (work|services|kind of work|do you do|can you do|jobs)|services?|do you (do|offer|handle)|what do you (do|offer)|remodel(ing)?|renovat(e|ion|ions|ing)|restor(e|ation|ations|ing))\\b",
      licence: "\\b(licen[cs]e[ds]?|insured|insurance|bonded|permits?)\\b",
      warranty: "\\b(warrant(y|ies)|guarantee[ds]?)\\b",
      timeline: "\\b(how long|timeline|time frame|timeframe|duration|weeks?|days?|start)\\b",
      privacy: "\\b(privacy|personal data|delete my|my data|my information)\\b",
      contact: "\\b(contact|phone|call|email|e mail|reach|number|talk to)\\b",
      hours: "\\b(hours?|open|opening|available|availability|weekends?|schedule)\\b",
      area: "\\b(where|area|areas|located|location|serve|service area|cities|city)\\b",
      photos:
        "\\b(gallery|photos?|pictures?|pics|examples?|portfolio|past (work|jobs|projects)|previous (work|jobs|projects))\\b",
      greeting: "^ (hi|hello|hey|hiya|good (morning|afternoon|evening))( there)? $",
      thanks: "\\b(thanks|thank you|thx|cheers)\\b",
      // Words only this language uses, to spot a visitor writing in it on
      // another language's page.
      spoken: null,
    },
    es: {
      identity:
        "\\b(humano|persona real|una persona|robot|bot|ia|inteligencia artificial|chatgpt|automatico|eres real|hablo con alguien)\\b",
      damage:
        "\\b(dano|danos|danad[oa]s?)\\s+(por|de|del)\\s+(el |la )?(agua|fuego|humo|tormenta|inundacion|granizo|viento|moho|hongos)\\b|\\binundaci(on|ones)\\b|\\binundad[oa]s?\\b|\\bmoho\\b|\\bhongos?\\b|\\baguas negras\\b|\\basbestos?\\b|\\bamianto\\b|\\b(tuberias?|tubos?|caneria) (rot[oa]s?|reventad[oa]s?)\\b|\\brestauracion de danos\\b|\\bincendios?\\b",
      notBathroom:
        "\\b(cocinas?|exterior(es)?|tejados?|techado|techos de la casa|estuco|terrazas?|cercas?|bardas?|canaletas?|sotanos?|garajes?|cocheras?|chimeneas?|entradas? de (auto|carro|coches?)|patios?|jardineria|jardin|piscinas?|albercas?|calefaccion|aire acondicionado|calentador de ambiente|recamaras?|dormitorios?|sala de estar|toda la casa|casa entera|casa completa|remodelar (mi|la) casa)\\b",
      fixture:
        "\\b(llaves?|grifos?|griferia|inodoros?|excusados?|tazas?|lavabos?|lavamanos|regaderas?|duchas?|tinas?|baneras?|tuberias?|tubos?|desagues?|drenajes?|valvulas?)\\b",
      problem:
        "\\b(fugas?|gotea|gotean|goteando|gotera|tapad[oa]s?|atascad[oa]s?|obstruid[oa]s?|rot[oa]s?|quebrad[oa]s?|agrietad[oa]s?|no funciona|no sirve|descompuest[oa]s?)\\b",
      price:
        "\\b(precio|precios|costo|costos|costar|costaria|costarian|cuesta|cuestan|cobran|cobra|cobrarian|tarifas?|cuanto (sale|saldria|seria|es|vale))\\b|\\$",
      trade:
        "\\b(plomeria|plomero|plomeros|fontaneria|fontanero|electricidad|electric[oa]s?|electricistas?|cableado|enchufes?|tomacorrientes?|tuberias?|valvulas?|desagues?|llaves?|grifos?|luces|luz|iluminacion|lamparas?|ventilador(es)?|extractor(es)?|interruptor(es)?|apagador(es)?)\\b",
      estimate:
        "\\b(estimado|estimados|estimacion|estimaciones|estimar|cotizacion|cotizaciones|cotizar|presupuesto|presupuestos|calcular)\\b",
      bathroom: "\\b(bano|banos)\\b",
      services:
        "\\b(que (trabajos?|servicios|hacen|ofrecen)|servicios?|remodel(ar|acion|aciones|o)|renovar|renovacion|restaur(ar|acion|aciones)|reformas?|reformar)\\b",
      licence: "\\b(licencia|licencias|licenciad[oa]s?|asegurad[oa]s?|seguro de responsabilidad|fianza|permisos?)\\b",
      warranty: "\\b(garantia|garantias|garantizad[oa]s?|garantizan)\\b",
      timeline: "\\b(cuanto tiempo|tiempo|plazos?|duracion|semanas?|dias?|empezar|comenzar|cuando)\\b",
      privacy: "\\b(privacidad|datos personales|borrar mis|mis datos|mi informacion)\\b",
      contact: "\\b(contacto|contactar|contactarlos|telefono|llamar|llamo|correo|email|e mail|hablar con|numero)\\b",
      hours: "\\b(horarios?|horas|abiert[oa]s?|abren|disponibles?|disponibilidad|fines? de semana|agenda)\\b",
      area: "\\b(donde|zonas?|areas?|ubicad[oa]s?|ubicacion|ciudad|ciudades|atienden|trabajan en)\\b",
      photos: "\\b(galeria|fotos?|imagenes|ejemplos?|portafolio|trabajos anteriores|proyectos anteriores)\\b",
      greeting: "^ (hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)( que tal)? $",
      thanks: "\\b(gracias|te agradezco|se agradece)\\b",
      spoken:
        "[¿¡ñ]|\\b(hola|cuanto|cuesta|precio|bano|necesito|quiero|gracias|usted|ustedes|hacen|cotizacion|presupuesto)\\b",
    },
    pt: {
      identity:
        "\\b(humano|pessoa real|uma pessoa|robo|bot|ia|inteligencia artificial|chatgpt|automatico|voce e real|falar com alguem)\\b",
      damage:
        "\\b(dano|danos|danificad[oa]s?)\\s+(por|de|causad[oa]s? por)\\s+(agua|fogo|fumaca|tempestade|enchente|inundacao|granizo|vento|mofo)\\b|\\b(enchentes?|inundacao|inundacoes|alagamento|alagad[oa]s?)\\b|\\bmofo\\b|\\bbolor\\b|\\binfiltrac(ao|oes)\\b|\\bamianto\\b|\\b(cano|canos|tubulacao) (estourad[oa]s?|rompid[oa]s?)\\b|\\bincendios?\\b",
      notBathroom:
        "\\b(cozinhas?|fachadas?|area externa|telhados?|muros?|cercas?|calhas?|porao|poroes|garagens?|garagem|lareiras?|chamines?|patios?|quintal|jardinagem|paisagismo|piscinas?|aquecimento|ar condicionado|quartos?|sala de estar|casa (toda|inteira)|toda a casa|reforma da casa)\\b",
      fixture:
        "\\b(torneiras?|vasos?|privadas?|descargas?|pias?|cubas?|chuveiros?|box|banheiras?|canos?|tubos?|ralos?|registros?|valvulas?)\\b",
      problem:
        "\\b(vazando|vazamentos?|vaza|pingando|pinga|entupid[oa]s?|quebrad[oa]s?|rachad[oa]s?|trincad[oa]s?|nao funciona|estragad[oa]s?|com defeito)\\b",
      price:
        "\\b(preco|precos|custo|custos|custar|custaria|custariam|custa|custam|cobram|cobra|cobrariam|valor|valores|quanto (fica|sai|seria|e))\\b|\\$",
      trade:
        "\\b(encanamento|encanador(es)?|hidraulic[oa]|eletric[oa]|eletricistas?|fiacao|tomadas?|canos?|registros?|ralos?|torneiras?|luzes|luz|iluminacao|lampadas?|luminarias?|exaustor(es)?|ventilador(es)?|interruptor(es)?)\\b",
      estimate: "\\b(estimativa|estimativas|estimar|orcamento|orcamentos|orcar|cotacao|cotacoes|calcular)\\b",
      bathroom: "\\b(banheiros?|lavabos?)\\b",
      services:
        "\\b(o que (voces )?fazem|servicos?|reformas?|reformar|renovar|renovacao|restaur(ar|acao|acoes)|remodel(ar|acao))\\b",
      licence:
        "\\b(licenca|licencas|licenciad[oa]s?|alvara|segurad[oa]s?|seguro de responsabilidade|permissao|permissoes)\\b",
      warranty: "\\b(garantia|garantias|garantid[oa]s?|garantem)\\b",
      timeline: "\\b(quanto tempo|tempo|prazos?|duracao|semanas?|dias?|comecar|quando)\\b",
      privacy: "\\b(privacidade|dados pessoais|apagar meus|excluir meus|meus dados|minhas informacoes)\\b",
      contact: "\\b(contato|contatar|telefone|ligar|ligo|email|e mail|whatsapp|falar com|numero)\\b",
      hours: "\\b(horarios?|horas|abert[oa]s?|abrem|disponivel|disponibilidade|fins? de semana|agenda)\\b",
      area: "\\b(onde|regiao|regioes|areas?|localizad[oa]s?|localizacao|cidades?|atendem)\\b",
      photos: "\\b(galeria|fotos?|imagens|exemplos?|portfolio|portifolio|trabalhos anteriores|projetos anteriores)\\b",
      greeting: "^ (oi|ola|opa|bom dia|boa tarde|boa noite|e ai)( tudo bem)? $",
      thanks: "\\b(obrigad[oa]s?|valeu|agradeco)\\b",
      spoken: "[ãõ]|\\b(ola|oi|quanto|custa|preco|banheiros?|preciso|quero|obrigad[oa]|voce|voces|fazem|orcamento)\\b",
    },
  };

  // French: the one other language visitors have tried; the assistant
  // only says which languages it speaks.
  var FRENCH = "\\b(bonjour|combien|salle|merci|vous|voudrais|prix|devis)\\b";

  // Topics where the English words are understood on every page, because
  // people use them in any language ("vanity", "LVP", "quote").
  var ALSO_ENGLISH = { price: true, estimate: true };

  // Published per-item prices. Checked in this order so "shower door" wins
  // over "shower" and "floor tile" counts as tile.
  var ITEMS = [
    {
      key: "showerDoor",
      price: "Shower_Door_Price",
      en: "\\bshower doors?\\b",
      es: "\\bpuertas? (de|para) (la )?(ducha|regadera)\\b|\\bmamparas?\\b|\\bcancel(es)?\\b",
      pt: "\\bportas? (do|de|para) box\\b|\\bbox de vidro\\b|\\bblindex\\b",
    },
    {
      key: "showerShelf",
      price: "Shower_Shelf_Price",
      en: "\\bshower (shelf|shelves|niches?)\\b",
      es: "\\b(repisas?|nichos?|estantes?)( empotrad[oa]s?)?( (de|en|para) (la )?(ducha|regadera))?\\b",
      pt: "\\b(nichos?|prateleiras? (do|no|de|para) (box|chuveiro))\\b",
    },
    {
      // "floor|wall" consumed together with "tile" (not just as a separate
      // alternative) so the strip below removes both words — otherwise
      // "floor tile" leaves "floor" behind to also match the flooring
      // pattern later, producing two contradictory price lines in one
      // reply (flooring's own text says "tile floors are priced as tile").
      key: "tile",
      price: "Tile_Price_Per_SqFt",
      en: "\\b(?:floor|wall)\\s+(?:tile|tiles|tiling|tiled)\\b|\\b(?:tile|tiles|tiling|tiled)\\b",
      es: "\\b(?:piso|pisos|pared|paredes)\\s+(?:de\\s+)?(?:azulejos?|losetas?|ceramica|porcelanato)\\b|\\b(?:azulejos?|losetas?|ceramica|porcelanato|mosaicos?|baldosas?)(?:\\s+(?:de|del|para|en)\\s+(?:el\\s+|la\\s+|las\\s+)?(?:piso|pisos|pared|paredes))?\\b",
      pt: "\\b(?:piso|pisos|parede|paredes)\\s+(?:de\\s+)?(?:ceramica|porcelanato|azulejos?)\\b|\\b(?:azulejos?|ceramicas?|porcelanatos?|pastilhas?|revestimentos?)(?:\\s+(?:de|do|da|no|na|para)\\s+(?:o\\s+|a\\s+)?(?:piso|pisos|parede|paredes))?\\b",
    },
    {
      key: "paint",
      price: "Painting_Price_Per_SqFt",
      en: "\\b(paint|painting|painted|painter)\\b",
      es: "\\b(pintura|pintar|pintad[oa]s?|pintor|pintores)\\b",
      pt: "\\b(pintura|pintar|pintad[oa]s?|pintor|pintores)\\b",
    },
    {
      key: "demolition",
      price: "Demo_Price_Per_SqFt",
      en: "\\b(demolition|demo|tear out|tearout|gut|gutting)\\b",
      es: "\\b(demolicion|demoler|derribar)\\b",
      pt: "\\b(demolicao|demolir|quebrar tudo|quebra quebra)\\b",
    },
    {
      key: "flooring",
      price: "Floor_Price_Per_SqFt",
      en: "\\b(floor|floors|flooring|vinyl|laminate|lvp)\\b",
      es: "\\b(pisos?|suelos?|vinil|vinilo|laminado)\\b",
      pt: "\\b(pisos?|chao|vinilico|laminado)\\b",
    },
    {
      key: "cabinet",
      price: "Cabinet_Price",
      en: "\\b(cabinet|cabinets|cabinetry)\\b",
      es: "\\b(gabinetes?|armarios?|alacenas?|botiquin)\\b",
      pt: "\\b(armarios?|armarinhos?|espelheiras?)\\b",
    },
    {
      key: "vanity",
      price: "Vanity_Price",
      en: "\\b(vanity|vanities)\\b",
      es: "\\b(tocador(es)?|muebles? (de|del|para el|para) (lavabo|bano|lavamanos))\\b",
      pt: "\\b(gabinetes?|bancadas?)\\b",
    },
    {
      key: "mirror",
      en: "\\b(mirror|mirrors)\\b",
      es: "\\bespejos?\\b",
      pt: "\\bespelhos?\\b",
    },
    {
      key: "toilet",
      price: "Toilet_Price",
      plumbing: true,
      en: "\\b(toilet|toilets)\\b",
      es: "\\b(inodoros?|excusados?|tazas? de bano|retretes?|sanitarios?|wc)\\b",
      pt: "\\b(vasos?( sanitarios?)?|privadas?|bacias?( sanitarias?)?)\\b",
    },
    {
      key: "sink",
      price: "Sink_Price",
      plumbing: true,
      en: "\\b(sink|sinks)\\b",
      es: "\\b(lavabos?|lavamanos|lavatorios?)\\b",
      pt: "\\b(pias?|cubas?|lavatorios?)\\b",
    },
    {
      key: "bathtub",
      plumbing: true,
      en: "\\b(bathtub|bathtubs|tub|tubs|bath tub)\\b",
      es: "\\b(baneras?|tinas?)\\b",
      pt: "\\b(banheiras?|ofuros?)\\b",
    },
    {
      key: "shower",
      price: "Shower_Price",
      plumbing: true,
      en: "\\b(shower|showers)\\b",
      es: "\\b(duchas?|regaderas?)\\b",
      pt: "\\b(chuveiros?|box|boxes|duchas?)\\b",
    },
    {
      key: "door",
      price: "Door_Price",
      en: "\\b(door|doors)\\b",
      es: "\\bpuertas?\\b",
      pt: "\\bportas?\\b",
    },
  ];

  function itemText(item, lang) {
    var $ = function (value) {
      return Pricing.shortMoney(value, I18n.locale(lang));
    };
    var vars = { price: item.price ? $(PRICES[item.price]) : "" };
    if (item.key === "mirror") {
      vars.price = $(PRICES.Mirror_Price);
      vars.huge = $(PRICES.Mirror_Huge_Price);
    }
    if (item.key === "bathtub") vars.price = $(Pricing.bathtubPrice(PRICES));
    var text = I18n.t("chat.item." + item.key, vars, lang);
    return item.plumbing ? text + " " + I18n.t("chat.plumbingExtra", null, lang) : text;
  }

  function reply(message, options) {
    options = options || {};
    var estimator = options.estimatorEnabled === true;
    var lang = WORDS[options.lang] ? options.lang : I18n.lang();
    var words = WORDS[lang];
    var t = normalize(message);
    if (!t.trim()) return null;
    var raw = String(message).toLowerCase();

    function T(key) {
      return I18n.t(key, CONTACT, lang);
    }
    function is(topic) {
      return has(t, words[topic]) || (lang !== "en" && ALSO_ENGLISH[topic] && has(t, WORDS.en[topic]));
    }
    function answer(key) {
      return { text: T(key), action: null };
    }
    function offer(text) {
      return estimator
        ? { text: text + " " + T("chat.estimateOffer"), action: "offerEstimate" }
        : { text: text, action: null };
    }
    function speaks(other) {
      var pattern = WORDS[other].spoken;
      return has(t, pattern) || has(raw, pattern);
    }

    if (is("identity")) return answer("chat.identity");
    // Written in one of the site's other languages: say so, in that language.
    for (var i = 0; i < I18n.LANGS.length; i++) {
      var other = I18n.LANGS[i];
      if (other !== lang && other !== "en" && speaks(other)) {
        return { text: I18n.t("chat.otherLanguage." + other, CONTACT, other), action: null };
      }
    }
    if (has(t, FRENCH)) return answer("chat.french");
    if (is("damage")) return answer("chat.damage");
    if (is("notBathroom")) return answer("chat.notBathroom");
    if (is("fixture") && is("problem")) return answer("chat.fixtureProblem");

    var matched = [];
    var matchedText = t;
    ITEMS.forEach(function (item) {
      var patterns = lang === "en" ? [item.en] : [item[lang], item.en];
      var hit = patterns.some(function (p) {
        return new RegExp(p).test(matchedText);
      });
      if (hit) {
        matched.push(itemText(item, lang));
        // "shower door" should not also answer "shower".
        patterns.forEach(function (p) {
          matchedText = matchedText.replace(new RegExp(p, "g"), " ");
        });
      }
    });
    if (matched.length) {
      if (!estimator) return answer("chat.callForPrice");
      return offer(matched.join(" "));
    }

    if (is("trade")) return answer("chat.trade");

    var bathroomPrice = is("bathroom") && is("price");
    if (is("estimate") || bathroomPrice || is("price")) {
      if (!estimator) return answer("chat.callForPrice");
      return { text: null, action: "startEstimate" };
    }

    if (is("licence")) return answer("chat.licence");
    if (is("warranty")) return answer("chat.warranty");
    if (is("photos")) return answer("chat.photos");
    if (is("timeline")) return answer("chat.timeline");
    if (is("services") || is("bathroom")) return offer(T("chat.services"));
    if (is("privacy")) return answer("chat.privacy");
    if (is("area")) return answer("chat.area");
    if (is("hours")) return answer("chat.hours");
    if (is("contact")) return answer("chat.contact");
    if (is("thanks")) return answer("chat.thanks");
    if (is("greeting")) return offer(T("chat.greeting"));

    return estimator ? { text: T("chat.fallback"), action: "offerEstimate" } : answer("chat.fallbackNoEstimate");
  }

  return {
    reply: reply,
    normalize: normalize,
    // English text, kept for the existing callers and tests.
    CALL_FOR_PRICE: I18n.t("chat.callForPrice", CONTACT, "en"),
    callForPrice: function (lang) {
      return I18n.t("chat.callForPrice", CONTACT, lang);
    },
    PHONE: PHONE,
    EMAIL: EMAIL,
  };
});
