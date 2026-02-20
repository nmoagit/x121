import { cn } from "@/lib/cn";

type SpacerSize = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16;

interface SpacerProps {
  size?: SpacerSize;
}

const SIZE_CLASSES: Record<SpacerSize, string> = {
  1: "h-[var(--spacing-1)] w-[var(--spacing-1)]",
  2: "h-[var(--spacing-2)] w-[var(--spacing-2)]",
  3: "h-[var(--spacing-3)] w-[var(--spacing-3)]",
  4: "h-[var(--spacing-4)] w-[var(--spacing-4)]",
  6: "h-[var(--spacing-6)] w-[var(--spacing-6)]",
  8: "h-[var(--spacing-8)] w-[var(--spacing-8)]",
  12: "h-[var(--spacing-12)] w-[var(--spacing-12)]",
  16: "h-[var(--spacing-16)] w-[var(--spacing-16)]",
};

export function Spacer({ size = 4 }: SpacerProps) {
  return <div aria-hidden="true" className={cn("shrink-0", SIZE_CLASSES[size])} />;
}
