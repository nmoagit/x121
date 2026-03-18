/**
 * Shared editor for blocking deliverables overrides.
 *
 * Used at project, group, and character level. Each level can override
 * or inherit from its parent in the hierarchy:
 * Studio → Project → Group → Character.
 */

import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives/Checkbox";
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
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Badge variant={isOverridden ? "warning" : "default"} size="sm">
          {isOverridden ? overrideLabel : inheritLabel}
        </Badge>
        {isOverridden && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={reset}
          >
            {resetLabel}
          </Button>
        )}
      </div>
      <Stack gap={2}>
        {DELIVERABLE_SECTIONS.map(({ key, label }) => (
          <Checkbox
            key={key}
            checked={effective.includes(key)}
            onChange={() => toggleSection(key)}
            label={label}
          />
        ))}
      </Stack>
    </Stack>
  );
}
