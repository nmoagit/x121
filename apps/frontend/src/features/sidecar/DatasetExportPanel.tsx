/**
 * Dataset export panel for VFX Sidecar & Dataset Export (PRD-40).
 *
 * Lists dataset exports with status badges, sample counts, and file sizes.
 * Provides an inline form for creating new exports with split configuration.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { API_BASE_URL } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Download, iconSizes } from "@/tokens/icons";

import { CreateExportForm } from "./CreateExportForm";
import { useDatasetExports } from "./hooks/use-sidecar";
import {
  EXPORT_STATUS_BADGE_VARIANT,
  EXPORT_STATUS_LABELS,
  resolveExportStatus,
} from "./types";
import type { DatasetExport } from "./types";

/* --------------------------------------------------------------------------
   Export row
   -------------------------------------------------------------------------- */

function ExportRow({ exportItem }: { exportItem: DatasetExport }) {
  const status = resolveExportStatus(exportItem.status_id);
  const isCompleted = status === "completed";
  const downloadUrl = `${API_BASE_URL}/projects/${exportItem.project_id}/dataset-exports/${exportItem.id}/download`;

  return (
    <div
      data-testid={`export-row-${exportItem.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">
            {exportItem.name}
          </span>
          <Badge variant={EXPORT_STATUS_BADGE_VARIANT[status]} size="sm">
            {EXPORT_STATUS_LABELS[status]}
          </Badge>
          {exportItem.sample_count != null && (
            <span className="text-[var(--color-text-muted)]">
              {exportItem.sample_count} samples
            </span>
          )}
          {exportItem.file_size_bytes != null && (
            <span className="text-[var(--color-text-muted)]">
              {formatBytes(exportItem.file_size_bytes)}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {formatDateTime(exportItem.created_at)}
        </p>
      </div>

      {isCompleted && (
        <a
          href={downloadUrl}
          data-testid={`download-export-${exportItem.id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-action-primary)] hover:underline"
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
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Dataset Exports
          </h3>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="add-export-btn"
            >
              New Export
            </Button>
          )}
        </CardHeader>

        <CardBody className="p-0">
          {showForm && (
            <CreateExportForm
              projectId={projectId}
              onCancel={() => setShowForm(false)}
            />
          )}

          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading exports...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="exports-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No dataset exports yet.
            </p>
          ) : (
            list.map((exp) => (
              <ExportRow key={exp.id} exportItem={exp} />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
