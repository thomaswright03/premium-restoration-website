# Premium Restoration — Website

The website for Premium Restoration, a bathroom-restoration business. Plain HTML/CSS/JS: **no build step and no framework**, so it is easy to hand off, edit and deploy. It is hosted on Vercel as a static site.

It has three parts:

- **Public pages** — home (with a scripted chat assistant that can give a rough bathroom labor estimate), About, FAQs, Get a Quote, Privacy Notice and Terms of Use.
- **Settings file** — `site-config.json`: switch the price estimator on/off, connect a form service, and fill in the owner's details, without touching code.
- **Admin quoting tool** — `/admin/`, a password-gated tool staff use to price bathroom jobs. Quotes are saved in the browser.

## Pages

- `index.html` — Home: hero, chat assistant, services, "How We Price" (`#pricing`), call to action
- `about.html` — About Us
- `faq.html` — FAQs (bathroom-only answers; no warranty or experience claims)
- `contact.html` — Get a Quote form (see "Contact / lead form")
- `privacy.html` — Privacy Notice (linked from every footer)
- `terms.html` — Terms of Use, incl. estimate disclaimer, third-party licences and accessibility contact
- `404.html` — "Page not found" page. Vercel serves it for any unknown URL, so it uses root-absolute links (`/index.html`).
- `gallery.html` — "Our Work". **Not linked from anywhere** (and `noindex`) until real project photos exist; see "Gallery photos".
- `admin/index.html` — Internal quoting tool (password-gated, not linked from the public site)

The site says "Get a Quote" / "Request a Quote", not "Free Quote": nothing confirms quotes are always free. Only bring "free" back once the owner confirms it.

## Structure

```
├── index.html, about.html, faq.html, contact.html, privacy.html, terms.html, gallery.html, 404.html
├── admin/index.html
├── api/materials-options.js  Vercel serverless function stub for live materials pricing (not implemented yet)
├── .env.example               env vars api/ expects (copy to .env.local; real values are gitignored)
├── site-config.json          owner-editable settings (see "Site settings")
├── favicon.svg, favicon.ico, apple-touch-icon.png
├── css/style.css             design tokens (colours incl. dark theme, type and spacing scales) + public styles
├── css/admin.css             admin tool styles (uses the same tokens)
├── js/bathroom-pricing.js    prices + THE bathroom calculation, validation and estimate text (shared)
├── js/materials-pricing.js   materials picker catalog + logic — MOCK DATA (see "Materials picker")
├── js/bathroom-room-layout.js pure logic for the 3D room preview (see "3D bathroom room preview")
├── js/bathroom-room-3d.js    the Three.js scene itself (ES module — the one non-classic script)
├── js/chat-replies.js        scripted chat answers (pure function, unit-tested)
├── js/site-config.js         loads site-config.json and shows/hides owner details on the page
├── js/theme.js               Light / Dark / System switch
├── js/estimate-pdf.js        PDF layout shared by the chat estimate and admin quotes
├── js/script.js              public-page behaviour (nav, FAQ, chat, estimate card, contact form)
├── js/admin.js               admin tool
├── js/vendor/                jsPDF 4.2.1 + Three.js 0.186.1 (both MIT, self-hosted) + their licences
├── fonts/                    self-hosted Inter + Playfair Display, with OFL licence texts
├── scripts/partials/         the ONE copy of the shared <head> bits, header/nav and footer
├── scripts/sync-pages.mjs    copies the partials and published prices into every page
├── scripts/check-placeholders.mjs   fails if a [BRACKETED PLACEHOLDER] is visible
├── scripts/serve.mjs         local server that behaves like Vercel (404.html for unknown URLs)
├── tests/unit/               Node unit tests (pricing, materials picker, chat replies)
├── tests/e2e/                Playwright browser tests
└── .github/workflows/ci.yml  runs every check on each push and pull request
```

## Site settings (`site-config.json`)

Everything the owner may want to change without a developer is in `site-config.json` at the root of the repo. Pages read it when they load.

**How to change a setting (no code editing):**

