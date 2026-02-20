import { cn } from "@/lib/cn";

type DividerOrientation = "horizontal" | "vertical";

interface DividerProps {
  orientation?: DividerOrientation;
  label?: string;
  className?: string;
}

export function Divider({ orientation = "horizontal", label, className }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <hr
        aria-orientation="vertical"
        className={cn(
          "inline-block w-px h-full border-none bg-[var(--color-border-default)]",
          className,
        )}
      />
    );
  }

  if (label) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <hr className="flex-1 border-none h-px bg-[var(--color-border-default)]" />
        <span className="text-xs text-[var(--color-text-muted)] shrink-0">{label}</span>
        <hr className="flex-1 border-none h-px bg-[var(--color-border-default)]" />
      </div>
    );
  }

  return (
    <hr className={cn("border-none h-px w-full bg-[var(--color-border-default)]", className)} />
  );
}
