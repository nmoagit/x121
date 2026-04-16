/**
 * Dataset export panel for VFX Sidecar & Dataset Export (PRD-40).
 *
 * Lists dataset exports with status indicators, sample counts, and file sizes.
 * Provides an inline form for creating new exports with split configuration.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { API_BASE_URL } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { Download, iconSizes } from "@/tokens/icons";

import { CreateExportForm } from "./CreateExportForm";
import { useDatasetExports } from "./hooks/use-sidecar";
import {
  EXPORT_STATUS_LABELS,
  resolveExportStatus,
} from "./types";
import type { DatasetExport } from "./types";
import { TYPO_DATA, TYPO_DATA_CYAN, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Export row
   -------------------------------------------------------------------------- */

function ExportRow({ exportItem }: { exportItem: DatasetExport }) {
  const status = resolveExportStatus(exportItem.status_id);
  const isCompleted = status === "completed";
  const downloadUrl = `${API_BASE_URL}/projects/${exportItem.project_id}/dataset-exports/${exportItem.id}/download`;
  const statusColor = TERMINAL_STATUS_COLORS[status] ?? "text-[var(--color-text-muted)]";

  return (
    <div
      data-testid={`export-row-${exportItem.id}`}
      className={`flex items-center justify-between gap-3 px-3 py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}
    >
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 ${TYPO_DATA}`}>
          <span className="font-medium text-[var(--color-text-primary)]">
            {exportItem.name}
          </span>
          <span className={`uppercase tracking-wide ${statusColor}`}>
            {EXPORT_STATUS_LABELS[status]}
          </span>
          {exportItem.sample_count != null && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-data-cyan)]">
                {exportItem.sample_count} samples
              </span>
            </>
          )}
          {exportItem.file_size_bytes != null && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-text-muted)]">
                {formatBytes(exportItem.file_size_bytes)}
              </span>
            </>
          )}
        </div>
        <p className="font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {formatDateTime(exportItem.created_at)}
        </p>
      </div>

      {isCompleted && (
        <a
          href={downloadUrl}
          data-testid={`download-export-${exportItem.id}`}
          className={`${TYPO_DATA_CYAN} inline-flex items-center gap-1 hover:text-cyan-300`}
        >
          <Download size={iconSizes.sm} aria-hidden="true" />
          Download
        </a>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function DatasetExportPanel({ projectId }: { projectId: number }) {
  const { data: exports, isLoading } = useDatasetExports(projectId);
  const [showForm, setShowForm] = useState(false);

  const list = exports ?? [];

  return (
    <div data-testid="dataset-export-panel">
      <div className={TERMINAL_PANEL}>
        <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
          <span className={TERMINAL_HEADER_TITLE}>Dataset Exports</span>
          {!showForm && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => setShowForm(true)}
              data-testid="add-export-btn"
            >
              New Export
            </Button>
          )}
        </div>

        {showForm && (
          <div className={TERMINAL_BODY}>
            <CreateExportForm
              projectId={projectId}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className={TERMINAL_BODY}>
            <p className={`${TYPO_DATA_MUTED} text-center`}>
              Loading exports...
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className={TERMINAL_BODY}>
            <p
              data-testid="exports-empty"
              className={`${TYPO_DATA_MUTED} text-center`}
            >
              No dataset exports yet.
            </p>
          </div>
        ) : (
          list.map((exp) => (
            <ExportRow key={exp.id} exportItem={exp} />
          ))
        )}
      </div>
    </div>
  );
}
