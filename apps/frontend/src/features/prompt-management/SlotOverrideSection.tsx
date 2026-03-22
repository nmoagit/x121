/**
 * Individual slot override section for the avatar scene override editor (PRD-115).
 *
 * Shows base prompt text, fragment list with remove buttons,
 * fragment dropdown for adding, and notes input.
 */

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { cn } from "@/lib/cn";

import { FragmentDropdown } from "./FragmentDropdown";
import type { PromptFragment, SlotDraft, WorkflowPromptSlot } from "./types";

export interface SlotOverrideSectionProps {
  slot: WorkflowPromptSlot;
  baseText: string;
  draft: SlotDraft;
  sceneTypeId: number;
  onAddFragment: (fragment: PromptFragment) => void;
  onRemoveFragment: (index: number) => void;
  onOverrideTextChange?: (text: string) => void;
  onNotesChange: (notes: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SlotOverrideSection({
  slot,
  baseText,
  draft,
  sceneTypeId,
  onAddFragment,
  onRemoveFragment,
  onOverrideTextChange,
  onNotesChange,
}: SlotOverrideSectionProps) {
  const hasOverride = !!draft.override_text;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-primary)] p-4",
      )}
      data-testid={`override-section-${slot.id}`}
    >
      <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
        {slot.slot_label}
      </h4>

      {/* Base text (read-only) */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">
            {hasOverride ? "Original prompt (overridden):" : "Base prompt:"}
          </span>
          {onOverrideTextChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (hasOverride) {
                  onOverrideTextChange("");
                } else {
                  onOverrideTextChange(baseText);
                }
              }}
              data-testid={`toggle-override-${slot.id}`}
            >
              {hasOverride ? "Use Original" : "Override"}
            </Button>
          )}
        </div>
        <p
          className={cn(
            "text-sm mt-1 whitespace-pre-wrap",
            hasOverride
              ? "text-[var(--color-text-muted)] line-through"
              : "text-[var(--color-text-secondary)]",
          )}
          data-testid={`base-text-${slot.id}`}
        >
          {baseText || "(no default)"}
        </p>
      </div>

      {/* Full override textarea */}
      {hasOverride && onOverrideTextChange && (
        <div className="mb-3">
          <span className="text-xs text-[var(--color-text-muted)]">Override prompt:</span>
          <textarea
            className={cn(
              "mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-default)]",
              "bg-[var(--color-surface-secondary)] p-2 text-sm text-[var(--color-text-primary)]",
              "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
              "min-h-[80px] resize-y",
            )}
            value={draft.override_text}
            onChange={(e) => onOverrideTextChange(e.target.value)}
            placeholder="Enter full prompt override..."
            data-testid={`override-text-${slot.id}`}
          />
        </div>
      )}

      {/* Fragment list */}
      {draft.fragments.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-[var(--color-text-muted)]">Fragments:</span>
          <ul className="mt-1 flex flex-col gap-1" data-testid={`fragment-list-${slot.id}`}>
            {draft.fragments.map((entry, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-2 text-sm px-2 py-1 bg-[var(--color-surface-secondary)] rounded-[var(--radius-sm)]"
              >
                <span className="text-[var(--color-text-primary)] truncate">{entry.text}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFragment(idx)}
                  aria-label={`Remove fragment ${idx + 1}`}
                  data-testid={`remove-fragment-${slot.id}-${idx}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add fragment */}
      <FragmentDropdown sceneTypeId={sceneTypeId} onSelect={onAddFragment} />

      {/* Notes */}
      <div className="mt-3">
        <Input
          label="Notes"
          value={draft.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Optional notes for this override..."
          data-testid={`override-notes-${slot.id}`}
        />
      </div>
    </div>
  );
}
