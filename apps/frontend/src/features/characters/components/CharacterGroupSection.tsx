/**
 * Reusable expandable group section for character grids (PRD-135).
 *
 * Extracted from ProjectCharactersTab so both the project tab and
 * Character Creator page can share the same group layout.
 */

import type { ReactNode } from "react";

import { Grid } from "@/components/layout";
import { cn } from "@/lib/cn";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER, INLINE_LINK_BTN } from "@/lib/ui-classes";
import { ChevronDown, ChevronRight, Edit3, Trash2 } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** Minimal character shape needed by the group section. */
export interface GroupSectionCharacter {
  id: number;
  name: string;
}

/** Drag-and-drop event handlers for a group section. */
export interface GroupSectionDragHandlers {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface CharacterGroupSectionProps<T extends GroupSectionCharacter> {
  /** HTML id for scroll-to-group anchoring. */
  sectionId?: string;
  /** Display name for the group header. */
  label: string;
  /** Characters in this group (already filtered/sorted). */
  characters: T[];
  /** Whether the section body is expanded. */
  expanded: boolean;
  /** Visual highlight when a drag is hovering over this group. */
  isDragOver?: boolean;
  /** Currently selected character IDs. */
  selectedCharIds: Set<number>;
  /** Toggle selection of a single character. */
  onCharSelect: (charId: number) => void;
  /** Select or deselect a batch of character IDs. Pass [] to deselect all. */
  onSelectAll: (charIds: number[]) => void;
  /** Toggle expanded/collapsed state. */
  onToggle: () => void;
  /** Edit callback for the group header. Omit to hide the edit button. */
  onEdit?: () => void;
  /** Delete callback for the group header. Omit to hide the delete button. */
  onDelete?: () => void;
  /** Drag-and-drop handlers. Omit to disable DnD on this section. */
  dragHandlers?: GroupSectionDragHandlers;
  /** Render function for each character. Receives the character object. */
  renderCard: (character: T) => ReactNode;
  /** Message shown when the group has no characters. */
  emptyMessage?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterGroupSection<T extends GroupSectionCharacter>({
  sectionId,
  label,
  characters,
  expanded,
  isDragOver = false,
  selectedCharIds,
  onCharSelect: _onCharSelect,
  onSelectAll,
  onToggle,
  onEdit,
  onDelete,
  dragHandlers,
  renderCard,
  emptyMessage = "No characters in this group. Drag characters here to add them.",
}: CharacterGroupSectionProps<T>) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const charIds = characters.map((c) => c.id);
  const allSelected = characters.length > 0 && charIds.every((id) => selectedCharIds.has(id));

  return (
    <div
      id={sectionId}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--color-surface-primary)] transition-colors",
        isDragOver
          ? "border-[var(--color-border-accent)] ring-2 ring-[var(--color-action-primary)] bg-[var(--color-surface-secondary)]"
          : "border-[var(--color-border-default)]",
      )}
      onDragEnter={dragHandlers?.onDragEnter}
      onDragOver={dragHandlers?.onDragOver}
      onDragLeave={dragHandlers?.onDragLeave}
      onDrop={dragHandlers?.onDrop}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-left hover:bg-[var(--color-surface-secondary)] transition-colors rounded-t-[var(--radius-md)] cursor-pointer"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <Chevron size={16} className="text-[var(--color-text-muted)] shrink-0" aria-hidden />
        <span className="font-medium text-[var(--color-text-primary)] flex-1">{label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {characters.length} {characters.length === 1 ? "character" : "characters"}
        </span>
        {characters.length > 0 && (
          <button
            type="button"
            className={INLINE_LINK_BTN}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAll(allSelected ? [] : charIds);
            }}
            aria-label={allSelected ? `Deselect all in ${label}` : `Select all in ${label}`}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className={ICON_ACTION_BTN}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit ${label}`}
          >
            <Edit3 size={14} aria-hidden />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className={ICON_ACTION_BTN_DANGER}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${label}`}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* Expanded character cards */}
      {expanded && (
        <div className="border-t border-[var(--color-border-default)] px-[var(--spacing-3)] py-[var(--spacing-3)]">
          {characters.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-2)]">
              {emptyMessage}
            </p>
          ) : (
            <Grid cols={2} gap={3} className="sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {characters.map((c) => renderCard(c))}
            </Grid>
          )}
        </div>
      )}
    </div>
  );
}