1. On GitHub, open the repository, click `site-config.json`, then the pencil ("Edit this file") icon.
2. Change the value (keep the quotes and commas exactly as they are), then click **Commit changes** on the production branch.
3. Vercel redeploys automatically, usually in under a minute. Visitors get the change the next time they load or refresh a page (the file is fetched fresh each time, not cached).

If you can't see the change after two minutes, check the deployment on the Vercel dashboard (see "Deploying"). If the file ever can't be read (for example, a typo that breaks the JSON), pages fall back to safe defaults: **price estimator off**, email-app contact form, and no owner details shown. The `npm test` checks catch broken JSON.

| Setting                      | What it does                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priceEstimator.enabled`     | `true` shows the "Get a bathroom price estimate" button and lets the chat give estimates and item prices. `false` hides the button, stops the "bathroom quote" trigger, and the chat answers any price question with "Call (385) 356-8733 or use the Contact page for a price."                         |
| `materialsEstimator.enabled` | `true` shows "Pick Your Materials →" on a finished estimate card. **Uses mock product/price data** (see "Materials picker") — leave `false` until a real pricing source is connected, unless you're comfortable a customer seeing placeholder prices labelled as such.                                  |
| `bathroomVisualizer.enabled` | `true` shows a live 3D room preview alongside the chat estimate (see "3D bathroom room preview"). The toilet is modeled realistically with two interchangeable styles; other fixtures are still flat-shaded stand-ins. Built entirely from what's typed into the estimate, no photo or upload involved. |
| `leadForm.endpoint`          | Blank = the Get a Quote form opens the visitor's email app (current behaviour). An `https://` address of a form service (e.g. Formspree `https://formspree.io/f/xxxxxxx`) = the form sends the request directly (see "Contact / lead form").                                                            |
| `leadForm.serviceName`       | Name of that form service, shown on the form and in the Privacy Notice (e.g. `"Formspree"`).                                                                                                                                                                                                            |
| `leadForm.servicePrivacyUrl` | Optional `https://` link to the form service's privacy policy, linked from the Privacy Notice.                                                                                                                                                                                                          |
| `owner.legalName`            | The owner's legal name. Blank = footers, Privacy Notice, Terms and the PDF say "operated by an individual" with no name (never a bracketed placeholder).                                                                                                                                                |
| `owner.contactAddress`       | Contact address. Blank = the sentence is left out.                                                                                                                                                                                                                                                      |
| `privacy.responsePeriod`     | e.g. `"30 days"`. Blank = the Privacy Notice leaves out "and we will respond within …".                                                                                                                                                                                                                 |

## Public chat assistant and price estimate

The chat on the home page is front-end only — no AI, no backend, no API key. Replies are scripted (`js/chat-replies.js`) and it says so (greeting, subtitle, and an honest answer if asked "are you a person / AI?"). Don't market it as AI.

