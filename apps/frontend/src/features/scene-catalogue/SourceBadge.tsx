/**
 * Badge showing the source level of a scene setting (PRD-111).
 *
 * Displays "Default", "Project", or "Avatar" with appropriate
 * color coding to indicate where the setting value originated.
 */

import { cn } from "@/lib/cn";
import { CATALOGUE_SOURCE_CONFIG } from "@/lib/setting-source";

import type { EffectiveSceneSetting } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Source mapping
   -------------------------------------------------------------------------- */

type SettingSource = EffectiveSceneSetting["source"];

/** Returns the human-readable label for a setting source. */
export function sourceLabel(source: SettingSource): string {
  return CATALOGUE_SOURCE_CONFIG[source]?.label ?? source;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface SourceBadgeProps {
  source: SettingSource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = CATALOGUE_SOURCE_CONFIG[source] ?? { label: source, color: "text-[var(--color-text-muted)]" };

  return (
    <span className={cn(TYPO_DATA, config.color)}>
      {config.label}
    </span>
  );
}
