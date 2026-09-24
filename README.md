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

The chat widget on the home page (between the hero and "What We Do") is front-end only — no AI, no backend, no API key. It's keyword-matched scripted responses and it tells visitors so (greeting, section subtitle, and an honest answer if asked "are you a person / AI?"). Don't market it as AI. **One real feature**: click "Get a bathroom price estimate" (or type something like "bathroom quote") and it walks the visitor through a scripted flow, then computes and shows an itemized, non-binding **labor-only** estimate. The public estimate prices **only the work the visitor explicitly chooses** (demolition, floor tile / other flooring / none, wall tile, wall paint, ceiling paint — nothing pre-selected, every question must be answered), shows each line's quantity × rate, and lists its assumptions (floor/wall area formulas, full-height walls with no deductions, what's excluded) on screen and in the PDF. **Plumbing and electrical work is not priced on the public site** (no plumbing points, electrical points, no-stack or bad-valve surcharges) until the licence position is confirmed — see "Licence line" below. The site no longer says plumbing/electrical is "not offered" (the admin tool does charge for it); instead every page, the estimate card and the PDF say it is **not included and will add to the cost**, and that toilets, sinks, showers and bathtubs need plumbing work. When the visitor lists any of those fixtures, the estimate card shows an extra "Plumbing for the N … item(s) you listed — Extra, not included" line (`PLUMBING_NOTE` / `plumbingFixtureCount` in `js/script.js`). If the owner decides how plumbing is handled (in-house with a licence, a named licensed subcontractor, or not at all), update that wording everywhere (`grep -rni plumb *.html js/script.js`). The public estimate shows **no tax line** (Utah generally treats labor on real property as not subject to sales tax — get tax advice before adding one back) and ends in an "Estimated Labor Total" with a not-a-quote disclaimer. Out-of-scope requests (kitchen, exterior, roofing, damage, mold, etc.) get a "bathrooms only" reply, and that check runs **before** every other keyword, so "water damage in my bathroom" or "kitchen quote" never gets a bathroom answer.

**Fullscreen:** the moment someone starts using the chat (focuses the input, or taps the quote-estimate suggestion), it expands to fill the whole screen so the conversation is the only thing visible, with an "×" button (or Escape) to close it and go back to browsing the page.

**Grouped mini-forms, not one question at a time:** the estimate flow asks for related fields together as a small fillable form embedded right in the chat bubble — one form for room dimensions (width/length/height), one for the work the job needs (5 choice questions, nothing pre-selected), and one for every fixture count (toilets, sinks, showers, etc. — 11 fields at once). A progress bar with a percentage (not "3/17") shows how close the visitor is to their estimate. "Cancel" on any form stops it.

**The finished estimate is a styled card**, not plain text — itemized lines (each with quantity × rate), "Not included" lines, a bold Estimated Labor Total band, a "What this estimate assumes" list, plus two buttons: **"Export as PDF"** (downloads a formatted PDF of the estimate, generated client-side with jsPDF — no backend involved) and **"Contact Us About This →"** (links to the Contact page). jsPDF is fetched from cdnjs **only when the visitor clicks Export** (no third-party script on normal page views); the PDF-building logic is `exportEstimateAsPdf()` in `js/script.js`. The PDF carries the business identity placeholders in `BUSINESS_IDENTITY`, the `ESTIMATE_DISCLAIMER` text and the same assumptions list.

That math comes from `js/bathroom-pricing.js` (`computePublicEstimate`), using the same prices as the admin quoting tool — the two are built from one shared file so they can never drift apart. The chat estimate always uses `DEFAULT_PRICES` from `js/bathroom-pricing.js` — it deliberately ignores prices saved under `pr_business_rates` from the admin screen, so every visitor (including staff browsers) sees the same published figures. If you change a price under Business Prices, also change `DEFAULT_PRICES` (and the $60 / $5 figures on `index.html`, `faq.html`, `terms.html` and in the chat replies) if the public prices should change too.

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

**Retention:** each quote shows its created/updated dates. Once the business has chosen its `[RETENTION PERIOD]`, set `QUOTE_RETENTION_DAYS` near the top of `js/admin.js` to the same number of days; the dashboard then flags quotes not updated within that period and offers "Delete Quotes Past Retention" (only use it for quotes that didn't lead to work).

## Retention and privacy requests routine

Until real retention periods are chosen, the Privacy Notice says plainly that no fixed periods are set yet and that enquiries/quotes are kept until deleted (deleted on request). The period-based wording, with the `[RETENTION PERIOD]` and `[CUSTOMER RECORD RETENTION PERIOD]` placeholders, is kept in an HTML comment in `privacy.html` — swap it in only once the periods are chosen **and** the routine below is actually running. The response time for requests is still `[PRIVACY RESPONSE PERIOD]`. Once the periods are chosen:

1. **Monthly** (put a recurring calendar reminder in place): open `/admin/` and delete quotes past retention; delete Gmail enquiries (and any offline notes) about jobs that didn't go ahead once they pass `[RETENTION PERIOD]`; delete customer records past `[CUSTOMER RECORD RETENTION PERIOD]` unless the law requires keeping them.
2. **Every privacy request** (email subject "Privacy request", or by phone): log it in a private spreadsheet (not in this public repo) with: date received, who asked, how identity was confirmed, what was found (Gmail, admin quotes in the browser, offline records), action taken, date closed. Respond within `[PRIVACY RESPONSE PERIOD]`.

## Licence line

The site does not state any licence status. Fixture installation (toilets, sinks, showers, bathtubs) is still advertised and priced, with wording that plumbing is extra and that the licences and permits it needs are confirmed with the customer before work is agreed — make sure that actually happens. Whether the business performs, subcontracts or drops plumbing/electrical/fixture work is the owner's decision; the site's wording must follow it.

The "Contractor License #" line has been **removed** from every footer, `terms.html` and the PDF estimate, and plumbing/electrical work is no longer advertised or priced on the public site, because showing a placeholder licence number could read as claiming a licence. Once the licence number and classification are confirmed and verifiable, restore the commented-out line in each footer and in `terms.html`, and set `BUSINESS_IDENTITY.license` in `js/script.js`.

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

- `[COMPANY LEGAL NAME]` — footer of every page, `privacy.html`, `terms.html`, PDF estimate (`js/script.js` `BUSINESS_IDENTITY`)
- `[BUSINESS ADDRESS]` — footer of every page, `privacy.html`, `terms.html`
- `[CONTRACTOR LICENSE #]`, `[LICENSE CLASSIFICATION]` — currently only in HTML comments (every footer, `terms.html`) and a code comment in `js/script.js`; see "Licence line" above
- `[GOVERNING STATE]` — `terms.html`
- `[EFFECTIVE DATE]` — `privacy.html`, `terms.html`
- `[RETENTION PERIOD]` — `privacy.html` (in an HTML comment until the routine runs; see "Retention and privacy requests routine"), `admin/index.html` (also set `QUOTE_RETENTION_DAYS` in `js/admin.js`)
- `[CUSTOMER RECORD RETENTION PERIOD]` — `privacy.html` (in the same HTML comment)
- `[PRIVACY RESPONSE PERIOD]` — `privacy.html`
