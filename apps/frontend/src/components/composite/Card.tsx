import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type CardElevation = "flat" | "sm" | "md" | "lg";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps {
  children: ReactNode;
  className?: string;
  elevation?: CardElevation;
  padding?: CardPadding;
}

interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

const ELEVATION_CLASSES: Record<CardElevation, string> = {
  flat: "",
  sm: "shadow-[var(--shadow-sm)]",
  md: "shadow-[var(--shadow-md)]",
  lg: "shadow-[var(--shadow-lg)]",
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-[var(--spacing-3)]",
  md: "p-[var(--spacing-4)]",
  lg: "p-[var(--spacing-6)]",
};

export function Card({ children, className, elevation = "sm", padding = "md" }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)]",
        ELEVATION_CLASSES[elevation],
        PADDING_CLASSES[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardSectionProps) {
  return (
    <div
      className={cn(
        "pb-[var(--spacing-3)] border-b border-[var(--color-border-default)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className }: CardSectionProps) {
  return <div className={cn("py-[var(--spacing-3)]", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSectionProps) {
  return (
    <div
      className={cn(
        "pt-[var(--spacing-3)] border-t border-[var(--color-border-default)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
