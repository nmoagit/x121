/**
 * Export history table component (PRD-39).
 *
 * Lists past delivery exports with status, profile info, file size,
 * and action buttons for download/re-export.
 */

import { Badge, Button } from "@/components";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime } from "@/lib/format";

import { useDeliveryExports } from "./hooks/use-delivery";
import { EXPORT_STATUS_LABELS, EXPORT_STATUS_VARIANT } from "./types";
import type { DeliveryExport } from "./types";

interface ExportHistoryProps {
  projectId: number;
  /** Called when re-export is requested for a given export. */
  onReExport?: (exportItem: DeliveryExport) => void;
}

export function ExportHistory({ projectId, onReExport }: ExportHistoryProps) {
  const { data: exports = [], isLoading } = useDeliveryExports(projectId);

  if (isLoading) {
    return (
      <div data-testid="export-history" className="text-sm text-[var(--color-text-muted)]">
        Loading export history...
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div data-testid="export-history" className="text-sm text-[var(--color-text-muted)]">
        No exports yet.
      </div>
    );
  }

  return (
    <div data-testid="export-history" className="space-y-2">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        Export History
      </h3>

      <table className="w-full text-sm">
        <thead>
          <tr
            className={cn(
              "border-b border-[var(--color-border-default)]",
              "text-left text-xs text-[var(--color-text-muted)]",
            )}
          >
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">File Size</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {exports.map((exp) => (
            <ExportRow key={exp.id} exportItem={exp} onReExport={onReExport} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportRow({
  exportItem,
  onReExport,
}: {
  exportItem: DeliveryExport;
  onReExport?: (item: DeliveryExport) => void;
}) {
  const isCompleted = exportItem.status_id === 6;

  return (
    <tr
      className="border-b border-[var(--color-border-default)]"
      data-testid="export-row"
    >
      <td className="py-2 pr-3 text-[var(--color-text-primary)]">
        {exportItem.created_at ? formatDateTime(exportItem.created_at) : "--"}
      </td>
      <td className="py-2 pr-3">
        <Badge
          variant={EXPORT_STATUS_VARIANT[exportItem.status_id] ?? "default"}
          size="sm"
        >
          {EXPORT_STATUS_LABELS[exportItem.status_id] ?? "Unknown"}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]" data-testid="file-size">
        {exportItem.file_size_bytes ? formatBytes(exportItem.file_size_bytes) : "--"}
      </td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          {isCompleted && exportItem.file_path && (
            <a
              href={exportItem.file_path}
              className="text-sm text-[var(--color-action-primary)] hover:underline"
              data-testid="download-link"
            >
              Download
            </a>
          )}
          {onReExport && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onReExport(exportItem)}
              data-testid="re-export-button"
            >
              Re-export
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
