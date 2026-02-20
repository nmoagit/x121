import { cn } from "@/lib/cn";
import { Loader2 } from "@/tokens/icons";

type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: SpinnerSize;
}

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

export function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <output
      aria-label="Loading"
      className={cn("inline-flex items-center justify-center text-[var(--color-action-primary)]")}
    >
      <Loader2 size={SIZE_PX[size]} className="animate-spin" aria-hidden="true" />
    </output>
  );
}
