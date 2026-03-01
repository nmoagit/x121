/**
 * Character summary card for the project characters grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Check, Edit3 } from "@/tokens/icons";

import type { Character, CharacterGroup } from "../types";
import { characterStatusBadgeVariant, characterStatusLabel } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterCardProps {
  character: Character;
  group?: CharacterGroup;
  selected?: boolean;
  onSelect?: (charId: number) => void;
  onClick: () => void;
  onEdit?: () => void;
}

export function CharacterCard({ character, group, selected, onSelect, onClick, onEdit }: CharacterCardProps) {
  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);

  return (
    <Card
      elevation="sm"
      padding="none"
      className={cn(
        "group/card cursor-pointer",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        selected && "ring-2 ring-[var(--color-border-accent)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-[var(--spacing-4)] py-[var(--spacing-3)]"
        aria-label={`Open character ${character.name}`}
      >
        <div className="flex items-start justify-between gap-[var(--spacing-2)]">
          <div className="flex items-center gap-[var(--spacing-2)] flex-1 min-w-0">
            {onSelect && (
              <span
                role="checkbox"
                tabIndex={0}
                aria-checked={selected}
                className={cn(
                  "shrink-0 w-5 h-5 rounded-[var(--radius-sm)] border flex items-center justify-center cursor-pointer transition-colors",
                  selected
                    ? "bg-[var(--color-action-primary)] border-[var(--color-action-primary)] text-white"
                    : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-[var(--color-border-accent)] text-transparent",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(character.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(character.id);
                  }
                }}
                aria-label={`${selected ? "Deselect" : "Select"} ${character.name}`}
              >
                <Check size={12} aria-hidden />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
                {character.name}
              </h3>
              {group && (
                <p className="mt-[var(--spacing-1)] text-xs text-[var(--color-text-muted)]">
                  Group: {group.name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
            {onEdit && (
              <span
                role="button"
                tabIndex={0}
                className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] opacity-0 group-hover/card:opacity-100 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer transition-opacity"
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
      </button>
    </Card>
  );
}
