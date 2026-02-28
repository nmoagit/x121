/**
 * Main page component for the Platform Setup Wizard (PRD-105).
 *
 * Renders the progress bar, current step form, navigation buttons,
 * and a "Skip Wizard" link for experienced administrators.
 */

import { useCallback, useState } from "react";

import { Badge, Button, Spinner } from "@/components/primitives";

import { AdminAccountStep } from "./AdminAccountStep";
import { ComfyUiStep } from "./ComfyUiStep";
import { DatabaseStep } from "./DatabaseStep";
import { HealthCheckStep } from "./HealthCheckStep";
import { IntegrationsStep } from "./IntegrationsStep";
import { StepProgress } from "./StepProgress";
import { StorageStep } from "./StorageStep";
import { WizardCompletePanel } from "./WizardCompletePanel";
import { WorkerStep } from "./WorkerStep";
import { useSkipWizard, useWizardStatus } from "./hooks/use-setup-wizard";
import { STEP_LABELS, STEP_ORDER, TOTAL_STEPS } from "./types";
import type { SetupStepName, StepStatus } from "./types";

/* --------------------------------------------------------------------------
   Step content mapping
   -------------------------------------------------------------------------- */

const STEP_COMPONENTS: Record<SetupStepName, React.FC> = {
  database: DatabaseStep,
  storage: StorageStep,
  comfyui: ComfyUiStep,
  admin_account: AdminAccountStep,
  worker_registration: WorkerStep,
  integrations: IntegrationsStep,
  health_check: HealthCheckStep,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SetupWizardPage() {
  const { data: wizardState, isPending } = useWizardStatus();
  const skipWizard = useSkipWizard();

  const serverIndex = wizardState?.current_step_index ?? 0;
  const [localIndex, setLocalIndex] = useState<number | null>(null);
  const currentIndex = localIndex ?? serverIndex;

  const handlePrevious = useCallback(() => {
    setLocalIndex((prev) => Math.max(0, (prev ?? currentIndex) - 1));
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    setLocalIndex((prev) => Math.min(TOTAL_STEPS - 1, (prev ?? currentIndex) + 1));
  }, [currentIndex]);

  const handleStepClick = useCallback((index: number) => {
    setLocalIndex(index);
  }, []);

  const handleGoToDashboard = useCallback(() => {
    window.location.href = "/";
  }, []);

  const handleSkip = useCallback(() => {
    if (window.confirm("Skip the setup wizard? You can configure services later from Settings.")) {
      skipWizard.mutate(undefined, {
        onSuccess: handleGoToDashboard,
      });
    }
  }, [skipWizard, handleGoToDashboard]);

  /* -- Loading state -- */

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  /* -- Wizard complete -- */

  if (wizardState?.completed) {
    return (
      <div data-testid="setup-wizard-page" className="max-w-3xl mx-auto space-y-6">
        <WizardCompletePanel onGoToDashboard={handleGoToDashboard} />
      </div>
    );
  }

  /* -- Active wizard -- */

  const steps: StepStatus[] = wizardState?.steps ?? [];
  const currentStepName = STEP_ORDER[currentIndex] ?? "database";
  const StepComponent = STEP_COMPONENTS[currentStepName];
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === TOTAL_STEPS - 1;

  return (
    <div data-testid="setup-wizard-page" className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Platform Setup</h2>
          <Badge variant="info" size="sm">
            PRD-105
          </Badge>
        </div>
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline transition-colors"
          data-testid="skip-wizard-link"
        >
          Skip Wizard
        </button>
      </div>

      {/* Progress indicator */}
      <StepProgress steps={steps} currentIndex={currentIndex} onStepClick={handleStepClick} />

      {/* Step header */}
      <div className="space-y-1">
        <h3 className="text-base font-medium text-[var(--color-text-primary)]">
          Step {currentIndex + 1}: {STEP_LABELS[currentStepName]}
        </h3>
      </div>

      {/* Step content */}
      <div data-testid="step-content" className="min-h-[200px]">
        <StepComponent />
      </div>

      {/* Navigation */}
      <div
        data-testid="wizard-navigation"
        className="flex items-center justify-between pt-4 border-t border-[var(--color-border-default)]"
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={isFirstStep}
          onClick={handlePrevious}
          data-testid="prev-step-btn"
        >
          Previous
        </Button>

        <span className="text-xs text-[var(--color-text-muted)]">
          Step {currentIndex + 1} of {TOTAL_STEPS}
        </span>

        <Button
          variant="primary"
          size="sm"
          disabled={isLastStep}
          onClick={handleNext}
          data-testid="next-step-btn"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
