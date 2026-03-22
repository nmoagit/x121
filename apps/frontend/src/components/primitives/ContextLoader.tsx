/**
 * Context-aware wireframe loader.
 *
 * Renders the WireframeLoader with text matching the current context:
 * - Inside a pipeline workspace → pipeline code (e.g., "x121", "y122")
 * - Outside pipeline context → app name ("αN2N")
 */

import { usePipelineContextSafe } from "@/features/pipelines";
import { WireframeLoader } from "./WireframeLoader";

interface ContextLoaderProps {
  /** Overall size in pixels (width). @default 64 */
  size?: number;
  /** CSS class for the wrapper. */
  className?: string;
}

export function ContextLoader({ size = 64, className }: ContextLoaderProps) {
  const pipeline = usePipelineContextSafe();
  const text = pipeline?.pipelineCode ?? "αN2N";

  return <WireframeLoader size={size} text={text} className={className} />;
}
