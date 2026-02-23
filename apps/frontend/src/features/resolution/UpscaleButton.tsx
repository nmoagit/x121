/**
 * UpscaleButton component for the Multi-Resolution Pipeline (PRD-59).
 *
 * Renders an "Upscale to Production" button that is disabled when the scene
 * is already at production tier or when an upscale operation is in progress.
 */

import { Button } from "@/components/primitives/Button";

interface UpscaleButtonProps {
  /** Whether the scene is already at the production tier. */
  isProduction: boolean;
  /** Whether an upscale mutation is currently in progress. */
  loading?: boolean;
  /** Click handler to trigger the upscale. */
  onClick: () => void;
}

export function UpscaleButton({
  isProduction,
  loading = false,
  onClick,
}: UpscaleButtonProps) {
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={isProduction}
      loading={loading}
      onClick={onClick}
      data-testid="upscale-button"
    >
      {isProduction ? "Production" : "Upscale to Production"}
    </Button>
  );
}
