# Premium Restoration — Website Template

A blank starting template for the Premium Restoration website. Plain HTML/CSS/JS — no build step, no framework, so it's easy to hand off, edit, or deploy anywhere.

## Pages

- `index.html` — Home
- `gallery.html` — Our Work (currently empty: the previous stock/watermarked images were removed; see "Gallery photos" below)
- `about.html` — About Us
- `faq.html` — FAQs (bathroom-only answers; no warranty or experience claims)
- `contact.html` — Get a Quote (opens the visitor's email app; see "Contact / lead form" below)
- `privacy.html` — Privacy Notice (linked from every footer)
- `terms.html` — Terms of Use, incl. estimate disclaimer, third-party licences and accessibility contact (linked from every footer)
- `admin/index.html` — Internal restoration quoting tool (password-gated, not linked from the public nav)

The site says "Get a Quote" / "Request a Quote", not "Free Quote": nothing confirms quotes are always free. Only bring "free" back once the owner confirms it.

## Structure

```
premium-restoration/
├── index.html
├── gallery.html
├── about.html
├── faq.html
├── contact.html
├── privacy.html
├── terms.html
├── admin/index.html
├── css/style.css
├── css/admin.css
├── js/script.js
├── js/admin.js
├── js/bathroom-pricing.js
├── fonts/               (self-hosted Inter + Playfair Display, with OFL licence texts)
└── images/
```

## Public chat quote assistant

The chat widget on the home page (between the hero and "What We Do") is front-end only — no AI, no backend, no API key. It's keyword-matched scripted responses and it tells visitors so (greeting, section subtitle, and an honest answer if asked "are you a person / AI?"). Don't market it as AI. **One real feature**: click "Get a bathroom price estimate" (or type something like "bathroom quote") and it walks the visitor through a scripted flow, then computes and shows an itemized, non-binding **labor-only** estimate. The public estimate prices **only the work the visitor explicitly chooses** (demolition, floor tile / other flooring / none, wall tile, wall paint, ceiling paint — nothing pre-selected, every question must be answered), shows each line's quantity × rate, and lists its assumptions (floor/wall area formulas, full-height walls with no deductions, what's excluded) on screen and in the PDF. **Plumbing and electrical work is not priced on the public site** (no plumbing points, electrical points, no-stack or bad-valve surcharges) until the licence position is confirmed — see "Licence line" below. The site no longer says plumbing/electrical is "not offered" (the admin tool does charge for it); instead every page, the estimate card and the PDF say it is **not included and will add to the cost**, and that toilets, sinks, showers and bathtubs need plumbing work. When the visitor lists any of those fixtures, the estimate card shows an extra "Plumbing for the N … item(s) you listed — Extra, not included" line (`PLUMBING_NOTE` / `plumbingFixtureCount` in `js/script.js`). If the owner decides how plumbing is handled (in-house with a licence, a named licensed subcontractor, or not at all), update that wording everywhere (`grep -rni plumb *.html js/script.js`). When fixtures that need plumbing are listed, the total is labelled "Estimated Labor Total, before plumbing" and a note under it (card and PDF) says it is not the full cost because plumbing for those items will be added (`totalLabel` / `plumbingTotalNote`). The plumbing amount itself is deliberately not shown publicly while there is no contractor licence. The public estimate shows **no tax line** (Utah generally treats labor on real property as not subject to sales tax — get tax advice before adding one back) and ends in an "Estimated Labor Total" with a not-a-quote disclaimer. Out-of-scope requests (kitchen, exterior, roofing, damage, mold, etc.) get a "bathrooms only" reply, and that check runs **before** every other keyword, so "water damage in my bathroom" or "kitchen quote" never gets a bathroom answer.

**Fullscreen:** the moment someone starts using the chat (focuses the input, or taps the quote-estimate suggestion), it expands to fill the whole screen so the conversation is the only thing visible, with an "×" button (or Escape) to close it and go back to browsing the page.

**Grouped mini-forms, not one question at a time:** the estimate flow asks for related fields together as a small fillable form embedded right in the chat bubble — one form for room dimensions (width/length/height), one for the work the job needs (5 choice questions, nothing pre-selected), and one for every fixture count (toilets, sinks, showers, etc. — 11 fields at once). A progress bar with a percentage (not "3/17") shows how close the visitor is to their estimate. "Cancel" on any form stops it.

