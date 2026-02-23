/**
 * ThresholdSettings -- duplicate detection configuration panel (PRD-79).
 *
 * Provides a slider for the similarity threshold (50%-100%) and toggles
 * for auto-check on upload and batch operations.
 */

import { useCallback, useState } from "react";

import { Button, Input, Toggle } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import type { DuplicateDetectionSetting, UpdateDuplicateSetting } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ThresholdSettingsProps {
  settings: DuplicateDetectionSetting;
  onSave: (input: UpdateDuplicateSetting) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ThresholdSettings({
  settings,
  onSave,
}: ThresholdSettingsProps) {
  const [threshold, setThreshold] = useState(
    String(Math.round(settings.similarity_threshold * 100)),
  );
  const [autoUpload, setAutoUpload] = useState(settings.auto_check_on_upload);
  const [autoBatch, setAutoBatch] = useState(settings.auto_check_on_batch);
  const [dirty, setDirty] = useState(false);

  const handleThresholdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setThreshold(e.target.value);
      setDirty(true);
    },
    [],
  );

  const handleAutoUploadChange = useCallback((checked: boolean) => {
    setAutoUpload(checked);
    setDirty(true);
  }, []);

  const handleAutoBatchChange = useCallback((checked: boolean) => {
    setAutoBatch(checked);
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const numericThreshold = parseFloat(threshold) / 100;
    if (Number.isNaN(numericThreshold)) return;

    onSave({
      similarity_threshold: numericThreshold,
      auto_check_on_upload: autoUpload,
      auto_check_on_batch: autoBatch,
    });
    setDirty(false);
  }, [threshold, autoUpload, autoBatch, onSave]);

  return (
    <Card elevation="flat" data-testid="threshold-settings">
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Duplicate Detection Settings
        </h3>
      </CardHeader>
      <CardBody>
        <div className="flex flex-col gap-4">
          {/* Threshold slider */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="similarity-threshold"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              Similarity Threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                id="similarity-threshold"
                type="range"
                min="50"
                max="100"
                step="1"
                value={threshold}
                onChange={handleThresholdChange}
                className="flex-1"
                aria-label="Similarity threshold slider"
              />
              <Input
                type="number"
                value={threshold}
                onChange={handleThresholdChange}
                aria-label="Similarity threshold value"
                className="w-16"
                min="50"
                max="100"
              />
              <span className="text-sm text-[var(--color-text-muted)]">%</span>
            </div>
          </div>

          {/* Auto-check on upload */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-[var(--color-text-secondary)]">
              Auto-check on upload
            </label>
            <Toggle
              checked={autoUpload}
              onChange={handleAutoUploadChange}
              size="sm"
              aria-label="Auto-check on upload"
            />
          </div>

          {/* Auto-check on batch */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-[var(--color-text-secondary)]">
              Auto-check on batch
            </label>
            <Toggle
              checked={autoBatch}
              onChange={handleAutoBatchChange}
              size="sm"
              aria-label="Auto-check on batch"
            />
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!dirty}
              aria-label="Save settings"
            >
              Save
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
