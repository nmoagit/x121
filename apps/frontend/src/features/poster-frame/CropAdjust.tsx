/**
 * Crop & adjustment panel for poster frames (PRD-96).
 *
 * Provides aspect ratio selection, brightness/contrast sliders with
 * live CSS filter preview, and save/cancel/reset actions.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { CropSettings, UpdatePosterFrameAdjustments } from "./types";
import {
  ASPECT_RATIO_OPTIONS,
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  BRIGHTNESS_STEP,
  CONTRAST_MAX,
  CONTRAST_MIN,
  CONTRAST_STEP,
  DEFAULT_BRIGHTNESS,
  DEFAULT_CONTRAST,
} from "./types";
import type { PosterFrame } from "./types";
import { TYPO_INPUT_LABEL, TYPO_CAPTION} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CropAdjustProps {
  posterFrame: PosterFrame;
  onSave: (adjustments: UpdatePosterFrameAdjustments) => void;
  onCancel: () => void;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function SliderField({
  label,
  value,
  min,
  max,
  step,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`flex items-center justify-between ${TYPO_CAPTION}`}>
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </span>
      <input
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer accent-[var(--color-action-primary)]"
      />
    </label>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CropAdjust({ posterFrame, onSave, onCancel }: CropAdjustProps) {
  const [brightness, setBrightness] = useState(posterFrame.brightness);
  const [contrast, setContrast] = useState(posterFrame.contrast);
  const [cropSettings, setCropSettings] = useState<CropSettings | null>(
    posterFrame.crop_settings_json,
  );

  const selectedRatio = cropSettings?.aspectRatio ?? "custom";

  const handleAspectChange = useCallback(
    (ratio: string) => {
      setCropSettings((prev) => ({
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        width: prev?.width ?? 100,
        height: prev?.height ?? 100,
        aspectRatio: ratio,
      }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setBrightness(DEFAULT_BRIGHTNESS);
    setContrast(DEFAULT_CONTRAST);
    setCropSettings(null);
  }, []);

  const handleSave = useCallback(() => {
    const adjustments: UpdatePosterFrameAdjustments = {
      brightness,
      contrast,
    };
    if (cropSettings) {
      adjustments.crop_settings_json = cropSettings;
    }
    onSave(adjustments);
  }, [brightness, contrast, cropSettings, onSave]);

  return (
    <div data-testid="crop-adjust" className="flex flex-col gap-4">
      {/* Preview */}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
        <img
          data-testid="crop-preview"
          src={posterFrame.image_path}
          alt="Poster preview"
          className="w-full object-contain"
          style={{
            filter: `brightness(${brightness}) contrast(${contrast})`,
          }}
        />
      </div>

      {/* Aspect ratio selector */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className={TYPO_INPUT_LABEL}>
          Aspect Ratio
        </legend>
        <div className="flex flex-wrap gap-2">
          {ASPECT_RATIO_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-testid={`aspect-${option.value}`}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium",
                "border transition-colors duration-[var(--duration-fast)]",
                selectedRatio === option.value
                  ? "border-[var(--color-border-accent)] bg-[var(--color-action-primary)]/10 text-[var(--color-action-primary)]"
                  : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]",
              )}
              onClick={() => handleAspectChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Sliders */}
      <div className="flex flex-col gap-3">
        <SliderField
          label="Brightness"
          value={brightness}
          min={BRIGHTNESS_MIN}
          max={BRIGHTNESS_MAX}
          step={BRIGHTNESS_STEP}
          testId="brightness-slider"
          onChange={setBrightness}
        />
        <SliderField
          label="Contrast"
          value={contrast}
          min={CONTRAST_MIN}
          max={CONTRAST_MAX}
          step={CONTRAST_STEP}
          testId="contrast-slider"
          onChange={setContrast}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          data-testid="reset-button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
        >
          Reset
        </Button>
        <div className="flex gap-2">
          <Button
            data-testid="cancel-button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            data-testid="save-button"
            variant="primary"
            size="sm"
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
