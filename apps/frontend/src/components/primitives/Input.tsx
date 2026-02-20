import { cn } from "@/lib/cn";
import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;

  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full px-3 py-2 text-base",
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
          "border rounded-[var(--radius-md)]",
          "placeholder:text-[var(--color-text-muted)]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          error
            ? "border-[var(--color-border-error)] focus:ring-[var(--color-border-error)]"
            : "border-[var(--color-border-default)] focus:ring-[var(--color-border-focus)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...rest}
      />

      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--color-action-danger)]">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p id={helperId} className="text-sm text-[var(--color-text-muted)]">
          {helperText}
        </p>
      )}
    </div>
  );
});
