import { expect, test } from "@playwright/test";

/**
 * Smoke and interaction tests for the static web build (same UI as Tauri shell).
 * Run: npm run test:e2e — Playwright builds, serves `vite preview` on 127.0.0.1:4173.
 */

/** Wait until the game UI is stable and all 52 cards are accounted for. */
async function waitForDealComplete(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          let total = 0;
          for (let c = 0; c < 7; c++) {
            total += document.querySelectorAll(`#tableau-${c} .card`).length;
          }
          for (let f = 0; f < 4; f++) {
            total += document.querySelectorAll(`#foundation-${f} .card`).length;
          }
          total += document.querySelectorAll("#waste .waste-card").length;
          const stockPile = document.querySelector<HTMLElement>("#stock .card-stock-pile");
          if (stockPile) {
            total += parseInt(stockPile.dataset.count ?? "0", 10);
          } else if (document.querySelector("#stock > .card")) {
            total += 1;
          }
          return JSON.stringify({
            busy: document.body.classList.contains("anim-busy"),
            total,
          });
        }),
      { timeout: 60_000 },
    )
    .toBe(JSON.stringify({ busy: false, total: 52 }));
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

/** Every card in play appears somewhere in the DOM — catches missing tableau cards after restart. */
async function totalCardsInPlay(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    for (let c = 0; c < 7; c++) {
      n += document.querySelectorAll(`#tableau-${c} .card`).length;
    }
    for (let f = 0; f < 4; f++) {
      n += document.querySelectorAll(`#foundation-${f} .card`).length;
    }
    n += document.querySelectorAll("#waste .waste-card").length;
    const stockPile = document.querySelector<HTMLElement>("#stock .card-stock-pile");
    if (stockPile) {
      n += parseInt(stockPile.dataset.count ?? "0", 10);
    } else {
      const freeCell = document.querySelector("#stock > .card");
      if (freeCell) n += 1;
    }
    return n;
  });
}

async function expectFullDeckVisible(
  page: import("@playwright/test").Page,
): Promise<void> {
  await expect.poll(async () => totalCardsInPlay(page), { timeout: 5000 }).toBe(52);
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

  test("after restart, all 52 cards are still represented in the UI", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await waitForDealComplete(page);
    await expectFullDeckVisible(page);

    await page.getByRole("button", { name: "Restart" }).click();
    await waitForDealComplete(page);
    await expectFullDeckVisible(page);
  });

  test("restart while the first deal animation is still running leaves a full deck", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await expect(page.locator("body")).toHaveClass(/anim-busy/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Restart" }).click();
    await waitForDealComplete(page);
    await expectFullDeckVisible(page);
  });

  test("after restart, drag ghost matches the grabbed tableau card", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await waitForDealComplete(page);

    await page.getByRole("button", { name: "Restart" }).click();
    await waitForDealComplete(page);

    const card = page.locator("#tableau-6 .card").last();
    await expect(card).toBeVisible();
    const meta = await card.evaluate((el: HTMLElement) => ({
      rank: el.dataset.rank,
      suit: el.dataset.suit,
    }));
    expect(meta.rank, "bottom tableau card should be face-up for this check").toBeTruthy();
    expect(meta.suit).toBeTruthy();

    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y + 24);
    const ghostCard = page.locator(".drag-ghost .drag-ghost-stack .card").first();
    await expect(ghostCard).toBeVisible();
    await expect(ghostCard).toHaveAttribute("data-rank", meta.rank!);
    await expect(ghostCard).toHaveAttribute("data-suit", meta.suit!);
    await page.mouse.up();
    await expect(page.locator(".drag-ghost")).toHaveCount(0);
  });
});
