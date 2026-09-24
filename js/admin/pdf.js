// Premium Restoration admin tool — Customer-ready PDF of a saved quote (same style as the public estimate).
//
// Part of the admin tool (js/admin/*.js, loaded in order by admin/index.html);
// the parts share one namespace, window.PRAdmin (A). Functions from other
// parts are called as A.name(...), so load order only matters for set-up.

(function (A) {
  "use strict";

  // ------------------------------------------------------------------
  // Customer-ready PDF of a saved quote (same style as the public estimate)
  // ------------------------------------------------------------------
  /**
   * @param {Quote} quote
   * @param {HTMLButtonElement} button
   */
  function downloadQuotePdf(quote, button) {
    if (!A.pricesReady()) return;
    var bathroom = quote.data.bathroom;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    Promise.all([window.EstimatePdf.load(), A.configReady])
      .then(function (loaded) {
        var config = loaded[1];
        var values = bathroom.jobValues || {};
        var scope = bathroom.scope || {};
        var prices = Object.assign({}, A.Pricing.DEFAULT_PRICES, bathroom.prices || {});
        var result = A.Pricing.computeEstimate(values, scope, { prices: prices, includeTrade: true });
        /** @type {NonNullable<PdfSpec["totals"]>} */
        var totals = [{ label: "Labor subtotal", value: A.money(result.subtotal) }];
        if (result.taxRatePercent > 0) {
          totals.push({ label: "Tax (" + result.taxRatePercent + "%)", value: A.money(result.taxAmount) });
        }
        totals.push({ label: "Estimated Labor Total", value: A.money(result.total), strong: true });
        var Pdf = window.EstimatePdf;
        var customer = A.cleanCustomer(quote.customer);
        var issued = new Date();
        var until = Pdf.heldUntil(issued, config && config.estimates ? config.estimates.validForDays : null);
        var reference = Pdf.quoteReference(quote);
        var doc = Pdf.build({
          title: "Bathroom Restoration — Labor Estimate",
          reference: reference,
          issued: issued,
          heldUntil: until,
          preparedFor: [customer.name, quote.address].filter(Boolean).join(", "),
          contact: [customer.phone, customer.email].filter(Boolean).join("  ·  "),
          intro: "Labor estimate for the work listed below.",
          lines: result.lines.map(function (/** @type {PricingLine} */ l) {
            return { label: l.label, detail: l.detail, amount: A.money(l.cost) };
          }),
          excluded: [
            {
              label: "Materials, permits" + (result.taxRatePercent > 0 ? "" : " & any applicable taxes"),
              value: "Not included",
            },
          ],
          totals: totals,
          afterTotal: [
            "This is an estimate of labor only, for the work listed. It is not a contract. Materials and permits are not included" +
              (result.taxRatePercent > 0 ? "" : ", and neither are any applicable taxes") +
              ". " +
              Pdf.withHeldUntil("Prices are current as of the date generated and may change.", until) +
              " Your actual price is set only in a written agreement with us.",
            "We do not currently hold a contractor licence. Before any work is agreed, we will tell you who will do any plumbing and electrical work, how it will be priced, and whether your job needs any permits.",
          ],
          sections: [
            { title: "What this estimate assumes", items: A.Pricing.estimateAssumptions(values, scope, result) },
          ],
          footer: {
            business: A.Business.businessLine(config && config.owner.legalName),
            phone: A.Business.PHONE,
            email: A.Business.EMAIL,
          },
        });
        doc.save(
          "estimate-" +
            quote.address
              .replace(/[^a-z0-9]+/gi, "-")
              .replace(/^-|-$/g, "")
              .toLowerCase() +
            "-" +
            reference +
            ".pdf",
        );
      })
      .catch(function () {
        A.alertError("The PDF couldn't be prepared. Check your connection and try again.");
      })
      .then(function () {
        button.disabled = false;
        button.textContent = label;
      });
  }

  // Used by the other parts of the admin tool.
  A.downloadQuotePdf = downloadQuotePdf;
})((window.PRAdmin = window.PRAdmin || /** @type {AdminNamespace} */ ({ state: {} })));
