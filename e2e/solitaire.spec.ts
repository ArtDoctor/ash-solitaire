import { expect, test } from "@playwright/test";

/**
 * Smoke and interaction tests for the static web build (same UI as Tauri shell).
 * Run: npm run test:e2e — Playwright builds, serves `vite preview` on 127.0.0.1:4173.
 */

/** Deal + post-deal auto-foundation animations set `body.anim-busy` (see `setAnimBusy` in main). */
async function waitForDealComplete(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("body")).toHaveClass(/anim-busy/, { timeout: 15_000 });
  await expect(page.locator("body")).not.toHaveClass(/anim-busy/, { timeout: 60_000 });
}

async function tableauSignature(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    let s = "";
    for (let c = 0; c < 7; c++) {
      const cards = document.querySelectorAll<HTMLElement>(`#tableau-${c} .card`);
      cards.forEach((el) => {
        s += `${el.dataset.rank ?? ""}${el.dataset.suit ?? ""}`;
      });
    }
    return s;
  });
}

test.describe("Solitaire web", () => {
  test("home is visible, then game has seven tableau columns", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Solitaire" })).toBeVisible();
    await expect(page.locator("#btn-play")).toBeVisible();

    await page.locator("#btn-play").click();
    await expect(page.locator("#screen-game")).toHaveClass(/active/);
    for (let i = 0; i < 7; i++) {
      await expect(page.locator(`#tableau-${i}`)).toBeVisible();
    }
    await waitForDealComplete(page);
  });

  test("stock draw shows up to three waste cards; only top waste card is draggable", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await waitForDealComplete(page);

    await page.locator("#stock .card-stock-pile").click();
    const wasteCards = page.locator("#waste .waste-card");
    await expect(wasteCards).toHaveCount(3);

    await expect(wasteCards.nth(0)).not.toHaveClass(/draggable-card/);
    await expect(wasteCards.nth(1)).not.toHaveClass(/draggable-card/);
    await expect(wasteCards.nth(2)).toHaveClass(/draggable-card/);
  });

  test("main menu returns to home", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await waitForDealComplete(page);

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("#screen-home")).toHaveClass(/active/);
    await expect(page.locator("#btn-play")).toBeVisible();
  });

  test("restart deals a new layout", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await waitForDealComplete(page);

    const before = await tableauSignature(page);
    expect(before.length).toBeGreaterThan(10);

    await page.getByRole("button", { name: "Restart" }).click();
    await waitForDealComplete(page);

    const after = await tableauSignature(page);
    expect(after).not.toEqual(before);
  });
});
