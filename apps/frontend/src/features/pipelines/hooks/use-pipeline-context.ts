/**
 * Hook to extract pipeline context from the current route.
 *
 * When the user navigates within `/pipelines/:pipelineCode/...`, this hook
 * provides the pipeline code from the URL. Components can use this to scope
 * their data fetching to the active pipeline.
 */

import { useParams } from "@tanstack/react-router";

/** Returns the pipeline code from URL params, or null if not in a pipeline route. */
export function usePipelineCode(): string | null {
  try {
    const params = useParams({ strict: false }) as Record<string, string | undefined>;
    return params.pipelineCode ?? null;
  } catch {
    return null;
  }
}
