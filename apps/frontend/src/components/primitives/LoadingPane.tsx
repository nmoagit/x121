import { ContextLoader } from "./ContextLoader";

/**
 * Centered spinner with consistent padding.
 *
 * Uses the context-aware loader that shows the pipeline code when inside
 * a pipeline workspace, or "αN2N" when in the global context.
 */

interface LoadingPaneProps {
  /** Spinner size. Defaults to "lg". */
  size?: "sm" | "md" | "lg";
}

export function LoadingPane({ size = "lg" }: LoadingPaneProps) {
  return (
    <div className="flex items-center justify-center py-[var(--spacing-8)]">
      <ContextLoader size={size === "sm" ? 32 : size === "lg" ? 64 : 48} />
    </div>
  );
}
