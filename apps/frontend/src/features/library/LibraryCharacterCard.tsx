/**
 * Card component for displaying a single library character (PRD-60).
 *
 * Read-only gallery mode (Amendment A.2): each card shows a "Go to Character"
 * link that navigates to the character's edit page. If the character exists
 * in multiple projects, a dropdown lets the user pick which project.
 */

import { useCallback, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";

import { Badge, Button } from "@/components";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import { ArrowRight, ChevronDown, Layers, User } from "@/tokens/icons";

import type { LibraryCharacter, LibraryUsageEntry } from "./types";

interface LibraryCharacterCardProps {
  character: LibraryCharacter;
  usageCount?: number;
  usage?: LibraryUsageEntry[];
  onSelect?: (character: LibraryCharacter) => void;
  onImport?: (character: LibraryCharacter) => void;
}

export function LibraryCharacterCard({
  character,
  usageCount = 0,
  usage = [],
  onSelect,
  onImport,
}: LibraryCharacterCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4 flex flex-col",
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

      {/* Footer: usage count + go-to / import actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border-default)]">
        <span
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
          data-testid="usage-count"
        >
          <Layers size={14} aria-hidden="true" />
          {usageCount} project{usageCount !== 1 ? "s" : ""}
        </span>

        <div className="flex items-center gap-2">
          <GoToCharacterButton usage={usage} />
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
    </div>
  );
}

/* --------------------------------------------------------------------------
   Go to Character — handles 0, 1, or many projects
   -------------------------------------------------------------------------- */

function GoToCharacterButton({ usage }: { usage: LibraryUsageEntry[] }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(dropdownRef, close, open);

  // No project usage — disabled state
  if (usage.length === 0) {
    return (
      <span
        className="text-xs text-[var(--color-text-disabled)] select-none"
        data-testid="go-to-character-disabled"
      >
        Not in any project
      </span>
    );
  }

  // Single project — direct link
  if (usage.length === 1) {
    const entry = usage[0] as LibraryUsageEntry;
    return (
      <Link
        to="/projects/$projectId/characters/$characterId"
        params={{
          projectId: String(entry.project_id),
          characterId: String(entry.project_character_id),
        }}
        search={{ tab: undefined }}
        onClick={(e) => e.stopPropagation()}
        data-testid="go-to-character-link"
      >
        <Button variant="ghost" size="sm" tabIndex={-1}>
          Go to Character
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </Link>
    );
  }

  // Multiple projects — dropdown
  return (
    <div ref={dropdownRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        data-testid="go-to-character-dropdown-trigger"
      >
        Go to Character
        <Badge variant="default" size="sm">
          {usage.length}
        </Badge>
        <ChevronDown
          size={14}
          className={cn(
            "transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </Button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-48",
            "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
            "bg-[var(--color-surface-primary)] shadow-lg",
            "py-1",
          )}
          data-testid="go-to-character-dropdown"
        >
          {usage.map((entry) => (
            <Link
              key={entry.link_id}
              to="/projects/$projectId/characters/$characterId"
              params={{
                projectId: String(entry.project_id),
                characterId: String(entry.project_character_id),
              }}
              search={{ tab: undefined }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2",
                "text-sm text-[var(--color-text-primary)]",
                "hover:bg-[var(--color-surface-hover)]",
                "transition-colors",
              )}
            >
              <span className="truncate">{entry.project_name}</span>
              <ArrowRight
                size={14}
                className="shrink-0 text-[var(--color-text-muted)]"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
