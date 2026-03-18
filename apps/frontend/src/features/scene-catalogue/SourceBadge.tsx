/**
 * Badge showing the source level of a scene setting (PRD-111).
 *
 * Displays "Default", "Project", or "Character" with appropriate
 * color coding to indicate where the setting value originated.
 */

import { Badge, type BadgeVariant } from "@/components/primitives/Badge";

import type { EffectiveSceneSetting } from "./types";

/* --------------------------------------------------------------------------
   Source mapping
   -------------------------------------------------------------------------- */

type SettingSource = EffectiveSceneSetting["source"];

const SOURCE_CONFIG: Record<SettingSource, { label: string; variant: BadgeVariant }> = {
  scene_type: { label: "Default", variant: "default" },
  project: { label: "Project", variant: "info" },
  group: { label: "Group", variant: "success" },
  character: { label: "Model", variant: "warning" },
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
    <Badge variant={config.variant} size="sm">
      {config.label}
    </Badge>
  );
}
