/**
 * CSV upload with column mapping dialog for legacy import (PRD-86).
 */

import { useState } from "react";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface CsvImportDialogProps {
  /** Called when the user submits CSV data. */
  onSubmit?: (csvData: string, columnMapping: Record<string, string>) => void;
  /** Called when the dialog is dismissed. */
  onClose?: () => void;
  /** Whether the dialog is loading. */
  loading?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CsvImportDialog({
  onSubmit,
  onClose,
  loading = false,
}: CsvImportDialogProps) {
  const [csvData, setCsvData] = useState("");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    name: "name",
    entity_type: "type",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (csvData.trim()) {
      onSubmit?.(csvData.trim(), columnMapping);
    }
  };

  const updateMapping = (key: string, value: string) => {
    setColumnMapping((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div data-testid="csv-import-dialog" className="space-y-4 rounded border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
          Import from CSV
        </h3>
        <button
          data-testid="close-csv-dialog-btn"
          onClick={onClose}
          type="button"
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="csv-data"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
          >
            CSV Data
          </label>
          <textarea
            id="csv-data"
            data-testid="csv-data-input"
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            placeholder="name,type,description&#10;Alice,character,Main protagonist"
            rows={6}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
            Column Mapping
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="map-name"
                className="text-xs text-[var(--color-text-secondary)]"
              >
                Name column
              </label>
              <input
                id="map-name"
                data-testid="map-name-input"
                type="text"
                value={columnMapping.name ?? ""}
                onChange={(e) => updateMapping("name", e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="map-type"
                className="text-xs text-[var(--color-text-secondary)]"
              >
                Type column
              </label>
              <input
                id="map-type"
                data-testid="map-type-input"
                type="text"
                value={columnMapping.entity_type ?? ""}
                onChange={(e) => updateMapping("entity_type", e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            data-testid="submit-csv-btn"
            disabled={loading || !csvData.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import CSV"}
          </button>
          <button
            type="button"
            data-testid="cancel-csv-btn"
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
