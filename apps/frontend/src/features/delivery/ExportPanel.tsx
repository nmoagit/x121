/**
 * Export panel for starting a delivery assembly job (PRD-39).
 *
 * Allows selecting an output format profile, models, watermark option,
 * and starting an export. Shows progress for in-flight exports.
 *
 * When "All models" is toggled off, auto-selects only deliverable models
 * (those without validation errors).
 */

import { useEffect, useState } from "react";

import { Badge, Button, Checkbox, Select, Toggle } from "@/components";
import { useToast } from "@/components/composite/useToast";
import { SECTION_HEADING } from "@/lib/ui-classes";

import { useCancelExport, useDeliveryExports, useOutputFormatProfiles, useStartAssembly } from "./hooks/use-delivery";
import { EXPORT_STATUS_LABELS, EXPORT_STATUS_VARIANT, formatProfileOption } from "./types";

interface ExportPanelProps {
  projectId: number;
  /** Available model options for multi-select. */
  avatars?: Array<{ id: number; name: string }>;
  /** Whether pre-export validation passed. When false, export is blocked. */
  validationPassed?: boolean;
  /** IDs of models that have validation errors (not deliverable). */
  invalidModelIds?: Set<number>;
  /** Project-level default output format profile ID override. */
  projectDefaultProfileId?: number | null;
  /** Controlled: whether "All models" is toggled on. */
  allAvatars: boolean;
  /** Controlled: setter for allAvatars. */
  onAllAvatarsChange: (value: boolean) => void;
  /** Controlled: currently selected avatar IDs (when not all). */
  selectedAvatarIds: number[];
  /** Controlled: setter for selectedAvatarIds. */
  onSelectedAvatarIdsChange: (ids: number[]) => void;
}

