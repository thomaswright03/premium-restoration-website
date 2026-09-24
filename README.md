# Premium Restoration — Website

The website for Premium Restoration, a bathroom-restoration business. Plain HTML/CSS/JS: **no build step and no framework**, so it is easy to hand off, edit and deploy. It is hosted on Vercel as a static site.

It has three parts:

- **Public pages** — home (with a scripted chat assistant that can give a rough bathroom labor estimate), About, FAQs, Get a Quote, Privacy Notice and Terms of Use.
- **Settings file** — `site-config.json`: switch the price estimator on/off, connect a form service, switch on anonymous visitor counts, and fill in the owner's details, without touching code.
- **Admin quoting tool** — `/admin/`, a password-gated tool staff use to price bathroom jobs. Quotes are saved in the browser.

## Pages

- `index.html` — Home: hero, chat assistant, services, "How We Price" (`#pricing`), call to action
- `about.html` — About Us
- `faq.html` — FAQs (bathroom-only answers; no warranty or experience claims)
- `contact.html` — Get a Quote form (see "Contact / lead form")
- `privacy.html` — Privacy Notice (linked from every footer)
- `terms.html` — Terms of Use, incl. estimate disclaimer, third-party licences and accessibility contact
- `404.html` — "Page not found" page. Vercel serves it for any unknown URL, so it uses root-absolute links (`/index.html`).
- `admin/index.html` — Internal quoting tool (password-gated, not linked from the public site)

The site says "Get a Quote" / "Request a Quote", not "Free Quote": nothing confirms quotes are always free. Only bring "free" back once the owner confirms it.

## Structure

```
├── index.html, about.html, faq.html, contact.html, privacy.html, terms.html, 404.html
├── admin/index.html
├── site-config.json          owner-editable settings (see "Site settings")
├── favicon.svg, favicon.ico, apple-touch-icon.png
├── css/style.css             design tokens (colours incl. dark theme, type and spacing scales) + public styles
├── css/admin.css             admin tool styles (uses the same tokens)
├── js/business-info.js       THE phone number, email address and "operated by" line (shared)
├── js/bathroom-pricing.js    prices + THE bathroom calculation, validation and estimate text (shared)
├── js/chat-replies.js        scripted chat answers (pure function, unit-tested)
├── js/site-config.js         loads site-config.json and shows/hides owner details on the page
├── js/analytics.js           optional anonymous visitor counts (off unless switched on)
├── js/theme.js               Light / Dark / System switch
├── js/estimate-pdf.js        PDF layout shared by the chat estimate and admin quotes
├── js/script.js              public-page behaviour (nav, FAQ, chat, estimate card, contact form)
├── js/admin.js               admin tool
├── js/vendor/                jsPDF 4.2.1 (MIT, self-hosted) + its licence
├── fonts/                    self-hosted Inter + Playfair Display, with OFL licence texts
├── scripts/partials/         the ONE copy of the shared <head> bits, header/nav and footer
├── scripts/sync-pages.mjs    copies the partials, published prices and contact details into every page
├── scripts/check-placeholders.mjs   fails if a [BRACKETED PLACEHOLDER] is visible
├── scripts/serve.mjs         local server that behaves like Vercel (404.html for unknown URLs)
├── tests/unit/               Node unit tests (pricing, chat replies, settings file, contact details)
├── tests/e2e/                Playwright browser tests
└── .github/workflows/ci.yml  runs every check on each push and pull request
```

## Site settings (`site-config.json`)

Everything the owner may want to change without a developer is in `site-config.json` at the root of the repo. Pages read it when they load.

**How to change a setting (no code editing):**

1. On GitHub, open the repository, click `site-config.json`, then the pencil ("Edit this file") icon.
2. Change the value (keep the quotes and commas exactly as they are), then click **Commit changes** on the production branch.
3. Vercel redeploys automatically, usually in under a minute. Visitors get the change the next time they load or refresh a page (the file is fetched fresh each time, not cached).

