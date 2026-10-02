"use strict";

const { test, expect } = require("@playwright/test");
const {
  startEstimate,
  answerScope,
  fillGroup,
  useConfig,
  sendChat,
  skipRoomInteractionSteps,
  disableMaterials,
} = require("./helpers");

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
    // Not about the materials picker — off so fixtures submits straight to
    // the card, matching what this test is actually checking.
    await disableMaterials(page);
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

  test("Kohler product switcher shows a tab per placed fixture and swaps the pick", async ({ page }) => {
    // Loads the tub, vanity sink, faucet and valve models on top of the
    // usual scene — slow under CI's software WebGL, same as chat.spec.js's
    // full-estimate test.
    test.setTimeout(90000);
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 12, Bathroom_Length_Ft: 10, Bathroom_Height_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Bathtub_Quantity: 1, Vanity_Quantity: 1, Shower_Quantity: 1 });

    const switcher = page.locator(".ai-chat-room-3d-products");
    await expect(switcher).toBeVisible();
    const tabs = switcher.getByRole("group", { name: "Kohler products", exact: true });
    for (const label of ["Tub", "Vanity", "Shower"]) {
      await expect(tabs.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    // Fixtures that aren't placed get no tab.
    await expect(tabs.getByRole("button", { name: "Toilet", exact: true })).toBeHidden();

    await tabs.getByRole("button", { name: "Tub", exact: true }).click();
    await expect(tabs.getByRole("button", { name: "Tub", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Tub faucet", "Tub valve", "Tub grab bar"]) {
      await expect(switcher.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(switcher.getByLabel("Shower base", { exact: true })).toBeHidden();
    const tub = switcher.getByLabel("Tub", { exact: true });
    await expect(tub).toHaveValue("freestanding");
    await tub.selectOption("K-1184-0");
    await expect(tub).toHaveValue("K-1184-0");
    const picks = await page.evaluate(() => window.BathroomRoom3D.getProductPicks());
    expect(picks.tub).toBe("K-1184-0");

    // A 36 in. base only comes with the 96 in. wall kit: the 72 in. one is
    // greyed out with the reason, and the walls show the 96 in. kit.
    await tabs.getByRole("button", { name: "Shower", exact: true }).click();
    await switcher.getByLabel("Shower base", { exact: true }).selectOption("K-9396-0");
    const walls = switcher.getByLabel("Shower walls", { exact: true });
    await expect(walls).toHaveValue("choreograph-96");
    await expect(walls.locator('option[value="choreograph-72"]')).toBeDisabled();
    await expect(walls.locator('option[value="choreograph-72"]')).toHaveText(
      "Choreograph 72 in. walls (Not made for this base)",
    );
  });

  test("dragging a fixture moves it to another wall, and a spot where it won't fit is refused", async ({ page }) => {
    test.setTimeout(90000);
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 12, Bathroom_Length_Ft: 10, Bathroom_Height_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Vanity_Quantity: 1 });
    await expect(page.locator(".ai-chat-room-3d-hint")).toContainText("Drag a toilet");

    async function dragTo(fixtureKey, x, z) {
      // Let the camera settle first, so the points stay where they were.
      await page.waitForTimeout(1500);
      const from = await page.evaluate((k) => window.BathroomRoom3D.screenPoint(k), fixtureKey);
      const to = await page.evaluate(([fx, fz]) => window.BathroomRoom3D.screenPoint(null, fx, fz), [x, z]);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
      await page.mouse.move(to.x, to.y, { steps: 5 });
      await page.mouse.up();
    }

    // To the middle of the south wall.
    await dragTo("Vanity_Quantity", 6, 9.6);
    await expect
      .poll(() => page.evaluate(() => window.BathroomRoom3D.getFixturePositions()))
      .toEqual({ Vanity_Quantity: { 0: { wallId: "S", offsetFt: 6 } } });

    // Onto the toilet: refused, the vanity stays on the south wall.
    const toilet = await page.evaluate(() => window.BathroomRoom3D.screenPoint("Toilet_Quantity"));
    expect(toilet).not.toBeNull();
    await dragTo("Vanity_Quantity", 1.3, 0.4);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.BathroomRoom3D.getFixturePositions())).toEqual({
      Vanity_Quantity: { 0: { wallId: "S", offsetFt: 6 } },
    });
  });

  test("picking a real toilet and sink product retints their real 3D models without errors", async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const modelsLoaded = Promise.all([
      page.waitForResponse((res) => res.url().endsWith("models/fixtures/toilet.glb")),
      page.waitForResponse((res) => res.url().endsWith("models/fixtures/sink.glb")),
    ]);
    await startEstimate(page);
    await answerScope(page, { demolition: "No", floorFinish: "None", walls: "Neither", paintCeiling: "No" });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Sink_Quantity: 1 });
    await modelsLoaded;
    // The toilet style switch hides once the real toilet replaced the
    // stand-ins, so the picks below retint the real models' clones.
    await expect(page.locator("#ai-chat-room-3d .ai-chat-room-3d-style-switch").first()).toBeHidden();

    await page.locator('input[autocomplete="postal-code"]').fill("84101");
    await page.locator(".ai-chat-group-continue").last().click();
    for (const category of ["Which toilets", "Which sinks"]) {
      await expect(page.locator(".ai-chat-group-intro", { hasText: category })).toBeVisible();
      await page.locator(".ai-chat-choice--material:enabled").last().click();
      await page.locator(".ai-chat-group-continue").last().click();
    }
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    expect(errors).toEqual([]);
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
    // These tests are about the wall-click room-shape flow and 3D camera,
    // not the materials picker — off so fixtures submits straight to the
    // card as it always has.
    await disableMaterials(page);
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

  test("Cancel on the plumbing-walls step abandons the whole estimate, not just that step", async ({ page }) => {
    await reachRoomShapeSteps(page);
    await expect(
      page.locator(".ai-chat-group-intro", { hasText: "Which wall(s) carry the plumbing stack" }),
    ).toBeVisible();
    await page.locator(".ai-chat-group-cancel", { hasText: "Cancel" }).last().click();
    await expect(page.locator("#ai-chat-room-3d")).toBeHidden();
    await expect(page.locator("#ai-chat-form")).toBeVisible();
  });

  test("Cancel on the entry-points count step abandons the whole estimate", async ({ page }) => {
    await reachRoomShapeSteps(page);
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator(".ai-chat-group-cancel", { hasText: "Cancel" }).last().click();
    await expect(page.locator("#ai-chat-room-3d")).toBeHidden();
    await expect(page.locator("#ai-chat-form")).toBeVisible();
  });

  test("Cancel is available on the per-entry-point wall-pick screen, even before a wall is clicked", async ({
    page,
  }) => {
    await reachRoomShapeSteps(page);
    await page.locator(".ai-chat-group-cancel", { hasText: "Skip" }).last().click();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toBeVisible();
    await page.locator(".ai-chat-group-continue", { hasText: "Continue" }).last().click();

    await expect(page.locator(".ai-chat-group-intro", { hasText: "click its wall" }).last()).toBeVisible();
    // No wall picked yet — this is exactly the state that used to have no
    // actionable button at all.
    const cancelBtn = page.locator(".ai-chat-group-cancel", { hasText: "Cancel" }).last();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page.locator("#ai-chat-room-3d")).toBeHidden();
    await expect(page.locator("#ai-chat-form")).toBeVisible();
  });
});

