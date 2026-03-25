/**
 * Startup readiness checklist display (PRD-80).
 *
 * Lists each startup check with pass/fail icons. Failed checks show
 * their error message. Required checks are visually distinguished
 * from optional ones.
 */

import { Badge ,  ContextLoader } from "@/components/primitives";
import { Check, XCircle } from "@/tokens/icons";

import { useStartupChecklist } from "./hooks/use-system-health";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StartupChecklist() {
  const { data: result, isLoading, error } = useStartupChecklist();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-6)]">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (error || !result) {
    return (
      <p className="py-[var(--spacing-4)] text-center text-sm text-[var(--color-text-muted)]">
        Failed to load startup checks.
      </p>
    );
  }

  return (
    <div>
      {/* Overall status */}
      <div className="mb-[var(--spacing-3)] flex items-center gap-[var(--spacing-2)]">
        {result.all_passed ? (
          <Badge variant="success" size="md">All Checks Passed</Badge>
        ) : (
          <Badge variant="danger" size="md">Some Checks Failed</Badge>
        )}
      </div>

      {/* Check list */}
      <ul className="space-y-[var(--spacing-2)]" role="list">
        {result.checks.map((check) => (
          <li
            key={check.name}
            className="flex items-start gap-[var(--spacing-2)] text-sm"
          >
            {/* Pass/fail icon */}
            <div className="mt-0.5 shrink-0">
              {check.passed ? (
                <Check
                  size={16}
                  className="text-[var(--color-action-success)]"
                  aria-label="Passed"
                />
              ) : (
                <XCircle
                  size={16}
                  className="text-[var(--color-action-danger)]"
                  aria-label="Failed"
                />
              )}
            </div>

            {/* Check name + details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[var(--spacing-2)]">
                <span className="text-[var(--color-text-primary)]">{check.name}</span>
                {!check.required && (
                  <Badge variant="default" size="sm">Optional</Badge>
                )}
              </div>

              {/* Error detail for failed checks */}
              {!check.passed && check.error && (
                <p className="mt-0.5 text-xs text-[var(--color-action-danger)]">
                  {check.error}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
