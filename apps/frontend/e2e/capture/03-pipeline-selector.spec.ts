/**
 * Chapter 3 — Pipeline Selector.
 *
 * Landing page at `/` after login. Card grid of available pipelines.
 * Empty-state shot is produced by mocking the /pipelines API so no data
 * is harmed.
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, snap } from "./_helpers";

const CH = "03-pipeline-selector";

test("Ch3 pipeline selector screenshots", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // Hero — real card grid.
  await go(page, "/");
  await snap(page, CH, "hero");

  // Card detail — crop the first pipeline card. PipelineSelectorPage renders
  // a Grid of <button> elements (each wrapping a <Card>) inside <main>.
  const firstCard = page.locator("main").locator("div.grid > button").first();
  if ((await firstCard.count()) > 0) {
    await snap(page, CH, "card-detail", undefined, { clip: firstCard });
  }

  // Empty state — mock the pipelines endpoint to return [], reload, shoot.
  await page.route("**/api/v1/pipelines", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await snap(page, CH, "empty");
  await page.unroute("**/api/v1/pipelines");
});
