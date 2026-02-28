/**
 * Individual slot override section for the character scene override editor (PRD-115).
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
  onNotesChange,
}: SlotOverrideSectionProps) {
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
        <span className="text-xs text-[var(--color-text-muted)]">Base prompt:</span>
        <p
          className="text-sm text-[var(--color-text-secondary)] mt-1 whitespace-pre-wrap"
          data-testid={`base-text-${slot.id}`}
        >
          {baseText || "(no default)"}
        </p>
      </div>

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
