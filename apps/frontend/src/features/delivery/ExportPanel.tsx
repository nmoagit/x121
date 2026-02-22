/**
 * Export panel for starting a delivery assembly job (PRD-39).
 *
 * Allows selecting an output format profile, characters, watermark option,
 * and starting an export. Shows progress for in-flight exports.
 */

import { useState } from "react";

import { Badge, Button, Checkbox, Select } from "@/components";

import { useOutputFormatProfiles, useStartAssembly } from "./hooks/use-delivery";
import { EXPORT_STATUS_LABELS, EXPORT_STATUS_VARIANT } from "./types";

interface ExportPanelProps {
  projectId: number;
  /** Available character options for multi-select. */
  characters?: Array<{ id: number; name: string }>;
  /** Currently running export status (if any). */
  activeExportStatus?: number | null;
}

export function ExportPanel({
  projectId,
  characters = [],
  activeExportStatus,
}: ExportPanelProps) {
  const { data: profiles = [] } = useOutputFormatProfiles();
  const startAssembly = useStartAssembly(projectId);

  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>([]);
  const [allCharacters, setAllCharacters] = useState(true);
  const [includeWatermark, setIncludeWatermark] = useState(false);

  const isExporting = activeExportStatus != null && activeExportStatus >= 1 && activeExportStatus <= 5;

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

  const profileOptions = profiles.map((p) => ({
    value: String(p.id),
    label: `${p.name} (${p.resolution}, ${p.codec})`,
  }));

  return (
    <div data-testid="export-panel" className="space-y-4">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
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

      {/* Character selection */}
      <div className="space-y-2">
        <Checkbox
          label="All characters"
          checked={allCharacters}
          onChange={setAllCharacters}
          data-testid="all-characters-checkbox"
        />
        {!allCharacters && characters.length > 0 && (
          <div className="ml-6 space-y-1" data-testid="character-checkboxes">
            {characters.map((c) => (
              <Checkbox
                key={c.id}
                label={c.name}
                checked={selectedCharacterIds.includes(c.id)}
                onChange={(checked) => handleCharacterToggle(c.id, checked)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Watermark */}
      <Checkbox
        label="Include watermark"
        checked={includeWatermark}
        onChange={setIncludeWatermark}
        data-testid="watermark-checkbox"
      />

      {/* Active export progress */}
      {isExporting && activeExportStatus != null && (
        <div data-testid="export-progress" className="flex items-center gap-2">
          <Badge variant={EXPORT_STATUS_VARIANT[activeExportStatus] ?? "default"} size="sm">
            {EXPORT_STATUS_LABELS[activeExportStatus] ?? "Unknown"}
          </Badge>
          <span className="text-sm text-[var(--color-text-muted)]">Export in progress...</span>
        </div>
      )}

      {/* Submit */}
      <Button
        variant="primary"
        size="sm"
        onClick={handleSubmit}
        disabled={!selectedProfileId || isExporting || startAssembly.isPending}
        data-testid="start-export-button"
      >
        {startAssembly.isPending ? "Starting..." : "Start Export"}
      </Button>
    </div>
  );
}