If you can't see the change after two minutes, check the deployment on the Vercel dashboard (see "Deploying"). If the file ever can't be read (for example, a typo that breaks the JSON), pages fall back to safe defaults: **price estimator off**, email-app contact form, **visitor counts off**, and no owner details shown. The `npm test` checks (`tests/unit/site-config.test.js`) catch broken JSON, a non-`https` form endpoint, a form service with no name, and an unsupported analytics provider.

| Setting                       | What it does                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priceEstimator.enabled`      | `true` shows the "Get a bathroom price estimate" button and lets the chat give estimates and item prices. `false` hides the button, stops the "bathroom quote" trigger, and the chat answers any price question with "Call (385) 356-8733 or use the Contact page for a price." |
| `leadForm.endpoint`           | Blank = the Get a Quote form opens the visitor's email app (current behaviour). An `https://` address of a form service (e.g. Formspree `https://formspree.io/f/xxxxxxx`) = the form sends the request directly (see "Contact / lead form").                                    |
| `leadForm.serviceName`        | Name of that form service, shown on the form and in the Privacy Notice (e.g. `"Formspree"`). If left blank, Formspree, Getform, Basin, FormSubmit and Web3Forms are recognised from the endpoint; for any other service `npm test` fails until a name is set.                   |
| `leadForm.servicePrivacyUrl`  | Optional `https://` link to the form service's privacy policy, linked from the Privacy Notice.                                                                                                                                                                                  |
| `owner.legalName`             | The owner's legal name. Blank = footers, Privacy Notice, Terms and the PDF say "operated by an individual" with no name (never a bracketed placeholder).                                                                                                                        |
| `owner.contactAddress`        | Contact address. Blank = the sentence is left out.                                                                                                                                                                                                                              |
| `privacy.responsePeriod`      | e.g. `"30 days"`. Blank = the Privacy Notice leaves out "and we will respond within …".                                                                                                                                                                                         |
| `analytics.enabled`           | `false` (default) = no visitor counting at all. `true` = anonymous counts with the provider below (see "Visitor counts"). The Privacy Notice changes to describe it only when this is `true`.                                                                                   |
| `analytics.provider`          | `"vercel"` (Vercel Web Analytics) or `"plausible"` (Plausible Analytics). Anything else keeps counting off.                                                                                                                                                                     |
| `analytics.domain`            | Plausible only: the site's domain as registered in Plausible. Blank = the website's own domain.                                                                                                                                                                                 |
| `analytics.scriptUrl`         | Optional: a different script address from the provider (e.g. the per-site script Plausible gives you). Blank = the provider's standard script.                                                                                                                                  |
| `analytics.servicePrivacyUrl` | Optional `https://` link to the provider's privacy policy, linked from the Privacy Notice.                                                                                                                                                                                      |

## Public chat assistant and price estimate

The chat on the home page is front-end only — no AI, no backend, no API key. Replies are scripted (`js/chat-replies.js`) and it says so (greeting, subtitle, and an honest answer if asked "are you a person / AI?"). Don't market it as AI.

