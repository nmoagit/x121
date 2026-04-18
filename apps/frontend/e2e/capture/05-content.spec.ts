/**
 * Chapter 5 — Content (cross-pipeline browse surfaces).
 *
 * Pages: Avatars, Library, Media, Scenes, Derived Clips, Scene Catalogue.
 * Drill-down example: Amouranth (inside the SDG project of the x121 pipeline).
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, SCREENSHOT_DIR, go, login, selectTab, snap } from "./_helpers";

const CH = "05";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch5 content screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // ---------------------- Avatars ----------------------
  await go(page, "/content/avatars");
  await snap(page, CH, "avatars-hero");
  // Do NOT click Amouranth here — opens SeedDataModal (covered in appendix).

  // ---------------------- Library ----------------------
  await go(page, "/content/library");
  await snap(page, CH, "library-hero");

  await safe("library Amouranth modal", async () => {
    // LibraryAvatarCard renders role="button" with no aria-label.
    const amouranth = page
      .locator('[role="button"]')
      .filter({ hasText: "Amouranth" })
      .first();
    if ((await amouranth.count()) === 0) return;
    await amouranth.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    const dialog = page.getByRole("dialog").first();
    if ((await dialog.count()) === 0) return;
    await snap(page, CH, "library-avatar-modal", undefined, { clip: dialog });

    // Try to open the nested ImportDialog from within LibraryAvatarModal.
    const importBtn = dialog.getByRole("button", { name: /^import|add to project/i }).first();
    if ((await importBtn.count()) > 0) {
      await importBtn.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const dlg2 = page.getByRole("dialog").nth(1);
      if ((await dlg2.count()) > 0) {
        await snap(page, CH, "library-import-dialog", undefined, { clip: dlg2 });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(350);
      }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  });

  // library-import-dialog is captured inline above, nested inside
  // LibraryAvatarModal — no separate top-level trigger.

  // ---------------------- Media ----------------------
  await go(page, "/content/media");
  await snap(page, CH, "media-hero");

  await safe("media list toggle", async () => {
    const listToggle = page.getByRole("button", { name: /list view|list$/i }).first();
    if ((await listToggle.count()) === 0) return;
    await listToggle.click({ timeout: 3_000 });
    await page.waitForTimeout(400);
    await snap(page, CH, "media-list");
  });

  await safe("media preview modal", async () => {
    // Thumbnail preview buttons have title="Preview" in the Media grid.
    // Click the first one overall (not necessarily Amouranth — data dependent).
    const thumb = page
      .locator('main button[title="Preview"], main button[aria-label*="preview" i]')
      .first();
    const fallback = page.locator('main [role="button"] img, main img').first();
    const target = (await thumb.count()) > 0 ? thumb : fallback;
    if ((await target.count()) === 0) return;
    await target.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    const dialog = page.getByRole("dialog").first();
    if ((await dialog.count()) === 0) return;
    await snap(page, CH, "media-preview-modal", undefined, { clip: dialog });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  });

  // ---------------------- Scenes ----------------------
  await go(page, "/content/scenes");
  await snap(page, CH, "scenes-hero");

  await safe("scenes playback modal", async () => {
    // ScenesPage defaults to list view: BrowseClipItem renders an
    // `h-14 w-20` video-thumbnail button. Grid view uses aspect-video.
    // Try list-row selector first, fall back to grid card button.
    const listBtn = page.locator('main button[class*="h-14"][class*="w-20"]').first();
    const gridBtn = page.locator('main button[class*="aspect-video"]').first();
    const target = (await listBtn.count()) > 0
      ? listBtn
      : (await gridBtn.count()) > 0
        ? gridBtn
        : page.locator("main button").first();
    if ((await target.count()) === 0) return;
    await target.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    const dialog = page.getByRole("dialog").first();
    if ((await dialog.count()) === 0) return;
    await snap(page, CH, "scenes-playback-modal", undefined, { clip: dialog });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  });

  // ---------------------- Derived Clips ----------------------
  await go(page, "/content/derived-clips");
  await snap(page, CH, "derived-clips-hero");

  await safe("derived-clips group detail", async () => {
    // Take the top 3 rows so the shot shows real clip data with thumbnails,
    // not a single thin wrapper. `.nth(n)` starts at 0.
    const rows = page.locator("main div.flex.flex-col.gap-2 > div, main div.grid > div");
    const count = await rows.count();
    if (count === 0) return;
    const first = rows.first();
    const firstBox = await first.boundingBox();
    if (!firstBox) return;
    const last = count >= 3 ? rows.nth(2) : rows.nth(count - 1);
    const lastBox = await last.boundingBox();
    if (!lastBox) return;
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-derived-clips-group.png`,
      clip: {
        x: Math.max(0, firstBox.x - 4),
        y: Math.max(0, firstBox.y - 4),
        width: Math.min(1580 - firstBox.x, firstBox.width + 8),
        height: lastBox.y + lastBox.height - firstBox.y + 8,
      },
    });
    // eslint-disable-next-line no-console
    console.log("  [shot] 05-derived-clips-group.png");
  });

  // ---------------------- Scene Catalogue ----------------------
  await go(page, "/content/scene-catalogue");
  await snap(page, CH, "catalogue-hero");

  const catalogueTabs: Array<[string, string]> = [
    ["Image Types", "catalogue-image-types-tab"],
    ["Scene Types", "catalogue-scene-types-tab"],
    ["Catalogue", "catalogue-catalogue-tab"],
    ["Tracks", "catalogue-tracks-tab"],
    ["Workflows", "catalogue-workflows-tab"],
    ["Prompt Defaults", "catalogue-prompt-defaults-tab"],
    ["Video Settings", "catalogue-video-settings-tab"],
  ];
  for (const [label, slug] of catalogueTabs) {
    await safe(`catalogue tab ${label}`, async () => {
      await selectTab(page, label);
      await snap(page, CH, slug);
    });
  }
});
