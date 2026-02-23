/**
 * Notes panel component for production notes (PRD-95).
 *
 * Displays a collapsible list of notes for an entity, organized by
 * category with color-coded badges, plus a "create note" button.
 */

import { useState } from "react";

import { Badge, Button } from "@/components";
import { formatDateTime } from "@/lib/format";

import type { NoteCategory, ProductionNote } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface NotesPanelProps {
  /** All notes for the entity. */
  notes: ProductionNote[];
  /** Available categories for badge rendering. */
  categories: NoteCategory[];
  /** Callback to create a new note. */
  onCreateNote?: () => void;
  /** Callback when a note is clicked (for thread view). */
  onNoteClick?: (noteId: number) => void;
  /** Callback when pin toggle is clicked. */
  onTogglePin?: (noteId: number) => void;
  /** Whether the panel is initially collapsed. */
  defaultCollapsed?: boolean;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getCategoryForNote(
  note: ProductionNote,
  categories: NoteCategory[],
): NoteCategory | undefined {
  return categories.find((c) => c.id === note.category_id);
}

function categoryBadgeVariant(
  categoryName: string,
): "default" | "danger" | "info" | "success" {
  switch (categoryName) {
    case "blocker":
      return "danger";
    case "instruction":
      return "info";
    case "fyi":
      return "success";
    default:
      return "default";
  }
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function NotesPanel({
  notes,
  categories,
  onCreateNote,
  onNoteClick,
  onTogglePin,
  defaultCollapsed = false,
}: NotesPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div data-testid="notes-panel" className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="notes-panel-toggle"
          className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span>{collapsed ? "+" : "-"}</span>
          Notes ({notes.length})
        </button>
        {onCreateNote && (
          <Button
            data-testid="create-note-btn"
            variant="primary"
            size="sm"
            onClick={onCreateNote}
          >
            New Note
          </Button>
        )}
      </div>

      {/* Note list */}
      {!collapsed && (
        <div data-testid="notes-list" className="space-y-2">
          {notes.length === 0 && (
            <p
              data-testid="empty-notes"
              className="py-3 text-center text-sm text-[var(--color-text-muted)]"
            >
              No notes yet.
            </p>
          )}

          {notes.map((note) => {
            const category = getCategoryForNote(note, categories);
            const variant = category
              ? categoryBadgeVariant(category.name)
              : "default";

            return (
              <div
                key={note.id}
                data-testid={`note-item-${note.id}`}
                className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Category badge + pin indicator */}
                    <div className="mb-1 flex items-center gap-2">
                      {category && (
                        <span data-testid={`category-badge-${note.id}`}>
                          <Badge variant={variant} size="sm">
                            {category.name}
                          </Badge>
                        </span>
                      )}
                      {note.pinned && (
                        <span data-testid={`pinned-badge-${note.id}`}>
                          <Badge variant="warning" size="sm">
                            Pinned
                          </Badge>
                        </span>
                      )}
                      {note.resolved_at && (
                        <Badge variant="success" size="sm">
                          Resolved
                        </Badge>
                      )}
                    </div>

                    {/* Content snippet */}
                    <p
                      data-testid={`note-content-${note.id}`}
                      className="line-clamp-3 text-sm text-[var(--color-text-primary)]"
                    >
                      {note.content_md}
                    </p>

                    {/* Metadata */}
                    <span className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {formatDateTime(note.created_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {onTogglePin && (
                      <button
                        type="button"
                        data-testid={`pin-btn-${note.id}`}
                        className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
                        onClick={() => onTogglePin(note.id)}
                      >
                        {note.pinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                    {onNoteClick && (
                      <button
                        type="button"
                        data-testid={`thread-btn-${note.id}`}
                        className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
                        onClick={() => onNoteClick(note.id)}
                      >
                        Thread
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
