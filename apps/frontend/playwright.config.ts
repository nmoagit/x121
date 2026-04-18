import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the app-guide screenshot capture suite.
 *
 * - Specs live under `e2e/capture/*.spec.ts`, one per documentation chapter.
 * - They are read-only: they log in, navigate, and screenshot. They do not
 *   mutate the dev database.
 * - Screenshots land in `design/docs/app-guide/screenshots/` (relative to the
 *   repo root), where `preamble.tex`'s `\screenshot{...}` macros pick them up.
 * - Credentials come from env vars (E2E_USERNAME / E2E_PASSWORD) and default
 *   to super-admin seed values. Override in `.env.local` or the shell.
 * - Base URL assumes a local dev server running on :5173 with the /an2n
 *   basepath.
 */

// Origin only — the app basepath (/an2n) is prefixed by the helpers in
// `e2e/capture/_helpers.ts` because Playwright treats any leading-`/` path
// passed to `page.goto` as origin-relative, which would strip the basepath.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /capture\/.*\.spec\.ts/,
  fullyParallel: false, // Capture order + login reuse matters
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1580, height: 1000 },
    deviceScaleFactor: 2, // Crisper PDFs
    colorScheme: "dark", // Force prefers-color-scheme: dark for screenshots
    trace: "off",
    screenshot: "off", // We take screenshots explicitly via helpers
    video: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "capture",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
