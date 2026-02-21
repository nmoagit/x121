/**
 * Layout serialization and deserialization (PRD-30).
 *
 * Converts panel layout state to/from JSON strings for persistence.
 * Designed for forward compatibility: unknown viewModules are preserved
 * in serialized form but filtered out during deserialization to prevent
 * rendering errors.
 */

import type { PanelState } from "./types";
import { getViewModule } from "./viewModuleRegistry";

/**
 * Serialize a panel layout array to a JSON string.
 */
export function serializeLayout(panels: PanelState[]): string {
  return JSON.stringify(panels);
}

/**
 * Deserialize a JSON string back into a panel layout array.
 *
 * Panels referencing unknown view modules (not currently registered) are
 * silently filtered out to ensure forward compatibility when modules are
 * removed or renamed.
 *
 * @param json - The JSON string to parse.
 * @param strict - If `true`, keep panels with unknown viewModules instead
 *                 of filtering them. Useful for admin tools. Defaults to `false`.
 */
export function deserializeLayout(json: string, strict = false): PanelState[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const panels: PanelState[] = [];

  for (const item of parsed) {
    if (!isValidPanelState(item)) continue;

    // Filter unknown modules unless strict mode is on
    if (!strict && !getViewModule(item.viewModule)) continue;

    panels.push(item as PanelState);
  }

  return panels;
}

/**
 * Basic structural validation for a panel state object.
 */
function isValidPanelState(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === "string" &&
    typeof obj.viewModule === "string" &&
    typeof obj.collapsed === "boolean" &&
    isPositionLike(obj.position) &&
    isSizeLike(obj.size)
  );
}

function isPositionLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.x === "number" && typeof obj.y === "number";
}

function isSizeLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.width === "number" && typeof obj.height === "number";
}
