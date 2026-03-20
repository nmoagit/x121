/**
 * Badge showing the source level of a scene setting (PRD-111).
 *
 * Displays "Default", "Project", or "Character" with appropriate
 * color coding to indicate where the setting value originated.
 */

import { cn } from "@/lib/cn";

import type { EffectiveSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Source mapping
   -------------------------------------------------------------------------- */

type SettingSource = EffectiveSceneSetting["source"];

const SOURCE_CONFIG: Record<SettingSource, { label: string; color: string }> = {
  scene_type: { label: "Default", color: "text-[var(--color-text-muted)]" },
  project: { label: "Project", color: "text-cyan-400" },
  group: { label: "Group", color: "text-green-400" },
  character: { label: "Model", color: "text-orange-400" },
};

/** Returns the human-readable label for a setting source. */
export function sourceLabel(source: SettingSource): string {
  return SOURCE_CONFIG[source].label;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface SourceBadgeProps {
  source: SettingSource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[source];

  return (
    <span className={cn("font-mono text-xs", config.color)}>
      {config.label}
    </span>
  );
}
