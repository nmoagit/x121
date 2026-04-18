/**
 * Chapter 4 — Dashboard & Performance.
 *
 * Routes:
 *   /dashboard                  — global dashboard (widget grid)
 *   /performance                — 5-tab analytics (Overview, Quality Trends,
 *                                 Workflow Comparison, Worker Benchmarking,
 *                                 Alert Thresholds)
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, selectTab, snap } from "./_helpers";

const CH = "04";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch4 dashboard + performance screenshots", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // Global dashboard.
  await go(page, "/dashboard");
  await snap(page, CH, "dashboard-global-hero");
  await snap(page, CH, "dashboard-global-widget-grid", undefined, { fullPage: true });

  // Performance dashboard + 5 tabs.
  await go(page, "/performance");
  await snap(page, CH, "performance-hero");

  const perfTabs: Array<[string, string]> = [
    ["Overview", "performance-overview-tab"],
    ["Quality Trends", "performance-quality-trends-tab"],
    ["Workflow Comparison", "performance-workflow-comparison-tab"],
    ["Worker Benchmarking", "performance-worker-benchmarking-tab"],
    ["Alert Thresholds", "performance-alert-thresholds-tab"],
  ];
  for (const [label, slug] of perfTabs) {
    await safe(`perf tab ${label}`, async () => {
      await selectTab(page, label);
      await snap(page, CH, slug);
    });
  }
});
