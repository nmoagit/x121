import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]",
  success: "bg-[var(--color-action-success)]/15 text-[var(--color-action-success)]",
  warning: "bg-[var(--color-action-warning)]/15 text-[var(--color-action-warning)]",
  danger: "bg-[var(--color-action-danger)]/15 text-[var(--color-action-danger)]",
  info: "bg-[var(--color-action-primary)]/15 text-[var(--color-action-primary)]",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

export function Badge({ variant = "default", size = "md", children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-full)]",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
      )}
    >
      {children}
    </span>
  );
}
