/**
 * JSON textarea field with validation (PRD-97).
 *
 * Displays a monospace textarea for editing JSON with inline error display.
 */

import { cn } from "@/lib/cn";

interface JsonTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onErrorClear?: () => void;
  rows?: number;
  "data-testid"?: string;
}

export function JsonTextarea({
  label,
  value,
  onChange,
  error,
  onErrorClear,
  rows = 4,
  ...rest
}: JsonTextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onErrorClear?.();
        }}
        rows={rows}
        className={cn(
          "w-full px-3 py-2 text-sm font-mono",
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
          "border rounded-[var(--radius-md)]",
          "placeholder:text-[var(--color-text-muted)]",
          "transition-colors duration-[var(--duration-fast)]",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          error
            ? "border-[var(--color-border-error)] focus:ring-[var(--color-border-error)]"
            : "border-[var(--color-border-default)] focus:ring-[var(--color-border-focus)]",
        )}
        data-testid={rest["data-testid"]}
      />
      {error && (
        <p role="alert" className="text-sm text-[var(--color-action-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
