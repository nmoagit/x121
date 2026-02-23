/**
 * InheritanceView -- displays effective hooks after scope-based inheritance
 * resolution (PRD-77).
 *
 * Each hook is annotated with its source level (studio/project/scene_type).
 * Inherited hooks are styled differently from locally defined hooks.
 */

import { Badge } from "@/components";

import { useEffectiveHooks } from "./hooks/use-pipeline-hooks";
import type { HookPoint, ScopeType } from "./types";
import {
  FAILURE_MODE_LABELS,
  HOOK_POINT_LABELS,
  failureModeVariant,
  hookTypeVariant,
} from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface InheritanceViewProps {
  scopeType: ScopeType;
  scopeId: number;
  hookPoint?: HookPoint;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function InheritanceView({
  scopeType,
  scopeId,
  hookPoint,
}: InheritanceViewProps) {
  const { data: effectiveHooks = [], isLoading } = useEffectiveHooks(
    scopeType,
    scopeId,
    hookPoint,
  );

  if (isLoading) {
    return (
      <div
        data-testid="inheritance-loading"
        className="p-4 text-sm text-[var(--color-text-secondary)]"
      >
        Resolving effective hooks...
      </div>
    );
  }

  if (effectiveHooks.length === 0) {
    return (
      <div
        data-testid="inheritance-empty"
        className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]"
      >
        No effective hooks for this scope.
      </div>
    );
  }

  return (
    <div data-testid="inheritance-view" className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Effective Hooks
      </h3>
      <div className="space-y-2">
        {effectiveHooks.map((hook) => {
          const isInherited = hook.source_level !== scopeType;

          return (
            <div
              key={hook.hook_id}
              data-testid={`effective-hook-${hook.hook_id}`}
              className={`flex items-center justify-between gap-4 rounded border p-3 ${
                isInherited
                  ? "border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                  : "border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {hook.name}
                </span>
                <Badge variant="default">
                  {HOOK_POINT_LABELS[hook.hook_point]}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={hookTypeVariant(hook.hook_type)}>
                  {hook.hook_type}
                </Badge>
                <Badge variant={failureModeVariant(hook.failure_mode)}>
                  {FAILURE_MODE_LABELS[hook.failure_mode]}
                </Badge>
                <span
                  data-testid={`source-level-${hook.hook_id}`}
                  className="text-xs text-[var(--color-text-secondary)]"
                >
                  {isInherited ? `Inherited from ${hook.source_level}` : "Local"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