- **Whole-word matching**, checked in a fixed order: identity question → non-English message (says the assistant only understands English and gives the phone number) → damage restoration (water/fire/smoke/mold damage: declined) → other non-bathroom work (kitchens, roofs, fireplaces, other rooms: declined) → a problem with a bathroom fixture (a leaking faucet or toilet gets a bathroom/plumbing answer, not a refusal) → a published item price (tile, paint, demolition, flooring, cabinets, vanities, mirrors, toilets, sinks, bathtubs, showers, doors, shower doors/shelves; the answer offers the estimate) → plumbing/electrical → price/estimate questions (start the estimate) → licence, warranty, photos, services, timeline, privacy, service area, hours, contact, greetings. Anything else gets "Sorry, I didn't understand", the phone number and the estimate button. `tests/unit/chat.test.js` holds 30+ sample questions and their expected answers; add a row there when you change a reply.
- **The estimate** asks, in small grouped forms with a progress bar: (1) which work is needed — demolition yes/no, floor tile / other flooring / none, walls tile (full height) / paint / neither, paint ceiling yes/no, nothing pre-selected; (2) only the measurements that work needs (width and length for any area work, ceiling height only for wall work), each checked to be more than 0 and at most 50 ft (20 ft for height); (3) fixture counts, whole numbers 0–20. Nothing is priced until every answer is valid, so chosen work can't be silently dropped.
- **The estimate card** leads with the numbers: a one-line "Rough, non-binding labor estimate", the itemised lines (each with quantity × rate), the not-included lines (plumbing for the listed toilets/sinks/showers/bathtubs, other plumbing & electrical, materials/permits/taxes), the total ("Estimated Labor Total", or "…, before plumbing" plus a note when plumbing fixtures are listed), then the full disclaimer and "What this estimate assumes". **Export as PDF** shows "Preparing PDF…", and an inline error with **Retry PDF** if it fails (no browser alert). **Contact Us About This →** opens the Get a Quote form with an editable summary of the estimate already in "Tell Us About Your Project".
- **Legal wording kept**: plumbing and electrical work is never priced publicly and is always described as not included and adding to the cost; toilets, sinks, showers and bathtubs need plumbing; no tax line (Utah generally treats labor on real property as not taxable — get tax advice before adding one); not a quote, offer or contract. The full disclaimer is on the card and in the PDF.
- **PDF**: built by `js/estimate-pdf.js` with jsPDF, which is **self-hosted** in `js/vendor/` (MIT licence, licence text alongside) and loaded only when someone exports. Pages are added as needed and every page has a footer with the date, phone, email, business name and page number.

The public estimate always uses the published `DEFAULT_PRICES` in `js/bathroom-pricing.js`; it ignores prices saved in a browser under Business Prices, so every visitor sees the same figures. This publishes your real bathroom prices to anyone (including competitors); switch it off with `priceEstimator.enabled` if you'd rather not.

## Materials picker

**Uses mock data.** Every product name, retailer and price in `js/materials-pricing.js` is placeholder data for building and testing the feature — none of it is fetched from anywhere real. Controlled separately from the labor estimate by `materialsEstimator.enabled` (default `false`) precisely because it isn't real pricing yet.