**The finished estimate is a styled card**, not plain text — itemized lines (each with quantity × rate), "Not included" lines, a bold Estimated Labor Total band, a "What this estimate assumes" list, plus two buttons: **"Export as PDF"** (downloads a formatted PDF of the estimate, generated client-side with jsPDF — no backend involved) and **"Contact Us About This →"** (links to the Contact page). jsPDF is fetched from cdnjs **only when the visitor clicks Export** (no third-party script on normal page views); the PDF-building logic is `exportEstimateAsPdf()` in `js/script.js`. The PDF carries the business identity (with the `[OWNER LEGAL NAME]` placeholder) in `BUSINESS_IDENTITY`, the `ESTIMATE_DISCLAIMER` text and the same assumptions list.

That math comes from `js/bathroom-pricing.js` (`computePublicEstimate`), using the same prices as the admin quoting tool — the two are built from one shared file so they can never drift apart. The chat estimate always uses `DEFAULT_PRICES` from `js/bathroom-pricing.js` — it deliberately ignores prices saved under `pr_business_rates` from the admin screen, so every visitor (including staff browsers) sees the same published figures. If you change a price under Business Prices, also change `DEFAULT_PRICES` (and the $60 / $5 figures on `index.html`, `faq.html`, `terms.html` and in the chat replies) if the public prices should change too. The admin dashboard and the bathroom quote form show a warning listing every saved price that differs from the published `DEFAULT_PRICES` (plumbing, electrical and tax are not published, so they are not compared), so staff quotes don't silently drift from what the website advertises.

This shows visitors your actual live prices in real time. If that's not what you want, the trigger and math live in `js/script.js` (`getBotReply`, `startBathroomQuote`, `BATHROOM_QUOTE_GROUPS`) — easy to disable or change to "we'll follow up" instead of showing a number.

## Admin quoting tool

Visit `/admin/` (e.g. `http://localhost:8000/admin/`, or open `admin/index.html` directly) to access an internal tool for building restoration quotes: log in, click "Create New Quote," enter a property address, pick a category, then fill out the category-specific fields that appear.

**Only Bathroom is enabled right now.** Exterior, Kitchen, and Flooring are marked with a "Coming Soon!" banner and their checkboxes are disabled on the category screen, since they don't have real pricing calculators yet (just unused scope-checklist code left in `admin.js` for later). To re-enable one, remove its `coming-soon` class/banner span and the checkbox's `disabled` attribute in `admin/index.html`.

**Bathroom category has a real labor price calculator**, using **flat per-unit prices** — quantity × a single $ price per item, live-computed as you type, built directly from the real pricing the business owner walked through (a 4×8 bathroom example job). No hours, no hourly rates: that's how this business actually charges.

**The bathroom calculator is intentionally limited to exactly the charges the business owner specified — nothing more.** It's grouped into 5 sections: Preparation (Demolition), Fixtures (Toilet, Sink, Bathtub, Shower, Shower Door, Entry Door, Vanity, Cabinets, Mirror standard/huge, Shower Shelf), Surfaces (Tile, Floor, Painting), Plumbing, and Electrical — with a running total banner. Line items that aren't part of the owner's list (e.g. Removal, Drying, Faucet, Countertop, Drywall, Ceiling, Trim, damage restoration, cleanup/reinstallation) were deliberately removed — don't add anything back in without new pricing info from the owner.

The total banner shows **Subtotal → Tax → Total**. The tax rate (`Labor_Tax_Rate_Percent`) defaults to **0%**: labor on real property may not be taxable (e.g. Utah Admin. Code R865-19S-58), so leave it at 0 unless a tax adviser confirms otherwise. It was renamed from `Tax_Rate_Percent`, so an old 7.45% saved in a browser is no longer used. Any rate you set under Business Prices is added to every bathroom quote's subtotal, and the dashboard's quote chip shows the tax-inclusive Total.

Click **"Business Prices"** on the dashboard to set the flat $ price for every bathroom line item, plus the tax rate — configured once, reused for every quote.

