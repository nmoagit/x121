/**
 * Character summary card for the project characters grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Check, Edit3, User } from "@/tokens/icons";

import type { Character, CharacterGroup } from "../types";
import { characterStatusBadgeVariant, characterStatusLabel } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterCardProps {
  character: Character;
  group?: CharacterGroup;
  avatarUrl?: string | null;
  selected?: boolean;
  onSelect?: (charId: number) => void;
  onClick: () => void;
  onEdit?: () => void;
}

export function CharacterCard({ character, group, avatarUrl, selected, onSelect, onClick, onEdit }: CharacterCardProps) {
  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);

  return (
    <Card
      elevation="sm"
      padding="none"
      className={cn(
        "group/card cursor-pointer overflow-hidden",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        selected && "ring-2 ring-[var(--color-border-accent)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open character ${character.name}`}
      >
        {/* Avatar area */}
        <div className="relative aspect-[4/3] bg-[var(--color-surface-tertiary)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={character.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <User size={48} className="text-[var(--color-text-muted)] opacity-30" />
            </div>
          )}

          {/* Selection checkbox overlay */}
          {onSelect && (
            <span
              role="checkbox"
              tabIndex={0}
              aria-checked={selected}
              className={cn(
                "absolute top-2 left-2 shrink-0 w-5 h-5 rounded-[var(--radius-sm)] border flex items-center justify-center cursor-pointer transition-colors",
                selected
                  ? "bg-[var(--color-action-primary)] border-[var(--color-action-primary)] text-white"
                  : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)] hover:border-[var(--color-border-accent)] text-transparent opacity-0 group-hover/card:opacity-100",
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

          {/* Edit button overlay */}
          {onEdit && (
            <span
              role="button"
              tabIndex={0}
              className="absolute top-2 right-2 p-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-primary)]/80 text-[var(--color-text-muted)] opacity-0 group-hover/card:opacity-100 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-primary)] cursor-pointer transition-opacity"
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
        </div>

        {/* Info area */}
        <div className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
          <div className="flex items-center justify-between gap-[var(--spacing-2)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {character.name}
            </h3>
            <Badge variant={badgeVariant} size="sm">
              {statusLabel}
            </Badge>
          </div>
          {group && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
              {group.name}
            </p>
          )}
        </div>
      </button>
    </Card>
  );
}
