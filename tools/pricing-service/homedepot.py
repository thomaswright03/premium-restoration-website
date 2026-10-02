"""Live Home Depot prices by model number, for the store nearest a ZIP code.

The Restor pipeline's step 4 (4.py), updated for Home Depot's current pages:
4.py's fixed XPaths no longer match anything, so it reported every product
as not found. This drives a real Chrome the same way (undetected
chromedriver), but finds things by Home Depot's own data-testid attributes
and the product page's structured data, which change far less often.

    driver = start_driver()
    store = set_store(driver, "84101")        # -> "21st South"
    price_of(driver, "K-31648-0")             # -> {"found": True, "price": 369.22, ...}
"""

import json
import os
import re
import time

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

HOME = "https://www.homedepot.com/"


def start_driver():
    """A visible Chrome window (Home Depot turns headless browsers away).
    CHROME_VERSION pins the chromedriver to the installed Chrome's major
    version when undetected-chromedriver guesses wrong."""
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1400,1000")
    version = os.environ.get("CHROME_VERSION")
    return uc.Chrome(options=options, version_main=int(version) if version else None)


def set_store(driver, zipcode):
    """Makes the store nearest zipcode the shopping store, so prices are
    that store's. Returns the store's name, or None if none was found."""
    driver.get(HOME)
    WebDriverWait(driver, 20).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='my-store-button']"))
    ).click()
    box = WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, "input[placeholder^='ZIP Code']"))
    )
    box.clear()
    box.send_keys(zipcode)
    box.send_keys(Keys.RETURN)
    time.sleep(3)
    buttons = [
        b
        for b in driver.find_elements(By.CSS_SELECTOR, "[data-testid='store-pod-localize__button']")
        if b.is_displayed()
    ]
    if not buttons:
        return None
    buttons[0].click()  # nearest store first
    time.sleep(3)
    shown = driver.find_elements(By.CSS_SELECTOR, "[data-testid='my-store-button']")
    return shown[0].text.split("\n")[0].strip() if shown else None


def _same_model(shown, mmn):
    """Home Depot lists some Kohler models without the "K-" prefix."""
    strip = lambda m: re.sub(r"^K-", "", str(m).strip().upper())
    return strip(shown) == strip(mmn)


_LD_JSON = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)


def _from_product_page(html, mmn):
    for match in _LD_JSON.finditer(html):
        try:
            data = json.loads(match.group(1))
        except ValueError:
            continue
        if isinstance(data, dict) and data.get("@type") == "Product":
            if not _same_model(data.get("model", ""), mmn):
                return None
            offer = data.get("offers") or {}
            price = offer.get("price")
            return {
                "found": True,
                "price": float(price) if price is not None else None,
                "name": data.get("name"),
                "url": (offer.get("url") or "").split("?")[0] or None,
            }
    return None


def _from_search_results(driver, mmn):
    for pod in driver.find_elements(By.CSS_SELECTOR, "[data-testid='product-pod']"):
        model = re.search(r"Model#\s*(\S+)", pod.text)
        if not model or not _same_model(model.group(1), mmn):
            continue
        price = pod.find_elements(By.CSS_SELECTOR, "[data-testid='price-simple']")
        cents = re.sub(r"[^\d]", "", price[0].text) if price else ""
        name = pod.find_elements(By.CSS_SELECTOR, "[data-testid='product-header']")
        link = pod.find_elements(By.CSS_SELECTOR, "a[href*='/p/']")
        return {
            "found": True,
            "price": int(cents) / 100 if cents else None,
            "name": name[0].text.strip() if name else None,
            "url": link[0].get_attribute("href").split("?")[0] if link else None,
        }
    return None


def price_of(driver, mmn, timeout=30):
    """The product's price at the current store. Searches for the model
    number, then without its "K-" prefix (how Home Depot lists some Kohler
    models). {"found": False} when neither search turns it up."""
    found = _search(driver, mmn, mmn, timeout)
    if not found["found"] and mmn.upper().startswith("K-"):
        found = _search(driver, mmn[2:], mmn, timeout)
    return found


def _search(driver, query, mmn, timeout):
    """A search with one match lands on the product page; otherwise the
    matching result card is used."""
    driver.get(HOME + "s/" + query)
    started = time.time()
    while time.time() - started < timeout:
        time.sleep(1)
        url = driver.current_url or ""
        if "/p/" in url:
            found = _from_product_page(driver.page_source, mmn)
            if found:
                return found
        elif driver.find_elements(By.CSS_SELECTOR, "[data-testid='product-pod']"):
            time.sleep(1)
            found = _from_search_results(driver, mmn)
            if found:
                return found
            # Results that settled without this model: not sold there.
            if time.time() - started > 8:
                return {"found": False}
    return {"found": False}
