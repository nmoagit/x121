/**
 * Value display and inline edit form for a platform setting (PRD-110).
 */

import { Button, Input } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Check, Eye, EyeOff, X } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   ValueDisplay
   -------------------------------------------------------------------------- */

interface ValueDisplayProps {
  value: string;
  sensitive: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  onEdit: () => void;
}

export function ValueDisplay({
  value,
  sensitive,
  revealed,
  onToggleReveal,
  onEdit,
}: ValueDisplayProps) {
  const RevealIcon = revealed ? EyeOff : Eye;

  return (
    <div className="flex items-center gap-[var(--spacing-2)]">
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "flex-1 truncate text-left text-sm font-mono",
          "text-[var(--color-text-secondary)]",
          "rounded-[var(--radius-sm)] px-2 py-1",
          "hover:bg-[var(--color-surface-tertiary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
        title="Click to edit"
      >
        {value || (
          <span className="italic text-[var(--color-text-muted)]">(empty)</span>
        )}
      </button>
      {sensitive && (
        <button
          type="button"
          onClick={onToggleReveal}
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={revealed ? "Hide value" : "Reveal value"}
        >
          <RevealIcon size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   EditForm
   -------------------------------------------------------------------------- */

interface EditFormProps {
  draft: string;
  sensitive: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditForm({
  draft,
  sensitive,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: EditFormProps) {
  return (
    <div className="flex items-start gap-[var(--spacing-2)]">
      <div className="flex-1">
        <Input
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          type={sensitive ? "password" : "text"}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onSave}
        loading={isSaving}
        icon={<Check size={14} />}
        aria-label="Save"
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        icon={<X size={14} />}
        aria-label="Cancel"
      >
        Cancel
      </Button>
    </div>
  );
}
