/**
 * Discovered parameters display component (PRD-75).
 *
 * Displays a read-only list of parameters discovered from the
 * ComfyUI workflow with their type, current value, and suggested name.
 * Editing is a post-MVP feature.
 */

import { Badge } from "@/components/primitives";

import type { DiscoveredParameter, ParamType } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ParameterEditorProps {
  /** List of discovered parameters to display. */
  parameters: DiscoveredParameter[];
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Format a parameter type for display. */
function formatParamType(paramType: ParamType): string {
  if (typeof paramType === "string") {
    return paramType.charAt(0).toUpperCase() + paramType.slice(1);
  }
  if (typeof paramType === "object" && "other" in paramType) {
    return paramType.other;
  }
  return "Unknown";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ParameterEditor({ parameters }: ParameterEditorProps) {
  if (parameters.length === 0) {
    return (
      <div
        data-testid="parameters-empty"
        className="text-sm text-[var(--color-text-tertiary)]"
      >
        No configurable parameters detected in this workflow.
      </div>
    );
  }

  // Group parameters by category.
  const grouped = parameters.reduce<Record<string, DiscoveredParameter[]>>(
    (acc, param) => {
      const cat = param.category || "Other";
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(param);
      return acc;
    },
    {},
  );

  return (
    <div data-testid="parameter-editor" className="space-y-4">
      {Object.entries(grouped).map(([category, params]) => (
        <div key={category}>
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
            {category}
          </h4>
          <div className="space-y-2">
            {params.map((param) => (
              <div
                key={`${param.node_id}-${param.input_name}`}
                data-testid={`param-row-${param.node_id}-${param.input_name}`}
                className="flex items-start justify-between rounded border border-[var(--color-border-subtle)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {param.suggested_name}
                    </span>
                    <Badge variant="default" size="sm">
                      {formatParamType(param.param_type)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                    Node {param.node_id} &middot; {param.input_name}
                  </p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <span className="text-sm font-mono text-[var(--color-text-secondary)]">
                    {JSON.stringify(param.current_value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
