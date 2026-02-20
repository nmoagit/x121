import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type GridCols = 1 | 2 | 3 | 4 | 6 | 12;
type GridGap = 0 | 1 | 2 | 3 | 4 | 6 | 8;

interface GridProps {
  cols?: GridCols;
  gap?: GridGap;
  children: ReactNode;
  className?: string;
}

const COLS_CLASSES: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
  12: "grid-cols-12",
};

const GAP_CLASSES: Record<GridGap, string> = {
  0: "gap-0",
  1: "gap-[var(--spacing-1)]",
  2: "gap-[var(--spacing-2)]",
  3: "gap-[var(--spacing-3)]",
  4: "gap-[var(--spacing-4)]",
  6: "gap-[var(--spacing-6)]",
  8: "gap-[var(--spacing-8)]",
};

export function Grid({ cols = 3, gap = 4, children, className }: GridProps) {
  return (
    <div className={cn("grid", COLS_CLASSES[cols], GAP_CLASSES[gap], className)}>{children}</div>
  );
}