A few line items work a little differently:
- **Bathtub** — not set directly; it's always calculated as 30% less than the current Shower price.
- **Tile** — one combined price per sq ft, applied to bathroom floor sq ft + wall sq ft together (no ceiling).
- **Painting** — one combined price per sq ft, applied to bathroom (ceiling) sq ft + wall sq ft together (no floor).
- **Floor** — $5 per sq ft of bathroom floor, per the owner's stated price (replaced the old flat $500 / $700 tiers).
- **Plumbing** — priced per "point of entry," counted automatically from the toilets, sinks, showers, and bathtubs you've already entered under Fixtures (no separate count to type), plus two optional flat surcharges: no existing plumbing stack, and a bad valve that needs replacing.
- **Bathroom Dimensions** — type the room's width, length, and height once at the top of the Bathroom section, and floor/ceiling sq ft and wall sq ft are calculated automatically and reused everywhere they're needed (Demolition, Tile, Floor, Painting).
- **Electrical** — a single flat price per "point of electrical entry" (lamps, outlets, fans, fan switches, light switches, an electric toilet — each counts as one point).
- **Entry Door** vs. **Shower Door** — two separate line items: the literal door into the bathroom, and the shower's own door, priced differently.
- **Mirror** — split into a standard-size line item and a separate huge/oversized line item, since those price differently.

**Note on the standalone terminal tool** (`quote_calculator.py`, in the "Restoration Quote Calculator" folder): it intentionally still uses the original hours × labor-rate model from `labor_cost_breakdown.xlsx` and was left as-is. The website's bathroom calculator and the terminal tool are two separate pricing structures now — they won't produce matching totals for the same job, by design.

**Important limitations, since there's no backend yet:**

- **Password gate is client-side only.** The password lives in plain text in `js/admin.js` — anyone who views the page source can read it and skip the login screen entirely. This only deters casual access; it is not real security. Don't put sensitive data behind this until there's a real backend with server-side auth.
- **Quotes and business prices are saved to the browser's local storage**, not a server. That means: data stays only on the device/browser it was entered on, clearing browser data deletes it, and it does not sync across devices or team members. A saved quote can be reopened via "View / Edit" from the dashboard, or removed with "Delete."
- To change the admin password, edit the `ADMIN_PASSWORD` constant near the top of `js/admin.js`.
- The bathroom calculator only prices **labor** — it doesn't include materials, overhead, permits, or profit margin, same as the spreadsheet it's based on.
- **The public chat quote assistant publishes your real bathroom prices** to anyone who visits the site and uses it (including competitors) — unlike the admin tool, it isn't password-gated. See "Public chat quote assistant" above if you'd rather it not show a live number.

