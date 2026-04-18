/**
 * Chapter 6 — Queue & Review.
 *
 * Pages: Queue, Annotations, Reviews.
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, snap } from "./_helpers";

const CH = "06";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch6 queue + review screenshots", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // ---------------------- Queue ----------------------
  await go(page, "/production/queue");
  await snap(page, CH, "queue-hero");

  // ---------------------- Annotations ----------------------
  await go(page, "/review/annotations");
  await snap(page, CH, "annotations-hero");

  await safe("annotations card detail", async () => {
    // Card grid — first card. Try common card-like selectors.
    const card = page
      .locator('main a[href*="/annotations/"], main button:has-text("f"), main [class*="card"]')
      .first();
    if ((await card.count()) === 0) return;
    await snap(page, CH, "annotations-card-detail", undefined, { clip: card });
  });

  // ---------------------- Reviews (empty state is fine) ----------------------
  await go(page, "/reviews");
  await snap(page, CH, "reviews-hero");
});
