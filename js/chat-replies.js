// Premium Restoration — scripted chat replies (no AI, no backend).
//
// Pure function: reply(message, { estimatorEnabled, leadFormEnabled })
// returns { text, action }  where action is one of
//   "startEstimate"  — start the guided bathroom estimate (no text shown)
//   "offerEstimate"  — show the text, then an "estimate" button
//   null             — just show the text
//
// Matching is on whole words only (so "work" never matches "fireplace"-style
// substrings, and "fire" does not match "fireplaces"). Prices come from
// js/bathroom-pricing.js, the same published prices the estimate uses.
//
// Never state a business fact the site doesn't already state (insurance,
// payment methods, service area, free quotes...): answer "please ask us"
// with the phone number instead.
//
// Loads as a plain browser script (window.ChatReplies) and as a Node module.

(function (/** @type {any} */ root) {
  "use strict";

  /**
   * A reply: text to show (null when the estimate starts straight away) and
   * what the chat does next ("offerEstimate", "startEstimate" or null).
   * @typedef {{ text: string | null, action: string | null }} ChatReply
   */
  /** @typedef {ReturnType<typeof wording>} Wording */
  var node = typeof module === "object" && module.exports && typeof require === "function";
  /** @type {typeof import("./bathroom-pricing.js")} */
  var Pricing = node ? require("./bathroom-pricing.js") : root.BathroomPricing;
  /** @type {typeof import("./business-info.js")} */
  var Business = node ? require("./business-info.js") : root.BusinessInfo;

  var PHONE = Business.PHONE;
  var EMAIL = Business.EMAIL;
  var PRICES = Pricing.DEFAULT_PRICES;
  var $ = Pricing.shortMoney;

  var ESTIMATE_OFFER = "For a rough estimate of your whole job, tap the button below or say “bathroom quote”.";
  var PLUMBING_EXTRA =
    "Installing it also needs plumbing work, which isn't included in our online prices and will add to the cost.";

  /**
   * @param {string} text
   * @param {string | RegExp} pattern
   */
  function has(text, pattern) {
    return new RegExp(pattern).test(text);
  }

  // Lower-case, straight apostrophes removed ("don't" -> "dont"), and every
  // other non-letter/digit turned into a space.
  /** @param {unknown} message */
  function normalize(message) {
    return (
      " " +
      String(message || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9áéíóúñüàâçèêëîïôûù¿¡$]+/g, " ")
        .trim() +
      " "
    );
  }

  // Only real questions about who is answering ("Are you a real person?",
  // "Is this a bot?", "Am I talking to a human?"). A message that merely
  // mentions a person ("I need a person to look at my shower") is answered on
  // its subject instead.
  var WHO = "(a |an )?(real |actual |live )?(person|human|bot|robot|ai|chat ?bot|chatgpt|machine|computer program)\\b";
  var IDENTITY = [
    "\\b(are|r) (you|u) " + WHO,
    "\\bare (you|u) (real|automated)\\b",
    "\\bis (this|it|that) " + WHO,
    "\\bis (this|it|that) (automated|chatgpt)\\b",
    "\\b(am i|are we) (talking|chatting|speaking) (to|with) " + WHO,
    "\\bwho am i (talking|chatting|speaking) (to|with)\\b",
    "\\b(youre|you are|ur) " + WHO,
    "\\bis (anyone|someone|somebody) (there|here|reading this)\\b",
    "\\bis there (a )?(real )?(person|human) (there|here|on the other end|reading)\\b",
  ].join("|");

  // Asking for a person to talk to: the phone number and email.
  var PERSON_REQUEST =
    "\\b(talk|speak|chat) (to|with) (a |an )?(real |actual |live )?(person|human|someone|somebody|anyone|agent|representative|the owner)\\b";
  var PERSON_REPLY =
    "To talk to a person, call " +
    PHONE +
    " or email " +
    EMAIL +
    ". I'm an automated assistant with scripted replies, so nothing you type here reaches us.";

  var IDENTITY_REPLY =
    "I'm an automated assistant with scripted replies — not a person, and not AI. Nothing you type here is sent to or read by us. To reach a person, call " +
    PHONE +
    " or email " +
    EMAIL +
    ".";

  // Spanish or French messages, including short everyday phrasing
  // ("hablas ingles", "parlez-vous anglais", "buenos días", "s'il vous
  // plaît"), and English questions about those languages. Only words that
  // aren't also English words are used, so English messages aren't caught.
  var OTHER_LANGUAGE =
    "[¿¡ñ]|\\b(" +
    [
      // Spanish
      "hola",
      "buenos",
      "buenas",
      "dias",
      "días",
      "tardes",
      "noches",
      "habla",
      "hablas",
      "hablan",
      "hablo",
      "ingles",
      "inglés",
      "espanol",
      "español",
      "cuanto",
      "cuánto",
      "cuanta",
      "cuánta",
      "cuesta",
      "cuestan",
      "precio",
      "precios",
      "baño",
      "baños",
      "bano",
      "banos",
      "ducha",
      "regadera",
      "inodoro",
      "lavabo",
      "azulejo",
      "azulejos",
      "piso",
      "pisos",
      "pintar",
      "pintura",
      "remodelar",
      "remodelacion",
      "remodelación",
      "reparar",
      "arreglar",
      "necesito",
      "necesita",
      "necesitamos",
      "quiero",
      "quisiera",
      "queremos",
      "puede",
      "puedes",
      "pueden",
      "ayuda",
      "ayudar",
      "gracias",
      "usted",
      "ustedes",
      "hacen",
      "tienen",
      "cotizacion",
      "cotización",
      "presupuesto",
      "trabajo",
      "cuando",
      "cuándo",
      "donde",
      "dónde",
      "por favor",
      // French
      "bonjour",
      "bonsoir",
      "salut",
      "parlez",
      "parles",
      "anglais",
      "francais",
      "français",
      "combien",
      "coute",
      "coûte",
      "salle",
      "douche",
      "toilettes",
      "carrelage",
      "peinture",
      "devis",
      "travaux",
      "merci",
      "vous",
      "voudrais",
      "voulez",
      "pouvez",
      "prix",
      "je suis",
      "je veux",
      "sil vous plait",
      "sil vous plaît",
      "oui",
      // English questions about Spanish or French
      "speak spanish",
      "speak french",
      "in spanish",
      "in french",
      "spanish speaking",
      "french speaking",
      "habla espanol",
    ].join("|") +
    ")\\b";
  var OTHER_LANGUAGE_REPLY =
    "Sorry — this automated assistant only understands English. Lo sentimos, este asistente automático solo entiende inglés. " +
    "Désolé, cet assistant automatique ne comprend que l'anglais. Please call " +
    PHONE +
    ".";

  var DAMAGE =
    "\\b(water|fire|smoke|storm|flood|hail|wind|mold|mould)\\s+damage(d)?\\b|\\bflood(ed|ing|s)?\\b|\\bmou?ld(y)?\\b|\\bmildew\\b|\\bsewage\\b|\\basbestos\\b|\\b(damage|disaster)\\s+restoration\\b|\\bburst\\s+pipes?\\b";

  // Words that mean a bathroom. A message that is about a bathroom is never
  // turned away, even if it also names another room.
  var BATHROOM = "\\b(bathrooms?|baths?|restrooms?|washrooms?|powder rooms?|ensuites?|en suites?)\\b";

  // Other work we don't take on.
  var OTHER_WORK =
    "\\b(kitchens?|exteriors?|roof(s|ing)?|siding|stucco|decks?|fences?|gutters?|fireplaces?|chimneys?|driveways?|patios?|landscaping|pools?|hvac|furnaces?|water heaters?|hot water heaters?|hot water tanks?|tankless water heaters?|boilers?|whole (home|house)|entire (home|house)|full (home|house)|remodel my (home|house))\\b";
  // Other rooms. On their own they are declined, but they can also say
  // where a bathroom is ("basement bathroom", "bathroom in the garage").
  var OTHER_ROOMS =
    "\\b(basements?|garages?|bedrooms?|living rooms?|laundry rooms?|laundry|utility rooms?|mud ?rooms?|attics?)\\b";
  var ROOM_WORDS =
    "(basements?|garages?|bedrooms?|master bedrooms?|living rooms?|pool house|pool|laundry rooms?|laundry|utility rooms?|attics?)";
  var BATHROOM_WORDS = "(bathrooms?|baths?|restrooms?|washrooms?|powder rooms?|ensuites?|en suites?)";

  // The non-bathroom work or rooms a message names, ignoring room words that
  // only say where the bathroom is.
  /** @param {string} t */
  function otherWorkNamed(t) {
    var rest = t
      .replace(new RegExp("\\b" + ROOM_WORDS + "\\s+" + BATHROOM_WORDS + "\\b", "g"), " bathroom ")
      .replace(
        new RegExp(
          "\\b" +
            BATHROOM_WORDS +
            "\\s+(in|off|next to|by|downstairs in|upstairs in)\\s+(the |my |our |a )?" +
            ROOM_WORDS +
            "\\b",
          "g",
        ),
        " bathroom ",
      );
    /** @type {string[]} */
    var found = [];
    [OTHER_WORK, OTHER_ROOMS].forEach(function (pattern) {
      (rest.match(new RegExp(pattern, "g")) || []).forEach(function (/** @type {string} */ word) {
        word = word.trim();
        if (found.indexOf(word) === -1) found.push(word);
      });
    });
    return found;
  }

  /** @param {string[]} words */
  function listWords(words) {
    if (words.length === 1) return words[0];
    return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
  }

  // Bathrooms in shops, offices, restaurants and other businesses: the
  // website doesn't say whether these are taken on.
  var COMMERCIAL =
    "\\bcommercial\\b|\\b(office|restaurant|store|shop|retail|business|hotel|motel|gym|school|church|public)s? (bathrooms?|restrooms?|washrooms?)\\b|\\b(bathrooms?|restrooms?|washrooms?) (in|at|for) (an? |our |my |the )?(office|restaurant|store|shop|business|hotel|motel|gym|school|church)s?\\b";

  var FIXTURE_WORDS =
    "\\b(faucets?|taps?|toilets?|sinks?|showers?|tubs?|bathtubs?|pipes?|drains?|valves?|showerheads?)\\b";
  var PROBLEM_WORDS = "\\b(leak(s|y|ing|ed)?|drip(s|py|ping)?|clogged|blocked|running|broken|cracked|not working)\\b";

  var PRICE_WORDS = "\\b(price|prices|pricing|cost|costs|charge|charges|rate|rates|how much|fee|fees)\\b|\\$";
  // "What's the total for a 5x8 bathroom?": a size or a total also asks for the estimate.
  var TOTAL_WORDS = "\\b(total|altogether|all in)\\b";
  var ROOM_SIZE = "\\b\\d+ ?(x|by) ?\\d+\\b";

  // Refinishing (reglazing, resurfacing) isn't one of the published items:
  // never answer it with an installation price.
  var REFINISH =
    "\\b(refinish(es|ed|ing)?|re finish(ing)?|reglaz(e|es|ed|ing)|re glaz(e|ing)|resurfac(e|es|ed|ing)|re surfac(e|ing)|re ?enamel(l?ing)?|recoat(ing)?|re coat(ing)?)\\b";

  // Heated floors: the floor is priced as usual; the heating is electrical work.
  var HEATED_FLOOR =
    "\\b(heated|radiant|underfloor|under floor|in floor|infloor|warm) (floors?|flooring|tiles?|heating)\\b|\\bfloor (heat|heating|heater|warming)\\b";

  // Items with no published price. Never priced or estimated here.
  var UNPRICED =
    "\\b(windows?|skylights?|counter ?tops?|counters?|vanity tops?|grab bars?|towel (bars?|racks?|rails?)|toilet paper holders?|accessories|drywall|sheetrock|baseboards?|trim|mouldings?|moldings?)\\b";

  // Published per-item prices. Checked in this order so "shower door" wins
  // over "shower" and "floor tile" counts as tile.
  var ITEMS = [
    {
      pattern: "\\bshower doors?\\b",
      text: function () {
        return "Shower door installation is " + $(PRICES.Shower_Door_Price) + " per door (labor only).";
      },
    },
    {
      pattern: "\\bshower (shelf|shelves|niches?)\\b",
      text: function () {
        return "A built-in shower shelf is " + $(PRICES.Shower_Shelf_Price) + " each (labor only).";
      },
    },
    {
      // Grout and caulk are part of tile work.
      pattern: "\\b(grout|grouting|regrout|re grout|caulk|caulking|recaulk|re caulk|sealant)\\b",
      text: function () {
        return (
          "Grout and caulk are part of our tile work, priced with the tile: " +
          $(PRICES.Tile_Price_Per_SqFt) +
          " per sq ft of floor or wall tiled (labor only). For a grout or caulk repair on its own, call " +
          PHONE +
          " and we'll tell you whether we can take it on."
        );
      },
    },
    {
      pattern: "\\b(tile|tiles|tiling|tiled)\\b",
      text: function () {
        return "Tile is " + $(PRICES.Tile_Price_Per_SqFt) + " per sq ft of floor or wall tiled (labor only).";
      },
    },
    {
      pattern: "\\b(paint|painting|painted|painter)\\b",
      text: function () {
        return (
          "Painting is " + $(PRICES.Painting_Price_Per_SqFt) + " per sq ft of wall or ceiling painted (labor only)."
        );
      },
    },
    {
      pattern: "\\b(demolition|demo|tear out|tearout|gut|gutting)\\b",
      text: function () {
        return "Demolition is " + $(PRICES.Demo_Price_Per_SqFt) + " per sq ft of bathroom floor (labor only).";
      },
    },
    {
      pattern: "\\b(floor|floors|flooring|vinyl|laminate|lvp)\\b",
      text: function () {
        return (
          "Bathroom flooring is " +
          $(PRICES.Floor_Price_Per_SqFt) +
          " per sq ft of bathroom floor (labor only; tile floors are priced as tile)."
        );
      },
    },
    {
      pattern: "\\b(cabinet|cabinets|cabinetry)\\b",
      text: function () {
        return "Bathroom cabinet installation is " + $(PRICES.Cabinet_Price) + " per cabinet (labor only).";
      },
    },
    {
      pattern: "\\b(vanity|vanities)\\b",
      text: function () {
        return "Vanity installation is " + $(PRICES.Vanity_Price) + " per vanity (labor only).";
      },
    },
    {
      pattern: "\\b(mirror|mirrors)\\b",
      text: function () {
        return (
          "Mirror installation is " +
          $(PRICES.Mirror_Price) +
          " per standard mirror, or " +
          $(PRICES.Mirror_Huge_Price) +
          " for a huge/oversized one (labor only)."
        );
      },
    },
    {
      pattern: "\\b(toilet|toilets)\\b",
      text: function () {
        return "Toilet installation is " + $(PRICES.Toilet_Price) + " per toilet (labor only). " + PLUMBING_EXTRA;
      },
    },
    {
      pattern: "\\b(sink|sinks)\\b",
      text: function () {
        return "Sink installation is " + $(PRICES.Sink_Price) + " per sink (labor only). " + PLUMBING_EXTRA;
      },
    },
    {
      // Jetted tubs (Jacuzzi, whirlpool) are installed as bathtubs; their
      // electrical hook-up is extra.
      pattern:
        "\\b(jacuzzis?|jetted (tub|tubs|bath|baths|bathtub|bathtubs)|whirlpool (tub|tubs|bath|baths|bathtub|bathtubs)|whirlpools?|spa (tub|tubs|bath|baths))\\b",
      text: function () {
        return (
          "A jetted tub (such as a Jacuzzi or whirlpool bath) is installed as a bathtub: " +
          $(Pricing.bathtubPrice(PRICES)) +
          " per bathtub (labor only). " +
          PLUMBING_EXTRA +
          " The electrical work for the jets isn't included either and also adds to the cost."
        );
      },
    },
    {
      pattern: "\\b(bathtub|bathtubs|tub|tubs|bath tub|soaking tub|clawfoot)\\b",
      text: function () {
        return (
          "Bathtub installation is " + $(Pricing.bathtubPrice(PRICES)) + " per bathtub (labor only). " + PLUMBING_EXTRA
        );
      },
    },
    {
      pattern: "\\b(shower|showers)\\b",
      text: function () {
        return "Shower installation is " + $(PRICES.Shower_Price) + " per shower (labor only). " + PLUMBING_EXTRA;
      },
    },
    {
      pattern: "\\b(door|doors)\\b",
      text: function () {
        return "Installing the bathroom's entry door is " + $(PRICES.Door_Price) + " per door (labor only).";
      },
    },
  ];

  var TRADE =
    "\\b(plumb(ing|er|ers)?|electric(al|ian|ians)?|wiring|outlets?|pipes?|valves?|drains?|faucets?|lights?|lighting|fans?|switch(es)?)\\b";
  var ESTIMATE = "\\b(estimate|estimates|quote|quotes|quotation|ballpark)\\b";
  // "How do I get a quote?": how to ask for a real quote.
  var QUOTE_HOWTO =
    "\\bhow (do|can|would|should|to) (i |we )?(get|request|ask for|book|arrange|go about getting) (a |an |my |the )?(written )?(quote|quotation|price)\\b";
  // "Is the estimate free?", "Do you charge for a quote?"
  var FREE =
    "\\b(free|free of charge|no charge|for nothing)\\b.*\\b(estimates?|quotes?|quotation|consultation|visit|assessment|it|this|chat)\\b|\\b(estimates?|quotes?|quotation|consultation|visit|assessment|it|this|chat)\\b.*\\b(free|free of charge|no charge)\\b|\\b(charge|cost|pay)( you)?( anything)? (for|to get) (a |an |the )?(estimate|quote|quotation|consultation|visit)\\b";
  var PAYMENT =
    "\\b(payments?|payment methods?|credit cards?|debit cards?|cards?|venmo|zelle|paypal|cash app|financing|finance|deposit|down payment|installments?|payment plans?|(pay|paying) (by|with|in) (check|cheque|cash|card|credit|debit)|(take|accept) (cash|checks?|cheques?|cards?|credit))\\b";

  var SERVICES =
    "\\b(what (work|services|kind of work|do you do|can you do|jobs)|services?|do you (do|offer|handle)|what do you (do|offer)|remodel(ing)?|renovat(e|ion|ions|ing)|restor(e|ation|ations|ing))\\b";
  var LICENCE = "\\b(licen[cs]e[ds]?|permits?)\\b";
  var INSURANCE = "\\b(insured|insurance|insurer|bonded|liability cover(age)?)\\b";
  var WARRANTY = "\\b(warrant(y|ies)|guarantee[ds]?)\\b";
  // Water heaters are plumbing work outside the bathroom restorations we do.
  var WATER_HEATER = "\\b(water heaters?|hot water heaters?|hot water tanks?|tankless|boilers?)\\b";
  // When someone can come out or start: only a person can answer that.
  var AVAILABILITY =
    "\\b(come|come out|come over|start|begin|visit|stop by|get here|be here|be there|fit me in|see it|look at it)\\s+(today|tonight|tomorrow|this week|next week|this weekend|this month|next month|soon|asap|right away|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\\b|\\b(are you|is anyone) (available|free)\\b|\\b(any|your) availability\\b|\\bwhen (can|could|would|will) (you|someone|somebody) (come|come out|start|begin|visit|get here)\\b|\\bhow soon can\\b|\\b(earliest|next available) (date|day|opening|appointment|slot)\\b|\\b(book|schedule) (a|an) (visit|appointment|consultation)\\b";
  var TIMELINE = "\\b(how long|timeline|time frame|timeframe|duration|weeks?|days?|start)\\b";
  // A clear question about time, answered even when it names an item
  // ("How long does a tile job take?").
  var TIMELINE_QUESTION =
    "\\b(how long|timeline|time frame|timeframe|duration|how many (days|weeks|months)|how soon|when (can|could|would) you start)\\b";
  var PRIVACY = "\\b(privacy|personal data|delete my|my data|my information)\\b";
  var CONTACT = "\\b(contact|phone|call|email|e mail|reach|number|talk to)\\b";
  var HOURS = "\\b(hours?|open|opening|available|availability|weekends?|schedule)\\b";
  var AREA = "\\b(where|area|areas|located|location|serve|service area|cities|city)\\b";
  var PHOTOS =
    "\\b(gallery|photos?|pictures?|pics|examples?|portfolio|past (work|jobs|projects)|previous (work|jobs|projects))\\b";
  var GREETING = "^ (hi|hello|hey|hiya|good (morning|afternoon|evening))( there)? $";
  var THANKS = "\\b(thanks|thank you|thx|cheers)\\b";

  // Every reply that names a way to get in touch, worded for the current
  // settings: with the Get a Quote form switched off ("please call us" mode)
  // nothing sends the visitor to the form, and with the estimator off nothing
  // offers an estimate or a price.
  /**
   * @param {boolean} estimator
   * @param {boolean} formOn
   */
  function wording(estimator, formOn) {
    var orForm = formOn ? " or use the Get a Quote page" : " or email " + EMAIL;
    var callOrForm = "call " + PHONE + orForm;
    var estimateInvite = estimator
      ? " For a bathroom project, say “bathroom quote” and I can give you a rough estimate."
      : " For a bathroom project, " + callOrForm + ".";
    return {
      callForPrice: "Call " + PHONE + orForm + " for a price.",
      callOrForm: callOrForm,
      notBathroom:
        "Sorry, we currently only take on bathroom restorations — not kitchens, exteriors, roofing, other rooms, or damage restoration — so we can't help with that." +
        estimateInvite,
      damage:
        "Sorry, we don't take on damage restoration (such as water, fire, smoke or mold damage), so we can't help with that. " +
        "We only do bathroom restorations." +
        estimateInvite.replace("For a bathroom project", "For a bathroom project without damage"),
      commercial:
        "This website doesn't say whether we take on commercial bathrooms (for example in offices, shops or restaurants), " +
        "so please ask us before relying on an online estimate: " +
        callOrForm +
        ".",
      fixtureProblem:
        "A leaking or broken faucet, toilet, sink, tub or shower is plumbing work. We can replace bathroom fixtures as part of a bathroom restoration, " +
        "but plumbing isn't included in our online prices and adds to the cost, and we do not currently hold a contractor licence. " +
        "Call " +
        PHONE +
        " to talk it through — we'll tell you who would do the plumbing and how it would be priced before any work is agreed. " +
        "(We don't take on water-damage restoration.)",
      trade:
        "Our online prices and estimates don't include plumbing or electrical work, and toilets, sinks, showers, and bathtubs also need plumbing work, so expect it to add to the cost. " +
        "We do not currently hold a contractor licence. " +
        (formOn ? "Tell us about your project on the Get a Quote page" : "Call " + PHONE) +
        " and we'll tell you who will do that work and how it will be priced before any work is agreed.",
      services:
        "We do bathroom restorations: demolition, installing fixtures (toilets, sinks, showers, bathtubs, vanities, mirrors, doors and cabinets), " +
        "tile, flooring, and painting walls and ceilings. We don't take on kitchens, exteriors, roofing, or damage restoration. " +
        "Plumbing and electrical work isn't included in our online estimates and adds to the cost.",
      licence:
        "We do not currently hold a contractor licence. Before any work is agreed, we'll tell you who will do any plumbing and electrical work, how it will be priced, " +
        "and whether your job needs any permits. Ask us anything else about this when you get in touch: " +
        PHONE +
        ".",
      insurance:
        "This website doesn't give details about insurance — neither our own cover nor insurance claims. Please ask us about it before you agree to any work: call " +
        PHONE +
        ".",
      warranty:
        "We don't advertise a standard warranty on this website. If you'd like one, ask us before you agree to the work, and make sure any warranty terms are given to you in writing.",
      waterHeater:
        "Sorry, we don't take on water heater installation or replacement: it's plumbing work outside the bathroom restorations we do, " +
        "and plumbing isn't included in our online prices. A licensed plumber is the right person to ask. For a bathroom restoration, " +
        callOrForm +
        ".",
      availability:
        "This chat can't check dates or book a visit. Call " +
        PHONE +
        (formOn ? " or send a request on the Get a Quote page" : " or email " + EMAIL) +
        " and we'll tell you when we could come out or start.",
      timeline:
        "It depends on the size of the bathroom and the work involved. We'll give you an expected timeline once we've seen the job — " +
        callOrForm +
        ".",
      payment:
        "This website doesn't list the payment methods we accept, or any deposit or financing terms, so please ask us: call " +
        PHONE +
        ".",
      free:
        (estimator ? "Using the estimate in this chat costs nothing and doesn't commit you to anything. " : "") +
        "This website doesn't say whether a visit or a written quote is free, so please ask us: call " +
        PHONE +
        ".",
      quoteHowTo:
        (formOn
          ? "For a quote, send us a request on the Get a Quote page or call " + PHONE + "."
          : "For a quote, call " +
            PHONE +
            " or email " +
            EMAIL +
            " — we're not taking requests through the website form right now.") +
        " Your actual price is set in writing after we've seen the job.",
      refinish:
        "We don't have an online price for refinishing, reglazing or resurfacing — our online prices are for installing new fixtures and surfaces, " +
        "so they don't apply. Call " +
        PHONE +
        " and ask whether we can take it on.",
      privacy:
        "Our Privacy Notice (linked at the bottom of every page) explains what we collect and how to ask us to access or delete your information.",
      contact:
        "You can reach us at " +
        PHONE +
        " or " +
        EMAIL +
        (formOn ? ", or use the form on our Get a Quote page to send us your request." : "."),
      hours:
        "Call " +
        PHONE +
        (formOn ? " or use the Get a Quote page" : " or email " + EMAIL) +
        ", and we'll get back to you as soon as we can.",
      area:
        "Call " +
        PHONE +
        (formOn ? " or use the Get a Quote page" : " or email " + EMAIL) +
        " with your address and we'll tell you whether we can take on your job.",
      photos:
        "We don't have photos of our own completed projects online yet — we'd rather show nothing than someone else's work. Ask us about past jobs when you get in touch.",
      greeting: estimator
        ? "Hello! Ask me about our bathroom work or prices, or get a rough estimate of your bathroom job."
        : "Hello! Ask me about our bathroom work or how to get a quote.",
      thanks: "You're welcome! If you'd like to talk to a person, call " + PHONE + ".",
      fallback:
        "Sorry, I didn't understand that. I can answer questions about our bathroom work" +
        (estimator ? " and prices, or give you a rough estimate." : ".") +
        " To talk to a person, " +
        callOrForm +
        ".",
    };
  }

  /**
   * @param {string} t
   * @param {boolean} estimator
   */
  function unpricedReply(t, estimator) {
    /** @type {string[]} */
    var names = [];
    (t.match(new RegExp(UNPRICED, "g")) || []).forEach(function (/** @type {string} */ word) {
      word = word.trim();
      if (names.indexOf(word) === -1) names.push(word);
    });
    return (
      "We don't have an online price for " +
      listWords(names) +
      ": " +
      (names.length === 1 ? "it isn't" : "they aren't") +
      " among the items our " +
      (estimator ? "online estimate covers" : "published prices cover") +
      ". Call " +
      PHONE +
      " and ask whether we can include " +
      (names.length === 1 ? "it" : "them") +
      " in your bathroom job."
    );
  }

  /** @param {boolean} estimator */
  function heatedFloorReply(estimator) {
    return (
      "A heated floor needs electrical work, which isn't included in our online prices and adds to the cost, and we do not currently hold a contractor licence. " +
      (estimator
        ? "The floor covering itself is priced like any bathroom floor: " +
          $(PRICES.Floor_Price_Per_SqFt) +
          " per sq ft for flooring, or " +
          $(PRICES.Tile_Price_Per_SqFt) +
          " per sq ft for tile (labor only). "
        : "") +
      "Call " +
      PHONE +
      " about the heating — we'll tell you who would do the electrical work and how it would be priced before any work is agreed."
    );
  }

  // Questions answered on their own subject, even when they name an item
  // ("Is there a warranty on the tile?"). Licence and insurance can both be
  // asked at once; availability wins over a general timeline question.
  /**
   * @param {string} t
   * @param {Wording} w
   */
  function topicalAnswers(t, w) {
    var list = [];
    if (has(t, LICENCE)) list.push(w.licence);
    if (has(t, INSURANCE)) list.push(w.insurance);
    if (has(t, WARRANTY)) list.push(w.warranty);
    if (has(t, AVAILABILITY)) list.push(w.availability);
    else if (has(t, TIMELINE_QUESTION)) list.push(w.timeline);
    return list.join(" ");
  }

  /**
   * @param {string[]} others
   * @param {boolean} estimator
   * @param {Wording} w
   * @returns {ChatReply}
   */
  function mixedReply(others, estimator, w) {
    var text =
      "We can help with the bathroom, but we only take on bathroom restorations, so we can't quote the " +
      listWords(others) +
      " part.";
    if (!estimator) return { text: text + " For a price on the bathroom, " + w.callOrForm + ".", action: null };
    return {
      text: text + " For a rough estimate of the bathroom, tap the button below or say “bathroom quote”.",
      action: "offerEstimate",
    };
  }

  // Published item prices named in the message (after unpriced words are
  // taken out, so "vanity top" is not priced as a vanity).
  /** @param {string} t */
  function itemPrices(t) {
    /** @type {string[]} */
    var matched = [];
    var rest = t.replace(new RegExp(UNPRICED, "g"), " ");
    ITEMS.forEach(function (item) {
      if (new RegExp(item.pattern).test(rest)) {
        matched.push(item.text());
        // "shower door" should not also answer "shower".
        rest = rest.replace(new RegExp(item.pattern, "g"), " ");
      }
    });
    return matched;
  }

  // What the visitor is asking about before any price is considered: who is
  // answering, the language, a person, work we don't do, and questions that
  // only a call can answer. Returns a reply, or null to carry on.
  /**
   * @param {string} t
   * @param {boolean} estimator
   * @param {Wording} w
   */
  function firstChecks(t, estimator, w) {
    if (has(t, IDENTITY)) return { text: IDENTITY_REPLY, action: null };
    if (has(t, OTHER_LANGUAGE)) return { text: OTHER_LANGUAGE_REPLY, action: null };
    if (has(t, PERSON_REQUEST)) return { text: PERSON_REPLY, action: null };
    if (has(t, DAMAGE)) return { text: w.damage, action: null };
    var others = otherWorkNamed(t);
    if (others.length) {
      if (has(t, BATHROOM)) return mixedReply(others, estimator, w);
      if (has(t, WATER_HEATER)) return { text: w.waterHeater, action: null };
      return { text: w.notBathroom, action: null };
    }
    if (has(t, COMMERCIAL)) return { text: w.commercial, action: null };
    if (has(t, FIXTURE_WORDS) && has(t, PROBLEM_WORDS)) return { text: w.fixtureProblem, action: null };
    if (has(t, REFINISH)) return { text: w.refinish, action: null };
    if (has(t, QUOTE_HOWTO)) return offerIf(estimator, w.quoteHowTo);
    var asksFree = has(t.replace(/\bfree ?standing\b/g, " "), FREE) && !has(t, AVAILABILITY);
    if (asksFree) return offerIf(estimator, w.free);
    if (has(t, PAYMENT)) return { text: w.payment, action: null };
    if (has(t, HEATED_FLOOR)) return offerIf(estimator, heatedFloorReply(estimator));
    return null;
  }

  /**
   * @param {boolean} estimator
   * @param {string} text
   * @returns {ChatReply}
   */
  function offerIf(estimator, text) {
    return estimator ? { text: text + " " + ESTIMATE_OFFER, action: "offerEstimate" } : { text: text, action: null };
  }

  // Prices, unpriced items and estimate requests. Returns a reply, or null.
  /**
   * @param {string} t
   * @param {boolean} estimator
   * @param {Wording} w
   * @param {string} topical
   */
  function priceChecks(t, estimator, w, topical) {
    var asksPrice = has(t, PRICE_WORDS);
    if (topical && !asksPrice) return { text: topical, action: null };
    var extra = topical ? " " + topical : "";
    var unpriced = has(t, UNPRICED);
    var matched = itemPrices(t);
    if (unpriced) {
      var text = unpricedReply(t, estimator);
      if (matched.length) text += " " + (estimator ? matched.join(" ") : w.callForPrice);
      return { text: text + extra, action: matched.length && estimator ? "offerEstimate" : null };
    }
    if (matched.length) {
      if (!estimator) return { text: w.callForPrice + extra, action: null };
      return offerIf(true, matched.join(" ") + extra);
    }
    if (topical) return { text: topical, action: null };
    if (has(t, TRADE)) return { text: w.trade, action: null };
    var sizedOrTotal = has(t, BATHROOM) && (has(t, TOTAL_WORDS) || has(t, ROOM_SIZE));
    if (has(t, ESTIMATE) || asksPrice || sizedOrTotal) {
      return estimator ? { text: null, action: "startEstimate" } : { text: w.callForPrice, action: null };
    }
    return null;
  }

  // Everything else: photos, services, privacy, area, hours, contact, greetings.
  /**
   * @param {string} t
   * @param {boolean} estimator
   * @param {Wording} w
   */
  function generalChecks(t, estimator, w) {
    if (has(t, PHOTOS)) return { text: w.photos, action: null };
    if (has(t, TIMELINE)) return { text: w.timeline, action: null };
    if (has(t, SERVICES) || has(t, BATHROOM)) return offerIf(estimator, w.services);
    if (has(t, PRIVACY)) return { text: w.privacy, action: null };
    if (has(t, AREA)) return { text: w.area, action: null };
    if (has(t, HOURS)) return { text: w.hours, action: null };
    if (has(t, CONTACT)) return { text: w.contact, action: null };
    if (has(t, THANKS)) return { text: w.thanks, action: null };
    if (has(t, GREETING)) return offerIf(estimator, w.greeting);
    return null;
  }

  // options: { estimatorEnabled, leadFormEnabled } (the form counts as on
  // unless leadFormEnabled is false).
  /**
   * @param {unknown} message what the visitor typed
   * @param {{ estimatorEnabled?: boolean, leadFormEnabled?: boolean }} [options]
   * @returns {ChatReply | null}
   */
  function reply(message, options) {
    options = options || {};
    var estimator = options.estimatorEnabled === true;
    var w = wording(estimator, options.leadFormEnabled !== false);
    if (!String(message || "").trim()) return null;
    var t = normalize(message);
    var fallback = { text: w.fallback, action: estimator ? "offerEstimate" : null };
    // Only emoji or symbols: still answer, never leave the visitor waiting.
    if (!t.trim()) return fallback;
    return (
      firstChecks(t, estimator, w) ||
      priceChecks(t, estimator, w, topicalAnswers(t, w)) ||
      generalChecks(t, estimator, w) ||
      fallback
    );
  }

  var api = { reply: reply };

  if (node) module.exports = api;
  else root.ChatReplies = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
