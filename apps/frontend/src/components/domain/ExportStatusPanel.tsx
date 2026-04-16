/**
 * Inline export status panel shown when an export job is in progress or completed.
 * Displays progress indicator, error messages, and download links for completed parts.
 * Auto-downloads each part as it becomes ready (progressive download).
 */

import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/primitives";
import { API_BASE_URL } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { Download, X } from "@/tokens/icons";
import type { ExportJob, ExportPart } from "@/features/exports/hooks/use-exports";
import { TYPO_DATA } from "@/lib/typography-tokens";

interface ExportStatusPanelProps {
  job: ExportJob;
  onDismiss: () => void;
}

export function ExportStatusPanel({ job, onDismiss }: ExportStatusPanelProps) {
  const isActive = job.status === "queued" || job.status === "processing";
  const parts = job.parts ?? [];

  const handleDownloadPart = useCallback(
    (part: ExportPart) => {
      const token = useAuthStore.getState().accessToken;
      const url = `${API_BASE_URL}/exports/${job.id}/download/${part.part}`;
      // Direct browser download via anchor — avoids fetch+blob memory issues with large files
      const downloadUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;
      const a = document.createElement("a");
      a.href = downloadUrl;
      const ts = job.created_at.replace(/[-:.T]/g, "").slice(0, 14);
      a.download = `export_${ts}_part${part.part}_of_${parts.length}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [job.id],
  );

  // Auto-download each part exactly once as it becomes available.
  // Track by part number — download only parts we haven't downloaded yet.
  const lastDownloadedPartRef = useRef(0);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const handleDownloadRef = useRef(handleDownloadPart);
  handleDownloadRef.current = handleDownloadPart;

  const partsCount = parts.length;
  useEffect(() => {
    const currentParts = partsRef.current;
    if (currentParts.length === 0) return;

    // Find parts with part number > lastDownloadedPart
    const newParts = currentParts.filter((p) => p.part > lastDownloadedPartRef.current);
    if (newParts.length === 0) return;

    // Sort by part number to ensure sequential download
    newParts.sort((a, b) => a.part - b.part);

    for (let i = 0; i < newParts.length; i++) {
      const part = newParts[i]!;
      lastDownloadedPartRef.current = Math.max(lastDownloadedPartRef.current, part.part);
      // Stagger downloads by 1s to avoid browser blocking
      setTimeout(() => handleDownloadRef.current(part), i * 1000);
    }
  }, [partsCount]);

  // Reset tracking when job ID changes.
  useEffect(() => {
    lastDownloadedPartRef.current = 0;
  }, [job.id]);

  return (
    <div className="bg-[var(--color-surface-secondary)] border-t border-[var(--color-border-default)] px-4 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className={`flex items-center gap-3 ${TYPO_DATA}`}>
          {/* Status indicator */}
          {isActive && (
            <>
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-400">
                Export {job.status === "queued" ? "queued" : "processing"}
                {parts.length > 0 && ` — ${parts.length} part${parts.length !== 1 ? "s" : ""} ready`}
                ...
              </span>
            </>
          )}

          {job.status === "completed" && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-[var(--color-data-green)]">
                Export complete — {parts.length} part{parts.length !== 1 ? "s" : ""}
              </span>
            </>
          )}

          {job.status === "failed" && (
            <>
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-[var(--color-data-red)]">
                Export failed{job.error_message ? `: ${job.error_message}` : ""}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Download buttons for available parts (shown during processing and after completion) */}
          {parts.length > 0 &&
            parts.map((part) => (
              <button
                key={part.part}
                type="button"
                onClick={() => handleDownloadPart(part)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors border border-[var(--color-border-default)] cursor-pointer"
              >
                <Download size={10} />
                Part {part.part} of {parts.length}
                <span className="text-[var(--color-text-muted)]">
                  ({formatBytes(part.size_bytes)})
                </span>
              </button>
            ))}

          {/* Dismiss */}
          {!isActive && (
            <Button
              variant="ghost"
              size="xs"
              icon={<X size={12} />}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
