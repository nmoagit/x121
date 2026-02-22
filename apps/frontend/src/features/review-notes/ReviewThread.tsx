/**
 * Threaded conversation view for a review note and its replies (PRD-38).
 *
 * Displays the root note, its thread of replies, a reply input at the
 * bottom, and mark-as-resolved / reopen controls.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { formatDateTime } from "@/lib/format";

import type { ReviewNote } from "./types";
import {
  NOTE_STATUS_RESOLVED,
  NOTE_STATUS_WONT_FIX,
  noteStatusLabel,
  statusBadgeVariant,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReviewThreadProps {
  /** The root note. */
  note: ReviewNote;
  /** Replies to the root note. */
  replies: ReviewNote[];
  /** Called when the user submits a reply. */
  onReply?: (text: string) => void;
  /** Called when the user marks the note as resolved. */
  onResolve?: () => void;
  /** Called when the user reopens the note. */
  onReopen?: () => void;
  /** Whether the thread is collapsed by default. */
  defaultCollapsed?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReviewThread({
  note,
  replies,
  onReply,
  onResolve,
  onReopen,
  defaultCollapsed = false,
}: ReviewThreadProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [replyText, setReplyText] = useState("");

  const isResolved = note.status === NOTE_STATUS_RESOLVED;
  const isWontFix = note.status === NOTE_STATUS_WONT_FIX;
  const canResolve = !isResolved && !isWontFix;

  const handleSubmitReply = () => {
    const trimmed = replyText.trim();
    if (trimmed && onReply) {
      onReply(trimmed);
      setReplyText("");
    }
  };

  return (
    <div
      className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]"
      data-testid="review-thread"
    >
      {/* Root note header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">
            User #{note.user_id}
          </span>
          {note.timecode && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {note.timecode}
            </span>
          )}
          <Badge variant={statusBadgeVariant(note.status)} size="sm">
            {noteStatusLabel(note.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-[var(--color-action-primary)] hover:underline"
            aria-label={collapsed ? "Expand thread" : "Collapse thread"}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          {/* Resolution controls */}
          {canResolve && onResolve && (
            <Button size="sm" variant="secondary" onClick={onResolve}>
              Resolve
            </Button>
          )}
          {isResolved && onReopen && (
            <Button size="sm" variant="ghost" onClick={onReopen}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Root note content */}
      <div className="p-3">
        {note.text_content && (
          <p
            className="text-sm text-[var(--color-text-secondary)]"
            data-testid="thread-root-text"
          >
            {note.text_content}
          </p>
        )}
        <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
          {formatDateTime(note.created_at)}
        </span>
      </div>

      {/* Thread replies */}
      {!collapsed && (
        <div data-testid="thread-replies">
          {replies.length > 0 && (
            <div className="border-t border-[var(--color-border-default)]">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  className="border-b border-[var(--color-border-default)] p-3 pl-6 last:border-b-0"
                  data-testid={`thread-reply-${reply.id}`}
                >
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      User #{reply.user_id}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {formatDateTime(reply.created_at)}
                    </span>
                  </div>
                  {reply.text_content && (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {reply.text_content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          {onReply && (
            <div className="flex items-center gap-2 border-t border-[var(--color-border-default)] p-3">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitReply();
                  }
                }}
                placeholder="Write a reply..."
                className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                data-testid="thread-reply-input"
              />
              <Button
                size="sm"
                onClick={handleSubmitReply}
                disabled={!replyText.trim()}
              >
                Reply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
