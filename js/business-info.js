// Premium Restoration — the ONE copy of the business's contact details and
// the wording that identifies who runs it.
//
// Used by every script (chat replies, the public estimate PDF, the contact
// form, the admin quote PDF) and by scripts/sync-pages.mjs, which writes the
// phone number and email address into every page (elements marked
// data-contact="phone" or data-contact="email"). To change a detail: edit it
// here, run `npm run pages`, and commit. See README "Contact info".
//
// Loads as a plain browser script (window.BusinessInfo) and as a Node module.

(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BusinessInfo = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NAME = "Premium Restoration";
  var PHONE = "(385) 356-8733";
  var EMAIL = "eduardo.moroni77@gmail.com";

  // "tel:" link for a US number written any way, e.g. (385) 356-8733 -> tel:+13853568733.
  function phoneHref(phone) {
    var digits = String(phone).replace(/\D/g, "");
    if (digits.length === 10) digits = "1" + digits;
    return "tel:+" + digits;
  }

  // Who runs the business, as printed on every PDF. legalName comes from
  // site-config.json (owner.legalName); blank = no name is shown.
  function businessLine(legalName) {
    var name = typeof legalName === "string" ? legalName.trim() : "";
    return NAME + ", operated by " + (name ? name + ", " : "") + "an individual (not a registered company)";
  }

  return {
    NAME: NAME,
    PHONE: PHONE,
    EMAIL: EMAIL,
    PHONE_HREF: phoneHref(PHONE),
    EMAIL_HREF: "mailto:" + EMAIL,
    phoneHref: phoneHref,
    businessLine: businessLine,
  };
});