**Retention:** each quote shows its created/updated dates. The owner keeps enquiries for about a month, so `QUOTE_RETENTION_DAYS` near the top of `js/admin.js` is set to 30 and the Privacy Notice says "about a month"; change both together. The dashboard flags quotes not updated within that period and offers "Delete Quotes Past Retention" (only use it for quotes that didn't lead to work). Each purge is logged with its date and count, and "Record Monthly Clean-Up" logs the date the whole monthly routine was done; the dashboard shows the last of each. That log (`pr_retention_log`) holds only dates and counts, and like quotes it lives only in that browser.

## Retention and privacy requests routine

The Privacy Notice says enquiries that don't lead to work (emails, and any quote prepared for them) are kept for **about a month** after the last contact and then deleted by hand. That promise is only true if the routine below actually runs. No period is set for customer records yet; the period-based wording with `[CUSTOMER RECORD RETENTION PERIOD]` is kept in an HTML comment in `privacy.html`. The response time for requests is still `[PRIVACY RESPONSE PERIOD]`, shown as a visible placeholder on the Privacy Notice until the owner gives it.

1. **Every few weeks, and at least monthly** (put a recurring calendar reminder in place): open `/admin/` in every browser that holds quotes and delete quotes past retention; delete Gmail enquiries, voicemails and text messages (and any offline notes) about jobs that didn't go ahead once they are about a month old; once `[CUSTOMER RECORD RETENTION PERIOD]` is set, delete customer records past it unless the law requires keeping them. Then press "Record Monthly Clean-Up" on the dashboard, and also note the date in the business's own records (the admin log is per browser, so it is not the whole record).
2. **Every privacy request** (email subject "Privacy request", or by phone): respond within `[PRIVACY RESPONSE PERIOD]`. The Privacy Notice gives examples of how identity may be confirmed (contacting us from the email address or phone number used before, or confirming details of the enquiry). Logging each request in a private spreadsheet (not in this public repo: date received, who asked, how identity was confirmed, what was found, action taken, date closed) is recommended. The Privacy Notice does not promise a log; only add that promise once the log exists.

## Licence line

The owner has confirmed there is **no contractor licence** at the moment. The site says so plainly ("We do not currently hold a contractor licence" on the home page services section, the FAQ and the Terms) and no longer says licences are "confirmed" before work, which could read as holding one. Fixture installation (toilets, sinks, showers, bathtubs) is still advertised and priced at the owner's request, with wording that plumbing is extra and that, before any work is agreed, the customer is told who will do the plumbing and electrical work, how it is priced and whether permits are needed — make sure that actually happens. Whether this work may be advertised and done without a licence is a question for a lawyer (see the legal review); the site's wording must follow the owner's decision.

The admin quote form shows a "No contractor licence is currently held" note in the Fixtures, Plumbing and Electrical sections, and a job-value note under the total. The note compares labor with the $3,000 and $7,000 checkpoints the legal review raised under Utah Code 58-55-305(1)(h) (`JOB_VALUE_CHECKPOINTS` in `js/admin.js`; Utah is inferred, not confirmed). These notes are warnings only: no price or line item changes. Materials count toward those checkpoints but are never in the calculator, so add them before comparing.

If someone other than the business does part of a job (for example a plumber or electrician), the Privacy Notice says the customer's details needed for that work are shared with them, and that the customer is told who they are before any work is agreed.

There is no licence number, so the "Contractor License #" line stays out of every footer, `terms.html` and the PDF estimate. Only if a licence is actually issued, add the commented-out line back in each footer and in `terms.html`, set `BUSINESS_IDENTITY.license` in `js/script.js`, and remove the "do not currently hold a contractor licence" sentences.

## Business identity

Premium Restoration is currently an **unregistered business run by one individual**: no LLC or other entity, no registered business name and no registered address. The Privacy Notice, Terms, every footer and the PDF say this, and name the operator as `[OWNER LEGAL NAME]` with contact address `[OWNER CONTACT ADDRESS]`. If the business is registered later, update all of them (and the "unregistered" wording) at once.

## Running locally

No build tools needed. Either open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying

Any static host works (GitHub Pages, Netlify, Vercel, S3, etc.). For GitHub Pages: Settings → Pages → deploy from the `main` branch, root directory.

## Contact / lead form — next steps

The form on `contact.html` (`#lead-form`) has **no backend**. On submit it opens the visitor's own email app with a pre-filled message to the business address and tells them plainly that nothing is received until they press Send. It never claims a request "has been received". If you wire it to a service instead, also update the "How this form works" notice on `contact.html` and the Privacy Notice (who receives the data, where it's stored, how long) **before** switching over. Options:

- **Netlify Forms** — add `data-netlify="true"` and a hidden `form-name` input if hosting on Netlify (no backend needed).
- **Formspree / Basin / etc.** — point the form's `action` at their endpoint (no backend needed).
- **Custom backend** — replace the JS in `js/script.js` with a `fetch()` call to your own API, which emails/stores the lead.

## Editing content

- Company name, contact info, and nav are repeated at the top/bottom of each HTML page (no templating layer yet) — update all seven public pages (and the placeholders listed below) if you change them.
- Colors and spacing are controlled by CSS variables at the top of `css/style.css`.
- Contact info currently set to: **(385) 356-8733** / **eduardo.moroni77@gmail.com**.

## Gallery photos

The six original gallery images were removed: several carried third-party watermarks or logos (e.g. a "dreamstime" watermark, a stock-library ID) and were presented as "projects we've completed". Only add photos that are either your own completed projects (with the client's written permission) or licensed images clearly captioned as illustrative. Record the source/licence of every image here. A commented template is in `gallery.html`.

## Placeholders to fill in before launch

These bracketed placeholders appear on the public site and must be replaced consistently in every file (`grep -rn "\[" --include=*.html --include=*.js .`):

- `[OWNER LEGAL NAME]` — footer of every page, `privacy.html`, `terms.html`, PDF estimate (`js/script.js` `BUSINESS_IDENTITY`)
- `[OWNER CONTACT ADDRESS]` — footer of every page, `privacy.html`, `terms.html`
- `[PRIVACY RESPONSE PERIOD]` — `privacy.html` (visible)
- `[CONTRACTOR LICENSE #]`, `[LICENSE CLASSIFICATION]` — only in HTML/code comments; there is no licence, see "Licence line" above
- `[GOVERNING STATE]` — only in an HTML comment in `terms.html`; the governing-law clause is hidden until the owner confirms the state
- `[CUSTOMER RECORD RETENTION PERIOD]` — only in an HTML comment in `privacy.html`

The Privacy Notice and Terms show a "Last updated" date (currently September 24, 2026). Change it whenever either page's wording changes.
