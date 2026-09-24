"use strict";

const { expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "site-config.json"), "utf8"));

// Serve a modified site-config.json for this page only.
async function useConfig(page, overrides) {
  const config = JSON.parse(JSON.stringify(BASE_CONFIG));
  for (const [section, values] of Object.entries(overrides || {})) {
    config[section] = Object.assign({}, config[section], values);
  }
  await page.route("**/site-config.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) }),
  );
  return config;
}

async function sendChat(page, text) {
  await page.fill("#ai-chat-input", text);
  await page.press("#ai-chat-input", "Enter");
}

async function startEstimate(page) {
  await page.goto("/index.html");
  await page.click("#ai-chat-quote-starter");
  await page.locator('form[data-group="scope"]').waitFor();
}

// scope: { demolition: "Yes"|"No", floorFinish: "Tile"|"Other flooring"|"None",
//          walls: "Tile (full height)"|"Paint"|"Neither", paintCeiling: "Yes"|"No" }
const SCOPE_LABELS = {
  demolition: "Remove the existing bathroom first (demolition)?",
  floorFinish: "New floor?",
  walls: "Walls?",
  paintCeiling: "Paint the ceiling?",
};

async function answerScope(page, scope) {
  const form = page.locator('form[data-group="scope"]').last();
  for (const [key, answer] of Object.entries(scope)) {
    const field = form.locator(".ai-chat-group-field", { hasText: SCOPE_LABELS[key] });
    await field.getByRole("button", { name: answer, exact: true }).click();
  }
  await form.getByRole("button", { name: /Continue/ }).click();
}

async function fillGroup(page, group, values) {
  const form = page.locator(`form[data-group="${group}"]`).last();
  for (const [name, value] of Object.entries(values)) {
    await form.locator(`input[name="${name}"]`).fill(String(value));
  }
  await form.locator(".ai-chat-group-continue").click();
}

async function loginAdmin(page) {
  await page.goto("/admin/");
  await page.fill("#login-password", "templein26)");
  await page.click('button:has-text("Log In")');
  await page.locator("#screen-dashboard").waitFor();
}

async function chooseAdmin(page, question, label) {
  await page.locator(".calc-row", { hasText: question }).locator("label.calc-choice", { hasText: label }).click();
}

// Everything is on one screen: property, customer and the calculator.
async function fillAdminQuote(page, { address, customer, dims, scope, counts }) {
  await page.click("#create-quote-btn");
  await page.locator("#screen-quote").waitFor();
  await page.fill("#quote-address", address);
  for (const [k, v] of Object.entries(customer || {})) await page.fill(`#quote-customer-${k}`, v);
  for (const [k, v] of Object.entries(dims || {})) await page.fill(`input[name="${k}"]`, String(v));
  for (const [k, v] of Object.entries(counts || {})) await page.fill(`input[name="${k}"]`, String(v));
  for (const [k, v] of Object.entries(scope || {})) await chooseAdmin(page, ADMIN_SCOPE_ROWS[k], v);
}

const ADMIN_SCOPE_ROWS = {
  demolition: "(demolition)",
  floorFinish: "New floor?",
  walls: "Walls?",
  paintCeiling: "Paint the ceiling?",
};

// The site's own confirmation dialog (not the browser's): press one of its buttons.
async function answerDialog(page, buttonName) {
  const dialog = page.locator("#admin-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: buttonName, exact: true }).click();
  await expect(dialog).toBeHidden();
}

module.exports = {
  answerDialog,
  ROOT,
  BASE_CONFIG,
  useConfig,
  sendChat,
  startEstimate,
  answerScope,
  fillGroup,
  loginAdmin,
  chooseAdmin,
  fillAdminQuote,
};
