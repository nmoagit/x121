/**
 * Shared editor for blocking deliverables overrides.
 *
 * Used at project, group, and character level. Each level can override
 * or inherit from its parent in the hierarchy:
 * Studio → Project → Group → Character.
 */

import { Stack } from "@/components/layout";
import { Button, Toggle } from "@/components/primitives";
import { RotateCcw } from "@/tokens/icons";

/** All known deliverable section keys with human labels. */
const DELIVERABLE_SECTIONS = [
  { key: "metadata", label: "Metadata" },
  { key: "images", label: "Images" },
  { key: "scenes", label: "Scenes" },
  { key: "speech", label: "Speech" },
] as const;

interface BlockingDeliverablesEditorProps {
  /** Currently effective blocking deliverables (resolved from parent if not overridden). */
  effective: string[];
  /** Whether this level has an explicit override (non-null). */
  isOverridden: boolean;
  /** Label for the badge when not overridden, e.g. "Inherited from Project". */
  inheritLabel: string;
  /** Label for the badge when overridden, e.g. "Group Override". */
  overrideLabel: string;
  /** Label for the reset button, e.g. "Reset to Project Default". */
  resetLabel: string;
  /** Called when the user toggles a section or resets. Pass the new array. Empty array = reset to inherit. */
  onUpdate: (next: string[]) => void;
}

export function BlockingDeliverablesEditor({
  effective,
  isOverridden,
  inheritLabel,
  overrideLabel,
  resetLabel,
  onUpdate,
}: BlockingDeliverablesEditorProps) {
  function toggleSection(key: string) {
    const next = effective.includes(key)
      ? effective.filter((k) => k !== key)
      : [...effective, key];
    onUpdate(next);
  }

  function reset() {
    onUpdate([]);
  }

  return (
    <Stack gap={3}>
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className={isOverridden ? "text-orange-400" : "text-[var(--color-text-muted)]"}>
          {isOverridden ? overrideLabel.toLowerCase() : inheritLabel.toLowerCase()}
        </span>
        {isOverridden && (
          <Button
            variant="ghost"
            size="xs"
            icon={<RotateCcw size={12} />}
            onClick={reset}
            className="!text-red-400 hover:!text-red-300"
          >
            {resetLabel}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-4">
        {DELIVERABLE_SECTIONS.map(({ key, label }) => (
          <Toggle
            key={key}
            checked={effective.includes(key)}
            onChange={() => toggleSection(key)}
            label={label}
            size="sm"
          />
        ))}
      </div>
    </Stack>
  );
}
