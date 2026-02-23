/**
 * Single download item with progress bar, speed display, status badge,
 * and action buttons (PRD-104).
 */

import { Badge } from "@/components/primitives";
import { estimateEta, formatBytes, formatSpeed } from "@/lib/format";
import { Pause, Play, RefreshCw, X } from "@/tokens/icons";

import type { DownloadStatusId, ModelDownload } from "./types";
import {
  DOWNLOAD_STATUS,
  MODEL_TYPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
} from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Calculate download progress as a percentage (0-100). */
function progressPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(Math.round((downloaded / total) * 100), 100);
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface DownloadItemProps {
  download: ModelDownload;
  onPause?: (id: number) => void;
  onResume?: (id: number) => void;
  onCancel?: (id: number) => void;
  onRetry?: (id: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DownloadItem({ download, onPause, onResume, onCancel, onRetry }: DownloadItemProps) {
  const statusLabel = STATUS_LABELS[download.status_id as DownloadStatusId] ?? "Unknown";
  const statusVariant = STATUS_VARIANTS[download.status_id as DownloadStatusId] ?? "default";
  const sourceLabel = SOURCE_LABELS[download.source_type] ?? download.source_type;
  const typeLabel = MODEL_TYPE_LABELS[download.model_type] ?? download.model_type;
  const pct = progressPercent(download.downloaded_bytes, download.file_size_bytes);
  const speed = formatSpeed(download.download_speed_bps);
  const eta = estimateEta(download.downloaded_bytes, download.file_size_bytes, download.download_speed_bps);

  const isDownloading = download.status_id === DOWNLOAD_STATUS.DOWNLOADING;
  const isPaused = download.status_id === DOWNLOAD_STATUS.PAUSED;
  const canPause = isDownloading;
  const canResume = isPaused;
  const canCancel = [DOWNLOAD_STATUS.QUEUED, DOWNLOAD_STATUS.DOWNLOADING, DOWNLOAD_STATUS.PAUSED].includes(
    download.status_id as 1 | 2 | 3,
  );
  const canRetry = [DOWNLOAD_STATUS.FAILED, DOWNLOAD_STATUS.CANCELLED].includes(
    download.status_id as 7 | 8,
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-[var(--spacing-4)] py-[var(--spacing-3)]">
      {/* Header row: name + status + actions */}
      <div className="flex items-center justify-between gap-[var(--spacing-2)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {download.model_name}
            </span>
            <Badge variant={statusVariant} size="sm">
              {statusLabel}
            </Badge>
          </div>
          <div className="mt-[var(--spacing-1)] flex items-center gap-[var(--spacing-2)] text-xs text-[var(--color-text-muted)]">
            <span>{sourceLabel}</span>
            <span aria-hidden>&middot;</span>
            <span>{typeLabel}</span>
            <span aria-hidden>&middot;</span>
            <span>{download.file_name}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-[var(--spacing-1)]">
          {canPause && onPause && (
            <button
              type="button"
              onClick={() => onPause(download.id)}
              className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Pause"
            >
              <Pause size={14} aria-hidden />
            </button>
          )}
          {canResume && onResume && (
            <button
              type="button"
              onClick={() => onResume(download.id)}
              className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Resume"
            >
              <Play size={14} aria-hidden />
            </button>
          )}
          {canRetry && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(download.id)}
              className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Retry"
            >
              <RefreshCw size={14} aria-hidden />
            </button>
          )}
          {canCancel && onCancel && (
            <button
              type="button"
              onClick={() => onCancel(download.id)}
              className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-danger)] transition-colors"
              title="Cancel"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="mt-[var(--spacing-2)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {formatBytes(download.downloaded_bytes)}
              {download.file_size_bytes ? ` / ${formatBytes(download.file_size_bytes)}` : ""}
            </span>
            <span className="flex items-center gap-[var(--spacing-2)]">
              {speed && <span>{speed}</span>}
              {eta && <span>ETA {eta}</span>}
              <span>{pct}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)]">
            <div
              className={`h-full rounded-full transition-all ${
                download.status_id === DOWNLOAD_STATUS.FAILED
                  ? "bg-[var(--color-danger)]"
                  : download.status_id === DOWNLOAD_STATUS.PAUSED
                    ? "bg-[var(--color-warning)]"
                    : "bg-[var(--color-primary)]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {download.error_message && (
        <p className="mt-[var(--spacing-2)] text-xs text-[var(--color-danger)]">
          {download.error_message}
        </p>
      )}
    </div>
  );
}
