import { useMemo } from "react";
import { filterVisibleParameters, type ParameterConfig } from "./parameterSchema";

/**
 * Hook that filters parameter configs based on current context.
 *
 * Returns only the parameters that pass their `visibleWhen` predicate
 * for the given context object. Memoized so downstream renderers only
 * re-render when the visible set actually changes.
 */
export function useParameterVisibility(
  params: ParameterConfig[],
  context: Record<string, unknown>,
): ParameterConfig[] {
  return useMemo(
    () => filterVisibleParameters(params, context),
    // Context is an object -- serialise to a stable string for the dep array.
    // This is intentionally coarse; callers should memoize their context object
    // if they need fine-grained control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, JSON.stringify(context)],
  );
}
