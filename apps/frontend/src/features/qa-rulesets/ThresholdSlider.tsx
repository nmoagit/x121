/**
 * ThresholdSlider — single metric threshold control (PRD-91).
 *
 * Displays warn and fail number inputs for a single QA metric,
 * with color-coded zone labels.
 */

import { useCallback } from "react";

import { Input } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { MetricThreshold } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ThresholdSliderProps {
  metricName: string;
  label: string;
  threshold: MetricThreshold;
  onChange: (t: MetricThreshold) => void;
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ThresholdSlider({
  metricName,
  label,
  threshold,
  onChange,
  disabled = false,
}: ThresholdSliderProps) {
  const handleFieldChange = useCallback(
    (field: "warn" | "fail") =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        if (!Number.isNaN(value)) {
          onChange({ ...threshold, [field]: value });
        }
      },
    [threshold, onChange],
  );

  return (
    <div
      data-testid={`threshold-slider-${metricName}`}
      className={cn(
        "flex items-center gap-4 py-2",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <span className="w-40 text-sm font-medium text-[var(--color-text-primary)] truncate">
        {label}
      </span>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--color-action-warning)]">
          Warn
        </span>
        <Input
          type="number"
          value={String(threshold.warn)}
          onChange={handleFieldChange("warn")}
          disabled={disabled}
          aria-label={`Warn threshold for ${label}`}
          className="w-20"
          step="0.01"
          min="0"
          max="1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--color-action-danger)]">
          Fail
        </span>
        <Input
          type="number"
          value={String(threshold.fail)}
          onChange={handleFieldChange("fail")}
          disabled={disabled}
          aria-label={`Fail threshold for ${label}`}
          className="w-20"
          step="0.01"
          min="0"
          max="1"
        />
      </div>
    </div>
  );
}
