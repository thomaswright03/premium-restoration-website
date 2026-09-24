"use strict";

const { test, expect } = require("@playwright/test");
const { useConfig } = require("./helpers");

async function fillValid(page) {
  await page.fill("#name", "Test Person");
  await page.fill("#phone", "(385) 555-0100");
  await page.fill("#email", "test@example.com");
  await page.fill("#message", "Small bathroom, new floor.");
}

test.describe("contact form without a form endpoint (email app)", () => {
  test("explains the email-app flow and builds the email with every field", async ({ page }) => {
    await page.goto("/contact.html");
    await expect(page.locator("#lead-submit span:visible")).toHaveText("Open Email to Send Request");
    await expect(page.locator(".form-consent:visible")).toContainText("your own email app opens a message to us");
    await fillValid(page);
    await page.click("#lead-submit");
    const status = page.locator("#form-status");
    await expect(status).toContainText("Please press Send in your email app");
    const href = await page.locator("#mailto-link").getAttribute("href");
    expect(href).toMatch(/^mailto:eduardo\.moroni77@gmail\.com\?subject=/);
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body).toContain("Name: Test Person");
    expect(body).toContain("Phone: (385) 555-0100");
    expect(body).toContain("Project details:\nSmall bathroom, new floor.");
    await expect(status).not.toContainText("Request sent");
  });

  test("validates the phone number and required fields", async ({ page }) => {
    await page.goto("/contact.html");
    await page.fill("#name", "Test Person");
    await page.fill("#phone", "abc");
    await page.fill("#email", "not-an-email");
    await page.click("#lead-submit");
    await expect(page.locator("#phone-error")).toHaveText(/valid phone number/);
    await expect(page.locator("#email-error")).toHaveText(/valid email address/);
    await expect(page.locator("#phone")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#form-status")).toBeHidden();
  });
});

test.describe("contact form with a form endpoint (site-config.json leadForm.endpoint)", () => {
  const ENDPOINT = "https://forms.example.test/f/abc123";

  test("sends with fetch, shows Sending…, then 'Request sent' only after success", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: ENDPOINT, serviceName: "Formspree" } });
    let posts = 0;
    let body = "";
    await page.route(ENDPOINT, async (route) => {
      posts++;
      body = route.request().postData() || "";
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/contact.html");
    await expect(page.locator("#lead-submit span:visible")).toHaveText("Send Request");
    await expect(page.locator(".form-consent:visible")).toContainText("sent to us through Formspree");
    await fillValid(page);
    await page.click("#lead-submit");
    await expect(page.locator("#lead-submit")).toBeDisabled();
    await expect(page.locator("#lead-submit")).toHaveText("Sending…");
    await expect(page.locator("#form-status")).not.toContainText("Request sent");
    // A second press while sending does nothing.
    await page
      .locator("#lead-submit")
      .click({ force: true })
      .catch(() => {});
    await expect(page.locator("#form-status")).toContainText("Request sent.");
    expect(posts).toBe(1);
    expect(body).toContain("Test Person");
    expect(body).toContain("Small bathroom, new floor.");
    await expect(page.locator("#name")).toHaveValue("");
    await expect(page.locator("#lead-submit")).toBeEnabled();
  });

  test("a failed send shows a clear error with the phone number and keeps what was typed", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: ENDPOINT } });
    await page.route(ENDPOINT, (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/contact.html");
    await fillValid(page);
    await page.click("#lead-submit");
    const status = page.locator("#form-status");
    await expect(status).toContainText("Sorry, your request wasn't sent.");
    await expect(status).toContainText("(385) 356-8733");
    await expect(status).not.toContainText("Request sent.");
    await expect(page.locator("#name")).toHaveValue("Test Person");
    await expect(page.locator("#lead-submit")).toBeEnabled();
    // The visitor's own email app is offered as the fallback, filled in.
    const fallback = page.locator("#mailto-fallback");
    await expect(fallback).toHaveText("send it with your email app instead");
    const href = await fallback.getAttribute("href");
    expect(href).toMatch(/^mailto:eduardo\.moroni77@gmail\.com\?subject=/);
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body).toContain("Name: Test Person");
    expect(body).toContain("Project details:\nSmall bathroom, new floor.");
  });

  test("a network failure or timeout is also reported, never as sent", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: ENDPOINT, serviceName: "Formspree" } });
    await page.route(ENDPOINT, (route) => route.abort("failed"));
    await page.goto("/contact.html");
    await fillValid(page);
    await page.click("#lead-submit");
    await expect(page.locator("#form-status")).toContainText("Sorry, your request wasn't sent.");
    await expect(page.locator("#mailto-fallback")).toBeVisible();
  });

  test("the estimate summary from the chat is sent with the request", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: ENDPOINT, serviceName: "Formspree" } });
    let body = "";
    await page.route(ENDPOINT, async (route) => {
      body = route.request().postData() || "";
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/index.html");
    await page.evaluate(() =>
      sessionStorage.setItem("pr_estimate_summary", "My bathroom estimate from your website:\n- Cabinets 3"),
    );
    await page.goto("/contact.html?from=estimate");
    await expect(page.locator("#message")).toHaveValue(/Cabinets 3/);
    await page.fill("#name", "Test Person");
    await page.fill("#phone", "(385) 555-0100");
    await page.fill("#email", "test@example.com");
    await page.click("#lead-submit");
    await expect(page.locator("#form-status")).toContainText("Request sent.");
    expect(body).toContain("My bathroom estimate from your website:");
    expect(body).toContain("Cabinets 3");
  });

  test("a well-known form service is named even if serviceName is left blank", async ({ page }) => {
    const FORMSPREE = "https://formspree.io/f/testform";
    await useConfig(page, {
      leadForm: { endpoint: FORMSPREE, serviceName: "", servicePrivacyUrl: "https://example.test/privacy" },
    });
    await page.goto("/contact.html");
    await expect(page.locator(".form-consent:visible")).toContainText("sent to us through Formspree");
    await expect(
      page.locator(".form-consent:visible").getByRole("link", { name: "its privacy policy" }),
    ).toHaveAttribute("href", "https://example.test/privacy");
    await page.goto("/privacy.html");
    await expect(page.locator("main")).toContainText("Formspree receives and stores what you send");
  });

  test("the Privacy Notice names the form service once one is configured", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: ENDPOINT, serviceName: "Formspree" } });
    await page.goto("/privacy.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    const text = await page.locator("main").innerText();
    expect(text).toContain("sent to us through Formspree");
    expect(text).toContain("Formspree receives and stores what you send");
    expect(text).not.toContain("it opens your own email app");
  });

  test("a non-https endpoint is ignored and the email-app form is kept", async ({ page }) => {
    await useConfig(page, { leadForm: { endpoint: "http://insecure.example.test/f" } });
    await page.goto("/contact.html");
    await expect(page.locator("html")).toHaveAttribute("data-config", "loaded");
    await expect(page.locator("#lead-submit span:visible")).toHaveText("Open Email to Send Request");
  });
});
