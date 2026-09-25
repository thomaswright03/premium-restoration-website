"use strict";

const { test, expect } = require("@playwright/test");
const { startEstimate, answerScope, fillGroup, useConfig, sendChat } = require("./helpers");

const NEEDS_WALLS = { demolition: "No", floorFinish: "Tile", walls: "Tile (full height)", paintCeiling: "Yes" };

test.describe("3D bathroom room preview", () => {
  test("mounts a sized canvas and is available as soon as an estimate starts, before dimensions are known", async ({
    page,
  }) => {
    await startEstimate(page);

    await expect(page.locator("#ai-chat-room-3d")).toBeVisible();
    const canvas = page.locator("#ai-chat-room-3d-canvas-wrap canvas");
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => window.BathroomRoom3D && window.BathroomRoom3D.available === true);

    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test("stays live-updating through scope, dimensions and fixtures", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 10, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 });
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Vanity_Quantity: 1, Mirror_Quantity: 1 });

    const stillAvailable = await page.evaluate(() => window.BathroomRoom3D.available);
    expect(stillAvailable).toBe(true);
    // The whole flow finished (fixtures is the last group), so the estimate
    // card is up and the 3D panel is no longer part of an in-progress form —
    // the scene object itself must simply have survived every live update.
    await expect(page.getByTestId("estimate-card")).toBeVisible();
  });

  test("cancelling mid-estimate hides the panel; starting again shows a clean one", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    // Still mid-flow here (the dimensions group is active), so its Cancel
    // button is the enabled one.
    await page.locator('form[data-group="dimensions"] .ai-chat-group-cancel', { hasText: "Cancel" }).click();
    await expect(page.locator("#ai-chat-room-3d")).toBeHidden();

    // The one-time suggestion button is gone once used (see chat.spec.js),
    // so a real visitor restarts through the chat input instead.
    await sendChat(page, "bathroom quote");
    await expect(page.locator("#ai-chat-room-3d")).toBeVisible();
    await page.waitForFunction(() => window.BathroomRoom3D && window.BathroomRoom3D.available === true);
  });

  test("off when bathroomVisualizer.enabled is false", async ({ page }) => {
    await useConfig(page, { bathroomVisualizer: { enabled: false } });
    await startEstimate(page);
    await expect(page.locator("#ai-chat-room-3d")).toBeHidden();
  });
});
