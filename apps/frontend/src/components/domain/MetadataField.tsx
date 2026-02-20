import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type MetadataOrientation = "horizontal" | "vertical";

interface MetadataFieldProps {
  label: string;
  value: ReactNode;
  orientation?: MetadataOrientation;
  className?: string;
}

export function MetadataField({
  label,
  value,
  orientation = "vertical",
  className,
}: MetadataFieldProps) {
  return (
    <div
      className={cn(
        orientation === "horizontal" ? "flex items-baseline gap-2" : "flex flex-col gap-0.5",
        className,
      )}
    >
      <dt className="text-xs font-medium text-[var(--color-text-muted)] shrink-0">{label}</dt>
      <dd className="text-sm text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
