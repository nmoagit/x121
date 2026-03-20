import { WireframeLoader } from "@/components/primitives";
/**
 * Centered spinner with consistent padding.
 *
 * Replaces inline `<div className="flex items-center justify-center ..."><WireframeLoader size={48} /></div>`
 * and `<Stack align="center"><WireframeLoader size={48} /></Stack>` patterns.
 */


interface LoadingPaneProps {
  /** Spinner size. Defaults to "lg". */
  size?: "sm" | "md" | "lg";
}

export function LoadingPane({ size = "lg" }: LoadingPaneProps) {
  return (
    <div className="flex items-center justify-center py-[var(--spacing-8)]">
      <WireframeLoader size={size === "sm" ? 32 : size === "lg" ? 64 : 48} />
    </div>
  );
}
