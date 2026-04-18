/**
 * Chapter 2 — Authentication & Public Pages.
 *
 * Captures the login form (pristine + error state) and the external review
 * share page (invalid token + pretend-valid-token rendering).
 *
 * Error state and empty states are produced via Playwright route mocks so
 * we never hit the real backend — no lockouts, no data mutation.
 */

import { test } from "@playwright/test";
import { CAPTURE_VIEWPORT, go, snap } from "./_helpers";

const CH = "02-auth";

test("Ch2 auth + public screenshots", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(CAPTURE_VIEWPORT);

  // Login — pristine form. Clip to the card so it fills the PDF page
  // rather than sitting as a tiny square in a mostly-empty viewport.
  await go(page, "/login");
  const loginCard = page.locator("form").first().locator("xpath=ancestor::div[1]");
  await snap(page, CH, "login-hero", undefined, { clip: loginCard });

  // Login — error state. Intercept the API so submit returns 401 instead of
  // hitting the real backend (avoids failed_login_count bumps and lockouts).
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "UNAUTHORIZED", error: "Invalid credentials" }),
    }),
  );

  const username = page.locator('input[type="text"]').first();
  const password = page.locator('input[type="password"]').first();
  const submit = page.getByRole("button", { name: /sign in/i });
  if (
    (await username.count()) > 0 &&
    (await password.count()) > 0 &&
    (await submit.count()) > 0
  ) {
    await username.fill("demo-user");
    await password.fill("wrong-password");
    await submit.first().click();
    // Wait for the error to render.
    await page.waitForTimeout(600);
    const card = page.locator("form").first().locator("xpath=ancestor::div[1]");
    await snap(page, CH, "login-error", undefined, { clip: card });
  }
  await page.unroute("**/api/v1/auth/login");

  // External review page — dropped: without a valid token the page renders
  // as a blank dark background, which isn't a useful screenshot. Keep the
  // token flow documented in prose only until we wire a mock.
});
