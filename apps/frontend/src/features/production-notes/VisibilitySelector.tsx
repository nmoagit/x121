/**
 * Visibility selector dropdown for production notes (PRD-95).
 *
 * Allows selecting a visibility level for a note: Private, Team,
 * Admin Only, Creator Only, or Reviewer Only.
 */

import { Select } from "@/components";

import type { NoteVisibility } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const VISIBILITY_OPTIONS: { value: NoteVisibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "team", label: "Team" },
  { value: "admin_only", label: "Admin Only" },
  { value: "creator_only", label: "Creator Only" },
  { value: "reviewer_only", label: "Reviewer Only" },
];

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VisibilitySelectorProps {
  /** Current visibility value. */
  value: NoteVisibility;
  /** Called when the user picks a new visibility. */
  onChange: (value: NoteVisibility) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VisibilitySelector({
  value,
  onChange,
  disabled = false,
}: VisibilitySelectorProps) {
  return (
    <div data-testid="visibility-selector">
      <Select
        label="Visibility"
        options={VISIBILITY_OPTIONS}
        value={value}
        onChange={(v) => onChange(v as NoteVisibility)}
        disabled={disabled}
      />
    </div>
  );
}
