// Premium Restoration — scripted chat replies (no AI, no backend).
//
// Pure function: reply(message, { estimatorEnabled }) returns
//   { text, action }  where action is one of
//   "startEstimate"  — start the guided bathroom estimate (no text shown)
//   "offerEstimate"  — show the text, then an "estimate" button
//   null             — just show the text
//
// Matching is on whole words only (so "work" never matches "fireplace"-style
// substrings, and "fire" does not match "fireplaces"). Prices come from
// js/bathroom-pricing.js, the same published prices the estimate uses.
//
// Loads as a plain browser script (window.ChatReplies) and as a Node module.

(function (root, factory) {
  "use strict";
  var api = factory(root.BathroomPricing || (typeof require === "function" ? require("./bathroom-pricing.js") : null));
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ChatReplies = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Pricing) {
  "use strict";

  var PHONE = "(385) 356-8733";
  var EMAIL = "eduardo.moroni77@gmail.com";
  var PRICES = Pricing.DEFAULT_PRICES;
  var $ = Pricing.shortMoney;

  var CALL_FOR_PRICE = "Call " + PHONE + " or use the Contact page for a price.";
  var ESTIMATE_OFFER = "For a rough estimate of your whole job, tap the button below or say “bathroom quote”.";
  var PLUMBING_EXTRA =
    "Installing it also needs plumbing work, which isn't included in our online prices and will add to the cost.";

  function has(text, pattern) {
    return new RegExp(pattern).test(text);
  }

  // Lower-case, straight apostrophes removed ("don't" -> "dont"), and every
  // other non-letter/digit turned into a space.
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

  var IDENTITY = "\\b(human|real person|a person|robot|bot|ai|chatgpt|automated|are you real)\\b";
  var IDENTITY_REPLY =
    "I'm an automated assistant with scripted replies — not a person, and not AI. Nothing you type here is sent to or read by us. To reach a person, call " +
    PHONE +
    " or email " +
    EMAIL +
    ".";

  var OTHER_LANGUAGE =
    "[¿¡ñ]|\\b(hola|cuanto|cuánto|cuesta|precio|baño|bano|necesito|quiero|gracias|usted|ustedes|hacen|remodelar|bonjour|combien|salle|merci|vous|voudrais|prix)\\b";
  var OTHER_LANGUAGE_REPLY =
    "Sorry — this automated assistant only understands English. Lo sentimos, este asistente automático solo entiende inglés. " +
    "Désolé, cet assistant automatique ne comprend que l'anglais. Please call " +
    PHONE +
    ".";

  var DAMAGE =
    "\\b(water|fire|smoke|storm|flood|hail|wind|mold|mould)\\s+damage(d)?\\b|\\bflood(ed|ing|s)?\\b|\\bmou?ld(y)?\\b|\\bmildew\\b|\\bsewage\\b|\\basbestos\\b|\\b(damage|disaster)\\s+restoration\\b|\\bburst\\s+pipes?\\b";
  var DAMAGE_REPLY =
    "Sorry, we don't take on damage restoration (such as water, fire, smoke or mold damage), so we can't help with that. " +
    "We only do bathroom restorations — for a bathroom project without damage, say “bathroom quote” and I can give you a rough estimate.";

  var NOT_BATHROOM =
    "\\b(kitchens?|exteriors?|roof(s|ing)?|siding|stucco|decks?|fences?|gutters?|basements?|garages?|fireplaces?|chimneys?|driveways?|patios?|landscaping|pools?|hvac|furnaces?|bedrooms?|living room|whole (home|house)|entire (home|house)|full (home|house)|remodel my (home|house))\\b";
  var NOT_BATHROOM_REPLY =
    "Sorry, we currently only take on bathroom restorations — not kitchens, exteriors, roofing, other rooms, or damage restoration — so we can't help with that. " +
    "For a bathroom project, say “bathroom quote” and I can give you a rough estimate.";

  var FIXTURE_WORDS =
    "\\b(faucets?|taps?|toilets?|sinks?|showers?|tubs?|bathtubs?|pipes?|drains?|valves?|showerheads?)\\b";
  var PROBLEM_WORDS = "\\b(leak(s|y|ing|ed)?|drip(s|py|ping)?|clogged|blocked|running|broken|cracked|not working)\\b";
  var FIXTURE_PROBLEM_REPLY =
    "A leaking or broken faucet, toilet, sink, tub or shower is plumbing work. We can replace bathroom fixtures as part of a bathroom restoration, " +
    "but plumbing isn't included in our online prices and adds to the cost, and we do not currently hold a contractor licence. " +
    "Call " +
    PHONE +
    " to talk it through — we'll tell you who would do the plumbing and how it would be priced before any work is agreed. " +
    "(We don't take on water-damage restoration.)";

  var PRICE_WORDS = "\\b(price|prices|pricing|cost|costs|charge|charges|rate|rates|how much|fee|fees)\\b|\\$";

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
      // "floor|wall" consumed together with "tile" (not just as a separate
      // alternative) so the strip below removes both words — otherwise
      // "floor tile" leaves "floor" behind to also match the flooring
      // pattern later, producing two contradictory price lines in one
      // reply (flooring's own text says "tile floors are priced as tile").
      pattern: "\\b(?:floor|wall)\\s+(?:tile|tiles|tiling|tiled)\\b|\\b(?:tile|tiles|tiling|tiled)\\b",
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
      pattern: "\\b(bathtub|bathtubs|tub|tubs|bath tub)\\b",
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
  var TRADE_REPLY =
    "Our online prices and estimates don't include plumbing or electrical work, and toilets, sinks, showers, and bathtubs also need plumbing work, so expect it to add to the cost. " +
    "We do not currently hold a contractor licence. Tell us about your project on the Contact page and we'll tell you who will do that work and how it will be priced before any work is agreed.";

  var ESTIMATE = "\\b(estimate|estimates|quote|quotes|quotation|ballpark)\\b";

  var SERVICES =
    "\\b(what (work|services|kind of work|do you do|can you do|jobs)|services?|do you (do|offer|handle)|what do you (do|offer)|remodel(ing)?|renovat(e|ion|ions|ing)|restor(e|ation|ations|ing))\\b";
  var SERVICES_REPLY =
    "We do bathroom restorations: demolition, installing fixtures (toilets, sinks, showers, bathtubs, vanities, mirrors, doors and cabinets), " +
    "tile, flooring, and painting walls and ceilings. We don't take on kitchens, exteriors, roofing, or damage restoration. " +
    "Plumbing and electrical work isn't included in our online estimates and adds to the cost.";

  var LICENCE = "\\b(licen[cs]e[ds]?|insured|insurance|bonded|permits?)\\b";
  var LICENCE_REPLY =
    "We do not currently hold a contractor licence. Before any work is agreed, we'll tell you who will do any plumbing and electrical work, how it will be priced, " +
    "and whether your job needs any permits. Ask us anything else about this when you get in touch: " +
    PHONE +
    ".";

  var WARRANTY = "\\b(warrant(y|ies)|guarantee[ds]?)\\b";
  var WARRANTY_REPLY =
    "We don't advertise a standard warranty on this website. If you'd like one, ask us before you agree to the work, and make sure any warranty terms are given to you in writing.";

  var TIMELINE = "\\b(how long|timeline|time frame|timeframe|duration|weeks?|days?|start)\\b";
  var TIMELINE_REPLY =
    "It depends on the size of the bathroom and the work involved. We'll give you an expected timeline once we've seen the job — call " +
    PHONE +
    " or use the Contact page.";

  var PRIVACY = "\\b(privacy|personal data|delete my|my data|my information)\\b";
  var PRIVACY_REPLY =
    "Our Privacy Notice (linked at the bottom of every page) explains what we collect and how to ask us to access or delete your information.";

  var CONTACT = "\\b(contact|phone|call|email|e mail|reach|number|talk to)\\b";
  var CONTACT_REPLY =
    "You can reach us at " + PHONE + " or " + EMAIL + ", or use the form on our Contact page to send us your request.";

  var HOURS = "\\b(hours?|open|opening|available|availability|weekends?|schedule)\\b";
  var HOURS_REPLY =
    "Reach out through the Contact page or give us a call at " +
    PHONE +
    ", and we'll get back to you as soon as we can.";

  var AREA = "\\b(where|area|areas|located|location|serve|service area|cities|city)\\b";
  var AREA_REPLY =
    "Call " + PHONE + " or use the Contact page with your address and we'll tell you whether we can take on your job.";

  var PHOTOS =
    "\\b(gallery|photos?|pictures?|pics|examples?|portfolio|past (work|jobs|projects)|previous (work|jobs|projects))\\b";
  var PHOTOS_REPLY =
    "We don't have photos of our own completed projects online yet — we'd rather show nothing than someone else's work. Ask us about past jobs when you get in touch.";

  var GREETING = "^ (hi|hello|hey|hiya|good (morning|afternoon|evening))( there)? $";
  var GREETING_REPLY = "Hello! Ask me about our bathroom work or prices, or get a rough estimate of your bathroom job.";

  var THANKS = "\\b(thanks|thank you|thx|cheers)\\b";
  var THANKS_REPLY = "You're welcome! If you'd like to talk to a person, call " + PHONE + ".";

  var FALLBACK =
    "Sorry, I didn't understand that. I can answer questions about our bathroom work and prices, or give you a rough estimate. To talk to a person, call " +
    PHONE +
    " or use the Contact page.";
  var FALLBACK_NO_ESTIMATE =
    "Sorry, I didn't understand that. I can answer questions about our bathroom work. To talk to a person, call " +
    PHONE +
    " or use the Contact page.";

  function reply(message, options) {
    options = options || {};
    var estimator = options.estimatorEnabled === true;
    var t = normalize(message);
    if (!t.trim()) return null;

    function offer(text) {
      return estimator ? { text: text + " " + ESTIMATE_OFFER, action: "offerEstimate" } : { text: text, action: null };
    }

    if (has(t, IDENTITY)) return { text: IDENTITY_REPLY, action: null };
    if (has(t, OTHER_LANGUAGE)) return { text: OTHER_LANGUAGE_REPLY, action: null };
    if (has(t, DAMAGE)) return { text: DAMAGE_REPLY, action: null };
    if (has(t, NOT_BATHROOM)) return { text: NOT_BATHROOM_REPLY, action: null };
    if (has(t, FIXTURE_WORDS) && has(t, PROBLEM_WORDS)) return { text: FIXTURE_PROBLEM_REPLY, action: null };

    var matched = [];
    var matchedText = t;
    ITEMS.forEach(function (item) {
      var re = new RegExp(item.pattern);
      if (re.test(matchedText)) {
        matched.push(item.text());
        // "shower door" should not also answer "shower".
        matchedText = matchedText.replace(new RegExp(item.pattern, "g"), " ");
      }
    });
    if (matched.length) {
      if (!estimator) return { text: CALL_FOR_PRICE, action: null };
      return offer(matched.join(" "));
    }

    if (has(t, TRADE)) return { text: TRADE_REPLY, action: null };

    var bathroomPrice = has(t, "\\bbathrooms?\\b") && has(t, PRICE_WORDS);
    if (has(t, ESTIMATE) || bathroomPrice || has(t, PRICE_WORDS)) {
      if (!estimator) return { text: CALL_FOR_PRICE, action: null };
      return { text: null, action: "startEstimate" };
    }

    if (has(t, LICENCE)) return { text: LICENCE_REPLY, action: null };
    if (has(t, WARRANTY)) return { text: WARRANTY_REPLY, action: null };
    if (has(t, PHOTOS)) return { text: PHOTOS_REPLY, action: null };
    if (has(t, TIMELINE)) return { text: TIMELINE_REPLY, action: null };
    if (has(t, SERVICES) || has(t, "\\bbathrooms?\\b")) return offer(SERVICES_REPLY);
    if (has(t, PRIVACY)) return { text: PRIVACY_REPLY, action: null };
    if (has(t, AREA)) return { text: AREA_REPLY, action: null };
    if (has(t, HOURS)) return { text: HOURS_REPLY, action: null };
    if (has(t, CONTACT)) return { text: CONTACT_REPLY, action: null };
    if (has(t, THANKS)) return { text: THANKS_REPLY, action: null };
    if (has(t, GREETING)) return offer(GREETING_REPLY);

    return estimator ? { text: FALLBACK, action: "offerEstimate" } : { text: FALLBACK_NO_ESTIMATE, action: null };
  }

  return {
    reply: reply,
    normalize: normalize,
    CALL_FOR_PRICE: CALL_FOR_PRICE,
    PHONE: PHONE,
    EMAIL: EMAIL,
  };
});
