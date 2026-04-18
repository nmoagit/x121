/**
 * Appendix B — Icon Reference.
 *
 * Captures a PNG per Lucide icon imported by the app (from `@/tokens/icons`).
 * Uses the `lucide-static` package to read each icon's raw SVG, renders it
 * on a transparent background in a Playwright page, and saves one PNG per
 * icon to `design/docs/app-guide/screenshots/icons/<IconName>.png`.
 *
 * The output is consumed by the `\iconrow{...}{...}{...}` macro in
 * preamble.tex, which renders each icon inline next to its description.
 */

import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCREENSHOT_DIR } from "./_helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Convert PascalCase / camelCase / mixed-case names to kebab-case.
 *  Lucide also inserts a hyphen before trailing digits (Trash2 → trash-2,
 *  BarChart3 → bar-chart-3), which the alphabetic rules don't cover. */
function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

/** Full list of icon names re-exported from `@/tokens/icons`. */
const ICON_NAMES: readonly string[] = [
  "ChevronDown", "ChevronRight", "ChevronLeft", "ChevronUp", "Menu",
  "PanelLeftClose", "PanelLeftOpen", "X", "Search", "ArrowLeft", "ArrowRight",
  "Archive", "ArchiveRestore", "RotateCcw", "Plus", "Minus",
  "Trash2", "Edit3", "Copy", "Download", "Upload",
  "Save", "RefreshCw", "Star", "Check", "AlertCircle",
  "AlertTriangle", "Info", "XCircle", "Loader2", "Clapperboard",
  "File", "FileText", "Folder", "Image", "Video",
  "FileVideo", "Play", "Pause", "SkipForward", "SkipBack",
  "Repeat", "Volume2", "VolumeX", "GripVertical", "LayoutGrid",
  "Layout", "Maximize2", "Minimize2", "Columns", "Keyboard",
  "Settings", "User", "LogOut", "Eye", "EyeOff",
  "Moon", "Sun", "SunMoon", "Monitor", "Palette",
  "Layers", "List", "Bell", "BellOff", "Clock",
  "Ban", "Square", "CircleCheck", "CircleX", "Activity",
  "HardDrive", "BarChart3", "Zap", "Lock", "Unlock",
  "GitBranch", "Server", "Cpu", "Power", "ShieldCheck",
  "Cloud", "Workflow", "Terminal", "ArrowDown", "ArrowUp",
  "Globe", "FileJson", "FolderKanban", "Film", "Mic",
  "Bug", "ListFilter", "Calendar", "DollarSign", "FileSearch",
  "Link2", "Timer", "TrendingUp", "Undo2", "Users",
  "MessageSquare", "Sparkles", "Wand2", "Wrench", "CheckCircle",
  "UserPlus", "ArrowRightLeft", "Wifi", "WifiOff", "RotateCw",
  "ScanEye", "ScanSearch", "Shield", "CircleDot", "ChevronsDownUp",
  "ChevronsUpDown", "Tag", "FolderSearch",
];

// Path to the lucide-static SVG folder inside the frontend workspace's
// node_modules. The spec file lives at apps/frontend/e2e/capture/, so the
// resolved path is ../../node_modules/lucide-static/icons.
const ICON_SVG_DIR = path.resolve(__dirname, "../../node_modules/lucide-static/icons");

const ICON_OUT_DIR = path.join(SCREENSHOT_DIR, "icons");

test("Appendix B icon reference — render per-icon PNGs", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(ICON_OUT_DIR, { recursive: true });

  // Render each icon on a transparent background. The icon stroke uses
  // `currentColor` internally, so we set the wrapper `color` to a dark
  // near-black that reads well on the white PDF pages the guide renders on.
  await page.setViewportSize({ width: 96, height: 96 });

  let written = 0;
  let skipped = 0;
  for (const name of ICON_NAMES) {
    const kebab = toKebab(name);
    const svgPath = path.join(ICON_SVG_DIR, `${kebab}.svg`);
    if (!fs.existsSync(svgPath)) {
      // eslint-disable-next-line no-console
      console.log(`  [skip] ${name} — missing ${kebab}.svg`);
      skipped += 1;
      continue;
    }
    let svg = fs.readFileSync(svgPath, "utf8");
    // Strip the leading license comment to keep the rendered HTML minimal.
    svg = svg.replace(/<!--[\s\S]*?-->/, "").trim();
    // Force a known stroke width + colour regardless of the default lucide
    // settings so the rendered glyph is consistent across icons.
    svg = svg
      .replace(/stroke="[^"]*"/, 'stroke="#1F2328"')
      .replace(/width="24"/, 'width="48"')
      .replace(/height="24"/, 'height="48"');

    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:8px;background:transparent;">
         <div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;color:#1F2328;">
           ${svg}
         </div>
       </body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(30);
    const box = page.locator("div").first();
    await box.screenshot({
      path: path.join(ICON_OUT_DIR, `${kebab}.png`),
      omitBackground: true,
    });
    written += 1;
  }
  // eslint-disable-next-line no-console
  console.log(`  [icons] wrote=${written}  skipped=${skipped}  dir=${ICON_OUT_DIR}`);
});
