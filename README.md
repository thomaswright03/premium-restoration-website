# Premium Restoration — Website

The website for Premium Restoration, a bathroom-restoration business. Plain HTML/CSS/JS: **no build step and no framework**, so it is easy to hand off, edit and deploy. It is hosted on Vercel as a static site.

It has three parts:

- **Public pages** — home (with a scripted chat assistant that can give a rough bathroom labor estimate), About, FAQs, Get a Quote, Privacy Notice and Terms of Use.
- **Settings file** — `site-config.json`: change the published prices, switch the price estimator on/off, put the quote form into "please call us" mode, connect a form service, switch on anonymous visitor counts, and fill in the owner's details, without touching code.
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

Every link to the Get a Quote page (nav, hero, calls to action, footers, the 404 page and the estimate card) is labelled **"Get a Quote"** — a browser test checks it. Never "Free Quote": nothing confirms quotes are always free, and the chat says so if asked. Only bring "free" back once the owner confirms it.

## Structure

```
├── index.html, about.html, faq.html, contact.html, privacy.html, terms.html, 404.html
├── admin/index.html
├── site-config.json          owner-editable settings (see "Site settings")
├── favicon.svg, favicon.ico, apple-touch-icon.png
├── css/style.css             design tokens (colours incl. dark theme, type and spacing scales) + public styles
├── css/admin.css             admin tool styles (uses the same tokens)
├── js/business-info.js       THE phone number, email address and "operated by" line (shared)
├── js/bathroom-pricing.js    THE bathroom calculation, validation and estimate text (shared); unpublished admin prices
├── js/chat-replies.js        scripted chat answers (pure function, unit-tested)
├── js/site-config.js         loads site-config.json and shows/hides owner details on the page
├── js/analytics.js           optional anonymous visitor counts (off unless switched on)
├── js/theme.js               Light / Dark / System switch
├── js/estimate-pdf.js        PDF layout shared by the chat estimate and admin quotes; PDF references and "held until" dates
├── js/script.js              page behaviour every public page shares (menu, header, scroll-reveal, FAQ)
├── js/lead-form.js           the Get a Quote form (checks, email app / form service, status messages)
├── js/chat/                  home-page chat, in parts sharing window.PRChat (loaded in this order by index.html):
│     core.js                 chat elements, settings, message rows, the estimate button
│     fullscreen.js           full-screen dialog mode (title, focus kept inside, Escape)
│     persistence.js          keeping the estimate in this tab across reloads
│     step-form.js            one step of the estimate (a small grouped form)
│     estimate-flow.js        the steps, Back, Cancel, finishing and restoring
│     estimate-card.js        the finished estimate card and its PDF
│     main.js                 sending messages, wiring
├── js/admin/                 admin tool, in parts sharing window.PRAdmin (loaded in this order by admin/index.html):
│     dates.js                "today / yesterday / N days ago" in calendar days (window.CalendarDays)
│     core.js                 settings keys, checked storage, messages, confirmation dialog
│     drafts.js               the quote being edited: one draft per quote, per tab
│     backup.js               backup panel, persistent-storage request, export / one-step restore
│     dashboard.js            quote list, search, retention clean-up, unsaved drafts, price warning
│     pdf.js                  customer PDF of a saved quote
│     editor.js               quote screen: property, customer, calculator, save
│     prices.js               Business Prices screen
│     main.js                 log-in, screens and addresses, wiring
├── tsconfig.json, types/     type check of all site scripts (npm run typecheck; no build)
├── js/vendor/                jsPDF 4.2.1 (MIT, self-hosted) + its licence
├── fonts/                    self-hosted Inter + Playfair Display, with OFL licence texts
├── fonts/pdf/                the same typefaces as fixed-weight .ttf files for the PDFs (made by scripts/make-pdf-fonts.py)
├── scripts/partials/         the ONE copy of the shared <head> bits, header/nav and footer
├── scripts/sync-pages.mjs    copies the partials, published prices (from site-config.json) and contact details into every page
├── scripts/check-placeholders.mjs   fails if a [BRACKETED PLACEHOLDER] is visible
├── scripts/serve.mjs         local server that behaves like Vercel (404.html for unknown URLs)
├── scripts/check-deploy.mjs  checks a deployed site serves exactly this checkout (npm run check:deploy -- <url>)
├── tests/unit/               Node unit tests (pricing, chat replies, settings file, page sync, contact details)
├── tests/fixtures/           test-prices.json: the fixed prices the tests use
├── tests/e2e/                Playwright browser tests
└── .github/workflows/ci.yml  runs every check on each push and pull request
```

## Site settings (`site-config.json`)

Everything the owner may want to change without a developer is in `site-config.json` at the root of the repo. Pages read it when they load.

**How to change a setting (no code editing):**

