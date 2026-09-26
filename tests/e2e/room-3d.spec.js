"use strict";

const { test, expect } = require("@playwright/test");
const { startEstimate, answerScope, fillGroup, useConfig, sendChat, skipRoomInteractionSteps } = require("./helpers");

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
    // The plumbing-walls and entry-points wall-click steps come next, right
    // after dimensions and before fixtures (see the dedicated describe
    // block below for that flow) — skip through them here since this test
    // is only about the scene surviving every live update, not that flow.
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Vanity_Quantity: 1, Mirror_Quantity: 1 });

    const stillAvailable = await page.evaluate(() => window.BathroomRoom3D.available);
    expect(stillAvailable).toBe(true);
    // The scene object itself must simply have survived every live update.
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

// Real canvas click coordinates, fixed to a point already confirmed (against
// the default overview camera framing for a 10x8x8 room) to land on a wall
// mesh rather than the floor/ceiling — see the fraction-of-canvas grid probe
// used while writing this test. Any point in that region works; this one is
// comfortably inside it.
const WALL_CLICK_FRACTION = { x: 0.3, y: 0.3 };

async function clickCanvasWall(page) {
  const box = await page.locator("#ai-chat-room-3d-canvas-wrap canvas").boundingBox();
  await page.mouse.click(box.x + box.width * WALL_CLICK_FRACTION.x, box.y + box.height * WALL_CLICK_FRACTION.y);
}

test.describe("3D room preview: wall-click plumbing walls, entry points, walk-in POV", () => {
  // Room-shape steps (plumbing walls, entry points) come right after
  // dimensions and before fixtures — they're basic facts about the room
  // itself, not something derived from which fixtures end up chosen, so
  // they're offered unconditionally (whenever the 3D preview is up),
  // before fixture counts are even asked.
  async function reachRoomShapeSteps(page) {
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 10, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 });
    await page.waitForFunction(() => window.BathroomRoom3D && window.BathroomRoom3D.available === true);
  }

  test("the plumbing-walls step appears right after dimensions, before fixtures; clicking a wall enables Continue", async ({
    page,
  }) => {
    await reachRoomShapeSteps(page);

    const intro = page.locator(".ai-chat-group-intro", { hasText: "Which wall(s) carry the plumbing stack" });
    await expect(intro).toBeVisible();
    const status = page.locator(".ai-chat-group-intro", { hasText: /selected/ }).last();
    await expect(status).toHaveText("No walls selected yet.");

    const continueBtn = page.locator(".ai-chat-group-continue", { hasText: "Continue" }).last();
    await expect(continueBtn).toBeDisabled();

    await clickCanvasWall(page);
    await expect(status).toHaveText("1 wall selected.");
    await expect(continueBtn).toBeEnabled();

    await continueBtn.click();
    // Next step is entry points, not fixtures yet.
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
  });

  test("skipping the plumbing-walls and entry-points steps still reaches the estimate once fixtures are filled", async ({
    page,
  }) => {
    await reachRoomShapeSteps(page);
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1 });
    await expect(page.getByTestId("estimate-card")).toBeVisible();
  });

  test("placing an entry point: pick a wall, nudge it, answer the door question, confirm, then fixtures, then the estimate", async ({
    page,
  }) => {
    await reachRoomShapeSteps(page);
    // Not the focus of this test — skip straight to entry points.
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator('input[type="text"][inputmode="numeric"]').last().fill("1");
    await page.locator(".ai-chat-group-continue", { hasText: "Continue" }).last().click();

    await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" })).toBeVisible();
    const confirmBtn = page.locator(".ai-chat-group-continue", { hasText: "Confirm entry point" });
    await expect(confirmBtn).toBeDisabled();

    await clickCanvasWall(page);
    await expect(page.locator(".ai-chat-group-intro", { hasText: "Wall selected" })).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    await page.locator("button", { hasText: "Move right →" }).click();
    await page.locator("button", { hasText: "No — open archway" }).click();
    await confirmBtn.click();

    // Fixtures come next, after the room-shape steps.
    await fillGroup(page, "fixtures", { Cabinet_Quantity: 1 });
    await expect(page.getByTestId("estimate-card")).toBeVisible();

    // The walk-in POV toggle appears once a real entry point is placed.
    const walkInBtn = page.locator(".ai-chat-room-3d-camera-toggle");
    await expect(walkInBtn).toBeVisible();
    await expect(walkInBtn).toHaveText("Walk in");
    await walkInBtn.click();
    await expect(walkInBtn).toHaveText("Overview");
    await expect(walkInBtn).toHaveAttribute("aria-pressed", "true");
    await walkInBtn.click();
    await expect(walkInBtn).toHaveText("Walk in");
  });

  test("multiple entry points show a per-entry switcher row once placed", async ({ page }) => {
    await reachRoomShapeSteps(page);
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator('input[type="text"][inputmode="numeric"]').last().fill("2");
    await page.locator(".ai-chat-group-continue", { hasText: "Continue" }).last().click();

    for (let i = 0; i < 2; i++) {
      await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" }).last()).toBeVisible();
      await clickCanvasWall(page);
      const confirmBtn = page.locator(".ai-chat-group-continue", { hasText: /Confirm/ }).last();
      await expect(confirmBtn).toBeEnabled();
      if (i === 1) {
        // Both points land on the same wall by clicking the same canvas
        // spot — nudge the second one clear of the first's clearance
        // envelope so both actually get placed instead of the second
        // being dropped as an overlap.
        const rightBtn = page.locator("button", { hasText: "Move right →" }).last();
        for (let n = 0; n < 6; n++) await rightBtn.click();
      }
      await confirmBtn.click();
    }

    await fillGroup(page, "fixtures", { Cabinet_Quantity: 1 });
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    const entrySwitch = page.locator(".ai-chat-room-3d-camera-controls .ai-chat-room-3d-style-switch");
    await expect(entrySwitch).toBeVisible();
    await expect(entrySwitch.locator(".ai-chat-room-3d-style-btn")).toHaveCount(2);
  });
});
