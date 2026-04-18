/**
 * Chapter 7 — Tools: Workflows.
 *
 * Only /tools/workflows is covered. Drill-down example: the `bj` workflow
 * and its five detail tabs (Canvas, Raw JSON, Validation, Scenes, Info).
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, selectTab, snap } from "./_helpers";

const CH = "07";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch7 workflows screenshots", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  await go(page, "/tools/workflows");
  await snap(page, CH, "workflows-hero");

  // Select the `bj` workflow. The list renders workflow entries; click by
  // visible text. Exact match preferred to avoid catching longer names.
  await safe("select bj workflow", async () => {
    const item = page.getByText("bj", { exact: true }).first();
    if ((await item.count()) === 0) return;
    await item.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    await snap(page, CH, "workflows-list-bj-selected");
  });

  // Walk the five detail-panel tabs. Scope selectors to the detail panel so
  // "Info" etc. don't match unrelated page elements (sidebar labels, icons).
  // The detail pane sits inside <main>, to the right of the workflow list.
  const wfTabs: Array<[string, string]> = [
    ["Canvas", "workflow-bj-canvas-tab"],
    ["Raw JSON", "workflow-bj-raw-json-tab"],
    ["Validation", "workflow-bj-validation-tab"],
    ["Scenes", "workflow-bj-scenes-tab"],
    ["Info", "workflow-bj-info-tab"],
  ];
  for (const [label, slug] of wfTabs) {
    await safe(`bj tab ${label}`, async () => {
      // Target the TabBar button inside the detail pane. TabBar renders
      // plain <button>s with the tab label as text content.
      const btn = page
        .locator("main")
        .getByRole("button", { name: new RegExp(`^${label}$`, "i") })
        .first();
      if ((await btn.count()) === 0) {
        // eslint-disable-next-line no-console
        console.log(`  [skip] bj tab ${label} — button not found`);
        return;
      }
      await btn.click({ timeout: 4_000 });
      await page.waitForTimeout(400);
      await snap(page, CH, slug);
    });
  }
});
