/**
 * Note thread component (PRD-95).
 *
 * Shows a parent note with its reply chain, a reply input at the bottom,
 * and resolve/unresolve actions.
 */

import { Badge, Button } from "@/components";
import { formatDateTime } from "@/lib/format";

import type { NoteCategory, ProductionNote } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface NoteThreadProps {
  /** The parent note. */
  parentNote: ProductionNote;
  /** Child notes (replies). */
  replies: ProductionNote[];
  /** Available categories. */
  categories: NoteCategory[];
  /** Called when the user clicks "Reply". */
  onReply?: () => void;
  /** Called when resolve is clicked. */
  onResolve?: (noteId: number) => void;
  /** Called when unresolve is clicked. */
  onUnresolve?: (noteId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function NoteThread({
  parentNote,
  replies,
  categories,
  onReply,
  onResolve,
  onUnresolve,
}: NoteThreadProps) {
  const isResolved = parentNote.resolved_at != null;
  const parentCategory = categories.find(
    (c) => c.id === parentNote.category_id,
  );

  return (
    <div data-testid="note-thread" className="space-y-3">
      {/* Parent note */}
      <div
        data-testid="parent-note"
        className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4"
      >
        <div className="mb-2 flex items-center gap-2">
          {parentCategory && (
            <Badge
              variant={parentCategory.name === "blocker" ? "danger" : "default"}
              size="sm"
            >
              {parentCategory.name}
            </Badge>
          )}
          <span data-testid="resolution-status">
            <Badge variant={isResolved ? "success" : "warning"} size="sm">
              {isResolved ? "Resolved" : "Open"}
            </Badge>
          </span>
        </div>

        <p
          data-testid="parent-content"
          className="text-sm text-[var(--color-text-primary)]"
        >
          {parentNote.content_md}
        </p>
        <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
          {formatDateTime(parentNote.created_at)}
        </span>

        {/* Resolve/Unresolve */}
        <div className="mt-3 flex items-center gap-2">
          {isResolved && onUnresolve && (
            <Button
              data-testid="unresolve-btn"
              variant="ghost"
              size="sm"
              onClick={() => onUnresolve(parentNote.id)}
            >
              Unresolve
            </Button>
          )}
          {!isResolved && onResolve && (
            <Button
              data-testid="resolve-btn"
              variant="primary"
              size="sm"
              onClick={() => onResolve(parentNote.id)}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div data-testid="replies-list" className="ml-4 space-y-2">
          {replies.map((reply) => {
            const replyCategory = categories.find(
              (c) => c.id === reply.category_id,
            );

            return (
              <div
                key={reply.id}
                data-testid={`reply-${reply.id}`}
                className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-3"
              >
                {replyCategory && (
                  <div className="mb-1">
                    <Badge variant="default" size="sm">
                      {replyCategory.name}
                    </Badge>
                  </div>
                )}
                <p className="text-sm text-[var(--color-text-primary)]">
                  {reply.content_md}
                </p>
                <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                  {formatDateTime(reply.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply action */}
      {onReply && (
        <div className="ml-4">
          <Button
            data-testid="reply-btn"
            variant="ghost"
            size="sm"
            onClick={onReply}
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}
