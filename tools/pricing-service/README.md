# Kohler pricing service

Live Home Depot prices for the Kohler products a customer picks in the 3D
room. When they click **See estimate**, the site sends their ZIP code and the
model numbers they picked to this service, which looks each one up at the
Home Depot store nearest that ZIP and answers with the prices. The estimate
card lists each product at that price; anything without one is named in a
note and left out of the total.

It's the Restor pipeline's step 4 (`4.py`) turned into a small web service,
with the lookup rewritten for Home Depot's current pages (`homedepot.py`).
It drives a real, visible Chrome window, so it can't run on Vercel: it runs
on a computer with Chrome installed, and the site calls it over the internet.

## Run it

```bash
cd tools/pricing-service
python3 -m pip install -r requirements.txt
python3 server.py
```

It listens on port 8787 (`PORT` to change it). Leave the Chrome window it
opens alone; closing it just makes the next request open a new one. If
Chrome fails to start with a version error, set `CHROME_VERSION` to your
Chrome's major version (for example `CHROME_VERSION=154 python3 server.py`).

Check it: `curl -X POST localhost:8787/prices -H 'Content-Type: application/json' -d '{"zip":"84101","mmns":["K-31648-0"]}'`

## Point the site at it

The site only accepts an `https://` address (or `http://localhost` while
testing on this computer), so expose the port with a tunnel, for example
Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8787
```

Then put the address it prints, plus `/prices`, in `site-config.json`:

```json
"productPricing": { "endpoint": "https://<your-tunnel>.trycloudflare.com/prices" }
```

Commit and push; Vercel redeploys. With the endpoint empty, or the service
unreachable, the estimate still works and says the Kohler products weren't
priced.

## How long it takes

Setting the store for a new ZIP takes about 15 seconds, then about 3 to 10
seconds per product. Prices are cached per ZIP and model for 24 hours
(`CACHE_HOURS`) in `cache.json`, so repeat lookups are instant. The site
waits up to 2.5 minutes before giving up.

## Limits

- Only model numbers in `models/products/kohler/manifest.json` are looked
  up, only for 5-digit ZIPs, at most 40 per request.
- Only the site's own addresses (the live site, its Vercel previews and
  localhost) can call it from a browser (`ALLOWED_ORIGINS` to change).
- It reads Home Depot's public pages the way a shopper's browser does.
  Home Depot's terms don't invite this, and it will break when their pages
  change; `homedepot.py` is the one place to fix.
