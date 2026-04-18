/**
 * Appendix A — Modal Index.
 *
 * Read-only captures of every modal referenced from a prominent page.
 * Each modal is opened via its in-app trigger and closed with Escape.
 * No submit / save / confirm / delete action is ever performed.
 */

import { type Locator, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CAPTURE_VIEWPORT, SCREENSHOT_DIR, go, goPipeline, login, selectTab, snap } from "./_helpers";

// CH = "A-modal" yields filenames like A-modal-library-avatar.png.
const CH = "A-modal";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

async function cropDialog(page: Page, slug: string): Promise<boolean> {
  const dialog = page.getByRole("dialog").first();
  if ((await dialog.count()) === 0) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${slug} — no dialog opened`);
    return false;
  }
  await snap(page, CH, slug, undefined, { clip: dialog });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  return true;
}

async function clickAndSnap(page: Page, trigger: Locator, slug: string): Promise<void> {
  if ((await trigger.count()) === 0) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${slug} — trigger not found`);
    return;
  }
  try {
    await trigger.first().click({ timeout: 3_000 });
  } catch {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${slug} — trigger click failed`);
    return;
  }
  await page.waitForTimeout(600);
  await cropDialog(page, slug);
}

test("Appendix A modal index screenshots", async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // ---------------------- Content modals ----------------------

  // LibraryAvatarModal — click the Amouranth card on /content/library.
  // LibraryAvatarCard uses role="button" (no aria-label).
  await go(page, "/content/library");
  await safe("library-avatar", async () => {
    const trigger = page
      .locator('[role="button"]')
      .filter({ hasText: "Amouranth" })
      .first();
    await clickAndSnap(page, trigger, "library-avatar");
  });

  // ImagePreviewModal — click the first preview button on /content/media.
  await go(page, "/content/media");
  await safe("image-preview", async () => {
    const trigger = page
      .locator('main button[title="Preview"], main button[aria-label*="preview" i]')
      .first();
    await clickAndSnap(page, trigger, "image-preview");
  });

  // ClipPlaybackModal — list-row thumbnail is `h-14 w-20`; grid card is aspect-video.
  await go(page, "/content/scenes");
  await safe("clip-playback", async () => {
    const listBtn = page.locator('main button[class*="h-14"][class*="w-20"]').first();
    const gridBtn = page.locator('main button[class*="aspect-video"]').first();
    const trigger = (await listBtn.count()) > 0 ? listBtn : gridBtn;
    await clickAndSnap(page, trigger, "clip-playback");
  });

  // SeedDataModal — click Amouranth on /content/avatars (AvatarCard has aria-label).
  await go(page, "/content/avatars");
  await safe("seed-data", async () => {
    const trigger = page.getByLabel(/^Open avatar Amouranth/i);
    await clickAndSnap(page, trigger, "seed-data");
  });

  // ---------------------- Review modals ----------------------

  // ClipPlaybackModal with annotation overlay — annotation card is a button.
  await go(page, "/review/annotations");
  await safe("clip-playback-annotations", async () => {
    const trigger = page.locator("main button").filter({ has: page.locator("video, img") }).first();
    const fallback = page.locator("main button").first();
    const target = (await trigger.count()) > 0 ? trigger : fallback;
    await clickAndSnap(page, target, "clip-playback-annotations");
  });

  // ---------------------- Admin modals ----------------------

  // BackendFormModal — Storage admin.
  await go(page, "/admin/storage");
  await safe("backend-form", async () => {
    const trigger = page.getByRole("button", {
      name: /add backend|new backend|create backend/i,
    });
    await clickAndSnap(page, trigger, "backend-form");
  });

  // delivery_video naming rule edit modal.
  await go(page, "/admin/naming");
  await safe("naming-rule-edit", async () => {
    const trigger = page.getByText(/delivery.video/i);
    await clickAndSnap(page, trigger, "naming-rule-edit");
  });

  // ProvisionWizard — Infrastructure admin. Exact button label is
  // "Provision Instance" (from InfrastructureControlPanel.tsx).
  await go(page, "/admin/infrastructure");
  await safe("provision-wizard", async () => {
    const trigger = page.getByRole("button", { name: /^Provision Instance$/i });
    await clickAndSnap(page, trigger, "provision-wizard");
  });

  // ---------------------- Pipeline workspace modals ----------------------

  // Avatar edit modal — Amouranth detail → Edit button with aria-label="Edit avatar".
  await goPipeline(page, "/projects/1/avatars/5");
  await page.waitForTimeout(800);
  await safe("avatar-edit", async () => {
    const trigger = page.getByLabel("Edit avatar");
    await clickAndSnap(page, trigger, "avatar-edit");
  });

  // QueueOutstandingModal — SDG → Production tab → "Queue Outstanding" button.
  await goPipeline(page, "/projects/1");
  await page.waitForTimeout(600);
  await safe("queue-outstanding", async () => {
    await selectTab(page, "Production");
    await page.waitForTimeout(500);
    const trigger = page.getByRole("button", { name: /^Queue Outstanding$/i });
    await clickAndSnap(page, trigger, "queue-outstanding");
  });

  // ---------------------- Dedup / copy helpers ----------------------
  // Some shots are the same modal captured elsewhere in the guide (ch05
  // hits library-avatar, media-preview, scenes-playback). If the ch05
  // capture produced a good file, mirror it under the appendix name so
  // the modal index doesn't render "Screenshot pending" for a modal we
  // already have.
  const DEDUP_MAP: Array<[string, string]> = [
    ["05-library-avatar-modal.png", "A-modal-library-avatar.png"],
    ["05-media-preview-modal.png", "A-modal-image-preview.png"],
    ["05-scenes-playback-modal.png", "A-modal-clip-playback.png"],
  ];
  for (const [src, dst] of DEDUP_MAP) {
    const srcPath = path.join(SCREENSHOT_DIR, src);
    const dstPath = path.join(SCREENSHOT_DIR, dst);
    if (fs.existsSync(srcPath) && !fs.existsSync(dstPath)) {
      fs.copyFileSync(srcPath, dstPath);
      // eslint-disable-next-line no-console
      console.log(`  [copy] ${src} → ${dst}`);
    }
  }
});
