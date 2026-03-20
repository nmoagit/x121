/**
 * Health check step for the setup wizard (PRD-105).
 *
 * Runs health checks against all configured services and displays
 * per-service status (green/yellow/red). Shows a success message
 * when all checks pass, or specific fix suggestions otherwise.
 */

import { Button ,  WireframeLoader } from "@/components/primitives";
import { Check } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useExecuteStep } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HealthCheckStep() {
  const executeStep = useExecuteStep();

  function handleRunChecks() {
    executeStep.mutate({
      stepName: "health_check",
      config: {},
    });
  }

  const stepResult = executeStep.data;
  const isCompleted = stepResult?.completed ?? false;

  return (
    <div data-testid="health-check-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{STEP_DESCRIPTIONS.health_check}</p>

      <Button
        variant="primary"
        size="sm"
        loading={executeStep.isPending}
        onClick={handleRunChecks}
        data-testid="run-health-check-btn"
      >
        Run Health Checks
      </Button>

      {/* Loading state */}
      {executeStep.isPending && (
        <div className="flex items-center justify-center py-6">
          <WireframeLoader size={32} />
        </div>
      )}

      {/* Success message */}
      {isCompleted && (
        <div
          data-testid="health-check-success"
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-action-success)]/10 text-[var(--color-action-success)]"
        >
          <div className="flex items-center gap-2">
            <Check size={iconSizes.sm} aria-hidden="true" />
            <span>All systems ready! Your platform is fully configured.</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {stepResult && !isCompleted && stepResult.error_message && (
        <div
          data-testid="health-check-errors"
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-action-danger)]/10 text-[var(--color-action-danger)]"
        >
          {stepResult.error_message}
        </div>
      )}
    </div>
  );
}
