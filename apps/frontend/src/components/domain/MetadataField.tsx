import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

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
      <dt className={`shrink-0 ${TYPO_INPUT_LABEL}`}>{label}</dt>
      <dd className="text-sm text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
