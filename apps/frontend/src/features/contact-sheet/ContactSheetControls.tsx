/**
 * Control bar for the contact sheet page (PRD-103).
 *
 * Provides generate, export, and grid-size controls.
 */

import { Button, Select } from "@/components/primitives";

import {
  EXPORT_FORMAT_LABELS,
  GRID_COLUMN_OPTIONS,
  type ExportFormat,
  type GridColumns,
} from "./types";

/* --------------------------------------------------------------------------
   Option builders
   -------------------------------------------------------------------------- */

const FORMAT_OPTIONS = (Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).map(
  (value) => ({ value, label: EXPORT_FORMAT_LABELS[value] }),
);

const COLUMN_OPTIONS = GRID_COLUMN_OPTIONS.map((n) => ({
  value: String(n),
  label: `${n} columns`,
}));

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ContactSheetControlsProps {
  imageCount: number;
  selectedCount?: number;
  exportFormat: ExportFormat;
  onExportFormatChange: (format: ExportFormat) => void;
  columns: GridColumns;
  onColumnsChange: (columns: GridColumns) => void;
  onGenerate: () => void;
  onExport: () => void;
  isGenerating?: boolean;
  isExporting?: boolean;
}

export function ContactSheetControls({
  imageCount,
  selectedCount = 0,
  exportFormat,
  onExportFormatChange,
  columns,
  onColumnsChange,
  onGenerate,
  onExport,
  isGenerating = false,
  isExporting = false,
}: ContactSheetControlsProps) {
  const hasImages = imageCount > 0;

  return (
    <div
      data-testid="contact-sheet-controls"
      className="flex flex-wrap items-end gap-4"
    >
      {/* Generate */}
      <Button
        data-testid="generate-btn"
        variant="primary"
        size="sm"
        loading={isGenerating}
        onClick={onGenerate}
      >
        Generate Face Crops
      </Button>

      {/* Grid columns */}
      <div className="w-36">
        <Select
          label="Grid size"
          options={COLUMN_OPTIONS}
          value={String(columns)}
          onChange={(v) => onColumnsChange(Number(v) as GridColumns)}
        />
      </div>

      {/* Export format */}
      <div className="w-40" data-testid="export-format-select">
        <Select
          label="Export format"
          options={FORMAT_OPTIONS}
          value={exportFormat}
          onChange={(v) => onExportFormatChange(v as ExportFormat)}
        />
      </div>

      {/* Export */}
      <Button
        data-testid="export-btn"
        variant="secondary"
        size="sm"
        loading={isExporting}
        disabled={!hasImages}
        onClick={onExport}
      >
        Export{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </Button>
    </div>
  );
}
