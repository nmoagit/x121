/**
 * Shared capture helpers for the app-guide screenshot suite.
 *
 * These helpers are intentionally small and read-only. They log the test
 * runner into the app as super-admin (credentials via env vars), let you
 * navigate to a route, and snapshot the current page into the documentation
 * screenshots folder.
 */

import { type Locator, type Page, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to `design/docs/app-guide/screenshots/` */
export const SCREENSHOT_DIR = path.resolve(
  __dirname,
  "../../../../design/docs/app-guide/screenshots",
);

/** Default credentials — override in .env.local. Super-admin role required. */
const E2E_USERNAME = process.env.E2E_USERNAME ?? "admin";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin";

/** App basepath under which every route is served. */
const APP_BASEPATH = process.env.E2E_APP_BASEPATH ?? "/an2n";

/** Target pipeline for the pipeline pass. Always `x121` per the doc plan. */
export const PIPELINE_CODE = process.env.E2E_PIPELINE_CODE ?? "x121";

/** Theme key and preference value that the app's ThemeProvider reads from
 * localStorage — keep in sync with `apps/frontend/src/tokens/types.ts`. */
const THEME_STORAGE_KEY = "an2n-theme";
const DARK_THEME_PREFERENCE = {
  colorScheme: "dark" as const,
  brandPalette: "obsidian" as const,
  highContrast: false,
};

/**
 * Force dark mode on every captured page. Two layers:
 *   1. Seed localStorage BEFORE the app mounts so the first paint is dark
 *      (avoids a light→dark flash on the screenshot).
 *   2. Intercept the authenticated `/user/theme` API so the user's saved
 *      backend preference (which `useThemePersistence` fetches post-login
 *      and applies on top of localStorage) always returns a dark payload.
 */
let themeRouteRegistered = new WeakSet<Page>();

async function seedDarkTheme(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore storage quota / disabled */
      }
    },
    { key: THEME_STORAGE_KEY, value: DARK_THEME_PREFERENCE },
  );

  if (themeRouteRegistered.has(page)) return;
  themeRouteRegistered.add(page);
  await page.route("**/api/v1/user/theme", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: 1,
            user_id: 0,
            color_scheme: "dark",
            brand_palette: "obsidian",
            high_contrast: false,
            custom_theme_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    }
    // Swallow PUTs so the test never mutates the real user's preference.
    return route.fulfill({ status: 204, body: "" });
  });
}

/**
 * Build a screenshot filename in the convention used by the guide.
 * `<chapter>-<slug>[-<variant>].png`
 */
export function shotName(chapter: string, slug: string, variant?: string): string {
  const suffix = variant ? `-${variant}` : "";
  return `${chapter}-${slug}${suffix}.png`;
}

/** Take a full-viewport screenshot and save it into the guide's screenshots dir. */
export async function snap(
  page: Page,
  chapter: string,
  slug: string,
  variant?: string,
  options: { fullPage?: boolean; clip?: Locator } = {},
): Promise<void> {
  // Give any micro-animations a moment to settle.
  await page.waitForTimeout(350);

  const filename = shotName(chapter, slug, variant);
  const filepath = path.join(SCREENSHOT_DIR, filename);

  if (options.clip) {
    await options.clip.screenshot({ path: filepath });
  } else {
    await page.screenshot({ path: filepath, fullPage: options.fullPage ?? false });
  }
  // eslint-disable-next-line no-console
  console.log(`  [shot] ${filename}`);
}

/**
 * Log in as super-admin. Idempotent — if already authenticated and not on the
 * login page, this is a no-op. Seeds the dark-theme preference first so the
 * login screen itself is captured in dark mode.
 */
export async function login(page: Page): Promise<void> {
  await seedDarkTheme(page);
  await page.goto(`${APP_BASEPATH}/login`, { waitUntil: "domcontentloaded" });

  // If a session already exists the router may bounce us out of /login.
  if (!page.url().includes("/login")) {
    return;
  }

  await page.locator('input[type="text"]').first().fill(E2E_USERNAME);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait until we've navigated off /login.
  await page.waitForFunction(
    () => !window.location.pathname.endsWith("/login"),
    { timeout: 15_000 },
  );
  // Allow the shell to mount and first data to load.
  await page.waitForTimeout(700);
}

/** Preferred initial viewport for guide screenshots. */
export const CAPTURE_VIEWPORT = { width: 1580, height: 1000 } as const;

/**
 * Navigate to a route under the app basepath and wait for it to settle.
 * `route` is a path like "/content/media" — no `/an2n` prefix needed, the
 * helper prepends `APP_BASEPATH` (defaults to `/an2n`) before calling
 * `page.goto`. Pass a fully-qualified URL to opt out of the basepath prefix.
 */
export async function go(page: Page, route: string): Promise<void> {
  // Seed the theme preference on every navigation. `addInitScript` runs
  // before the page scripts, but only on NEW documents — so we also call
  // it here to cover specs that start with `go(...)` instead of `login()`.
  await seedDarkTheme(page);
  const target = /^https?:\/\//.test(route)
    ? route
    : `${APP_BASEPATH}${route.startsWith("/") ? route : `/${route}`}`;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
}

/**
 * Open a global-pass route (no pipeline selected).
 * Convenience wrapper for clarity.
 */
export const goGlobal = go;

/** Open a pipeline-scoped route under the configured PIPELINE_CODE. */
export async function goPipeline(page: Page, routeWithinPipeline: string): Promise<void> {
  const full = routeWithinPipeline.startsWith("/")
    ? `/pipelines/${PIPELINE_CODE}${routeWithinPipeline}`
    : `/pipelines/${PIPELINE_CODE}/${routeWithinPipeline}`;
  await go(page, full);
}

/** Click a tab by visible label (works for <Tabs> and <TabBar>). */
export async function selectTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${label}$`, "i") });
  const count = await tab.count();
  if (count > 0) {
    await tab.first().click();
  } else {
    // Fallback: component may not wire ARIA roles; click by text.
    await page.getByText(label, { exact: true }).first().click();
  }
  await page.waitForTimeout(400);
}

/** Assert that an element is visible — use to gate captures on real content. */
export async function waitVisible(locator: Locator, timeout = 10_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout });
}
