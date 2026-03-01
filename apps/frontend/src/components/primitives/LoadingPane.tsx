/**
 * Centered spinner with consistent padding.
 *
 * Replaces inline `<div className="flex items-center justify-center ..."><Spinner /></div>`
 * and `<Stack align="center"><Spinner /></Stack>` patterns.
 */

import { Spinner } from "@/components/primitives/Spinner";

interface LoadingPaneProps {
  /** Spinner size. Defaults to "lg". */
  size?: "sm" | "md" | "lg";
}

export function LoadingPane({ size = "lg" }: LoadingPaneProps) {
  return (
    <div className="flex items-center justify-center py-[var(--spacing-8)]">
      <Spinner size={size} />
    </div>
  );
}
