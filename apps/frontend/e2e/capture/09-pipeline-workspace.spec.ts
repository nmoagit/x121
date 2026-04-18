/**
 * Chapter 9 — Pipeline Workspace: x121 — Adult Content.
 *
 * Walks the x121 pipeline end-to-end: workspace dashboard, SDG project
 * (5 top tabs + 2 inner Overview tabs), Amouranth avatar (10 tabs),
 * pipeline-scoped Content/Production/Review/Tools pages and the two
 * pipeline-admin pages (Naming Rules, Output Profiles).
 */

import { test } from "@playwright/test";
import {
  CAPTURE_VIEWPORT,
  PIPELINE_CODE,
  go,
  goPipeline,
  login,
  selectTab,
  snap,
} from "./_helpers";

const CH = "09";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch9 pipeline workspace screenshots", async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // ---------------------- Enter the workspace via pipeline card click. ----------------------
  await go(page, "/");
  await safe("enter x121 workspace", async () => {
    // Prefer an exact-text match on the pipeline code; fall back to first
    // pipeline card in the grid.
    const card = page
      .locator("main")
      .locator("div.grid > button")
      .filter({ hasText: PIPELINE_CODE })
      .first();
    const fallback = page.locator("main div.grid > button").first();
    const target = (await card.count()) > 0 ? card : fallback;
    if ((await target.count()) === 0) return;
    await target.click({ timeout: 3_000 });
    await page.waitForTimeout(900);
    await snap(page, CH, "ws-enter");
    await snap(page, CH, "ws-sidebar", undefined, { fullPage: true });
  });

  // ---------------------- Workspace Dashboard ----------------------
  await goPipeline(page, "/dashboard");
  await snap(page, CH, "ws-dashboard-hero");

  // ---------------------- Projects list → SDG ----------------------
  await goPipeline(page, "/projects");
  await snap(page, CH, "ws-projects-list");

  await safe("SDG project detail", async () => {
    const sdg = page.getByLabel(/^Open project SDG/i).first();
    if ((await sdg.count()) === 0) return;
    await sdg.click({ timeout: 3_000 });
    await page.waitForTimeout(700);
    await snap(page, CH, "ws-sdg-detail-hero");
  });

  // SDG top tabs. Default is Overview so snap it first.
  await safe("SDG Overview tab", async () => {
    await selectTab(page, "Overview");
    await snap(page, CH, "ws-sdg-overview-tab");
  });

  // Inner Readiness / Matrix tabs in the AvatarDeliverablesGrid.
  await safe("SDG Overview / Readiness inner tab", async () => {
    const btn = page.getByRole("button", { name: /^Readiness$/i }).first();
    if ((await btn.count()) === 0) return;
    await btn.click({ timeout: 3_000 });
    await page.waitForTimeout(400);
    await snap(page, CH, "ws-sdg-overview-readiness");
  });

  await safe("SDG Overview / Matrix inner tab", async () => {
    const btn = page.getByRole("button", { name: /^Matrix$/i }).first();
    if ((await btn.count()) === 0) return;
    await btn.click({ timeout: 3_000 });
    await page.waitForTimeout(400);
    await snap(page, CH, "ws-sdg-overview-matrix");
  });

  const sdgTabs: Array<[string, string]> = [
    ["Avatars", "ws-sdg-avatars-tab"],
    ["Production", "ws-sdg-production-tab"],
    ["Delivery", "ws-sdg-delivery-tab"],
    ["Settings", "ws-sdg-settings-tab"],
  ];
  for (const [label, slug] of sdgTabs) {
    await safe(`SDG tab ${label}`, async () => {
      await selectTab(page, label);
      await snap(page, CH, slug);
    });
  }

  // ---------------------- Amouranth avatar detail (direct route) ----------------------
  await goPipeline(page, "/projects/1/avatars/5");
  await snap(page, CH, "amouranth-hero");

  const amouranthTabs: Array<[string, string]> = [
    ["Overview", "amouranth-overview-tab"],
    ["Images", "amouranth-images-tab"],
    ["Seeds", "amouranth-seeds-tab"],
    ["Scenes", "amouranth-scenes-tab"],
    ["Derived", "amouranth-derived-tab"],
    ["Metadata", "amouranth-metadata-tab"],
    ["Speech", "amouranth-speech-tab"],
    ["Deliverables", "amouranth-deliverables-tab"],
    ["Review", "amouranth-review-tab"],
    ["Settings", "amouranth-settings-tab"],
  ];
  for (const [label, slug] of amouranthTabs) {
    await safe(`amouranth tab ${label}`, async () => {
      await selectTab(page, label);
      // Async-data tabs (Review, Deliverables, Derived, Speech) render
      // skeletons first; wait for content to populate before snapping.
      await page.waitForTimeout(1200);
      await snap(page, CH, slug);
    });
  }

  // ---------------------- Pipeline-scoped pages ----------------------
  const scopedPages: Array<[string, string]> = [
    ["/avatars", "ws-avatars"],
    ["/library", "ws-library"],
    ["/media", "ws-media"],
    ["/scenes", "ws-scenes"],
    ["/derived-clips", "ws-derived-clips"],
    ["/scene-catalogue", "ws-catalogue"],
    ["/queue", "ws-queue"],
    ["/annotations", "ws-annotations"],
    ["/reviews", "ws-reviews"],
    ["/workflows", "ws-workflows"],
    ["/naming", "ws-naming-hero"],
    ["/output-profiles", "ws-output-profiles-hero"],
  ];
  for (const [route, slug] of scopedPages) {
    await safe(`scoped page ${route}`, async () => {
      await goPipeline(page, route);
      // Scoped pages (queue, workflows, reviews, annotations) fetch data
      // on mount — wait past the initial spinner.
      await page.waitForTimeout(1200);
      await snap(page, CH, slug);
    });
  }
});
