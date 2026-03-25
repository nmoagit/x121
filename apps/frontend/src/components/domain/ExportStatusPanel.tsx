/**
 * Inline export status panel shown when an export job is in progress or completed.
 * Displays progress indicator, error messages, and download links for completed parts.
 */

import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/primitives";
import { API_BASE_URL } from "@/lib/api";
import { downloadBlob } from "@/lib/file-utils";
import { formatBytes } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { Download, X } from "@/tokens/icons";
import type { ExportJob, ExportPart } from "@/features/exports/hooks/use-exports";

interface ExportStatusPanelProps {
  job: ExportJob;
  onDismiss: () => void;
}

export function ExportStatusPanel({ job, onDismiss }: ExportStatusPanelProps) {
  const isActive = job.status === "queued" || job.status === "processing";
  const autoDownloadedRef = useRef<number | null>(null);

  const handleDownloadPart = useCallback(
    async (part: ExportPart) => {
      const token = useAuthStore.getState().accessToken;
      const url = `${API_BASE_URL}/exports/${job.id}/download/${part.part}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, `export_${job.id}_part${part.part}.zip`);
    },
    [job.id],
  );

  // Auto-download all parts when the job completes.
  useEffect(() => {
    if (job.status !== "completed") return;
    if (autoDownloadedRef.current === job.id) return;
    autoDownloadedRef.current = job.id;

    // Stagger downloads slightly so the browser doesn't block them.
    job.parts.forEach((part, i) => {
      setTimeout(() => handleDownloadPart(part), i * 500);
    });
  }, [job.status, job.id, job.parts, handleDownloadPart]);

  return (
    <div className="bg-[#161b22] border-t border-[var(--color-border-default)] px-4 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Status indicator */}
          {isActive && (
            <>
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-400">
                Export {job.status === "queued" ? "queued" : "processing"}...
              </span>
            </>
          )}

          {job.status === "completed" && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-green-400">
                Export complete — {job.parts.length} part{job.parts.length !== 1 ? "s" : ""}
              </span>
            </>
          )}

          {job.status === "failed" && (
            <>
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-red-400">
                Export failed{job.error_message ? `: ${job.error_message}` : ""}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Download buttons for completed parts */}
          {job.status === "completed" &&
            job.parts.map((part) => (
              <button
                key={part.part}
                type="button"
                onClick={() => handleDownloadPart(part)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] bg-[#0d1117] text-[var(--color-text-primary)] hover:bg-[#1c2128] transition-colors border border-[var(--color-border-default)] cursor-pointer"
              >
                <Download size={10} />
                Part {part.part}
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
