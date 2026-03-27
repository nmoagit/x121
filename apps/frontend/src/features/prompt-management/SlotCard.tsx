/**
 * Individual slot card for the prompt slots panel (PRD-115).
 *
 * Renders a single workflow prompt slot with editable textarea,
 * type indicator, and save button.
 */

import type React from "react";

import { Button } from "@/components/primitives/Button";
import { PLACEHOLDER_REGEX } from "@/features/prompt-editor";
import { cn } from "@/lib/cn";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_TEXTAREA,
} from "@/lib/ui-classes";

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
  const isPositive = slot.slot_type === "positive";
  const borderColor = isPositive ? "border-l-green-500" : "border-l-red-500";
  const typeColor = isPositive ? "text-green-400" : "text-red-400";

  return (
    <div
      className={cn(TERMINAL_PANEL, "border-l-2", borderColor)}
      data-testid={`slot-card-${slot.id}`}
    >
      <div className={`${TERMINAL_HEADER} flex items-center gap-2`}>
        <span className={TERMINAL_HEADER_TITLE}>{slot.slot_label}</span>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{slot.node_id}</span>
        <span className={`font-mono text-[10px] uppercase tracking-wide ${typeColor}`}>
          {isPositive ? "positive" : "negative"}
        </span>
        {!slot.is_user_editable && (
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]" aria-label="Read only">
            (read only)
          </span>
        )}
      </div>

      <div className={TERMINAL_BODY}>
        {slot.description && (
          <p className="font-mono text-[10px] text-[var(--color-text-muted)] mb-2">{slot.description}</p>
        )}

        <textarea
          value={text}
          readOnly={!slot.is_user_editable}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          className={cn(
            TERMINAL_TEXTAREA,
            "resize-y",
            !slot.is_user_editable && "opacity-60 cursor-not-allowed",
          )}
          data-testid={`slot-textarea-${slot.id}`}
        />

        {text && (
          <div className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
            Preview: {renderPromptText(text)}
          </div>
        )}

        {slot.is_user_editable && isDirty && (
          <div className="mt-2 flex justify-end">
            <Button size="xs" onClick={onSave} loading={isSaving} data-testid={`slot-save-${slot.id}`}>
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
