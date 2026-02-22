/**
 * Card component for displaying a single library character (PRD-60).
 */

import { Badge, Button } from "@/components";
import { cn } from "@/lib/cn";
import { Layers, User } from "@/tokens/icons";

import type { LibraryCharacter } from "./types";

interface LibraryCharacterCardProps {
  character: LibraryCharacter;
  usageCount?: number;
  onSelect?: (character: LibraryCharacter) => void;
  onImport?: (character: LibraryCharacter) => void;
}

export function LibraryCharacterCard({
  character,
  usageCount = 0,
  onSelect,
  onImport,
}: LibraryCharacterCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "hover:border-[var(--color-border-hover)]",
        "transition-colors cursor-pointer",
      )}
      data-testid={`library-card-${character.id}`}
      onClick={() => onSelect?.(character)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(character);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "flex items-center justify-center mb-3 rounded-[var(--radius-md)]",
          "bg-[var(--color-surface-tertiary)] h-32 overflow-hidden",
        )}
      >
        {character.thumbnail_path ? (
          <img
            src={character.thumbnail_path}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <User
            size={32}
            className="text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Name and status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {character.name}
        </h4>
        {character.is_published && (
          <Badge variant="success" size="sm">
            Published
          </Badge>
        )}
      </div>

      {/* Description */}
      {character.description && (
        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mb-2">
          {character.description}
        </p>
      )}

      {/* Tags */}
      {character.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {character.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="default" size="sm">
              {tag}
            </Badge>
          ))}
          {character.tags.length > 3 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              +{character.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: usage count + import button */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border-default)]">
        <span
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
          data-testid="usage-count"
        >
          <Layers size={14} aria-hidden="true" />
          {usageCount} project{usageCount !== 1 ? "s" : ""}
        </span>
        {onImport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onImport(character);
            }}
            data-testid="import-button"
          >
            Import
          </Button>
        )}
      </div>
    </div>
  );
}
