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
import { SECTION_HEADING } from "@/lib/ui-classes";

import { useOutputFormatProfiles, useStartAssembly } from "./hooks/use-delivery";
import { EXPORT_STATUS_LABELS, EXPORT_STATUS_VARIANT, formatProfileOption } from "./types";

interface ExportPanelProps {
  projectId: number;
  /** Available model options for multi-select. */
  characters?: Array<{ id: number; name: string }>;
  /** Currently running export status (if any). */
  activeExportStatus?: number | null;
  /** Whether pre-export validation passed. When false, export is blocked. */
  validationPassed?: boolean;
  /** IDs of models that have validation errors (not deliverable). */
  invalidModelIds?: Set<number>;
  /** Project-level default output format profile ID override. */
  projectDefaultProfileId?: number | null;
}

export function ExportPanel({
  projectId,
  characters = [],
  activeExportStatus,
  validationPassed,
  invalidModelIds,
  projectDefaultProfileId,
}: ExportPanelProps) {
  const { data: profiles = [] } = useOutputFormatProfiles();
  const startAssembly = useStartAssembly(projectId);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [allCharacters, setAllCharacters] = useState(true);
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

  const isExporting = activeExportStatus != null && activeExportStatus >= 1 && activeExportStatus <= 5;

  // When toggling off "All models", auto-select only deliverable models
  function handleAllToggle(checked: boolean) {
    setAllCharacters(checked);
    if (!checked) {
      const deliverable = characters
        .filter((c) => !invalidModelIds?.has(c.id))
        .map((c) => c.id);
      setSelectedCharacterIds(deliverable);
    }
  }

  function handleCharacterToggle(id: number, checked: boolean) {
    setSelectedCharacterIds((prev) =>
      checked ? [...prev, id] : prev.filter((cid) => cid !== id),
    );
  }

  function handleSubmit() {
    if (!selectedProfileId) return;

    startAssembly.mutate({
      format_profile_id: Number(selectedProfileId),
      character_ids: allCharacters ? null : selectedCharacterIds,
      include_watermark: includeWatermark,
    });
  }

  const profileOptions = profiles.map(formatProfileOption);

  const deliverableCount = characters.filter((c) => !invalidModelIds?.has(c.id)).length;

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
          checked={allCharacters}
          onChange={handleAllToggle}
          size="sm"
        />
        {!allCharacters && characters.length > 0 && (
          <>
            <p className="ml-6 text-xs text-[var(--color-text-muted)]">
              {deliverableCount} of {characters.length} models deliverable — {selectedCharacterIds.length} selected
            </p>
            <div className="ml-6 grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-6" data-testid="character-checkboxes">
              {characters.map((c) => {
                const isInvalid = invalidModelIds?.has(c.id);
                return (
                  <div key={c.id} className={isInvalid ? "opacity-50" : ""}>
                    <Checkbox
                      label={c.name}
                      checked={selectedCharacterIds.includes(c.id)}
                      onChange={(checked) => handleCharacterToggle(c.id, checked)}
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
      <div className="flex items-center gap-[var(--spacing-3)]">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!selectedProfileId || isExporting || startAssembly.isPending || validationPassed === false}
          data-testid="start-export-button"
        >
          {startAssembly.isPending ? "Starting..." : "Start Export"}
        </Button>
        {validationPassed === false && (
          <span className="text-xs text-[var(--color-action-danger)]">
            Run validation and fix errors before exporting
          </span>
        )}
        {isExporting && activeExportStatus != null && (
          <div data-testid="export-progress" className="flex items-center gap-2">
            <Badge variant={EXPORT_STATUS_VARIANT[activeExportStatus] ?? "default"} size="sm">
              {EXPORT_STATUS_LABELS[activeExportStatus] ?? "Unknown"}
            </Badge>
            <span className="text-sm text-[var(--color-text-muted)]">Export in progress...</span>
          </div>
        )}
      </div>
    </div>
  );
}
