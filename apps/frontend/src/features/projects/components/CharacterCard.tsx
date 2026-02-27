/**
 * Character summary card for the project characters grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { Character, CharacterGroup } from "../types";
import { STATUS_COLORS, STATUS_LABELS } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const COLOR_TO_VARIANT: Record<string, BadgeVariant> = {
  gray: "default",
  yellow: "warning",
  blue: "info",
  purple: "info",
  green: "success",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterCardProps {
  character: Character;
  group?: CharacterGroup;
  onClick: () => void;
}

export function CharacterCard({ character, group, onClick }: CharacterCardProps) {
  const statusLabel = character.status_id
    ? (STATUS_LABELS[character.status_id] ?? "Unknown")
    : "No Status";

  const statusColor = character.status_id
    ? (STATUS_COLORS[character.status_id] ?? "gray")
    : "gray";

  const badgeVariant = COLOR_TO_VARIANT[statusColor] ?? "default";

  return (
    <Card
      elevation="sm"
      padding="md"
      className={cn(
        "cursor-pointer",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open character ${character.name}`}
      >
        <div className="flex items-start justify-between gap-[var(--spacing-2)]">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {character.name}
          </h3>
          <Badge variant={badgeVariant} size="sm">
            {statusLabel}
          </Badge>
        </div>

        {group && (
          <p className="mt-[var(--spacing-1)] text-xs text-[var(--color-text-muted)]">
            Group: {group.name}
          </p>
        )}
      </button>
    </Card>
  );
}