- Once the labor estimate finishes, "Pick Your Materials →" on the card starts a second guided flow: a ZIP code (used only for a placeholder regional price adjustment, `mockRegionalFactor()`), then one grouped choice per material the labor estimate actually priced — read straight from `computeEstimate`'s own line items (`categoriesFromLines()`), so it can never offer a material for work that wasn't chosen, and never needs updating when the scope model changes.
- **Cheaper of two retailers, only when it's a real match.** An option with more than one entry in `retailers` represents the _same manufacturer model_ sold at both Home Depot and Lowe's (e.g. one specific Kohler or American Standard SKU) — `bestRetailer()` picks the lower price and shows "Cheaper than [other] ($X) for the same product." A store-exclusive private-label product (Lowe's "allen + roth", Home Depot's "TrafficMaster", etc.) has only one retailer, since there's no real equivalent to compare against — never a fuzzy guess.
- **Paint is bought by the gallon**, not by the square foot: `computeMaterialCost()` rounds the painted area up to whole gallons (400 sq ft coverage) before pricing, and never rounds down below one gallon.
- **The finished materials card** always leads with the sample-data disclosure, then itemised picks, a Materials Subtotal, a combined Labor + Materials line, and a **"Where to buy these"** shopping list with a real link per pick — followed by **Export as PDF** (same jsPDF pipeline as the labor estimate) and **Contact Us About This →** (prefills the Get a Quote form with the materials summary, same pattern as the labor estimate's `from=estimate`, here `from=materials`).
- **Category icons, not product photos.** Each option shows a plain inline SVG glyph for its category (toilet, tile, paint roller, etc.), defined in `js/script.js` as `MATERIAL_ICON_SVG`. This is deliberate while the catalog is mock data: there's no real per-SKU image to show, and hot-linking a retailer's product photos without an actual data/affiliate agreement would be both fragile (URLs move, get blocked) and outside what's licensed. Real photos go in at the same time as real prices — see "To go live" below.

To go live with real prices (and real photos) later: sign up for the Home Depot and/or Lowe's affiliate/data-feed programs (self-serve, free — both include an image URL per product in the feed), replace `getOptionsForCategory()` with a server-side lookup (a Vercel serverless function, so no retailer API key is ever exposed in this public file) that returns each option's real `imageUrl` alongside its price, swap the category `<span>` icon in `appendMaterialCategoryForm()` (`js/script.js`) for an `<img>` using that URL, replace `mockRegionalFactor()` with a real location adjustment (e.g. BEA Regional Price Parities), and set `IS_MOCK_DATA` to `false`. Nothing else needs to change — `js/script.js` only calls the functions `js/materials-pricing.js` already exposes.

**In progress:** a Lowe's Developer Hub app (Product Discovery solution, Product Catalog capability) has been submitted for approval. `api/materials-options.js` is a not-yet-implemented Vercel serverless function stub for this — it validates its inputs and env vars and returns a clear "not configured" error, but makes no real API call yet, since Lowe's exact endpoint path, auth header, and response field names aren't visible until the app is approved and its interactive docs unlock. `.env.example` lists the environment variables it expects (`LOWES_API_KEY`, `LOWES_API_BASE_URL`) — copy it to `.env.local` for local testing, or set them as real Environment Variables in the Vercel project dashboard for production; both are gitignored so a real key never gets committed. Once the account is approved, the API docs will confirm the exact request/response shape needed to finish this function and switch `js/materials-pricing.js` over to calling it.

## 3D bathroom room preview

**An orbitable 3D room — not a photo, and not a rendering of the customer's actual bathroom.** Controlled by `bathroomVisualizer.enabled` (default `false`). When on, starting the chat estimate immediately shows a side panel (stacked above the conversation on narrow screens, docked to the right on wide ones — `.ai-chat-fullscreen-body` in `css/style.css`) with a small 3D room the customer can drag to orbit. There's no photo upload of any kind — the room is built entirely from what's typed into the estimate.

The toilet is modeled to a realistic standard (real proportions, glazed-porcelain PBR materials, image-based lighting, real shadows — see `buildToiletStyleA`/`buildToiletStyleB` in `js/bathroom-room-3d.js`), with two interchangeable styles the visitor can toggle live once a toilet is placed. Every other fixture (bathtub, sink/vanity, shower, mirrors, cabinet, doors) is still a flat-shaded stylized stand-in, pending the same treatment.

- **Renders immediately, before dimensions are known.** The room's width/length/height chat group is only asked when the chosen scope actually needs floor or wall area (`scopeNeeds()` in `js/bathroom-pricing.js`) — a fixtures-only job never asks for them at all. Until real dimensions are entered, the room renders at a sensible default footprint (`js/bathroom-room-layout.js`'s `computeRoomDimensions`/`DEFAULT_ROOM`), then live-resizes the moment width/length/height are typed.
- **Live-updating, not just on submit.** As the customer picks a scope answer or types a fixture count — before clicking "Continue," not just after — the room's finishes and fixture layout update immediately, matching the same event-driven pattern the rest of the chat estimate uses.
- **Two files, cleanly split.** `js/bathroom-room-layout.js` is DOM-free, Three.js-free pure logic (room-dimension defaulting, finish colors, and a deterministic fixture-placement algorithm), unit-tested in `tests/unit/room-layout.test.js`. `js/bathroom-room-3d.js` is the one Three.js scene module — the only first-party file using ES `import`/`export` (see the dedicated `eslint.config.js` block for it), self-hosted from `js/vendor/three/` (Three.js 0.186.1, MIT) via a native `<script type="importmap">` in `index.html` — no bundler, no CDN request at runtime.
- **Deterministic layout, not a real floor plan.** Fixtures (toilet, sink, bathtub, shower, vanity, cabinet, mirrors, entry door, shower shelf) are placed around the room's walls by a fixed-priority, fixed-scan-order algorithm — same inputs always produce the same layout, and changing one fixture's count never relocates an already-placed fixture of a different type. Items that don't fit are silently dropped rather than erroring.
- **Safe by construction.** `window.BathroomRoom3D`'s methods are always safe to call — if WebGL is unavailable or the vendored library fails to load, the estimate flow continues exactly as if the preview were off; nothing in `js/script.js` depends on it succeeding.
- Demolition has no visual effect, same reason the materials picker excludes it — there's nothing to visually add for removing something.