export function ExportPanel({
  projectId,
  avatars = [],
  validationPassed,
  invalidModelIds,
  projectDefaultProfileId,
  allAvatars,
  onAllAvatarsChange,
  selectedAvatarIds,
  onSelectedAvatarIdsChange,
}: ExportPanelProps) {
  const { data: profiles = [] } = useOutputFormatProfiles();
  const { data: exports = [] } = useDeliveryExports(projectId);
  const { addToast } = useToast();
  const startAssembly = useStartAssembly(projectId);
  const cancelExport = useCancelExport(projectId);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [includeWatermark, setIncludeWatermark] = useState(false);

  // Auto-select a profile on initial load (only when user hasn't chosen one yet)
  useEffect(() => {
    if (selectedProfileId || profiles.length === 0) return;

    // 1. Project-level default
    if (projectDefaultProfileId && profiles.some((p) => p.id === projectDefaultProfileId)) {
      setSelectedProfileId(String(projectDefaultProfileId));
      return;
    }

    // 2. Platform-level default (is_default flag)
    const platformDefault = profiles.find((p) => p.is_default);
    if (platformDefault) {
      setSelectedProfileId(String(platformDefault.id));
      return;
    }

    // 3. First profile alphabetically
    const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
    const first = sorted[0];
    if (first) {
      setSelectedProfileId(String(first.id));
    }
  }, [profiles, projectDefaultProfileId, selectedProfileId]);

  // Derive active export status from the most recent export record
  const activeExport = exports.find((e) => e.status_id >= 1 && e.status_id <= 5);
  const activeExportStatus = activeExport?.status_id ?? null;
  const isExporting = activeExportStatus != null;

  // When toggling off "All models", auto-select only deliverable models
  function handleAllToggle(checked: boolean) {
    onAllAvatarsChange(checked);
    if (!checked) {
      const deliverable = avatars
        .filter((c) => !invalidModelIds?.has(c.id))
        .map((c) => c.id);
      onSelectedAvatarIdsChange(deliverable);
    }
  }

  function handleAvatarToggle(id: number, checked: boolean) {
    const next = checked
      ? [...selectedAvatarIds, id]
      : selectedAvatarIds.filter((cid) => cid !== id);
    onSelectedAvatarIdsChange(next);
  }

  function handleCancel() {
    if (!activeExport) return;
    cancelExport.mutate(activeExport.id, {
      onSuccess: () => addToast({ message: "Export cancelled", variant: "info" }),
      onError: (err) =>
        addToast({
          message: `Cancel failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          variant: "error",
        }),
    });
  }

  function handleSubmit() {
    if (!selectedProfileId) return;

    startAssembly.mutate(
      {
        format_profile_id: Number(selectedProfileId),
        avatar_ids: allAvatars ? null : selectedAvatarIds,
        include_watermark: includeWatermark,
      },
      {
        onSuccess: () => addToast({ message: "Export started", variant: "success" }),
        onError: (err) =>
          addToast({
            message: `Export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            variant: "error",
          }),
      },
    );
  }

  const profileOptions = profiles.map(formatProfileOption);

  const deliverableCount = avatars.filter((c) => !invalidModelIds?.has(c.id)).length;
  const invalidCount = avatars.length - deliverableCount;
  const hasDeliverableModels = deliverableCount > 0;

  // Determine why export might be blocked (first matching reason wins)
  const disabledReason = !selectedProfileId
    ? "Select an output format profile"
    : isExporting
      ? "An export is already in progress"
      : validationPassed === false && !hasDeliverableModels
        ? "No deliverable models — fix all validation errors"
        : null;

  const canExport = !disabledReason && !startAssembly.isPending;

  return (
    <div data-testid="export-panel" className="space-y-4">
      <h3 className={SECTION_HEADING}>
        Export Delivery
      </h3>

      {/* Profile selection */}
      <Select
        label="Output Format Profile"
        placeholder="Select a profile..."
        options={profileOptions}
        value={selectedProfileId}
        onChange={setSelectedProfileId}
        data-testid="profile-select"
      />

      {/* Model selection */}
      <div className="space-y-2">
        <Toggle
          label="All models"
          checked={allAvatars}
          onChange={handleAllToggle}
          size="sm"
        />
        {!allAvatars && avatars.length > 0 && (
          <>
            <p className="ml-6 text-xs text-[var(--color-text-muted)]">
              {deliverableCount} of {avatars.length} models deliverable — {selectedAvatarIds.length} selected
            </p>
            <div className="ml-6 grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-6" data-testid="avatar-checkboxes">
              {avatars.map((c) => {
                const isInvalid = invalidModelIds?.has(c.id);
                return (
                  <div key={c.id} className={isInvalid ? "opacity-50" : ""}>
                    <Checkbox
                      label={c.name}
                      checked={selectedAvatarIds.includes(c.id)}
                      onChange={(checked) => handleAvatarToggle(c.id, checked)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Watermark */}
      <Toggle
        label="Include watermark"
        checked={includeWatermark}
        onChange={setIncludeWatermark}
        size="sm"
        data-testid="watermark-checkbox"
      />

      {/* Submit + progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-[var(--spacing-3)]">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canExport}
            data-testid="start-export-button"
          >
            {startAssembly.isPending ? "Starting..." : "Start Export"}
          </Button>
          {disabledReason && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {disabledReason}
            </span>
          )}
          {isExporting && activeExportStatus != null && (
            <div data-testid="export-progress" className="flex items-center gap-2">
              <Badge variant={EXPORT_STATUS_VARIANT[activeExportStatus] ?? "default"} size="sm">
                {EXPORT_STATUS_LABELS[activeExportStatus] ?? "Unknown"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={cancelExport.isPending}
              >
                {cancelExport.isPending ? "Cancelling..." : "Cancel"}
              </Button>
            </div>
          )}
        </div>
        {validationPassed === false && hasDeliverableModels && invalidCount > 0 && (
          <p className="text-xs text-[var(--color-action-warning)]">
            {invalidCount} model{invalidCount !== 1 ? "s" : ""} ha{invalidCount !== 1 ? "ve" : "s"} validation errors and will be skipped.
            Toggle off "All models" to choose which to include.
          </p>
        )}
      </div>
    </div>
  );
}
