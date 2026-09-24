"use strict";

// The unit tests price jobs with tests/fixtures/test-prices.json, not with
// whatever the owner currently has in site-config.json, so changing a price
// there never breaks the tests. (tests/unit/site-config.test.js checks the
// owner's prices themselves.)

const Pricing = require("../../js/bathroom-pricing.js");
const TEST_PRICES = require("../fixtures/test-prices.json");

const check = Pricing.validatePublishedPrices(TEST_PRICES);
if (!check.valid) throw new Error("tests/fixtures/test-prices.json: " + check.errors.join(" "));
Pricing.setPublishedPrices(check.prices);

module.exports = { Pricing, TEST_PRICES };
