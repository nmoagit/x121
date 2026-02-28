/**
 * Individual slot card for the prompt slots panel (PRD-115).
 *
 * Renders a single workflow prompt slot with editable textarea,
 * type badge, and save button.
 */

import type React from "react";

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { PLACEHOLDER_REGEX } from "@/features/prompt-editor";
import { cn } from "@/lib/cn";

import type { WorkflowPromptSlot } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Render text with `{placeholder}` tokens highlighted in bold. */
function renderPromptText(text: string) {
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    result.push(
      <strong key={key++} className="text-[var(--color-action-primary)]">
        {match[0]}
      </strong>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    result.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return result;
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface SlotCardProps {
  slot: WorkflowPromptSlot;
  text: string;
  isDirty: boolean;
  isSaving: boolean;
  onTextChange: (text: string) => void;
  onSave: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SlotCard({ slot, text, isDirty, isSaving, onTextChange, onSave }: SlotCardProps) {
  const badgeVariant = slot.slot_type === "positive" ? "info" : "warning";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-primary)] p-4",
      )}
      data-testid={`slot-card-${slot.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{slot.slot_label}</span>
        <Badge variant={badgeVariant} size="sm">
          {slot.slot_type}
        </Badge>
        {!slot.is_user_editable && (
          <span className="text-xs text-[var(--color-text-muted)]" aria-label="Read only">
            (read only)
          </span>
        )}
      </div>

      {slot.description && (
        <p className="text-xs text-[var(--color-text-muted)] mb-2">{slot.description}</p>
      )}

      <textarea
        value={text}
        readOnly={!slot.is_user_editable}
        onChange={(e) => onTextChange(e.target.value)}
        rows={3}
        className={cn(
          "w-full px-3 py-2 text-sm",
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
          "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
          "placeholder:text-[var(--color-text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]",
          "resize-y",
          !slot.is_user_editable && "opacity-60 cursor-not-allowed",
        )}
        data-testid={`slot-textarea-${slot.id}`}
      />

      {text && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">
          Preview: {renderPromptText(text)}
        </div>
      )}

      {slot.is_user_editable && isDirty && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={onSave} loading={isSaving} data-testid={`slot-save-${slot.id}`}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
