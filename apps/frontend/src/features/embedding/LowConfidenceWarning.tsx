/**
 * Inline dismissible warning banner for low-confidence face detection (PRD-76).
 *
 * Shown when the face detection confidence falls below the threshold but
 * is still usable. The user can dismiss the warning.
 */

import { useState } from "react";
import { X } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LowConfidenceWarningProps {
  /** Detection confidence as a fraction (0.0 - 1.0). */
  confidence: number;
  /** Threshold that was used for classification (0.0 - 1.0). */
  threshold?: number;
}

export function LowConfidenceWarning({
  confidence,
  threshold = 0.7,
}: LowConfidenceWarningProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-action-warning)]/10 border border-[var(--color-action-warning)]/30"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-action-warning)]">
          Low Confidence Detection
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Face detection confidence is{" "}
          <strong>{(confidence * 100).toFixed(1)}%</strong>, which is below the{" "}
          <strong>{(threshold * 100).toFixed(0)}%</strong> threshold. The
          detected face may not be accurate. Consider uploading a clearer image.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss warning"
        className="shrink-0 p-1 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
        onClick={() => setDismissed(true)}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
