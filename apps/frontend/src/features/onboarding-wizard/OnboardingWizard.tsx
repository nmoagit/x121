/**
 * Main wizard shell for bulk character onboarding (PRD-67).
 *
 * Renders the step indicator, current step content, and navigation
 * buttons. Manages step transitions via the onboarding session API.
 */

import { Badge, Button } from "@/components";

import { StepIndicator } from "./StepIndicator";
import { StepMetadata } from "./StepMetadata";
import { StepSceneTypes } from "./StepSceneTypes";
import { StepSummary } from "./StepSummary";
import { StepUpload } from "./StepUpload";
import { StepVariantGeneration } from "./StepVariantGeneration";
import { StepVariantReview } from "./StepVariantReview";
import type { OnboardingSession } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface OnboardingWizardProps {
  /** The current onboarding session. */
  session: OnboardingSession;
  /** Callback to advance to the next step. */
  onAdvance: () => void;
  /** Callback to go back one step. */
  onGoBack: () => void;
  /** Callback to update step data. */
  onUpdateStepData: (data: Record<string, unknown>) => void;
  /** Callback to abandon the session. */
  onAbandon: () => void;
  /** Callback to complete the session. */
  onComplete: () => void;
  /** Whether a mutation is currently in progress. */
  isLoading?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OnboardingWizard({
  session,
  onAdvance,
  onGoBack,
  onUpdateStepData,
  onAbandon,
  onComplete,
  isLoading = false,
}: OnboardingWizardProps) {
  const { current_step: currentStep, step_data: stepData, character_ids: characterIds, status } = session;

  const isCompleted = status === "completed";
  const isAbandoned = status === "abandoned";
  const isInProgress = status === "in_progress";
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === 6;

  function renderStepContent() {
    switch (currentStep) {
      case 1:
        return (
          <StepUpload
            stepData={stepData}
            onUpdateStepData={onUpdateStepData}
          />
        );
      case 2:
        return (
          <StepVariantGeneration
            stepData={stepData}
            characterIds={characterIds}
            onUpdateStepData={onUpdateStepData}
          />
        );
      case 3:
        return (
          <StepVariantReview
            stepData={stepData}
            characterIds={characterIds}
            onUpdateStepData={onUpdateStepData}
          />
        );
      case 4:
        return (
          <StepMetadata
            stepData={stepData}
            characterIds={characterIds}
            onUpdateStepData={onUpdateStepData}
          />
        );
      case 5:
        return (
          <StepSceneTypes
            stepData={stepData}
            onUpdateStepData={onUpdateStepData}
          />
        );
      case 6:
        return (
          <StepSummary
            stepData={stepData}
            characterIds={characterIds}
            isSubmitting={isLoading}
            onComplete={onComplete}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div data-testid="onboarding-wizard" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
          Character Onboarding Wizard
        </h2>
        {isCompleted && (
          <Badge variant="success">Completed</Badge>
        )}
        {isAbandoned && (
          <Badge variant="danger">Abandoned</Badge>
        )}
      </div>

      {/* Step indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Step content */}
      <div
        data-testid="step-content"
        className="min-h-[200px] rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4"
      >
        {renderStepContent()}
      </div>

      {/* Navigation */}
      {isInProgress && (
        <div
          data-testid="wizard-navigation"
          className="flex items-center justify-between"
        >
          <div className="flex gap-2">
            <Button
              data-testid="back-btn"
              variant="secondary"
              disabled={isFirstStep || isLoading}
              onClick={onGoBack}
            >
              Back
            </Button>
            {!isLastStep && (
              <Button
                data-testid="next-btn"
                variant="primary"
                disabled={isLoading}
                onClick={onAdvance}
              >
                Next
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="save-close-btn"
              variant="secondary"
              size="sm"
              disabled={isLoading}
            >
              Save & Close
            </Button>
            <Button
              data-testid="abandon-btn"
              variant="danger"
              size="sm"
              disabled={isLoading}
              onClick={onAbandon}
            >
              Abandon
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
