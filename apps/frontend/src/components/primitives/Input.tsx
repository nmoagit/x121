import { cn } from "@/lib/cn";
import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

type InputSize = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<InputSize, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-3 py-2 text-base",
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Visual size. Default "md". */
  size?: InputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, size = "md", className, id, ...rest },
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
        <label htmlFor={inputId} className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
          {label}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full",
          SIZE_CLASSES[size],
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] font-mono",
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
