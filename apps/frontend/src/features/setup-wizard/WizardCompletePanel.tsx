/**
 * Success panel shown when all setup wizard steps are complete (PRD-105).
 *
 * Displays a congratulatory message and a "Go to Dashboard" button.
 */

import { Card, CardBody } from "@/components/composite";
import { Button } from "@/components/primitives";
import { Check } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface WizardCompletePanelProps {
  /** Navigate to the main dashboard. */
  onGoToDashboard: () => void;
}

export function WizardCompletePanel({ onGoToDashboard }: WizardCompletePanelProps) {
  return (
    <Card elevation="sm" padding="lg">
      <CardBody className="p-0">
        <div
          data-testid="wizard-complete"
          className="flex flex-col items-center gap-4 py-8 text-center"
        >
          {/* Success icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-action-success)]/15">
            <Check size={32} className="text-[var(--color-action-success)]" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Setup Complete
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-md">
              Your platform is fully configured and ready to use. All required services have been
              verified and are operational.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={onGoToDashboard}
            data-testid="go-to-dashboard-btn"
          >
            Go to Dashboard
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
