/**
 * Chapter 8 — Admin.
 *
 * Pages: Pipelines, Infrastructure, Cloud GPUs, Storage, Naming Rules,
 * Queue Manager, Output Profiles. Drill-downs: x121 pipeline, RunPod cloud
 * provider (4 tabs), delivery_video naming rule modal, BackendFormModal.
 */

import { type Page, test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, selectTab, snap } from "./_helpers";

const CH = "08";

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
  if ((await dialog.count()) === 0) return false;
  await snap(page, CH, slug, undefined, { clip: dialog });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  return true;
}

test("Ch8 admin screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // ---------------------- Pipelines ----------------------
  await go(page, "/admin/pipelines");
  await snap(page, CH, "admin-pipelines-list-hero");

  await safe("x121 pipeline detail", async () => {
    // Pipeline rows render as role="button" elements containing the code.
    const x121 = page
      .locator('[role="button"]')
      .filter({ hasText: "x121" })
      .first();
    if ((await x121.count()) === 0) return;
    await x121.click({ timeout: 3_000 });
    await page.waitForTimeout(800);
    await snap(page, CH, "admin-pipelines-x121-detail");
  });

  // ---------------------- Infrastructure ----------------------
  await go(page, "/admin/infrastructure");
  await snap(page, CH, "admin-infrastructure-hero");

  // ---------------------- Cloud GPUs ----------------------
  await go(page, "/admin/cloud-gpus");
  await snap(page, CH, "admin-cloud-gpus-hero");

  await safe("RunPod provider detail", async () => {
    const runpod = page.getByText("RunPod", { exact: true }).first();
    if ((await runpod.count()) === 0) return;
    await runpod.click({ timeout: 3_000 });
    await page.waitForTimeout(600);
    await snap(page, CH, "admin-cloud-gpus-runpod-hero");

    const runpodTabs: Array<[string, string]> = [
      ["Instances", "admin-cloud-gpus-runpod-instances-tab"],
      ["GPU Types", "admin-cloud-gpus-runpod-gpu-types-tab"],
      ["Scaling Rules", "admin-cloud-gpus-runpod-scaling-rules-tab"],
      ["Cost", "admin-cloud-gpus-runpod-cost-tab"],
    ];
    for (const [label, slug] of runpodTabs) {
      await safe(`RunPod tab ${label}`, async () => {
        await selectTab(page, label);
        await snap(page, CH, slug);
      });
    }
  });

  // ---------------------- Storage ----------------------
  await go(page, "/admin/storage");
  await snap(page, CH, "admin-storage-hero");

  await safe("BackendFormModal", async () => {
    const trigger = page
      .getByRole("button", { name: /add backend|new backend|create backend/i })
      .first();
    if ((await trigger.count()) === 0) return;
    await trigger.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    await cropDialog(page, "admin-storage-backend-form-modal");
  });

  // ---------------------- Naming Rules ----------------------
  await go(page, "/admin/naming");
  await snap(page, CH, "admin-naming-hero");

  await safe("delivery_video naming modal", async () => {
    const card = page.getByText(/delivery.video/i).first();
    if ((await card.count()) === 0) return;
    await card.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    await cropDialog(page, "admin-naming-delivery-video-modal");
  });

  // ---------------------- Queue Manager ----------------------
  await go(page, "/admin/queue");
  await snap(page, CH, "admin-queue-manager-hero");

  // ---------------------- Output Profiles ----------------------
  await go(page, "/admin/output-profiles");
  await snap(page, CH, "admin-output-profiles-hero");

  await safe("default output profile detail", async () => {
    // First profile row / card — click it to reveal the detail panel.
    const first = page.locator('main button, main [role="button"], main a').first();
    if ((await first.count()) === 0) return;
    await first.click({ timeout: 3_000 });
    await page.waitForTimeout(500);
    // Crop the detail panel (right-hand pane). Fall back to full viewport if
    // we can't locate an explicit aside.
    const panel = page.locator("main aside, main section:nth-of-type(2)").first();
    if ((await panel.count()) > 0) {
      await snap(page, CH, "admin-output-profiles-default-detail", undefined, {
        clip: panel,
      });
    } else {
      await snap(page, CH, "admin-output-profiles-default-detail");
    }
  });
});