1. On GitHub, open the repository, click `site-config.json`, then the pencil ("Edit this file") icon. (This works in a phone's browser too.)
2. Change the value (keep the quotes, colons and commas exactly as they are; `true`, `false` and prices are typed without quotes), then click **Commit changes**. Commit to the production branch (normally `main`); if branch protection is on, see "While branch protection is on" below.
3. Vercel redeploys automatically, usually in under a minute. Visitors get the change the next time they load or refresh a page: the pages fetch `site-config.json` fresh every time (never from a cache).

If you can't see the change after two minutes, check the deployment on the Vercel dashboard (see "Deploying"). If the file ever can't be read (for example, a typo that breaks the JSON), pages fall back to safe defaults: **price estimator and online prices off** (the pages, the greeting and the chat all say "call for a price"), the quote form on with the email-app route, **visitor counts off**, and no owner details shown. The `npm test` checks (`tests/unit/site-config.test.js`) catch broken JSON, a switch typed in quotes, unusable prices, a non-`https` form endpoint, a form service with no name, and an unsupported analytics provider — and CI runs them on every commit, so a mistake shows as a red cross on GitHub within a few minutes.

### The two switches (turning things off quickly)

| To…                                                                                                       | Set in `site-config.json`                | Effect on the next page load                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| switch off the price estimator and online prices (e.g. a price is wrong)                                  | `"priceEstimator": { "enabled": false }` | The "Get a bathroom price estimate" button disappears, "bathroom quote" no longer starts an estimate, every price question in the chat gets "Call (385) 356-8733 or use the Get a Quote page for a price.", the greeting no longer invites price questions, and the price figures on the home page, FAQ and Terms are replaced by "call for the current price" wording, so the page and the chat never disagree. |
| put the quote form into "please call us" mode (e.g. you can't take on work, or requests are going astray) | `"leadForm": { "enabled": false, … }`    | The Get a Quote page shows "Please call us — we're not taking requests through this form right now" with the phone number and email, instead of the form. Nothing can be submitted. The chat's replies give the phone number and email instead of the form, a finished estimate offers "Call (385) 356-8733" instead of "Get a Quote", and the home page's closing section says to call.                         |

Set the value back to `true` to switch it on again. **How long it takes:** the time to edit and commit (a minute or two), plus Vercel's redeploy (usually under a minute), plus the visitor loading or refreshing a page — so a few minutes in all. A visitor who already has the page open keeps the old behaviour until they reload. If branch protection is on and you go through a pull request, add the time CI takes (about 3–5 minutes) — or use the bypass described below.

**Not yet tried on production.** Both switches are covered by the browser tests (`tests/e2e/chat.spec.js` "estimator switch" and `tests/e2e/contact.spec.js` "quote form switch"), but they haven't been flipped on the live site, because this work had no access to production. Once this version is live, try each switch once: set it to `false`, commit, wait for the deployment to be "Ready", reload the home page / Get a Quote page to see the effect, then set it back to `true`. Record the date here: _Switches last tried on production: not yet._

**Emergency alternative:** Vercel's **Instant Rollback** (see "Deploying") puts the whole site back to an earlier deployment in seconds, without GitHub — useful if a bad change broke the site itself.

| Setting                       | What it does                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `priceEstimator.enabled`      | `true` shows the "Get a bathroom price estimate" button, lets the chat give estimates and item prices, and shows the price figures in page text. `false` hides the button and the figures, stops the "bathroom quote" trigger, and the chat answers any price question with "Call (385) 356-8733 or use the Get a Quote page for a price." |
| `prices.*`                    | The published labor prices in US dollars, as plain numbers (`"cabinetEach": 60`, `"paintingPerSqFt": 1.79`). See "Changing a published price" below.                                                                                                                                                                                       |
| `leadForm.enabled`            | `true` (normal) shows the Get a Quote form. `false` = "please call us" mode (see "The two switches").                                                                                                                                                                                                                                      |
| `leadForm.endpoint`           | Blank = the Get a Quote form opens the visitor's email app (current behaviour). An `https://` address of a form service (e.g. Formspree `https://formspree.io/f/xxxxxxx`) = the form sends the request directly (see "Contact / lead form").                                                                                               |
| `leadForm.serviceName`        | Name of that form service, shown on the form and in the Privacy Notice (e.g. `"Formspree"`). If left blank, Formspree, Getform, Basin, FormSubmit and Web3Forms are recognised from the endpoint; for any other service `npm test` fails until a name is set.                                                                              |
| `leadForm.servicePrivacyUrl`  | Optional `https://` link to the form service's privacy policy, linked from the Privacy Notice.                                                                                                                                                                                                                                             |
| `owner.legalName`             | The owner's legal name. Blank = footers, Privacy Notice, Terms and the PDF say "operated by an individual" with no name (never a bracketed placeholder).                                                                                                                                                                                   |
| `owner.contactAddress`        | Contact address. Blank = the sentence is left out.                                                                                                                                                                                                                                                                                         |
| `privacy.responsePeriod`      | e.g. `"30 days"`. Blank = the Privacy Notice leaves out "and we will respond within …".                                                                                                                                                                                                                                                    |
| `analytics.enabled`           | `false` (default) = no visitor counting at all. `true` = anonymous counts with the provider below (see "Visitor counts"). The Privacy Notice changes to describe it only when this is `true`.                                                                                                                                              |
| `analytics.provider`          | `"vercel"` (Vercel Web Analytics) or `"plausible"` (Plausible Analytics). Anything else keeps counting off.                                                                                                                                                                                                                                |
| `analytics.domain`            | Plausible only: the site's domain as registered in Plausible. Blank = the website's own domain.                                                                                                                                                                                                                                            |
| `analytics.scriptUrl`         | Optional: a different script address from the provider (e.g. the per-site script Plausible gives you). Blank = the provider's standard script.                                                                                                                                                                                             |
| `analytics.servicePrivacyUrl` | Optional `https://` link to the provider's privacy policy, linked from the Privacy Notice.                                                                                                                                                                                                                                                 |
| `estimates.validForDays`      | How many days the prices on an estimate or quote PDF are held, as a whole number from 1 to 365 (e.g. `30`, no quotes). `null` (current: not decided by the owner) = the PDFs print no "prices held until" date and keep "Prices are current as of the date generated and may change." Anything else fails `npm test`.                      |

### Changing a published price

1. Edit `site-config.json` on GitHub as above and change the number after the price's name, e.g. `"cabinetEach": 60` → `"cabinetEach": 65`. Use a plain number: no `$`, no quotes, cents after a dot (`1.79`).
2. Commit. After the redeploy, the home page, FAQ, Terms, the chat's answers, the chat estimate, new admin quotes and the PDFs all use the new price (the bathtub price follows `showerEach`: always 30% less).
3. Quotes already saved in the admin tool keep the prices they were saved with until they are edited and saved again. If you had set a different price for the same item under the admin's Business Prices, the dashboard shows the difference.
4. Optional, for a developer: run `npm run pages` and commit, so the price text written into the page files matches too (visitors with JavaScript see the new price anyway).

| Name                | Price                                                        | Name              | Price                                  |
| ------------------- | ------------------------------------------------------------ | ----------------- | -------------------------------------- |
| `demolitionPerSqFt` | Demolition, per sq ft of floor                               | `vanityEach`      | Vanity install, each                   |
| `toiletEach`        | Toilet install, each (plumbing extra)                        | `cabinetEach`     | Cabinet install, each                  |
| `sinkEach`          | Sink install, each (plumbing extra)                          | `mirrorEach`      | Standard mirror install, each          |
| `showerEach`        | Shower install, each (plumbing extra); bathtubs are 30% less | `hugeMirrorEach`  | Huge/oversized mirror install, each    |
| `showerDoorEach`    | Shower door install, each                                    | `showerShelfEach` | Built-in shower shelf, each            |
| `entryDoorEach`     | Bathroom entry door install, each                            | `tilePerSqFt`     | Tile, per sq ft of floor or wall tiled |
| `flooringPerSqFt`   | Flooring other than tile, per sq ft                          | `paintingPerSqFt` | Painting, per sq ft of wall or ceiling |

## Public chat assistant and price estimate

The chat on the home page is front-end only — no AI, no backend, no API key. Replies are scripted (`js/chat-replies.js`) and it says so (greeting, subtitle, and an honest answer if asked "are you a person / AI?"). Don't market it as AI.

- **Whole-word matching**, checked in a fixed order: a real identity question ("Are you a real person?", "Is this a bot?", "Am I talking to a human?" — a message that only mentions a person, like "I need a person to look at my shower", is answered on its subject) → a Spanish or French message, or a question about those languages ("hablas ingles", "buenos días", "parlez-vous anglais", "Do you speak Spanish?": says, in all three languages, that the assistant only understands English and gives the phone number) → asking to talk to a person (phone and email) → damage restoration (water/fire/smoke/mold damage: declined) → other rooms or work (kitchens, roofs, fireplaces, basements, bedrooms, water heaters…; a water heater on its own gets "we don't take on water heater work — ask a licensed plumber") → a problem with a bathroom fixture (a leaking faucet or toilet gets a bathroom/plumbing answer, not a refusal) → commercial bathrooms (offices, shops, restaurants: the site doesn't say, so "please ask us") → a problem with a fixture → refinishing/reglazing (no online price; never answered with an installation price) → "How do I get a quote?" → "Is the estimate free?" (the chat estimate costs nothing; whether a visit or written quote is free isn't stated, so "please ask us", then the estimate button) → payment methods, deposits, financing ("please ask us") → heated floors (the floor is priced as usual; the heating is electrical work, not included and adding to the cost) → licence, insurance (the site states nothing about insurance: "please ask us"), warranty, availability ("Can you come tomorrow?", "When can you start?": call or use the Get a Quote page) and timeline questions (answered even when they name an item: "How long does a tile job take?"; with a price question too, both answers are given) → items with no published price (windows, countertops, vanity tops, grab bars, towel bars, drywall, trim…: "we don't have an online price — call us"; the estimate isn't started for them) → a published item price (grout and caulk as tile work, tile, paint, demolition, flooring, cabinets, vanities, mirrors, toilets, sinks, jetted tubs/Jacuzzis as bathtubs with the jets' electrical work extra, bathtubs, showers, doors, shower doors/shelves; the answer offers the estimate) → plumbing/electrical → price/estimate questions, or a bathroom with a size or "total" ("What's the total for a 5x8 bathroom?": start the estimate) → photos, services, privacy, service area, hours, contact, greetings. Anything else — including a message of only emoji — gets "Sorry, I didn't understand", the phone number and the estimate button.
- **Never invent a business fact.** Anything the site doesn't already state — insurance, payment methods, service area, whether quotes are free, commercial work, unpriced items — gets an honest "this website doesn't say, please ask us" with the phone number. Other rooms (kitchens, laundry rooms, basements…) get a clear no.
- **Replies follow the switches**: with the estimator off, nothing invites a price question or offers an estimate; with the quote form in "please call us" mode, nothing points to the form (phone and email instead).
- **Bathrooms are never turned away.** A room word that only says where the bathroom is ("basement bathroom", "bathroom in the garage", "master bedroom bathroom") is ignored. A request for a bathroom **and** other work ("my bathroom and kitchen") gets "We can help with the bathroom, but … we can't quote the kitchen part" and the estimate offer. Only messages about other work alone are declined. `tests/unit/chat.test.js` holds 70+ sample questions and their expected answers; add a row there when you change a reply.
- **Full screen**: on a phone the chat opens full screen when the visitor starts typing; on any screen it opens full screen while an estimate is being worked out. On a computer, typing a question keeps the chat part of the page. Full screen acts as a dialog: it has a title ("Automated Assistant"), the page behind can't be reached with Tab, and Escape or the X closes it and puts focus back where the visitor was — on the estimate button that opened it (or, if the estimate was asked for by typing, on the current step).
- **One estimate button at a time**: each reply that offers the estimate replaces the previous button. While an estimate is being worked out, that button (or a new one, if it was started by typing or picked up after a reload) reads **Continue my estimate →** and reopens it full screen on the current step; it goes once the estimate is finished or cancelled.
- **The estimate** asks, in small grouped forms with a progress bar: (1) which work is needed — demolition yes/no, floor tile / other flooring / none, walls tile (full height) / paint / neither, paint ceiling yes/no, nothing pre-selected; (2) only the measurements that work needs (width and length for any area work, ceiling height only for wall work), each more than 0 and at most 50 ft (20 ft for height); (3) fixture counts, whole numbers 0–20. Nothing is priced until every answer is valid, so chosen work can't be silently dropped, and an estimate needs at least one priced item: with no work chosen and every count 0, the last step says "There's nothing to price yet: enter how many of at least one item above, or go ← Back and choose some work." and no $0.00 card is shown.
- **Feet and inches**: measurements accept `5`, `5.5`, `5,5`, `5ft`, `5'`, `5'6"`, `5 ft 6 in`, `5 feet 6 inches` or `66"` (all read by `parseFeet()` in `js/bathroom-pricing.js`, also used by the admin tool). Something it can't read gets "Enter the width as a number of feet, e.g. 5.5, or feet and inches, e.g. 5' 6""; the range message appears only for a real size outside the range.
- **Back and reload**: steps 2 and 3 have a **← Back** button that shows the previous step again with its answers filled in (changing the work re-asks only the measurements it needs and keeps those already given). The estimate in progress, or the finished estimate card, is kept in the tab's `sessionStorage` (`pr_chat_estimate`), so a reload picks it up where the visitor left it; closing the tab or pressing Cancel forgets it. The Privacy Notice mentions this.
- **The estimate card** leads with the numbers: a one-line "Rough, non-binding labor estimate", the itemised lines (each with quantity × rate), the not-included lines (plumbing for the listed toilets/sinks/showers/bathtubs, other plumbing & electrical, materials/permits/taxes), the total ("Estimated Labor Total", or "…, before plumbing" plus a note when plumbing fixtures are listed), then the full disclaimer and "What this estimate assumes". **Export as PDF** shows "Preparing PDF…", and an inline error with **Retry PDF** if it fails (no browser alert). **Get a Quote →** opens the Get a Quote form with an editable summary of the estimate already in "Tell Us About Your Project" (in "please call us" mode it is **Call (385) 356-8733 →** instead).
- **Legal wording kept**: plumbing and electrical work is never priced publicly and is always described as not included and adding to the cost; toilets, sinks, showers and bathtubs need plumbing; no tax line (Utah generally treats labor on real property as not taxable — get tax advice before adding one); not a quote, offer or contract. The full disclaimer is on the card and in the PDF.
- **PDF**: built by `js/estimate-pdf.js` with jsPDF, which is **self-hosted** in `js/vendor/` (MIT licence, licence text alongside) and loaded only when someone exports. It is not an npm dependency: to update it, replace `js/vendor/jspdf.umd.min.js` with the `dist/jspdf.umd.min.js` file of the new release (and its licence), then run `npm test`.
  - **Look**: the website's typefaces — the business name in Playfair Display, everything else in Inter — embedded from `fonts/pdf/` (fixed-weight TrueType copies of the site's web fonts, made by `scripts/make-pdf-fonts.py`; jsPDF can't use the variable `.woff2` files). Like jsPDF they are fetched only when a PDF is made (about 185 KB), so page loads are unchanged, and only the letters used go into the PDF. If they can't be fetched, the PDF is still made in standard fonts.
  - **Header**: the business name, a **reference** and the **issue date**, and — only if the owner has set `estimates.validForDays` — "Prices held until <date>" (the disclaimer then says the prices "are held until <date>; after that they may change"). A visitor's estimate gets a new random reference such as `PR-E-20260924-7K3F` (kept for that estimate, so exporting again gives the same one, and added to the summary if the visitor then uses **Get a Quote**). An admin quote's reference comes from the quote (`PR-Q-<date created>-<code from its id>`), so every PDF of that quote matches. The reference is also in the file name.
  - Pages are added as needed and every page has a footer with the phone, email, reference, page number and business name.

The public estimate always uses the published prices from `site-config.json`; it ignores prices saved in a browser under Business Prices, so every visitor sees the same figures. This publishes your real bathroom prices to anyone (including competitors); switch it off with `priceEstimator.enabled` if you'd rather not.

## One calculation, one set of prices

`js/bathroom-pricing.js` holds the only bathroom calculation (`computeEstimate`). Both the chat estimate and the admin tool call it, so for the same room, work and fixtures the admin total equals the public estimate; the admin tool can add plumbing points, the two plumbing surcharges, electrical points and tax. A unit test checks this across a table of jobs.

**The published prices live in `site-config.json`** (`prices`), so the owner can change them without a developer — see "Changing a published price" under "Site settings". When a page loads, `js/site-config.js` checks them and hands them to `js/bathroom-pricing.js` (`setPublishedPrices`), and fills every price in the page text (written as `<span data-price="Cabinet_Price">$60</span>`). The chat's price answers, the estimate, the admin quotes, the admin "differs from the website" warning and both PDFs all read those same prices. The bathtub price isn't set: it is always 30% less than `showerEach`. Plumbing, the two plumbing surcharges, electrical and the tax rate are never published; their defaults stay in `js/bathroom-pricing.js` and can be changed per browser under Business Prices.

**If the prices can't be used** (a price missing, typed in quotes or with a `$`, 0 or less, over 10,000, more than 2 decimal places, or a misspelt name), the price estimator switches itself off, and the chat and the page text both say "call for a price" rather than show a wrong figure, and the admin tool says it can't price quotes until the file is fixed (saved quotes and backups still work). `npm test` (`tests/unit/site-config.test.js`) names the exact problem.

**The price text in the page files** is refreshed by `npm run pages` (for visitors without JavaScript and for search engines that don't run it). Visitors with JavaScript see the prices in `site-config.json` straight away even before that is run, so `npm run check:pages` (and CI) only prints a notice when the files' price text is older than the settings, instead of failing.

**Tests use their own prices**: `tests/fixtures/test-prices.json` (the owner-stated prices of September 2026, e.g. $60 per cabinet and $5 per sq ft of flooring). The unit tests load them, and `npm run test:e2e` serves them in place of the owner's (`SITE_CONFIG_PRICES` in `playwright.config.js` and `scripts/serve.mjs`). So the owner changing a price never breaks a test, and the tests still check every calculation against known figures. A browser test (`tests/e2e/prices.spec.js`) changes the cabinet price in the settings only and checks the home page, FAQ, Terms, chat, estimate and admin quote all follow.

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

Every row shows its own cost (quantity × rate) in one right-hand column on a computer; on a phone each row stacks label → input → cost. The total shows Subtotal → Tax → Total. A note under the total compares labor with the $3,000 and $7,000 thresholds of Utah's small-project exemption from contractor licensing (`JOB_VALUE_CHECKPOINTS` in `js/admin/editor.js`; Utah is assumed, not confirmed). The notes only warn; they never change a price.

- **Nothing is lost**: each screen has its own address (`#/dashboard`, `#/details` for the quote, `#/prices`; the old `#/new` opens the quote screen), so the browser's Back/Forward work. Each quote being edited is kept as its own draft in the browser (`pr_quote_draft:<quote id>`), and each tab remembers which one it is editing, so reloading the page keeps every value and two tabs editing different quotes never overwrite or discard each other's changes. Leaving a quote with unsaved changes (Cancel or the browser's Back) asks "Discard unsaved changes?". The dashboard lists every quote with unsaved changes, each with **Resume** and **Discard** (Discard asks first); opening a quote that has unsaved changes carries on with them, and starting or opening another quote keeps them. Leaving **Business Prices** with changed fields asks too.
- **Confirmations** use the tool's own dialog: a title, a button naming the action ("Delete quote", "Discard changes"), Cancel focused first, Escape to cancel, and focus back on the button that opened it. (A browser too old for `<dialog>` falls back to its plain OK/Cancel box.)
- **Messages** ("Quote for … saved", errors) appear at the top of the screen in their own space, so they never cover a button, and stay until dismissed (×), replaced, or the screen changes.
- **Saving** refuses a quote with nothing to price (no work, fixture, plumbing surcharge or electrical point chosen: "Nothing to price yet…", which goes as soon as something is chosen) and checks every answer (field messages if something is missing or not a sensible number; the address is required; the customer's phone and email are optional but must look right if given; the "Fix the N highlighted answers" message counts down as answers are fixed and disappears once none are left), shows "Saving…", and can't create duplicates (each quote has its id from the start). The dashboard then says "Quote for <address> saved".
- **If the browser won't store data** (storage full or blocked), the tool says so and keeps everything on screen.
- **Dashboard** (in this order, so on a phone the first quote and **Create New Quote** are on screen without scrolling): **Create New Quote** / **Business Prices**, any unsaved drafts, a one-line **Backups** status, a one-line **Clean-up** status, the search box, the quotes, and a closed "Data handling and tax" note. Each status line opens its details on demand (**Details**) and is marked in red and opened by itself only while something is due. With no quotes the list's place holds one message (with **Restore from Backup**) and the search box is hidden. Each card shows the address and, if entered, the customer's name, phone and email. Find a quote by address, name, email or phone (digits match however the number was typed). **Download PDF** (customer-ready, same style as the public estimate, "Prepared for: <name>, <address>", the customer's phone and email if entered, the quote's reference, with the licence and exclusions wording), **Mark Job Booked** (see "Retention"), **Delete** (always styled as destructive).
- **Backups** (a line near the top of the dashboard, always shown — see "Backups and moving to another device" below): the date of the last backup and **Export Backup** / **Export Now**; under **Details**, **Restore from Backup** and whether the browser has agreed to keep the data.
- **Old quotes** saved by the previous calculator (which charged demolition, tile, flooring and painting on every room) are not re-priced silently: they show "Needs review: old calculator" with their old total, and when opened ask you to choose the work; the new total replaces the old one only when you save. Their PDF download is disabled until then.
- **Business Prices** sets the flat price for every line item and the tax rate (default **0%**: labor on real property may not be taxable, e.g. Utah Admin. Code R865-19S-58 — leave it at 0 unless a tax adviser confirms otherwise). The dashboard warns when a saved price differs from the website's published price.

**Important limitations (no backend):**

- **The password gate is client-side only.** The password is in plain text in `js/admin/main.js` (`ADMIN_PASSWORD`); anyone who reads the source can skip the login. It deters casual access only. Don't put sensitive data behind it until there is a real backend with server-side authentication.
- **Quotes, prices and the retention log are saved in the browser's local storage**, not a server: they stay on that device/browser, are deleted if browser data is cleared (and Safari deletes them by itself if the tool isn't opened for 7 days), and don't sync. The tool protects against this as far as a browser allows (next section), but only a server-side store makes quotes survive on their own — see "Owner inputs still needed".
- The calculator prices **labor** only — no materials, overhead, permits or profit margin.

### Backups and moving to another device

Because quotes exist only in one browser, the dashboard's **Backups** line:

- **Asks the browser to keep the data** (`navigator.storage.persist()`) once per visit, and says what it answered (a short "Storage not protected" / "Storage not guaranteed" tag on the line, the full text under **Details**): "Storage: protected" (the browser agreed not to clear it on its own), "Storage: not protected" (it may delete the quotes without warning — shown in red, with **Ask Browser to Keep Data** to ask again; Firefox asks you, Chrome and Edge decide for themselves and are more likely to agree once the page is bookmarked) or "Storage: not guaranteed" (the browser can't say). Even "protected" doesn't survive clearing browsing data, Safari's 7-day rule or a new device, so backups are still needed.
- **Records every backup** (`pr_last_backup`: date and number of quotes) and shows "Last backup: today / yesterday / N days ago", counted in calendar days on the device's clock (a backup made at 11 pm is "yesterday" at 8 am; `js/admin/dates.js`), with how many quotes were added or changed since.
- **Warns until a backup is recent**: with quotes saved and no backup, or a backup 3 days old or more (`BACKUP_REMINDER_DAYS` in `js/admin/core.js`), the line turns red with "Last backup: … — Export now" and an **Export Now** button beside it. It can't be dismissed; exporting clears it.
- **Export** downloads `premium-restoration-quotes-<date>.json` with every quote (including customer details), the Business Prices saved in that browser and the clean-up log. Keep it somewhere other than that browser (e.g. the business's cloud drive). It holds customers' personal details: store it privately and delete old backup files in the monthly clean-up.
- **Restore from Backup is one step**: choose the file and it is restored straight away. It never deletes anything: quotes that aren't in the browser are added, a quote already there is replaced only by a newer copy, and Business Prices are restored only if that browser has none. When the dashboard is empty its one message says the browser may have cleared its storage (and, if this browser made a backup, how many quotes it held and when) and has its own **Restore from Backup** button.

To move to another device or browser: Export Backup on the old one, open `/admin/` on the new one, log in, Restore from Backup.

**Retention:** each quote shows its created/updated dates. The owner keeps enquiries for about a month, so `QUOTE_RETENTION_DAYS` in `js/admin/core.js` is 30 and the Privacy Notice says "about a month"; change both together. Press **Mark Job Booked** on a quote that became a job: it is then a customer record, shows "Job booked", and is never flagged or deleted by the clean-up (press **Undo Job Booked** to undo). The dashboard flags the other quotes not updated within that period and offers **Delete Old Enquiries**, which deletes only those. The **Clean-up** line opens by itself and turns red while quotes are past the period, or when the last logged monthly clean-up is more than 31 days old (or none is logged and a quote is older than that); otherwise it is one quiet line ("Nothing past 30 days; last clean-up logged …"). Each deletion is logged with its date and count, and **Log This Month's Clean-Up** logs the date the whole monthly routine was done. That log (`pr_retention_log`) holds only dates and counts, and lives only in that browser.

## Retention and privacy requests routine

The Privacy Notice says enquiries that don't lead to work (emails, texts, voicemails, form-service submissions if a form service is used, and any quote prepared for them) are kept for **about a month** after the last contact and then deleted by hand. That promise is only true if this routine runs. No period is set for customer records yet; the period-based wording with `[CUSTOMER RECORD RETENTION PERIOD]` is kept in an HTML comment in `privacy.html`.

1. **Every few weeks, and at least monthly** (set a recurring reminder): open `/admin/` in every browser that holds quotes, mark any quotes that became jobs (**Mark Job Booked**), and press **Delete Old Enquiries**; delete backup files older than about a month (keep the newest one), since they hold the same personal details; delete Gmail enquiries, voicemails and text messages (and any offline notes) about jobs that didn't go ahead once they are about a month old; if a form service is connected, delete those submissions in its dashboard too; once a customer-record period is set, delete customer records past it unless the law requires keeping them. Then press **Log This Month's Clean-Up** and also note the date in the business's own records.
2. **Every privacy request** (email subject "Privacy request", or by phone): respond promptly — and within `privacy.responsePeriod` once it is set (the Privacy Notice only promises a period once it is filled in). The Privacy Notice gives examples of how identity may be confirmed. Logging each request in a private spreadsheet (not in this repo) is recommended; the Privacy Notice does not promise a log.

## Licence line

The owner has confirmed there is **no contractor licence** at the moment. The site says so plainly ("We do not currently hold a contractor licence" in the home page's "Good to know" note, the FAQ, the Terms, the chat's plumbing/licence answers and the admin quote PDF) and never says licences are "confirmed" before work. Fixture installation (toilets, sinks, showers, bathtubs) is advertised and priced at the owner's request, with wording that plumbing is extra and that, before any work is agreed, the customer is told who will do the plumbing and electrical work, how it is priced and whether permits are needed — make sure that actually happens. Whether this work may be advertised and done without a licence is a question for a lawyer; the site's wording must follow the owner's decision. If the owner decides how plumbing is handled, update the wording everywhere (`grep -rni plumb *.html js/ scripts/partials`).

The admin quote form shows a "No contractor licence is currently held" note in the Fixtures, Plumbing and Electrical sections.

There is no licence number, so no licence line appears anywhere. Only if a licence is actually issued: add the commented-out line back in `scripts/partials/footer.html` (then `npm run pages`) and in `terms.html`, add it to the PDF footer (`businessLine()` in `js/business-info.js`, used by both PDFs), and remove the "do not currently hold a contractor licence" sentences.

## Business identity

Premium Restoration is currently an **unregistered business run by one individual**: no LLC or other entity, no registered business name and no registered address. The Privacy Notice, Terms, every footer and the PDF say this. The owner's name and address come from `site-config.json` (`owner.legalName`, `owner.contactAddress`) and are shown only once filled in. If the business is registered later, update the "unregistered" wording on `privacy.html`, `terms.html`, `scripts/partials/footer.html` and `businessLine()` in `js/business-info.js` (both PDF footers) at once.

## Contact / lead form

The form on `contact.html` checks name, a real phone number (10–15 digits) and email before doing anything, with a message under each field. Fields have maximum lengths (name 100, phone 25, email 254 characters) and "Tell Us About Your Project" stops at 2,000 characters, with a counter under it ("0 / 2,000 characters", red with "N left" from 200 remaining; screen readers are told at 200, 50 and at the limit).

- **No endpoint set (current):** pressing the button opens the visitor's own email app with the request filled in, and the page says plainly that nothing is received until they press Send there (with a link to open the email again, plus the phone number and email address). It never claims a request "has been received".
- **Endpoint set** (`leadForm.endpoint` in `site-config.json`): pressing **Send Request** sends the form, including any estimate summary carried over from the chat, with `fetch()` as a normal form POST with `Accept: application/json` (the Formspree convention; Basin, Getform and similar services work the same way). The button shows "Sending…" and is disabled until the reply; "Request sent" appears **only** after a successful (2xx) reply. Any failure or a 15-second timeout shows "Sorry, your request wasn't sent", keeps what was typed, and offers the visitor's email app as the **fallback** ("send it with your email app instead" opens a filled-in email) plus the phone number and email. A hidden `_gotcha` field catches simple spam bots. The "How this form works" text on the form and the Privacy Notice switch automatically to name the service (from `leadForm.serviceName`, or recognised from the endpoint) and link its privacy policy (`leadForm.servicePrivacyUrl`).

**Connecting a form service (go-live checklist):**

1. Create a form at the service (e.g. formspree.io) with the business email as the recipient, and copy its endpoint (`https://formspree.io/f/…`).
2. In `site-config.json`, set `leadForm.endpoint` to it, `leadForm.serviceName` to the service's name (e.g. `"Formspree"`) and `leadForm.servicePrivacyUrl` to its privacy policy URL. Run `npm test` (or let CI run it) — it fails if the endpoint isn't `https://` or the service isn't named.
3. Commit. After Vercel redeploys, open the live Get a Quote page **on a computer with no email app set up** (or in a private window, where no email app will open), fill in every field, send a test request, and check that the page says "Request sent" and the email arrives in the business inbox with every field. Then do the same starting from a chat estimate ("Get a Quote →" on the estimate card), and check the estimate summary arrives too. Finally check that the form text ("How this form works") and the Privacy Notice name the service.
4. Some services (Formspree included) ask you to confirm the first submission or the recipient address by email — do that, then send one more test.
5. Add the service's stored submissions to the monthly clean-up (above).

Until a service is connected, nothing reaches the business unless the visitor's own email app sends it, and the site can't tell whether it did. Connecting one needs the owner to create the service account; no code change is needed.

## Visitor counts (analytics)

Off by default. When `analytics.enabled` is `true` with a supported `analytics.provider`, `js/analytics.js` loads the provider's script on the public pages (never on `/admin/`) and counts page views plus these events, by name only — never anything the visitor typed:

| Event                       | When                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `Estimate started`          | the chat estimate starts                                                               |
| `Estimate completed`        | the estimate card is shown                                                             |
| `Estimate PDF failed`       | the estimate PDF couldn't be prepared                                                  |
| `Get a Quote from estimate` | the Get a Quote page opens from an estimate                                            |
| `Quote request sent`        | the form service accepted a request (only with `leadForm.endpoint` set)                |
| `Quote request failed`      | sending through the form service failed or timed out                                   |
| `Quote email opened`        | the visitor's email app was opened with the request (no form service, so not a "sent") |

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
npm run lint      # ESLint (zero warnings allowed; no function over 150 lines)
npm run typecheck # TypeScript checks the JavaScript through its JSDoc (tsconfig.json; nothing is built)
npm run format:check   # Prettier (npm run format to fix)
npm run check:pages    # shared header/footer and contact details are in sync (notice if price text is older than site-config.json)
npm run check:placeholders   # no [BRACKETED PLACEHOLDER] visible on any page
npm run check:deploy -- <url>  # (not part of npm test) a deployed site serves exactly this checkout
npm run test:unit      # pricing, chat-reply, settings-file (incl. prices), page-sync and contact-details unit tests (node --test)
npm run test:e2e       # Playwright browser tests (Chromium)
```

The browser tests cover the chat estimate (including validation, feet and inches, Back, reload, the PDF, and the card opening on its total at phone and desktop sizes), the chat's full-screen/focus behaviour and replies, the estimator switch, the contact form in both modes (including the email-app fallback), visitor counts on and off, the admin tool (one-screen quote with customer details, save/edit/delete, double save, reload, per-quote drafts across two tabs, the unsaved-changes prompts, the error summary counting down, styled dialogs, job booked and retention, messages, old quotes, storage failure, phone layout), admin backups (never-backed-up and overdue warnings, the backup date, one-step restore after the browser's storage is cleared, Business Prices carried to a new browser, and each answer from the browser about keeping data), both PDFs' business line, a price changed in the settings reaching every page, the chat, the estimate and admin quotes (and invalid prices switching the estimator off), every page at 375/390/768/1280px (no sideways scroll, no placeholders, no console errors or missing files), prices in page text, the 404 page, favicon, focus rings, tap-target sizes, and colour contrast in light and dark themes (axe-core). First-time Playwright setup on a new machine: `npx playwright install chromium`.

**CI:** `.github/workflows/ci.yml` runs all of the above (except `check:deploy`) on every push and pull request, as one check named **"Lint, format, page sync, placeholders, unit and browser tests"** (workflow "CI"). CI only reports; it does **not** stop a failing change being merged until branch protection is turned on for the production branch — a GitHub setting a repository admin changes (still to do, see "Owner inputs"):

1. On GitHub, open the repository → **Settings** → (under "Code and automation") **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**. (Classic alternative: **Settings** → **Branches** → **Add classic branch protection rule**.)
2. Give it a name (e.g. "Production needs CI"), set **Enforcement status** to **Active**.
3. Under **Target branches** → **Add target** → **Include default branch** (or "Include by pattern" and type the production branch set in Vercel → Settings → Git, normally `main`).
4. Tick **Require a pull request before merging** (so changes arrive as pull requests that CI checks) and **Require status checks to pass**; under the latter press **Add checks**, type `Lint, format`, and pick **"Lint, format, page sync, placeholders, unit and browser tests"** (it only appears once CI has run at least once). Press **Create**.
5. Check it works: open a pull request that breaks a unit test (e.g. change an expected total in `tests/unit/pricing.test.js`); GitHub should show "Merging is blocked" until it passes. Close the pull request without merging.

Rulesets and branch protection are free for public repositories; a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise) for them to be enforced.

**While branch protection is on:** GitHub won't accept commits straight to the production branch, so when you edit `site-config.json` on GitHub choose **"Create a new branch for this commit and start a pull request"**, press **Create pull request**, wait for the green tick (about 3–5 minutes), then **Merge**. For the two emergency switches, the repository admin can instead add themselves under the ruleset's **Bypass list** ("Repository admin" role), which lets them commit straight to the production branch; CI still runs afterwards and shows a red cross if something is wrong.

## Deploying (Vercel)

The site is deployed on Vercel from this GitHub repository as a static site: framework preset "Other", **no build command**, output directory = the repository root. Vercel serves `404.html` for unknown URLs automatically.

- **Deploy:** push (or merge a pull request) to the production branch set in the Vercel project (Settings → Git). Vercel builds a production deployment within about a minute. Every other branch and pull request gets its own preview URL, which is a good place to check a change first.
- **Check a deploy:** Vercel dashboard → the project → Deployments; the newest production one should say "Ready" and show the commit you expect. Then, from a checkout of that commit, run `npm run check:deploy -- https://premium-restoration.vercel.app`: it compares every page, script, stylesheet and `site-config.json` on the live site with the checkout and checks that removed pages (`gallery.html`) answer 404. "serves exactly this checkout" = the deploy is right; otherwise it lists what differs.
- **Current state (September 24, 2026):** production is still on an older build — `npm run check:deploy` reports every file as different, `js/business-info.js` missing and `/gallery.html` still answering. This branch's work reaches production only once it is merged into the production branch (open a pull request from this branch, let CI pass, merge), after which Vercel deploys it; then run the check above.
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
- **A durable, shared store for admin quotes**: quotes are kept only in the browser that created them (see "Backups and moving to another device"). For quotes to survive on their own and be shared between devices, the owner needs to choose and create an account with a hosted database or back-end service (for example Supabase, Firebase or a Vercel storage product), which also brings real server-side log-in. That account, its cost and where customer data is stored are the owner's decisions; once chosen, the admin tool's storage functions (`js/admin/core.js`, `drafts.js`, `backup.js`) can be moved onto it, and the Privacy Notice updated to name it. Until then, export a backup at the end of every working day.
- **Form service**: whether to use one (e.g. Formspree) and its endpoint → `leadForm.*`, then the go-live checklist in "Contact / lead form" (a real test request must arrive in the business inbox). Until then, the form uses the visitor's email app, and the site can't tell whether a request was sent.
- **Tile floor rate**: the owner said "$5 per square foot for flooring". The site charges $5/sq ft for **other flooring** but prices a **tile floor** at the tile rate, **$4/sq ft** (`prices.tilePerSqFt` in `site-config.json`), in the chat estimate, chat answers, admin quotes and PDFs. Confirm in writing which is right. If tile floors should be $5/sq ft, that is a change to the calculation, not just a price: the floor-tile line in `computeEstimate()` (`js/bathroom-pricing.js`) must use the flooring rate (changing `tilePerSqFt` would also change wall tile), the chat's flooring/tile answers and the "Surfaces" note in the admin must say so, and the pricing unit tests must be updated to pin the confirmed rate. No price has been changed until then.
- **Visitor counts**: whether to switch on anonymous counts, and with which provider (Vercel Web Analytics or Plausible) → `analytics.*` (see "Visitor counts").
- **Spanish / French**: whether customers need these languages. If yes, full translations of the pages, chat, estimate card and PDF (with a language switcher) are a separate piece of work; if English only, record that decision here.
- **Plumbing and licence position**: how plumbing/electrical work is handled (in-house with a licence, a named licensed subcontractor, or not at all), on legal advice — then update the wording (see "Licence line").
- **Photos** of completed projects, with each client's written permission (or properly licensed images captioned as illustrative), for the home and About pages; see "Photos".
- **Free quotes**: confirm whether quotes are always free before any page says "free".
- **Tax**: a tax adviser's confirmation before any tax is added to quotes.
- **Prices other than $60/cabinet and $5/sq ft of flooring**: confirm the remaining published rates (demolition, tile, paint, fixtures) are current. Any change is made in `site-config.json` → `prices` (see "Site settings").
- **Estimator on or off**: confirm the owner is happy publishing live prices through the chat (`priceEstimator.enabled`).
- **GitHub branch protection** requiring the CI check before merging (repository admin; steps under "Tests and checks").

## Legal pages

The Privacy Notice and Terms show a "Last updated" date (currently September 24, 2026). Change it whenever either page's wording changes.
