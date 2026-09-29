"use strict";

// Spanish and Portuguese: the language menu, remembering the choice, the
// browser-language redirect, and the chat estimate end to end in each.

const { test, expect } = require("@playwright/test");
const { sendChat } = require("./helpers");

test.describe("language menu", () => {
  test("switching language keeps the page, and the choice is remembered", async ({ page }) => {
    await page.goto("/faq.html");
    await page.locator(".lang-menu summary").click();
    await page.getByRole("link", { name: "Español" }).click();
    await expect(page).toHaveURL(/\/es\/faq\.html$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("h1")).not.toContainText("Frequently");
    expect(await page.evaluate(() => localStorage.getItem("pr_lang"))).toBe("es");

    // An English link now opens the Spanish page, keeping ?query and #hash.
    await page.goto("/index.html?x=1#pricing");
    await expect(page).toHaveURL(/\/es\/index\.html\?x=1#pricing$/);

    // Choosing English again sticks too.
    await page.locator(".lang-menu summary").click();
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await page.goto("/about.html");
    await expect(page).toHaveURL(/\/about\.html$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the menu lists all three languages, marks the current one, and closes with Escape", async ({ page }) => {
    await page.goto("/pt/contact.html");
    const menu = page.locator(".lang-menu");
    await menu.locator("summary").click();
    await expect(menu.getByRole("link")).toHaveText(["English", "Español", "Português"]);
    await expect(menu.getByRole("link", { name: "Português" })).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
  });
});

test.describe("a Portuguese browser", () => {
  test.use({ locale: "pt-BR" });

  test("is sent to the Portuguese page on its first visit", async ({ page }) => {
    await page.goto("/contact.html");
    await expect(page).toHaveURL(/\/pt\/contact\.html$/);
    await expect(page.locator("h1")).toContainText("orçamento");
  });

  test("stays in English once English is chosen", async ({ page }) => {
    await page.goto("/index.html?lang=en");
    await expect(page).toHaveURL(/\/index\.html$/);
    await page.goto("/about.html");
    await expect(page).toHaveURL(/\/about\.html$/);
  });
});

test.describe("an English browser", () => {
  test.use({ locale: "en-US" });

  test("stays on the English pages", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("chat in Spanish and Portuguese", () => {
  test("the assistant answers in Portuguese, with prices in Portuguese format", async ({ page }) => {
    await page.goto("/pt/index.html");
    await sendChat(page, "quanto custa o porcelanato?");
    await expect(page.locator(".ai-chat-row.bot .ai-chat-text").last()).toContainText(
      "custa US$ 4 por pé quadrado de piso ou parede",
    );
  });

  test("a whole estimate in Spanish, through to the Contact form", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/es/index.html");
    await page.click("#ai-chat-quote-starter");
    const scope = page.locator('form[data-group="scope"]');
    const answer = (question, label) =>
      scope
        .locator(".ai-chat-group-field", { hasText: question })
        .getByRole("button", { name: label, exact: true })
        .click();
    await answer("¿Quitar primero el baño actual (demolición)?", "No");
    await answer("¿Piso nuevo?", "Otro tipo de piso");
    await answer("¿Paredes?", "Ninguno");
    await answer("¿Pintar el techo?", "No");
    await scope.getByRole("button", { name: "Continuar →" }).click();

    // A decimal comma is understood: 7,5 ft.
    const dims = page.locator('form[data-group="dimensions"]');
    await dims.locator('input[name="Bathroom_Width_Ft"]').fill("7,5");
    await dims.locator('input[name="Bathroom_Length_Ft"]').fill("8");
    await dims.getByRole("button", { name: "Continuar →" }).click();
    for (let i = 0; i < 2; i++) {
      const skip = page.locator(".ai-chat-group-cancel", { hasText: "Omitir" }).last();
      if ((await skip.isVisible().catch(() => false)) && (await skip.isEnabled().catch(() => false))) {
        await skip.click();
      }
    }

    const fixtures = page.locator('form[data-group="fixtures"]');
    await expect(fixtures.locator("label", { hasText: "Muebles de lavabo" })).toBeVisible();
    await fixtures.getByRole("button", { name: /Ver mi estimación/ }).click();

    // Flooring is a materials category: ZIP code, then one product pick.
    await expect(page.locator(".ai-chat-field-label", { hasText: "Código postal (ZIP)" })).toBeVisible();
    await page.locator('input[autocomplete="postal-code"]').fill("123");
    await page.locator('input[autocomplete="postal-code"]').press("Enter");
    await expect(page.locator(".ai-chat-field-error")).toHaveText("Escriba un código postal de 5 dígitos.");
    await page.locator('input[autocomplete="postal-code"]').fill("84101");
    await page.locator('input[autocomplete="postal-code"]').press("Enter");
    const pick = page.locator(".ai-chat-group-form").last();
    await expect(pick).toContainText("Elija el producto para: piso (60 pies²)");
    await pick.locator(".ai-chat-choice").first().click();
    await pick.getByRole("button", { name: "Ver mi estimación →" }).click();

    const card = page.locator('[data-testid="estimate-card"]');
    await expect(card).toContainText("Su estimación");
    await expect(card).toContainText("60 pies² × $5.00");
    await expect(card).toContainText("Área del piso: 7.5 × 8 pies = 60 pies²");
    await expect(card).toContainText("Total estimado (mano de obra + materiales)");
    await expect(card.getByRole("button", { name: "Descargar en PDF" })).toBeVisible();

    await card.getByRole("link", { name: "Contáctenos sobre esto →" }).click();
    await expect(page).toHaveURL(/\/es\/contact\.html\?from=estimate$/);
    await expect(page.locator("#message")).toHaveValue(/^Mi estimación del baño hecha en su sitio web:/);
    await page.click("#lead-submit");
    await expect(page.locator("#name-error")).toHaveText("Escriba su nombre.");
  });
});
