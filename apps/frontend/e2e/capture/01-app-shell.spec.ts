/**
 * Chapter 1 — App Shell.
 *
 * Captures the persistent UI that wraps every authenticated page:
 * Sidebar, Header, UserMenu, StatusFooter, ActivityConsoleDrawer,
 * PageGuideBanner.
 *
 * Every optional toggle is guarded so a missing/overlaid element skips
 * cleanly rather than failing the whole spec.
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, login, snap } from "./_helpers";

const CH = "01-app-shell";

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`  [skip] ${label} — ${(err as Error).message.split("\n")[0]}`);
  }
}

test("Ch1 app shell screenshots", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);
  await login(page);

  // Hero — full authenticated shell on the landing page.
  await go(page, "/");
  await snap(page, CH, "appshell-hero");

  // Sidebar expanded + collapsed (extras — useful for the chapter).
  await snap(page, CH, "sidebar-expanded", undefined, { fullPage: true });

  await safe("sidebar collapse toggle", async () => {
    const collapse = page.getByRole("button", { name: /collapse|toggle sidebar/i });
    if ((await collapse.count()) === 0) return;
    await collapse.first().click({ timeout: 3_000 });
    await snap(page, CH, "sidebar-collapsed");
    await collapse.first().click({ timeout: 3_000 });
  });

  // Header — crop the top bar.
  const header = page.locator("header").first();
  if ((await header.count()) > 0) {
    await snap(page, CH, "header-hero", undefined, { clip: header });
  }

  // Page guide banner — rendered by PageGuideBanner at the top of <main>
  // whenever the route has a hint in PAGE_GUIDES. '/' has one.
  await safe("page guide banner", async () => {
    const banner = page.locator('main [role="status"], main .rounded-md').first();
    const guide = page.getByText(/Welcome to αN2N|This is your Studio Pulse/i).first();
    const target = (await guide.count()) > 0 ? guide : banner;
    if ((await target.count()) === 0) return;
    // Climb to the banner container (the text lives inside a styled div).
    const container = target.locator("xpath=ancestor::div[1]");
    await snap(page, CH, "page-guide-banner", undefined, { clip: container });
  });

  // User menu — click the Avatar trigger inside the header, then crop to
  // the open panel only (role="menu").
  await safe("user menu", async () => {
    const trigger = page.locator("header").locator('[aria-haspopup="menu"]').first();
    if ((await trigger.count()) === 0) return;
    await trigger.click({ timeout: 3_000 });
    await page.waitForTimeout(300);
    const panel = page.locator('[role="menu"]').first();
    if ((await panel.count()) === 0) return;
    await snap(page, CH, "user-menu-open", undefined, { clip: panel });
    await page.keyboard.press("Escape");
  });

  // StatusFooter renders as <CollapsedFooter> by default (a 6px handle).
  // Expand it first, then crop the <footer>.
  await safe("status footer expand + crop", async () => {
    const expand = page.getByRole("button", { name: /expand footer/i });
    if ((await expand.count()) > 0) {
      await expand.first().click({ timeout: 3_000 });
      await page.waitForTimeout(250);
    }
    const footerEl = page.locator("footer").first();
    if ((await footerEl.count()) === 0) return;
    await snap(page, CH, "status-footer-hero", undefined, { clip: footerEl });
  });

  // Activity console drawer — click the Console segment, capture drawer,
  // walk the 4 tabs.
  await safe("activity console drawer + tabs", async () => {
    const consoleBtn = page
      .locator("footer")
      .getByRole("button", { name: /^Console$/i });
    if ((await consoleBtn.count()) === 0) return;
    await consoleBtn.first().click({ timeout: 3_000 });
    await page.waitForTimeout(400);
    await snap(page, CH, "activity-console-hero");

    for (const [id, slug] of [
      ["Generation", "activity-console-generation-tab"],
      ["Infra", "activity-console-infra-tab"],
      ["Live", "activity-console-live-tab"],
      ["History", "activity-console-history-tab"],
    ] as const) {
      await safe(`console tab ${id}`, async () => {
        const tab = page.getByRole("tab", { name: new RegExp(`^${id}$`, "i") });
        if ((await tab.count()) === 0) return;
        await tab.first().click({ timeout: 3_000 });
        // Give async content (infra / live streams) time to arrive so the
        // captured tab isn't just an empty pane.
        await page.waitForTimeout(1500);
        await snap(page, CH, slug);
      });
    }

    // Close the drawer to leave the page clean for subsequent specs.
    await consoleBtn.first().click({ timeout: 3_000 });
  });
});
