/**
 * Admin Sensitivity Defaults panel (PRD-82).
 *
 * Allows administrators to set a studio-wide minimum blur level.
 * Includes a visual preview of all blur levels applied to sample cards.
 */

import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { cn } from "@/lib/cn";
import { User } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useStudioSensitivityConfig,
  useUpdateStudioConfig,
} from "../sensitivity/hooks/use-sensitivity-settings";
import type { BlurLevel } from "../sensitivity/types";
import { BLUR_CSS, BLUR_LEVELS, BLUR_LEVEL_LABELS } from "../sensitivity/types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SAMPLE_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80' fill='%23666'%3E%3Crect width='120' height='80' rx='4'/%3E%3C/svg%3E";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SensitivityDefaults() {
  const { data: config, isLoading } = useStudioSensitivityConfig();
  const updateConfig = useUpdateStudioConfig();

  const [selectedLevel, setSelectedLevel] = useState<BlurLevel | null>(null);

  /* Use API value as source of truth until user makes a selection */
  const activeLevel = selectedLevel ?? config?.min_level ?? "full";

  function handleSave() {
    updateConfig.mutate({ min_level: activeLevel });
  }

  const isDirty = selectedLevel !== null && selectedLevel !== config?.min_level;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Studio Sensitivity Defaults
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Set the minimum blur level enforced across the studio. Users cannot
          select a less restrictive level than this.
        </p>
      </CardHeader>

      <CardBody>
        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
        ) : (
          <>
            {/* Radio group */}
            <fieldset className="space-y-2 mb-6">
              <legend className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Minimum Blur Level
              </legend>
              {BLUR_LEVELS.map((level) => (
                <label
                  key={level}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] cursor-pointer",
                    "border transition-colors",
                    activeLevel === level
                      ? "border-[var(--color-border-focus)] bg-[var(--color-surface-tertiary)]"
                      : "border-transparent hover:bg-[var(--color-surface-tertiary)]",
                  )}
                >
                  <input
                    type="radio"
                    name="min-blur-level"
                    value={level}
                    checked={activeLevel === level}
                    onChange={() => setSelectedLevel(level)}
                    className="accent-[var(--color-action-primary)]"
                  />
                  <span className="text-sm text-[var(--color-text-primary)]">
                    {BLUR_LEVEL_LABELS[level]}
                  </span>
                </label>
              ))}
            </fieldset>

            {/* Preview cards */}
            <div className="mb-6">
              <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                Preview
              </p>
              <div className="grid grid-cols-4 gap-3">
                {BLUR_LEVELS.map((level) => (
                  <BlurPreviewCard key={level} level={level} isActive={activeLevel === level} />
                ))}
              </div>
            </div>

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={!isDirty}
              loading={updateConfig.isPending}
            >
              Save Defaults
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Preview card sub-component
   -------------------------------------------------------------------------- */

function BlurPreviewCard({ level, isActive }: { level: BlurLevel; isActive: boolean }) {
  const isPlaceholder = level === "placeholder";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] overflow-hidden border",
        isActive
          ? "border-[var(--color-border-focus)] ring-2 ring-[var(--color-border-focus)]"
          : "border-[var(--color-border-default)]",
      )}
    >
      <div className="relative h-20 bg-[var(--color-surface-tertiary)]">
        {isPlaceholder ? (
          <div className="flex items-center justify-center w-full h-full text-[var(--color-text-muted)]">
            <User size={iconSizes.lg} aria-hidden="true" />
          </div>
        ) : (
          <img
            src={SAMPLE_IMAGE}
            alt={`${BLUR_LEVEL_LABELS[level]} preview`}
            className="w-full h-full object-cover"
            style={{ filter: BLUR_CSS[level] }}
          />
        )}
      </div>
      <p className="text-xs text-center py-1.5 text-[var(--color-text-muted)]">
        {BLUR_LEVEL_LABELS[level]}
      </p>
    </div>
  );
}
