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
  catalog_default: { label: "Default", variant: "default" },
  project_override: { label: "Project", variant: "info" },
  character_override: { label: "Character", variant: "warning" },
};

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
