/**
 * Pinned note banner component (PRD-95).
 *
 * Shows a banner at the top of entity views for pinned notes.
 * Blocker-category notes get a red border + warning treatment.
 */

import { useState } from "react";

import { Badge } from "@/components";

import type { NoteCategory, ProductionNote } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PinnedNoteBannerProps {
  /** Pinned notes to display. */
  notes: ProductionNote[];
  /** Available categories for badge rendering. */
  categories: NoteCategory[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PinnedNoteBanner({ notes, categories }: PinnedNoteBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const visibleNotes = notes.filter((n) => !dismissedIds.has(n.id));

  if (visibleNotes.length === 0) return null;

  const dismiss = (id: number) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <div data-testid="pinned-banner" className="space-y-2">
      {visibleNotes.map((note) => {
        const category = categories.find((c) => c.id === note.category_id);
        const isBlocker = category?.name === "blocker";

        return (
          <div
            key={note.id}
            data-testid={`pinned-note-${note.id}`}
            className={`flex items-start gap-3 rounded border p-3 ${
              isBlocker
                ? "border-[var(--color-action-danger)] bg-[var(--color-action-danger)]/10"
                : "border-[var(--color-action-warning)] bg-[var(--color-action-warning)]/10"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                {category && (
                  <span data-testid={`pinned-category-${note.id}`}>
                    <Badge
                      variant={isBlocker ? "danger" : "warning"}
                      size="sm"
                    >
                      {category.name}
                    </Badge>
                  </span>
                )}
              </div>
              <p
                data-testid={`pinned-content-${note.id}`}
                className="line-clamp-2 text-sm text-[var(--color-text-primary)]"
              >
                {note.content_md}
              </p>
            </div>
            <button
              type="button"
              data-testid={`dismiss-btn-${note.id}`}
              className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
              onClick={() => dismiss(note.id)}
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}