- **Whole-word matching**, checked in a fixed order: a real identity question ("Are you a real person?", "Is this a bot?", "Am I talking to a human?" — a message that only mentions a person, like "I need a person to look at my shower", is answered on its subject) → a Spanish or French message, or a question about those languages ("hablas ingles", "buenos días", "parlez-vous anglais", "Do you speak Spanish?": says, in all three languages, that the assistant only understands English and gives the phone number) → asking to talk to a person (phone and email) → damage restoration (water/fire/smoke/mold damage: declined) → other rooms or work (kitchens, roofs, fireplaces, basements, bedrooms, water heaters…; a water heater on its own gets "we don't take on water heater work — ask a licensed plumber") → a problem with a bathroom fixture (a leaking faucet or toilet gets a bathroom/plumbing answer, not a refusal) → licence, warranty, availability ("Can you come tomorrow?", "When can you start?": call or use the Contact page) and timeline questions (answered even when they name an item: "How long does a tile job take?"; with a price question too, both answers are given) → a published item price (grout and caulk as tile work, tile, paint, demolition, flooring, cabinets, vanities, mirrors, toilets, sinks, jetted tubs/Jacuzzis as bathtubs with the jets' electrical work extra, bathtubs, showers, doors, shower doors/shelves; the answer offers the estimate) → plumbing/electrical → price/estimate questions (start the estimate) → photos, services, privacy, service area, hours, contact, greetings. Anything else — including a message of only emoji — gets "Sorry, I didn't understand", the phone number and the estimate button.
- **Bathrooms are never turned away.** A room word that only says where the bathroom is ("basement bathroom", "bathroom in the garage", "master bedroom bathroom") is ignored. A request for a bathroom **and** other work ("my bathroom and kitchen") gets "We can help with the bathroom, but … we can't quote the kitchen part" and the estimate offer. Only messages about other work alone are declined. `tests/unit/chat.test.js` holds 70+ sample questions and their expected answers; add a row there when you change a reply.
- **Full screen**: on a phone the chat opens full screen when the visitor starts typing; on any screen it opens full screen while an estimate is being worked out. On a computer, typing a question keeps the chat part of the page. Full screen acts as a dialog: it has a title ("Automated Assistant"), the page behind can't be reached with Tab, and Escape or the X closes it and puts focus back where the visitor was.
- **One estimate button at a time**: each reply that offers the estimate replaces the previous button.
- **The estimate** asks, in small grouped forms with a progress bar: (1) which work is needed — demolition yes/no, floor tile / other flooring / none, walls tile (full height) / paint / neither, paint ceiling yes/no, nothing pre-selected; (2) only the measurements that work needs (width and length for any area work, ceiling height only for wall work), each more than 0 and at most 50 ft (20 ft for height); (3) fixture counts, whole numbers 0–20. Nothing is priced until every answer is valid, so chosen work can't be silently dropped.
- **Feet and inches**: measurements accept `5`, `5.5`, `5,5`, `5ft`, `5'`, `5'6"`, `5 ft 6 in`, `5 feet 6 inches` or `66"` (all read by `parseFeet()` in `js/bathroom-pricing.js`, also used by the admin tool). Something it can't read gets "Enter the width as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6""; the range message appears only for a real size outside the range.
- **Back and reload**: steps 2 and 3 have a **← Back** button that shows the previous step again with its answers filled in (changing the work re-asks only the measurements it needs and keeps those already given). The estimate in progress, or the finished estimate card, is kept in the tab's `sessionStorage` (`pr_chat_estimate`), so a reload picks it up where the visitor left it; closing the tab or pressing Cancel forgets it. The Privacy Notice mentions this.
- **The estimate card** leads with the numbers: a one-line "Rough, non-binding labor estimate", the itemised lines (each with quantity × rate), the not-included lines (plumbing for the listed toilets/sinks/showers/bathtubs, other plumbing & electrical, materials/permits/taxes), the total ("Estimated Labor Total", or "…, before plumbing" plus a note when plumbing fixtures are listed), then the full disclaimer and "What this estimate assumes". **Export as PDF** shows "Preparing PDF…", and an inline error with **Retry PDF** if it fails (no browser alert). **Contact Us About This →** opens the Get a Quote form with an editable summary of the estimate already in "Tell Us About Your Project".
- **Legal wording kept**: plumbing and electrical work is never priced publicly and is always described as not included and adding to the cost; toilets, sinks, showers and bathtubs need plumbing; no tax line (Utah generally treats labor on real property as not taxable — get tax advice before adding one); not a quote, offer or contract. The full disclaimer is on the card and in the PDF.
- **PDF**: built by `js/estimate-pdf.js` with jsPDF, which is **self-hosted** in `js/vendor/` (MIT licence, licence text alongside) and loaded only when someone exports. Pages are added as needed and every page has a footer with the date, phone, email, business name and page number.

The public estimate always uses the published `DEFAULT_PRICES` in `js/bathroom-pricing.js`; it ignores prices saved in a browser under Business Prices, so every visitor sees the same figures. This publishes your real bathroom prices to anyone (including competitors); switch it off with `priceEstimator.enabled` if you'd rather not.

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

Visit `/admin/` (e.g. `http://localhost:8000/admin/`). Log in and click **Create New Quote**: one screen holds the **property address**, optional **customer name, phone and email**, and the bathroom calculator, down to **Save Quote**. Only bathroom restorations are quoted.

**The calculator prices only the work you choose**, with the same questions as the public estimate and nothing selected by default:

- **Room size** — width, length and height, in feet or feet and inches (saved as feet); floor area (= ceiling area) and wall area are shown. Only needed when area-priced work is chosen.
- **Work** — demolition yes/no; floor tile / other flooring / none; walls tile (full height) / paint / neither; paint ceiling yes/no. The floor is never charged twice and the same walls can't be both tiled and painted.
- **Fixtures** — toilets, sinks, bathtubs (always 30% less than the shower price), showers, shower doors, entry doors, vanities, cabinets, standard and huge mirrors, shower shelves.
- **Plumbing** — points counted automatically from the toilets, sinks, showers and bathtubs, plus the "no existing stack" and "bad valve" surcharges.
- **Electrical** — points (lamps, outlets, fans, switches, electric toilet).

Every row shows its own cost (quantity × rate) in one right-hand column on a computer; on a phone each row stacks label → input → cost. The total shows Subtotal → Tax → Total. A note under the total compares labor with the $3,000 and $7,000 thresholds of Utah's small-project exemption from contractor licensing (`JOB_VALUE_CHECKPOINTS` in `js/admin.js`; Utah is assumed, not confirmed). The notes only warn; they never change a price.

- **Nothing is lost**: each screen has its own address (`#/dashboard`, `#/details` for the quote, `#/prices`; the old `#/new` opens the quote screen), so the browser's Back/Forward work. The quote being edited is kept as a draft in the browser, so reloading the page keeps every value. Leaving a quote with unsaved changes (Cancel or the browser's Back) asks "Discard unsaved changes?". An unsaved draft is offered again on the dashboard; opening another quote or starting a new one while it exists asks **Resume changes / Discard / Cancel**, so changes are only thrown away when someone chooses to. Leaving **Business Prices** with changed fields asks too.
- **Confirmations** use the tool's own dialog: a title, a button naming the action ("Delete quote", "Discard changes"), Cancel focused first, Escape to cancel, and focus back on the button that opened it. (A browser too old for `<dialog>` falls back to its plain OK/Cancel box.)
- **Messages** ("Quote for … saved", errors) appear at the top of the screen in their own space, so they never cover a button, and stay until dismissed (×), replaced, or the screen changes.
- **Saving** checks every answer (field messages if something is missing or not a sensible number; the address is required; the customer's phone and email are optional but must look right if given), shows "Saving…", and can't create duplicates (each quote has its id from the start). The dashboard then says "Quote for <address> saved".
- **If the browser won't store data** (storage full or blocked), the tool says so and keeps everything on screen.
- **Dashboard**: each card shows the address and, if entered, the customer's name, phone and email. Find a quote by address, name, email or phone (digits match however the number was typed). **Download PDF** (customer-ready, same style as the public estimate, "Prepared for: <name>, <address>", with the licence and exclusions wording), **Mark as Led to Work** (see "Retention"), **Delete** (always styled as destructive), **Export Quotes** / **Import Quotes** (JSON file with every detail, including customer details, so quotes can be backed up or moved to another browser; importing adds new quotes and replaces a quote only with a newer copy; a file with nothing new just says "Nothing new to import").
- **Old quotes** saved by the previous calculator (which charged demolition, tile, flooring and painting on every room) are not re-priced silently: they show "Needs review: old calculator" with their old total, and when opened ask you to choose the work; the new total replaces the old one only when you save. Their PDF download is disabled until then.
- **Business Prices** sets the flat price for every line item and the tax rate (default **0%**: labor on real property may not be taxable, e.g. Utah Admin. Code R865-19S-58 — leave it at 0 unless a tax adviser confirms otherwise). The dashboard warns when a saved price differs from the website's published price.

**Important limitations (no backend):**

- **The password gate is client-side only.** The password is in plain text in `js/admin.js` (`ADMIN_PASSWORD`); anyone who reads the source can skip the login. It deters casual access only. Don't put sensitive data behind it until there is a real backend with server-side authentication.
- **Quotes, prices and the retention log are saved in the browser's local storage**, not a server: they stay on that device/browser, are deleted if browser data is cleared, and don't sync. Use Export Quotes for backups.
- The calculator prices **labor** only — no materials, overhead, permits or profit margin.

**Retention:** each quote shows its created/updated dates. The owner keeps enquiries for about a month, so `QUOTE_RETENTION_DAYS` in `js/admin.js` is 30 and the Privacy Notice says "about a month"; change both together. Press **Mark as Led to Work** on a quote that became a job: it is then a customer record, shows "Led to work", and is never flagged or deleted by the clean-up (press **Unmark Led to Work** to undo). The dashboard flags the other quotes not updated within that period and offers "Delete Quotes Past Retention", which deletes only those. Each purge is logged with its date and count, and "Record Monthly Clean-Up" logs the date the whole monthly routine was done. That log (`pr_retention_log`) holds only dates and counts, and lives only in that browser.

## Retention and privacy requests routine

The Privacy Notice says enquiries that don't lead to work (emails, texts, voicemails, form-service submissions if a form service is used, and any quote prepared for them) are kept for **about a month** after the last contact and then deleted by hand. That promise is only true if this routine runs. No period is set for customer records yet; the period-based wording with `[CUSTOMER RECORD RETENTION PERIOD]` is kept in an HTML comment in `privacy.html`.

1. **Every few weeks, and at least monthly** (set a recurring reminder): open `/admin/` in every browser that holds quotes, mark any quotes that led to work, and delete quotes past retention; delete Gmail enquiries, voicemails and text messages (and any offline notes) about jobs that didn't go ahead once they are about a month old; if a form service is connected, delete those submissions in its dashboard too; once a customer-record period is set, delete customer records past it unless the law requires keeping them. Then press "Record Monthly Clean-Up" and also note the date in the business's own records.
2. **Every privacy request** (email subject "Privacy request", or by phone): respond promptly — and within `privacy.responsePeriod` once it is set (the Privacy Notice only promises a period once it is filled in). The Privacy Notice gives examples of how identity may be confirmed. Logging each request in a private spreadsheet (not in this repo) is recommended; the Privacy Notice does not promise a log.

## Licence line

The owner has confirmed there is **no contractor licence** at the moment. The site says so plainly ("We do not currently hold a contractor licence" in the home page's "Good to know" note, the FAQ, the Terms, the chat's plumbing/licence answers and the admin quote PDF) and never says licences are "confirmed" before work. Fixture installation (toilets, sinks, showers, bathtubs) is advertised and priced at the owner's request, with wording that plumbing is extra and that, before any work is agreed, the customer is told who will do the plumbing and electrical work, how it is priced and whether permits are needed — make sure that actually happens. Whether this work may be advertised and done without a licence is a question for a lawyer; the site's wording must follow the owner's decision. If the owner decides how plumbing is handled, update the wording everywhere (`grep -rni plumb *.html js/ scripts/partials`).

The admin quote form shows a "No contractor licence is currently held" note in the Fixtures, Plumbing and Electrical sections.

There is no licence number, so no licence line appears anywhere. Only if a licence is actually issued: add the commented-out line back in `scripts/partials/footer.html` (then `npm run pages`) and in `terms.html`, add it to the PDF footer (`businessLine()` in `js/business-info.js`, used by both PDFs), and remove the "do not currently hold a contractor licence" sentences.

## Business identity

Premium Restoration is currently an **unregistered business run by one individual**: no LLC or other entity, no registered business name and no registered address. The Privacy Notice, Terms, every footer and the PDF say this. The owner's name and address come from `site-config.json` (`owner.legalName`, `owner.contactAddress`) and are shown only once filled in. If the business is registered later, update the "unregistered" wording on `privacy.html`, `terms.html`, `scripts/partials/footer.html` and `businessLine()` in `js/business-info.js` (both PDF footers) at once.

## Contact / lead form

The form on `contact.html` checks name, a real phone number (10–15 digits) and email before doing anything, with a message under each field.

- **No endpoint set (current):** pressing the button opens the visitor's own email app with the request filled in, and the page says plainly that nothing is received until they press Send there (with a link to open the email again, plus the phone number and email address). It never claims a request "has been received".
- **Endpoint set** (`leadForm.endpoint` in `site-config.json`): pressing **Send Request** sends the form, including any estimate summary carried over from the chat, with `fetch()` as a normal form POST with `Accept: application/json` (the Formspree convention; Basin, Getform and similar services work the same way). The button shows "Sending…" and is disabled until the reply; "Request sent" appears **only** after a successful (2xx) reply. Any failure or a 15-second timeout shows "Sorry, your request wasn't sent", keeps what was typed, and offers the visitor's email app as the **fallback** ("send it with your email app instead" opens a filled-in email) plus the phone number and email. A hidden `_gotcha` field catches simple spam bots. The "How this form works" text on the form and the Privacy Notice switch automatically to name the service (from `leadForm.serviceName`, or recognised from the endpoint) and link its privacy policy (`leadForm.servicePrivacyUrl`).

**Connecting a form service (go-live checklist):**

1. Create a form at the service (e.g. formspree.io) with the business email as the recipient, and copy its endpoint (`https://formspree.io/f/…`).
2. In `site-config.json`, set `leadForm.endpoint` to it, `leadForm.serviceName` to the service's name (e.g. `"Formspree"`) and `leadForm.servicePrivacyUrl` to its privacy policy URL. Run `npm test` (or let CI run it) — it fails if the endpoint isn't `https://` or the service isn't named.
3. After Vercel redeploys, open the live Get a Quote page **on a computer with no email app set up**, send a test request, and check that the page says "Request sent" and the email arrives in the business inbox. Then check that the form text and the Privacy Notice name the service.
4. Add the service's stored submissions to the monthly clean-up (above).

## Visitor counts (analytics)

Off by default. When `analytics.enabled` is `true` with a supported `analytics.provider`, `js/analytics.js` loads the provider's script on the public pages (never on `/admin/`) and counts page views plus these events, by name only — never anything the visitor typed:

| Event                   | When                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `Estimate started`      | the chat estimate starts                                                               |
| `Estimate completed`    | the estimate card is shown                                                             |
| `Estimate PDF failed`   | the estimate PDF couldn't be prepared                                                  |
| `Contact Us About This` | the Get a Quote page opens from an estimate                                            |
| `Quote request sent`    | the form service accepted a request (only with `leadForm.endpoint` set)                |
| `Quote request failed`  | sending through the form service failed or timed out                                   |
| `Quote email opened`    | the visitor's email app was opened with the request (no form service, so not a "sent") |

Both providers count **without cookies** and show only totals. Nothing is counted when the browser sends **Do Not Track** or **Global Privacy Control**. While counting is on, the Privacy Notice names the service, lists what is counted and says DNT/GPC stop it; while it is off, it says the site uses no analytics.

- **Vercel Web Analytics** (`"provider": "vercel"`): in the Vercel dashboard, open the project → **Analytics** → Enable, then redeploy. Page views appear under Analytics; the named events appear under its **Events** panel (custom events need a Vercel plan that includes them — check the current plan).
- **Plausible Analytics** (`"provider": "plausible"`): add the site in Plausible (paid service), put its domain in `analytics.domain` if it differs from the website's, and, for each event name above, add a **custom event goal** in the site's settings so it shows on the dashboard. If Plausible gives you a per-site script address, put it in `analytics.scriptUrl`.

To check it works: complete one estimate and send one request on the live site, then see both counted in the provider's dashboard (allow a few minutes).

## Colour theme and design tokens

`css/style.css` starts with the design tokens: colours for the light theme and a dark theme, a type scale of seven sizes (nothing below 14px) and a spacing scale. Change tokens rather than individual rules. The dark theme follows the device setting; visitors can choose **System / Light / Dark** in every page footer (and on the admin dashboard); the choice is remembered in that browser and applied before the page first paints. All text meets at least 4.5:1 contrast in both themes (checked by the browser tests), and every interactive element shows a visible focus ring for keyboard users.

## Language

The site is **English only**. Whether Spanish or French versions are needed hasn't been decided by the owner (see "Owner inputs still needed"). Until then, the chat replies to a Spanish or French message — including short everyday phrasing such as "hablas ingles", "buenos días", "necesito arreglar mi ducha", "parlez-vous anglais" or "s'il vous plaît" — and to "Do you speak Spanish/French?" with a short note (in English, Spanish and French) that the assistant only understands English, and gives the phone number. It doesn't claim the business offers service in those languages. Only words that aren't also English are used for this, so English messages aren't caught; add a row to `tests/unit/chat.test.js` for any new phrase.

## Photos

There are no photos on the site. The six original gallery images were removed: several carried third-party watermarks or logos and were presented as "projects we've completed". The empty "Our Work" page was removed too (it is still in the git history), so nothing links to or deploys a "coming soon" page. Only add photos that are either your own completed projects (with the client's written permission) or licensed images clearly captioned as illustrative. Record the source/licence of every image here, put optimised files (with alt text) in a new `images/` folder, and use them on the home and About pages or a new "Our Work" page (add that page to `PAGES` in `scripts/sync-pages.mjs` and to `scripts/partials/header.html` / `footer.html`, then run `npm run pages`).

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
npm run test:unit      # pricing, chat-reply, settings-file and contact-details unit tests (node --test)
npm run test:e2e       # Playwright browser tests (Chromium)
```

The browser tests cover the chat estimate (including validation, feet and inches, Back, reload and the PDF), the chat's full-screen/focus behaviour and replies, the estimator switch, the contact form in both modes (including the email-app fallback), visitor counts on and off, the admin tool (one-screen quote with customer details, save/edit/delete, double save, reload, the unsaved-changes prompts, styled dialogs, led-to-work and retention, messages, old quotes, storage failure, export/import, phone layout), both PDFs' business line, every page at 375/390/768/1280px (no sideways scroll, no placeholders, no console errors or missing files), prices in page text, the 404 page, favicon, focus rings, tap-target sizes, and colour contrast in light and dark themes (axe-core). First-time Playwright setup on a new machine: `npx playwright install chromium`.

**CI:** `.github/workflows/ci.yml` runs all of the above on every push and pull request, as one check named **"Lint, format, page sync, placeholders, unit and browser tests"** (workflow "CI"). CI only reports; it does **not** stop a failing change being merged until branch protection is turned on for the production branch — a GitHub setting a repository admin changes (still to do, see "Owner inputs"):

1. On GitHub: the repository → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset** (or, in the classic settings, **Settings** → **Branches** → **Add branch protection rule**).
2. Target the production branch (the one set in Vercel → Settings → Git, normally `main`).
3. Turn on **Require status checks to pass** (classic: "Require status checks to pass before merging"), add the check above (it appears in the search once CI has run at least once), and save.
4. Check it: open a pull request that breaks a unit test; GitHub should show merging as blocked until the test passes.

Once this is on, GitHub rejects commits to the production branch that haven't passed the check, so edit `site-config.json` on GitHub by choosing **"Create a new branch for this commit and start a pull request"**, wait for the check, then merge.

## Deploying (Vercel)

The site is deployed on Vercel from this GitHub repository as a static site: framework preset "Other", **no build command**, output directory = the repository root. Vercel serves `404.html` for unknown URLs automatically.

- **Deploy:** push (or merge a pull request) to the production branch set in the Vercel project (Settings → Git). Vercel builds a production deployment within about a minute. Every other branch and pull request gets its own preview URL, which is a good place to check a change first.
- **Check a deploy:** Vercel dashboard → the project → Deployments; the newest one should say "Ready".
- **Roll back:** Vercel dashboard → Deployments → pick the last good deployment → "…" menu → **Instant Rollback** (or "Promote to Production"). Then fix the problem in the repo; the next push deploys normally.
- **Settings changes** (`site-config.json`) deploy the same way — see "Site settings".

## Contact info

Phone **(385) 356-8733** and email **eduardo.moroni77@gmail.com** are defined once, in `js/business-info.js` (`PHONE`, `EMAIL`; the `tel:` link is worked out from the phone number). Every script reads them from there (chat replies, contact form, both PDFs), and `npm run pages` writes them into every page wherever an element is marked `data-contact="phone"` or `data-contact="email"` (a `mailto:` link keeps its `?subject=…`). To change one: edit `js/business-info.js`, run `npm run pages`, commit. `npm run check:pages` (and CI) fails if a page still has the phone number, the email address or a `tel:`/`mailto:` link that isn't marked, and a unit test fails if another script repeats them.

## Owner inputs still needed

These are decisions or facts only the owner can supply. Until then, the site leaves the related text out rather than showing a placeholder.

- **Legal name** of the owner → `owner.legalName` in `site-config.json`.
- **Contact address** → `owner.contactAddress`.
- **Privacy-request response period** (e.g. "30 days") → `privacy.responsePeriod`.
- **Customer-record retention period** → then un-comment the wording in `privacy.html`.
- **Governing state** for the Terms → then un-comment the clause in `terms.html`.
- **Form service**: whether to use one (e.g. Formspree) and its endpoint → `leadForm.*`, then the go-live checklist in "Contact / lead form" (a real test request must arrive in the business inbox). Until then, the form uses the visitor's email app, and the site can't tell whether a request was sent.
- **Tile floor rate**: the owner said "$5 per square foot for flooring". The site charges $5/sq ft for **other flooring** but prices a **tile floor** at the tile rate, **$4/sq ft** (`Tile_Price_Per_SqFt`), in the chat estimate, chat answers, admin quotes and PDFs. Confirm in writing which is right. If tile floors should be $5/sq ft, the floor-tile line in `computeEstimate()` (`js/bathroom-pricing.js`) must use the flooring rate, the chat's flooring/tile answers and the "Surfaces" note in the admin must say so, and the pricing unit tests must be updated to pin the confirmed rate. No price has been changed until then.
- **Visitor counts**: whether to switch on anonymous counts, and with which provider (Vercel Web Analytics or Plausible) → `analytics.*` (see "Visitor counts").
- **Spanish / French**: whether customers need these languages. If yes, full translations of the pages, chat, estimate card and PDF (with a language switcher) are a separate piece of work; if English only, record that decision here.
- **Plumbing and licence position**: how plumbing/electrical work is handled (in-house with a licence, a named licensed subcontractor, or not at all), on legal advice — then update the wording (see "Licence line").
- **Photos** of completed projects, with each client's written permission (or properly licensed images captioned as illustrative), for the home and About pages; see "Photos".
- **Free quotes**: confirm whether quotes are always free before any page says "free".
- **Tax**: a tax adviser's confirmation before any tax is added to quotes.
- **Prices other than $60/cabinet and $5/sq ft of flooring**: confirm the remaining published rates (demolition, tile, paint, fixtures) are current.
- **Estimator on or off**: confirm the owner is happy publishing live prices through the chat (`priceEstimator.enabled`).
- **GitHub branch protection** requiring the CI check before merging (repository admin; steps under "Tests and checks").

## Legal pages

The Privacy Notice and Terms show a "Last updated" date (currently September 24, 2026). Change it whenever either page's wording changes.