test.describe("sink faucets match the sink's holes", () => {
  test("a single-hole vanity top only offers single-hole faucets, and a widespread pick moves to one", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 10, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Vanity_Quantity: 1 });

    const sink = page.locator("#ai-chat-room-3d-product-vanitySink");
    const faucet = page.locator("#ai-chat-room-3d-product-vanityFaucet");
    await faucet.selectOption("K-14410-4-CP");
    await expect(faucet).toHaveValue("K-14410-4-CP");
    await sink.selectOption("K-3048-1-0");
    // The widespread faucet can't go on a one-hole top: the room shows a
    // single-hole one instead, and the dropdown says why.
    await expect(faucet).toHaveValue("K-14402-4A-CP");
    const widespread = faucet.locator('option[value="K-14410-4-CP"]');
    await expect(widespread).toBeDisabled();
    await expect(widespread).toContainText("Doesn't fit this sink's faucet holes");
    const centerset = faucet.locator('option[value="K-35951-4-CP"]');
    await expect(centerset).toBeDisabled();
  });
});

test.describe("going back a step", () => {
  test("a room too small for its fixtures can be made bigger with Back, keeping every answer", async ({ page }) => {
    await disableMaterials(page);
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 4, Bathroom_Length_Ft: 4, Bathroom_Height_Ft: 8 });
    await skipRoomInteractionSteps(page);
    await fillGroup(page, "fixtures", { Toilet_Quantity: 1, Bathtub_Quantity: 1, Vanity_Quantity: 1 });
    await expect(page.locator(".ai-chat-group-error").last()).toBeVisible();

    // Back through the fixtures, entry points and plumbing walls steps to the size.
    const back = () => page.getByRole("button", { name: "← Back" }).last().click();
    await back();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "How many entry points" })).toHaveCount(2);
    await back();
    await expect(page.locator(".ai-chat-group-intro", { hasText: "carry the plumbing stack" })).toHaveCount(2);
    await back();
    const dims = page.locator('form[data-group="dimensions"]').last();
    await expect(dims.locator('input[name="Bathroom_Width_Ft"]')).toHaveValue("4");
    await expect(dims.locator('input[name="Bathroom_Height_Ft"]')).toHaveValue("8");
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8 });
    await skipRoomInteractionSteps(page);

    // The fixture counts come back filled in, and now they fit.
    const fixtures = page.locator('form[data-group="fixtures"]').last();
    await expect(fixtures.locator('input[name="Bathtub_Quantity"]')).toHaveValue("1");
    await fixtures.locator(".ai-chat-group-continue").click();
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    await expect(page.getByTestId("estimate-card")).toContainText("Tile");
  });

  test("the first step has no Back, and Back on the size keeps the scope answers", async ({ page }) => {
    await startEstimate(page);
    await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
    await answerScope(page, NEEDS_WALLS);
    await page.getByRole("button", { name: "← Back" }).last().click();
    const scope = page.locator('form[data-group="scope"]').last();
    await expect(scope.getByRole("button", { name: "Tile (full height)", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await scope.getByRole("button", { name: /Continue/ }).click();
    await expect(page.locator('form[data-group="dimensions"]').last()).toBeVisible();
  });
});

test.describe("saved design", () => {
  test("the design is kept in this browser and can be picked up again", async ({ page }) => {
    await disableMaterials(page);
    await startEstimate(page);
    await expect(page.locator(".ai-chat-saved-design")).toHaveCount(0);
    await answerScope(page, NEEDS_WALLS);
    await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 6, Bathroom_Length_Ft: 9, Bathroom_Height_Ft: 8 });
    await skipRoomInteractionSteps(page);
    const fixtures = page.locator('form[data-group="fixtures"]').last();
    await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
    await fixtures.locator('input[name="Vanity_Quantity"]').fill("1");
    await page.evaluate(() => window.BathroomRoom3D.setProductPick("toilet", "K-3981-0"));
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pr_saved_design") || "{}")))
      .toMatchObject({ step: "fixtures", room: { productPicks: { toilet: "K-3981-0" } } });

    // Come back later: the first question offers the saved design.
    await startEstimate(page);
    await expect(page.locator(".ai-chat-saved-design")).toContainText("saved in this browser");
    await page.getByRole("button", { name: "Pick up where I left off →" }).click();
    const resumed = page.locator('form[data-group="fixtures"]').last();
    await expect(resumed.locator('input[name="Toilet_Quantity"]')).toHaveValue("1");
    await expect(resumed.locator('input[name="Vanity_Quantity"]')).toHaveValue("1");
    expect(await page.evaluate(() => window.BathroomRoom3D.getProductPicks().toilet)).toBe("K-3981-0");
    await expect(page.locator('form[data-group="scope"] button').first()).toBeDisabled();

    // Back still walks through the earlier answers.
    await resumed.getByRole("button", { name: "← Back" }).click();
    await skipRoomInteractionSteps(page);
    await page.locator('form[data-group="fixtures"]').last().locator(".ai-chat-group-continue").click();
    await expect(page.getByTestId("estimate-card")).toBeVisible();
    await expect(page.getByTestId("estimate-card")).toContainText("Tile");

    // The quote form gets the products picked in the room.
    await page.getByTestId("estimate-card").locator(".ai-chat-estimate-cta").click();
    await expect(page.locator("#message")).toHaveValue(/Products picked in the 3D room:\n- Toilet: .*\(K-3981-0\)/);
  });

  test("Forget it removes the saved design", async ({ page }) => {
    await startEstimate(page);
    await answerScope(page, NEEDS_WALLS);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("pr_saved_design"))).toBe(true);
    await startEstimate(page);
    await page.getByRole("button", { name: "Forget it" }).click();
    await expect(page.locator(".ai-chat-saved-design")).toContainText("gone from this browser");
    expect(await page.evaluate(() => localStorage.getItem("pr_saved_design"))).toBeNull();
    await startEstimate(page);
    await expect(page.locator(".ai-chat-saved-design")).toHaveCount(0);
  });
});

test("the room says when a fixture fits but is tight", async ({ page }) => {
  await disableMaterials(page);
  await startEstimate(page);
  await answerScope(page, NEEDS_WALLS);
  await fillGroup(page, "dimensions", { Bathroom_Width_Ft: 5, Bathroom_Length_Ft: 8, Bathroom_Height_Ft: 8 });
  await skipRoomInteractionSteps(page);
  const fixtures = page.locator('form[data-group="fixtures"]').last();
  const note = page.locator(".ai-chat-room-3d-tight");
  await fixtures.locator('input[name="Toilet_Quantity"]').fill("1");
  await expect(note).toBeHidden();
  await fixtures.locator('input[name="Bathtub_Quantity"]').fill("1");
  await fixtures.locator('input[name="Vanity_Quantity"]').fill("1");
  await expect(note).toHaveText("Fits, but tight: Toilet, 15 in. beside it (18 in. recommended).");
});
