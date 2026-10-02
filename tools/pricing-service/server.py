"""Live Kohler pricing for the website's estimate.

The chat's last step (js/script.js priceKohlerPicks) sends the customer's
ZIP and the model numbers of the Kohler products they picked in the 3D
room; this looks each one up at the Home Depot store nearest that ZIP
(homedepot.py) and answers with the prices.

    POST /prices  {"zip": "84101", "mmns": ["K-31648-0", "K-14436-CP"]}
    -> {"zip": "84101", "store": "21st South",
        "results": {"K-31648-0": {"found": true, "price": 369.22,
                                  "name": "...", "url": "https://..."},
                    "K-14436-CP": {...}}}

One Chrome window does all the lookups, one request at a time. Answers are
kept for CACHE_HOURS (at most a day, as the privacy notice says) per ZIP
and model, in cache.json next to this file, so the same products near the
same ZIP come back instantly. Nothing about who asked is stored or logged.

Only model numbers the site actually offers (models/products/kohler/
manifest.json) are looked up, and only for 5-digit ZIPs. See README.md for
running it and pointing the site at it.
"""

import json
import os
import queue
import re
import threading
import time
from concurrent.futures import Future
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from selenium.common.exceptions import WebDriverException

import homedepot

HERE = Path(__file__).resolve().parent
MANIFEST = HERE.parent.parent / "models" / "products" / "kohler" / "manifest.json"
CACHE_FILE = HERE / "cache.json"
PORT = int(os.environ.get("PORT", "8787"))
CACHE_HOURS = float(os.environ.get("CACHE_HOURS", "24"))
MAX_MODELS = 40
# The live site, its Vercel previews, and the local dev server.
ALLOWED_ORIGIN = re.compile(
    os.environ.get(
        "ALLOWED_ORIGINS",
        r"^(https://premium-restoration(-[a-z0-9-]+)?\.vercel\.app|http://localhost(:\d+)?)$",
    )
)

KNOWN_MODELS = {p["mmn"] for p in json.loads(MANIFEST.read_text())["products"]}


def load_cache():
    try:
        return json.loads(CACHE_FILE.read_text())
    except (OSError, ValueError):
        return {"stores": {}, "prices": {}}


cache = load_cache()
cache_lock = threading.Lock()


def fresh(entry):
    return entry is not None and time.time() - entry["at"] < CACHE_HOURS * 3600


def save_cache():
    """Drops anything older than CACHE_HOURS before writing (the privacy
    notice promises prices are kept no more than a day)."""
    for table in ("stores", "prices"):
        cache[table] = {k: v for k, v in cache[table].items() if fresh(v)}
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache))
    tmp.replace(CACHE_FILE)


jobs = queue.Queue()


def worker():
    """Owns the one Chrome window; restarts it if it dies."""
    driver = None
    current_zip = None
    while True:
        zipcode, mmns, done = jobs.get()
        try:
            for attempt in range(2):
                try:
                    if driver is None:
                        driver = homedepot.start_driver()
                        current_zip = None
                    if current_zip != zipcode:
                        store = homedepot.set_store(driver, zipcode)
                        current_zip = zipcode
                        with cache_lock:
                            cache["stores"][zipcode] = {"at": time.time(), "store": store}
                    for mmn in mmns:
                        key = zipcode + "|" + mmn
                        with cache_lock:
                            if fresh(cache["prices"].get(key)):
                                continue
                        result = homedepot.price_of(driver, mmn)
                        result["checkedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                        with cache_lock:
                            cache["prices"][key] = {"at": time.time(), "result": result}
                    break
                except WebDriverException:
                    try:
                        driver.quit()
                    except Exception:
                        pass
                    driver = None
                    if attempt == 1:
                        raise
            with cache_lock:
                save_cache()
            done.set_result(True)
        except Exception as err:  # the request answers with what's cached
            done.set_exception(err)


def answer(zipcode, mmns):
    with cache_lock:
        store = cache["stores"].get(zipcode)
        missing = [m for m in mmns if not fresh(cache["prices"].get(zipcode + "|" + m))]
    if missing or not fresh(store):
        done = Future()
        jobs.put((zipcode, missing, done))
        try:
            done.result(timeout=170)
        except Exception:
            pass
    with cache_lock:
        store = cache["stores"].get(zipcode) or {}
        results = {}
        for m in mmns:
            entry = cache["prices"].get(zipcode + "|" + m)
            if entry:
                results[m] = entry["result"]
    return {"zip": zipcode, "store": store.get("store"), "results": results}


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get("Origin", "")
        if ALLOWED_ORIGIN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"ok": True})
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/prices":
            self.reply(404, {"error": "not found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 10000)
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self.reply(400, {"error": "send JSON"})
            return
        zipcode = str(body.get("zip", "")).strip()
        mmns = body.get("mmns")
        if not re.fullmatch(r"\d{5}", zipcode):
            self.reply(400, {"error": "zip must be 5 digits"})
            return
        if not isinstance(mmns, list) or not mmns or len(mmns) > MAX_MODELS:
            self.reply(400, {"error": "mmns must be a list of 1 to %d model numbers" % MAX_MODELS})
            return
        mmns = [m for m in dict.fromkeys(str(m) for m in mmns) if m in KNOWN_MODELS]
        if not mmns:
            self.reply(400, {"error": "none of those are Kohler products the site offers"})
            return
        self.reply(200, answer(zipcode, mmns))

    def log_message(self, fmt, *args):
        # No client addresses: nothing here identifies who asked.
        print(fmt % args, flush=True)


if __name__ == "__main__":
    threading.Thread(target=worker, daemon=True).start()
    print("Kohler pricing service on http://localhost:%d (POST /prices)" % PORT, flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
