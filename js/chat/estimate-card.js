// Premium Restoration chat — the finished estimate card and its PDF.
//
// The card leads with the total, then the itemised lines, what isn't
// included, the full disclaimer and what the estimate assumes. The legal
// wording here (plumbing and electrical not included and adding to the cost,
// not a quote/offer/contract) must be kept.
//
// Part of the chat (js/chat/*.js, see core.js); shares window.PRChat (C).

(function (C) {
  "use strict";

  var PLUMBING_NOTE =
    "Plumbing and electrical work is not included. Toilets, sinks, showers, and bathtubs also need plumbing work, " +
    "so if you listed any, or your job needs other plumbing or electrical work, expect it to add to the cost. " +
    "We'll tell you how it will be handled and priced before any work is agreed.";

  var ESTIMATE_DISCLAIMER =
    "This is an automated, non-binding estimate of labor only, based only on the measurements, counts, and " +
    "choices you entered and the assumptions listed with it. It is not a quote, offer, or contract. It excludes " +
    "plumbing and electrical work (including the plumbing any toilets, sinks, showers, or bathtubs need), " +
    "materials, permits, and any applicable taxes, which will add to the cost where your job needs them. " +
    "Prices are current as of the date generated and may change. Your actual price is set only in a " +
    "written agreement after we review your project in person.";

  function Pricing() {
    return window.BathroomPricing;
  }

  function totalLabel(fixtureCount) {
    return fixtureCount > 0 ? "Estimated Labor Total, before plumbing" : "Estimated Labor Total";
  }

  function plumbingTotalNote(fixtureCount) {
    return (
      "This is not the full cost of your job: plumbing work for the " +
      Pricing().formatQty(fixtureCount) +
      " toilet/sink/shower/bathtub item(s) you listed will be added on top of this total."
    );
  }

  function excludedLines(fixtureCount) {
    var list = [];
    if (fixtureCount > 0) {
      list.push({
        label:
          "Plumbing for the " + Pricing().formatQty(fixtureCount) + " toilet/sink/shower/bathtub item(s) you listed",
        value: "Extra — not included",
      });
    }
    list.push({
      label: (fixtureCount > 0 ? "Any other plumbing" : "Plumbing") + " & electrical work",
      value: "Extra — not included",
    });
    list.push({ label: "Materials, permits & any applicable taxes", value: "Not included" });
    return list;
  }

  function allAssumptions(values, scope, result) {
    return Pricing()
      .estimateAssumptions(values, scope, result)
      .concat([PLUMBING_NOTE, "Also not included: materials, permits, and any applicable taxes."]);
  }

  function businessLine() {
    var config = C.state.config;
    return window.BusinessInfo.businessLine(config && config.owner.legalName);
  }

  function cardHeader(result) {
    var fixtureCount = result.plumbingFixtureCount;
    var money = Pricing().money;
    var fragment = document.createDocumentFragment();
    var head = C.el("div", "ai-chat-estimate-header");
    head.appendChild(C.el("p", "eyebrow", "Your Estimate"));
    head.appendChild(C.el("h3", null, "Bathroom Restoration"));
    head.appendChild(C.el("p", "ai-chat-estimate-lede", "Rough, non-binding labor estimate — details below."));
    fragment.appendChild(head);

    // The total comes straight after the heading, so both are on screen
    // when the card appears; the itemised lines follow.
    var totalWrap = C.el("div", "ai-chat-estimate-total");
    totalWrap.setAttribute("tabindex", "-1");
    totalWrap.setAttribute("role", "group");
    totalWrap.setAttribute("aria-label", totalLabel(fixtureCount) + ": " + money(result.subtotal));
    totalWrap.appendChild(C.el("span", "ai-chat-estimate-total-label", totalLabel(fixtureCount)));
    totalWrap.appendChild(C.el("span", "ai-chat-estimate-total-value", money(result.subtotal)));
    fragment.appendChild(totalWrap);
    if (fixtureCount > 0)
      fragment.appendChild(C.el("p", "ai-chat-estimate-total-note", plumbingTotalNote(fixtureCount)));
    return { fragment: fragment, total: totalWrap };
  }

  function cardLines(result) {
    var money = Pricing().money;
    var lines = C.el("div", "ai-chat-estimate-lines");
    result.lines.forEach(function (r) {
      var line = C.el("div", "ai-chat-estimate-line");
      var labelWrap = C.el("span", null, r.label + " ");
      labelWrap.appendChild(C.el("small", "ai-chat-estimate-detail", r.detail));
      line.appendChild(labelWrap);
      line.appendChild(C.el("span", "ai-chat-estimate-amount", money(r.cost)));
      lines.appendChild(line);
    });
    return lines;
  }

  function cardExcluded(fixtureCount) {
    var excluded = C.el("div", "ai-chat-estimate-excluded");
    excludedLines(fixtureCount).forEach(function (x) {
      var line = C.el("div", "ai-chat-estimate-line muted");
      line.appendChild(C.el("span", null, x.label));
      line.appendChild(C.el("span", null, x.value));
      excluded.appendChild(line);
    });
    return excluded;
  }

  function cardAssumptions(assumptions) {
    var wrap = C.el("div", "ai-chat-estimate-assumptions");
    wrap.appendChild(C.el("p", "ai-chat-estimate-assumptions-title", "What this estimate assumes"));
    var list = C.el("ul");
    assumptions.forEach(function (a) {
      list.appendChild(C.el("li", null, a));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function cardActions(estimate, pdfStatus) {
    var actions = C.el("div", "ai-chat-estimate-actions");
    var exportBtn = C.el("button", "ai-chat-estimate-export", "Export as PDF");
    exportBtn.type = "button";
    exportBtn.addEventListener("click", function () {
      exportPdf(exportBtn, pdfStatus, estimate);
    });
    actions.appendChild(exportBtn);

    actions.appendChild(nextStepLink(estimate));
    return actions;
  }

  // The next step after an estimate: the Get a Quote form, carrying the
  // estimate with it (every link to that page is labelled "Get a Quote"), or
  // in "please call us" mode the phone number.
  function nextStepLink(estimate) {
    var Business = window.BusinessInfo;
    if (!C.leadFormEnabled()) {
      var call = C.el("a", "ai-chat-estimate-cta", "Call " + Business.PHONE + "\u00a0→");
      call.href = Business.PHONE_HREF;
      return call;
    }
    var cta = C.el("a", "ai-chat-estimate-cta", "Get a Quote\u00a0→");
    cta.href = "contact.html?from=estimate";
    cta.addEventListener("click", function () {
      C.saveSummary(Pricing().buildEstimateSummary(estimate.values, estimate.scope, estimate.result));
    });
    return cta;
  }

  // options.restored: shown after a reload, so focus isn't moved.
  function appendEstimateCard(values, scope, options) {
    options = options || {};
    var result = Pricing().computePublicEstimate(values, scope);
    var estimate = { values: values, scope: scope, result: result, assumptions: allAssumptions(values, scope, result) };

    var parts = C.botRow();
    var content = C.el("div", "ai-chat-text");
    var card = C.el("div", "ai-chat-estimate");
    card.setAttribute("data-testid", "estimate-card");
    var header = cardHeader(result);
    card.appendChild(header.fragment);
    card.appendChild(cardLines(result));
    card.appendChild(cardExcluded(result.plumbingFixtureCount));
    card.appendChild(C.el("p", "ai-chat-estimate-disclaimer", ESTIMATE_DISCLAIMER));
    card.appendChild(cardAssumptions(estimate.assumptions));
    var pdfStatus = C.el("p", "ai-chat-estimate-pdf-status");
    pdfStatus.setAttribute("role", "status");
    pdfStatus.hidden = true;
    card.appendChild(cardActions(estimate, pdfStatus));
    card.appendChild(pdfStatus);

    content.appendChild(card);
    parts.inner.appendChild(content);
    C.els.messages.appendChild(parts.row);
    if (options.restored) return; // don't move focus or scroll the page on load
    showCardTop(parts.row);
    // Screen readers hear the total first; Tab then moves on to the card's buttons.
    C.focusQuietly(header.total);
  }

  // Scrolls the chat so the top of a new estimate card (its heading and
  // total) is in view, rather than the end of the card.
  function showCardTop(row) {
    var messages = C.els.messages;
    var gap = 12;
    var offset = row.getBoundingClientRect().top - messages.getBoundingClientRect().top;
    messages.scrollTop = Math.max(0, messages.scrollTop + offset - gap);
    if (!C.isFullscreen() && row.scrollIntoView) row.scrollIntoView({ block: "start" });
  }

  function pdfSpec(estimate) {
    var money = Pricing().money;
    var result = estimate.result;
    var fixtureCount = result.plumbingFixtureCount;
    var Business = window.BusinessInfo;
    return {
      title: "Bathroom Restoration — Labor Estimate",
      intro: "Rough, non-binding labor estimate.",
      lines: result.lines.map(function (r) {
        return { label: r.label, detail: r.detail, amount: money(r.cost) };
      }),
      excluded: excludedLines(fixtureCount),
      totals: [{ label: totalLabel(fixtureCount), value: money(result.subtotal), strong: true }],
      afterTotal: (fixtureCount > 0 ? [plumbingTotalNote(fixtureCount)] : []).concat([ESTIMATE_DISCLAIMER]),
      sections: [{ title: "What this estimate assumes", items: estimate.assumptions }],
      footer: {
        business: businessLine(),
        phone: Business.PHONE,
        email: Business.EMAIL,
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      },
    };
  }

  function exportPdf(button, status, estimate) {
    if (button.disabled) return;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    status.hidden = true;
    status.textContent = "";
    window.EstimatePdf.load()
      .then(function () {
        window.EstimatePdf.build(pdfSpec(estimate)).save("premium-restoration-bathroom-estimate.pdf");
        button.disabled = false;
        button.textContent = label;
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = "Retry PDF";
        status.hidden = false;
        status.textContent = "Sorry, the PDF couldn't be prepared. Check your connection and press Retry PDF.";
        C.track("ESTIMATE_PDF_FAILED");
        status.classList.add("is-error");
      });
  }

  // Used by the other parts of the chat.
  C.appendEstimateCard = appendEstimateCard;
})((window.PRChat = window.PRChat || { state: {} }));
