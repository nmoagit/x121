/**
 * Character summary card for the project characters grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Edit3 } from "@/tokens/icons";

import type { Character, CharacterGroup } from "../types";
import { characterStatusBadgeVariant, characterStatusLabel } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterCardProps {
  character: Character;
  group?: CharacterGroup;
  onClick: () => void;
  onEdit?: () => void;
}

export function CharacterCard({ character, group, onClick, onEdit }: CharacterCardProps) {
  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);

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
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate flex-1">
            {character.name}
          </h3>
          <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
            {onEdit && (
              <span
                role="button"
                tabIndex={0}
                className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit();
                  }
                }}
                aria-label={`Edit ${character.name}`}
              >
                <Edit3 size={14} aria-hidden />
              </span>
            )}
            <Badge variant={badgeVariant} size="sm">
              {statusLabel}
            </Badge>
          </div>
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