## One calculation, one set of prices

`js/bathroom-pricing.js` holds the prices (`DEFAULT_PRICES`) **and** the only bathroom calculation (`computeEstimate`). Both the chat estimate and the admin tool call it, so for the same room, work and fixtures the admin total equals the public estimate; the admin tool can add plumbing points, the two plumbing surcharges, electrical points and tax. A unit test checks this across a table of jobs.

Published prices in page text (e.g. "$60 per Cabinet", "$5 per sq ft") are written as `<span data-price="Cabinet_Price">$60</span>` and filled from `DEFAULT_PRICES` by `npm run pages`. Chat price answers read `DEFAULT_PRICES` directly. So to change a published price:

1. Change it in `DEFAULT_PRICES` (`js/bathroom-pricing.js`).
2. Run `npm run pages` and commit the result.
3. Update the "owner-stated published prices" unit test if the owner really changed the price.

If step 2 is forgotten, CI fails ("pages are out of date"); the unit tests also fail if the cabinet ($60) or flooring ($5/sq ft) price changes without the test being updated.

## Shared header, footer and head

The header/nav, footer and shared `<head>` lines (favicon, theme colour, theme script, stylesheet) are defined once in `scripts/partials/`. Each page contains them between `<!-- chrome:header -->` … `<!-- /chrome:header -->` markers (and `head`, `footer`), already filled in, so the committed pages work with no build step. After editing a partial, run `npm run pages` and commit. CI fails if a page is out of date.

## Admin quoting tool

Visit `/admin/` (e.g. `http://localhost:8000/admin/`). Log in, click **Create New Quote**, enter the property address, then fill in the bathroom calculator. Only bathroom restorations are quoted; the old "Coming Soon" Exterior/Kitchen/Flooring categories and their unused code were removed.

**The calculator prices only the work you choose**, with the same questions as the public estimate and nothing selected by default:

- **Room size** — width, length and height; floor area (= ceiling area) and wall area are shown. Only needed when area-priced work is chosen.
- **Work** — demolition yes/no; floor tile / other flooring / none; walls tile (full height) / paint / neither; paint ceiling yes/no. The floor is never charged twice and the same walls can't be both tiled and painted.
- **Fixtures** — toilets, sinks, bathtubs (always 30% less than the shower price), showers, shower doors, entry doors, vanities, cabinets, standard and huge mirrors, shower shelves.
- **Plumbing** — points counted automatically from the toilets, sinks, showers and bathtubs, plus the "no existing stack" and "bad valve" surcharges.
- **Electrical** — points (lamps, outlets, fans, switches, electric toilet).

Every row shows its own cost (quantity × rate) in one right-hand column on a computer; on a phone each row stacks label → input → cost. The total shows Subtotal → Tax → Total. A note under the total compares labor with the $3,000 and $7,000 thresholds of Utah's small-project exemption from contractor licensing (`JOB_VALUE_CHECKPOINTS` in `js/admin.js`; Utah is assumed, not confirmed). The notes only warn; they never change a price.

- **Nothing is lost**: each screen has its own address (`#/dashboard`, `#/new`, `#/details`, `#/prices`), so the browser's Back/Forward work. The quote being edited is kept as a draft in the browser, so Back → Get Started, or reloading the page, keeps every value. Cancel (or leaving with Back) asks "Discard this quote's changes?". An unsaved draft is offered again on the dashboard.
- **Saving** checks every answer (field messages if something is missing or not a sensible number), shows "Saving…", and can't create duplicates (each quote has its id from the start). The dashboard then says "Quote for <address> saved".
- **If the browser won't store data** (storage full or blocked), the tool says so and keeps everything on screen.
- **Dashboard**: find a quote by address, **Download PDF** (customer-ready, same style as the public estimate, with the licence and exclusions wording), **Export Quotes** / **Import Quotes** (JSON file, so quotes can be backed up or moved to another browser; importing adds new quotes and replaces a quote only with a newer copy).
- **Old quotes** saved by the previous calculator (which charged demolition, tile, flooring and painting on every room) are not re-priced silently: they show "Needs review: old calculator" with their old total, and when opened ask you to choose the work; the new total replaces the old one only when you save. Their PDF download is disabled until then.
- **Business Prices** sets the flat price for every line item and the tax rate (default **0%**: labor on real property may not be taxable, e.g. Utah Admin. Code R865-19S-58 — leave it at 0 unless a tax adviser confirms otherwise). The dashboard warns when a saved price differs from the website's published price.

