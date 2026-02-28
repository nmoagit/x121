/**
 * ThresholdEditor — scene-type threshold configuration panel (PRD-91).
 *
 * Loads effective thresholds, the current override, and available profiles.
 * Users can assign a profile, tweak per-metric overrides, save, or reset.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Select, Spinner } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import {
  useDeleteSceneTypeQaOverride,
  useEffectiveThresholds,
  useQaProfiles,
  useSceneTypeQaOverride,
  useUpsertSceneTypeQaOverride,
} from "./hooks/use-qa-rulesets";
import { ThresholdSlider } from "./ThresholdSlider";
import type { MetricThreshold } from "./types";
import { EMPTY_THRESHOLD, metricLabel, SECTION_HEADING_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const NO_PROFILE_VALUE = "";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ThresholdEditorProps {
  sceneTypeId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ThresholdEditor({ sceneTypeId }: ThresholdEditorProps) {
  const { data: effective, isPending: effectivePending } =
    useEffectiveThresholds(sceneTypeId);
  const { data: override, isPending: overridePending } =
    useSceneTypeQaOverride(sceneTypeId);
  const { data: profiles, isPending: profilesPending } = useQaProfiles();

  const upsertMutation = useUpsertSceneTypeQaOverride();
  const deleteMutation = useDeleteSceneTypeQaOverride();

  const isPending = effectivePending || overridePending || profilesPending;

  /* -- Local draft state ------------------------------------------------- */

  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    NO_PROFILE_VALUE,
  );
  const [customThresholds, setCustomThresholds] = useState<
    Record<string, MetricThreshold>
  >({});
  const [dirty, setDirty] = useState(false);

  // Sync server state into local draft when data arrives.
  useEffect(() => {
    if (override) {
      setSelectedProfileId(
        override.qa_profile_id != null
          ? String(override.qa_profile_id)
          : NO_PROFILE_VALUE,
      );
      setCustomThresholds(override.custom_thresholds ?? {});
      setDirty(false);
    }
  }, [override]);

  /* -- Derived values ---------------------------------------------------- */

  const metricNames = useMemo(() => {
    if (!effective) return [];
    return Object.keys(effective).sort();
  }, [effective]);

  const profileOptions = useMemo(() => {
    const opts = [{ value: NO_PROFILE_VALUE, label: "No profile" }];
    if (profiles) {
      for (const p of profiles) {
        opts.push({ value: String(p.id), label: p.name });
      }
    }
    return opts;
  }, [profiles]);

  /* -- Handlers ---------------------------------------------------------- */

  const handleProfileChange = useCallback((value: string) => {
    setSelectedProfileId(value);
    setDirty(true);
  }, []);

  const handleThresholdChange = useCallback(
    (metric: string, threshold: MetricThreshold) => {
      setCustomThresholds((prev) => ({ ...prev, [metric]: threshold }));
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(() => {
    const profileId =
      selectedProfileId !== NO_PROFILE_VALUE
        ? Number(selectedProfileId)
        : null;
    const hasCustom = Object.keys(customThresholds).length > 0;

    upsertMutation.mutate({
      sceneTypeId,
      data: {
        qa_profile_id: profileId,
        custom_thresholds: hasCustom ? customThresholds : undefined,
      },
    });
    setDirty(false);
  }, [sceneTypeId, selectedProfileId, customThresholds, upsertMutation]);

  const handleReset = useCallback(() => {
    deleteMutation.mutate(sceneTypeId);
    setSelectedProfileId(NO_PROFILE_VALUE);
    setCustomThresholds({});
    setDirty(false);
  }, [sceneTypeId, deleteMutation]);

  /* -- Render ------------------------------------------------------------ */

  if (isPending) {
    return (
      <div data-testid="threshold-editor-loading" className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div data-testid="threshold-editor">
      <Card elevation="flat">
        <CardHeader>
        <h3 className={SECTION_HEADING_CLASSES}>
          QA Thresholds
        </h3>
      </CardHeader>

      <CardBody className="space-y-4">
        {/* Profile selector */}
        <div data-testid="profile-selector">
          <Select
            label="QA Profile"
            options={profileOptions}
            value={selectedProfileId}
            onChange={handleProfileChange}
            placeholder="Select a profile..."
          />
        </div>

        {/* Per-metric sliders */}
        <div data-testid="metric-sliders" className="space-y-1">
          {metricNames.map((metric) => (
            <ThresholdSlider
              key={metric}
              metricName={metric}
              label={metricLabel(metric)}
              threshold={
                customThresholds[metric] ??
                (effective?.[metric] as MetricThreshold) ?? EMPTY_THRESHOLD
              }
              onChange={(t) => handleThresholdChange(metric, t)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            data-testid="threshold-save-btn"
            onClick={handleSave}
            disabled={!dirty}
            loading={upsertMutation.isPending}
          >
            Save
          </Button>
          <Button
            data-testid="threshold-reset-btn"
            variant="secondary"
            onClick={handleReset}
            loading={deleteMutation.isPending}
          >
            Reset to defaults
          </Button>
        </div>
        </CardBody>
      </Card>
    </div>
  );
}
