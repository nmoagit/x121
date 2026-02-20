import { cn } from "@/lib/cn";
import { Loader2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]",
    "hover:bg-[var(--color-action-primary-hover)]",
  ].join(" "),
  secondary: [
    "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]",
    "border border-[var(--color-border-default)]",
    "hover:bg-[var(--color-surface-secondary)]",
  ].join(" "),
  danger: [
    "bg-[var(--color-action-danger)] text-[var(--color-text-inverse)]",
    "hover:bg-[var(--color-action-danger-hover)]",
  ].join(" "),
  ghost: [
    "bg-transparent text-[var(--color-text-primary)]",
    "hover:bg-[var(--color-surface-tertiary)]",
  ].join(" "),
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-base gap-2",
  lg: "px-6 py-3 text-lg gap-2.5",
};

const ICON_SIZE: Record<ButtonSize, number> = {
  sm: iconSizes.sm,
  md: iconSizes.md,
  lg: iconSizes.lg,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center font-medium",
        "rounded-[var(--radius-md)]",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={ICON_SIZE[size]} className="animate-spin" aria-hidden="true" />
      ) : icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});