**Important limitations (no backend):**

- **The password gate is client-side only.** The password is in plain text in `js/admin.js` (`ADMIN_PASSWORD`); anyone who reads the source can skip the login. It deters casual access only. Don't put sensitive data behind it until there is a real backend with server-side authentication.
- **Quotes, prices and the retention log are saved in the browser's local storage**, not a server: they stay on that device/browser, are deleted if browser data is cleared, and don't sync. Use Export Quotes for backups.
- The calculator prices **labor** only — no materials, overhead, permits or profit margin.

**Retention:** each quote shows its created/updated dates. The owner keeps enquiries for about a month, so `QUOTE_RETENTION_DAYS` in `js/admin.js` is 30 and the Privacy Notice says "about a month"; change both together. The dashboard flags quotes not updated within that period and offers "Delete Quotes Past Retention" (only for quotes that didn't lead to work). Each purge is logged with its date and count, and "Record Monthly Clean-Up" logs the date the whole monthly routine was done. That log (`pr_retention_log`) holds only dates and counts, and lives only in that browser.

## Retention and privacy requests routine

The Privacy Notice says enquiries that don't lead to work (emails, texts, voicemails, form-service submissions if a form service is used, and any quote prepared for them) are kept for **about a month** after the last contact and then deleted by hand. That promise is only true if this routine runs. No period is set for customer records yet; the period-based wording with `[CUSTOMER RECORD RETENTION PERIOD]` is kept in an HTML comment in `privacy.html`.

1. **Every few weeks, and at least monthly** (set a recurring reminder): open `/admin/` in every browser that holds quotes and delete quotes past retention; delete Gmail enquiries, voicemails and text messages (and any offline notes) about jobs that didn't go ahead once they are about a month old; if a form service is connected, delete those submissions in its dashboard too; once a customer-record period is set, delete customer records past it unless the law requires keeping them. Then press "Record Monthly Clean-Up" and also note the date in the business's own records.
2. **Every privacy request** (email subject "Privacy request", or by phone): respond promptly — and within `privacy.responsePeriod` once it is set (the Privacy Notice only promises a period once it is filled in). The Privacy Notice gives examples of how identity may be confirmed. Logging each request in a private spreadsheet (not in this repo) is recommended; the Privacy Notice does not promise a log.

## Licence line

The owner has confirmed there is **no contractor licence** at the moment. The site says so plainly ("We do not currently hold a contractor licence" in the home page's "Good to know" note, the FAQ, the Terms, the chat's plumbing/licence answers and the admin quote PDF) and never says licences are "confirmed" before work. Fixture installation (toilets, sinks, showers, bathtubs) is advertised and priced at the owner's request, with wording that plumbing is extra and that, before any work is agreed, the customer is told who will do the plumbing and electrical work, how it is priced and whether permits are needed — make sure that actually happens. Whether this work may be advertised and done without a licence is a question for a lawyer; the site's wording must follow the owner's decision. If the owner decides how plumbing is handled, update the wording everywhere (`grep -rni plumb *.html js/ scripts/partials`).

The admin quote form shows a "No contractor licence is currently held" note in the Fixtures, Plumbing and Electrical sections.

There is no licence number, so no licence line appears anywhere. Only if a licence is actually issued: add the commented-out line back in `scripts/partials/footer.html` (then `npm run pages`) and in `terms.html`, add it to the PDF footer (`businessLine()` in `js/script.js`, and the admin PDF in `js/admin.js`), and remove the "do not currently hold a contractor licence" sentences.

## Business identity

Premium Restoration is currently an **unregistered business run by one individual**: no LLC or other entity, no registered business name and no registered address. The Privacy Notice, Terms, every footer and the PDF say this. The owner's name and address come from `site-config.json` (`owner.legalName`, `owner.contactAddress`) and are shown only once filled in. If the business is registered later, update the "unregistered" wording on `privacy.html`, `terms.html`, `scripts/partials/footer.html` and the PDF footers at once.

## Contact / lead form

The form on `contact.html` checks name, a real phone number (10–15 digits) and email before doing anything, with a message under each field.

- **No endpoint set (current):** pressing the button opens the visitor's own email app with the request filled in, and the page says plainly that nothing is received until they press Send there (with a link to open the email again, plus the phone number and email address). It never claims a request "has been received".
- **Endpoint set** (`leadForm.endpoint` in `site-config.json`): the form is sent with `fetch()` as a normal form POST with `Accept: application/json` (the Formspree convention; Basin, Getform and similar services work the same way). The button shows "Sending…" and is disabled until the reply; "Request sent" appears **only** after a successful (2xx) reply; any failure or a 15-second timeout shows "Sorry, your request wasn't sent" with the phone number and email, and keeps what was typed. A hidden `_gotcha` field catches simple spam bots. The "How this form works" text on the form and the Privacy Notice switch automatically to say the request goes through the named form service.

To connect Formspree: create a form at formspree.io with the business email as recipient, copy its endpoint (`https://formspree.io/f/…`), put it in `leadForm.endpoint`, set `leadForm.serviceName` to `"Formspree"` and `leadForm.servicePrivacyUrl` to its privacy policy URL, then submit a test request and confirm the email arrives. Add the service's submissions to the monthly clean-up (above).

## Colour theme and design tokens

`css/style.css` starts with the design tokens: colours for the light theme and a dark theme, a type scale of seven sizes (nothing below 14px) and a spacing scale. Change tokens rather than individual rules. The dark theme follows the device setting; visitors can choose **System / Light / Dark** in every page footer (and on the admin dashboard); the choice is remembered in that browser and applied before the page first paints. All text meets at least 4.5:1 contrast in both themes (checked by the browser tests), and every interactive element shows a visible focus ring for keyboard users.

## Language

The site is **English only**. Whether Spanish or French versions are needed hasn't been decided by the owner (see "Owner inputs still needed"). Until then, the chat replies to a Spanish or French message with a short note (in English, Spanish and French) that the assistant only understands English, and gives the phone number — it doesn't claim the business offers service in those languages.

## Gallery photos

The six original gallery images were removed: several carried third-party watermarks or logos and were presented as "projects we've completed". "Our Work" is now unlinked (the hero button and nav link point to "How We Price" instead). Only add photos that are either your own completed projects (with the client's written permission) or licensed images clearly captioned as illustrative. Record the source/licence of every image here, put the files in a new `images/` folder, use the commented template in `gallery.html`, then add "Our Work" back to `scripts/partials/header.html` and `footer.html` and run `npm run pages`.

## Running locally

No build tools are needed to run the site. Serve the folder (opening `index.html` straight from disk works for browsing, but browsers block `site-config.json` there, so the estimator stays off):

```bash
python3 -m http.server 8000      # or: npm run serve  (also serves 404.html like Vercel)
```

Then visit `http://localhost:8000`.

## Tests and checks

Development tools need Node 20+ and `npm install`.

```bash
npm test          # everything below, in order
npm run lint      # ESLint (zero warnings allowed)
npm run format:check   # Prettier (npm run format to fix)
npm run check:pages    # shared header/footer and published prices are in sync
npm run check:placeholders   # no [BRACKETED PLACEHOLDER] visible on any page
npm run test:unit      # pricing and chat-reply unit tests (node --test)
npm run test:e2e       # Playwright browser tests (Chromium)
```

The browser tests cover the chat estimate (including validation and the PDF), the estimator switch, the contact form in both modes, the admin tool (create/edit/save/delete, double save, Back, reload, cancel, old quotes, storage failure, export/import, phone layout), every page at 375/390/768/1280px (no sideways scroll, no placeholders, no console errors or missing files), prices in page text, the 404 page, favicon, focus rings, tap-target sizes, and colour contrast in light and dark themes (axe-core). First-time Playwright setup on a new machine: `npx playwright install chromium`.

**CI:** `.github/workflows/ci.yml` runs all of the above on every push and pull request. To make failures block merging, turn on branch protection for the production branch in GitHub (Settings → Branches → Add rule → "Require status checks to pass" → select the CI check).

## Deploying (Vercel)

The site is deployed on Vercel from this GitHub repository as a static site: framework preset "Other", **no build command**, output directory = the repository root. Vercel serves `404.html` for unknown URLs automatically.

- **Deploy:** push (or merge a pull request) to the production branch set in the Vercel project (Settings → Git). Vercel builds a production deployment within about a minute. Every other branch and pull request gets its own preview URL, which is a good place to check a change first.
- **Check a deploy:** Vercel dashboard → the project → Deployments; the newest one should say "Ready".
- **Roll back:** Vercel dashboard → Deployments → pick the last good deployment → "…" menu → **Instant Rollback** (or "Promote to Production"). Then fix the problem in the repo; the next push deploys normally.
- **Settings changes** (`site-config.json`) deploy the same way — see "Site settings".

## Contact info

Phone **(385) 356-8733** and email **eduardo.moroni77@gmail.com** appear in `scripts/partials/footer.html`, the page bodies (contact, privacy, terms), `js/script.js`, `js/chat-replies.js`, `js/admin.js` (PDF footer) and here. Change them everywhere at once (`grep -rn "356-8733\|eduardo.moroni77" --exclude-dir=node_modules .`), then run `npm run pages`.

## Owner inputs still needed

These are decisions or facts only the owner can supply. Until then, the site leaves the related text out rather than showing a placeholder.

- **Legal name** of the owner → `owner.legalName` in `site-config.json`.
- **Contact address** → `owner.contactAddress`.
- **Privacy-request response period** (e.g. "30 days") → `privacy.responsePeriod`.
- **Customer-record retention period** → then un-comment the wording in `privacy.html`.
- **Governing state** for the Terms → then un-comment the clause in `terms.html`.
- **Form service**: whether to use one (e.g. Formspree) and its endpoint → `leadForm.*`. Until then, the form uses the visitor's email app.
- **Spanish / French**: whether customers need these languages. If yes, full translations of the pages, chat, estimate card and PDF (with a language switcher) are a separate piece of work; if English only, record that decision here.
- **Plumbing and licence position**: how plumbing/electrical work is handled (in-house with a licence, a named licensed subcontractor, or not at all), on legal advice — then update the wording (see "Licence line").
- **Photos** of completed projects, with each client's written permission, before "Our Work" returns.
- **Free quotes**: confirm whether quotes are always free before any page says "free".
- **Tax**: a tax adviser's confirmation before any tax is added to quotes.
- **Prices other than $60/cabinet and $5/sq ft of flooring**: confirm the remaining published rates (demolition, tile, paint, fixtures) are current.
- **Estimator on or off**: confirm the owner is happy publishing live prices through the chat (`priceEstimator.enabled`).
- **Materials picker**: currently mock data (see "Materials picker") — needs a real pricing source connected (e.g. Home Depot/Lowe's affiliate feeds) before `materialsEstimator.enabled` should ever be turned on for real customers.
- **3D bathroom room preview**: a stylized, non-photorealistic room built from the estimate's own answers (see "3D bathroom room preview") — fine to leave on since it's clearly disclosed as a stylized preview, not a real rendering of the customer's actual bathroom.
- **GitHub branch protection** requiring the CI check before merging (repository admin).

## Legal pages

The Privacy Notice and Terms show a "Last updated" date (currently September 24, 2026). Change it whenever either page's wording changes.
