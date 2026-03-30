/**
 * Export history table component (PRD-39).
 *
 * Lists past delivery exports with status, profile info, file size,
 * and action buttons for download/re-export.
 */

import { Button } from "@/components";
import { API_BASE_URL } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  SECTION_HEADING,
} from "@/lib/ui-classes";
import { useAuthStore } from "@/stores/auth-store";

import { useDeliveryExports } from "./hooks/use-delivery";
import { EXPORT_STATUS_LABELS } from "./types";
import type { DeliveryExport } from "./types";

const STATUS_COLOR: Record<number, string> = {
  1: "text-[var(--color-text-muted)]",  // Pending
  2: "text-cyan-400",                    // Assembling
  3: "text-cyan-400",                    // Transcoding
  4: "text-cyan-400",                    // Packaging
  5: "text-orange-400",                  // Validating
  6: "text-green-400",                   // Completed
  7: "text-red-400",                     // Failed
};

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

  const visible = exports.filter((e) => e.status_id !== 7);

  if (visible.length === 0) {
    return (
      <div data-testid="export-history" className="text-sm text-[var(--color-text-muted)]">
        No exports yet.
      </div>
    );
  }

  return (
    <div data-testid="export-history" className="space-y-2">
      <h3 className={SECTION_HEADING}>
        Export History
      </h3>

      <table className="w-full">
        <thead>
          <tr className={TERMINAL_DIVIDER}>
            <th className={`${TERMINAL_TH} py-2 pr-3`}>Date</th>
            <th className={`${TERMINAL_TH} py-2 pr-3`}>Status</th>
            <th className={`${TERMINAL_TH} py-2 pr-3`}>File Size</th>
            <th className={`${TERMINAL_TH} py-2`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((exp) => (
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
  const token = useAuthStore((s) => s.accessToken);
  const isCompleted = exportItem.status_id === 6;

  return (
    <tr
      className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
      data-testid="export-row"
    >
      <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-primary)]">
        {exportItem.created_at ? formatDateTime(exportItem.created_at) : "--"}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        <span className={STATUS_COLOR[exportItem.status_id] ?? "text-[var(--color-text-muted)]"}>
          {EXPORT_STATUS_LABELS[exportItem.status_id] ?? "Unknown"}
        </span>
      </td>
      <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-muted)]" data-testid="file-size">
        {exportItem.file_size_bytes ? formatBytes(exportItem.file_size_bytes) : "--"}
      </td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          {isCompleted && exportItem.file_path && (
            <a
              href={`${API_BASE_URL}/projects/${exportItem.project_id}/exports/${exportItem.id}/download?token=${token}`}
              className="font-mono text-xs text-cyan-400 hover:underline"
              data-testid="download-link"
            >
              Download.rar
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
