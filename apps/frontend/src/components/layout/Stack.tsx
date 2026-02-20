import { cn } from "@/lib/cn";
import type { ElementType, ReactNode } from "react";

type StackDirection = "vertical" | "horizontal";
type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
type StackAlign = "start" | "center" | "end" | "stretch";
type StackJustify = "start" | "center" | "end" | "between";

interface StackProps {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

const DIRECTION_CLASSES: Record<StackDirection, string> = {
  vertical: "flex-col",
  horizontal: "flex-row",
};

const GAP_CLASSES: Record<StackGap, string> = {
  0: "gap-0",
  1: "gap-[var(--spacing-1)]",
  2: "gap-[var(--spacing-2)]",
  3: "gap-[var(--spacing-3)]",
  4: "gap-[var(--spacing-4)]",
  5: "gap-[var(--spacing-5)]",
  6: "gap-[var(--spacing-6)]",
  8: "gap-[var(--spacing-8)]",
};

const ALIGN_CLASSES: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const JUSTIFY_CLASSES: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

export function Stack({
  direction = "vertical",
  gap = 3,
  align = "stretch",
  justify = "start",
  children,
  className,
  as: Component = "div",
}: StackProps) {
  return (
    <Component
      className={cn(
        "flex",
        DIRECTION_CLASSES[direction],
        GAP_CLASSES[gap],
        ALIGN_CLASSES[align],
        JUSTIFY_CLASSES[justify],
        className,
      )}
    >
      {children}
    </Component>
  );
}
