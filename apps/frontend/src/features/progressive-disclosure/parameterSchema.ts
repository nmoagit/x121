/**
 * Schema types for parameter-level progressive disclosure (PRD-32).
 *
 * Each parameter has a tier (essential vs. advanced) and optional
 * dependency/visibility rules that determine whether it should be shown.
 */

/** Configuration for a single parameter in a progressive-disclosure context. */
export interface ParameterConfig {
  /** Unique key identifying the parameter (e.g. "temperature", "seed"). */
  key: string;
  /** Human-readable label displayed in the UI. */
  label: string;
  /** Determines visibility tier: essential params are always shown. */
  tier: "essential" | "advanced";
  /** Tooltip text explaining what the parameter does. */
  tooltip: string;
  /** Keys of other parameters this parameter depends on. */
  dependsOn?: string[];
  /** Predicate that determines visibility based on current form context. */
  visibleWhen?: (context: Record<string, unknown>) => boolean;
}

/** Filters a list of parameter configs to only those visible in the given context. */
export function filterVisibleParameters(
  params: ParameterConfig[],
  context: Record<string, unknown>,
): ParameterConfig[] {
  return params.filter((param) => {
    if (param.visibleWhen && !param.visibleWhen(context)) {
      return false;
    }
    return true;
  });
}
