/**
 * Scrollable timeline of review notes for a segment (PRD-38).
 *
 * Displays notes in chronological order with user info, timecode,
 * text content, tag badges, and resolution status.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { formatDateTime } from "@/lib/format";

import type { ReviewNote, ReviewTag } from "./types";
import { noteStatusLabel, statusBadgeVariant } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface NoteTimelineProps {
  /** List of notes to display. */
  notes: ReviewNote[];
  /** Available tags for display (matched by tag_ids on notes). */
  tags?: ReviewTag[];
  /** Called when the user wants to add a new note. */
  onAddNote?: () => void;
  /** Called when a note is clicked to expand/view thread. */
  onNoteClick?: (noteId: number) => void;
  /** Sort order. Defaults to "asc" (oldest first). */
  sortOrder?: "asc" | "desc";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function NoteTimeline({
  notes,
  tags = [],
  onAddNote,
  onNoteClick,
  sortOrder = "asc",
}: NoteTimelineProps) {
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  const sortedNotes = [...notes].sort((a, b) => {
    const diff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortOrder === "asc" ? diff : -diff;
  });

  // Only show top-level notes (no parent).
  const topLevelNotes = sortedNotes.filter((n) => n.parent_note_id === null);

  const toggleExpand = (noteId: number) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="note-timeline">
      {/* Add note button */}
      {onAddNote && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={onAddNote}>
            Add Note
          </Button>
        </div>
      )}

      {/* Empty state */}
      {topLevelNotes.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
          No review notes yet.
        </p>
      )}

      {/* Note list */}
      {topLevelNotes.map((note) => (
        <div
          key={note.id}
          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3"
          data-testid={`note-item-${note.id}`}
        >
          {/* Header: user, timecode, status */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">
                User #{note.user_id}
              </span>
              {note.timecode && (
                <span
                  className="font-mono text-xs text-[var(--color-text-muted)]"
                  data-testid={`note-timecode-${note.id}`}
                >
                  {note.timecode}
                </span>
              )}
              {note.frame_number != null && !note.timecode && (
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  Frame {note.frame_number}
                </span>
              )}
            </div>
            <Badge
              variant={statusBadgeVariant(note.status)}
              size="sm"
            >
              {noteStatusLabel(note.status)}
            </Badge>
          </div>

          {/* Text content */}
          {note.text_content && (
            <p
              className="mb-2 text-sm text-[var(--color-text-secondary)]"
              data-testid={`note-text-${note.id}`}
            >
              {note.text_content}
            </p>
          )}

          {/* Voice memo indicator */}
          {note.voice_memo_path && (
            <div className="mb-2 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <span aria-hidden="true">🎤</span>
              <span>Voice memo attached</span>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1" data-testid={`note-tags-${note.id}`}>
              {/* Note: in a full implementation, tags would come from note-tag join data.
                  This placeholder shows available tags for styling reference. */}
            </div>
          )}

          {/* Footer: timestamp + expand */}
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>{formatDateTime(note.created_at)}</span>
            <div className="flex gap-2">
              {onNoteClick && (
                <button
                  type="button"
                  onClick={() => onNoteClick(note.id)}
                  className="text-[var(--color-action-primary)] hover:underline"
                >
                  View Thread
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleExpand(note.id)}
                className="text-[var(--color-action-primary)] hover:underline"
              >
                {expandedNotes.has(note.id) ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
