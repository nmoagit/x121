/**
 * Inline export status panel shown when an export job is in progress or completed.
 * Displays progress indicator, error messages, and download links for completed parts.
 */

import { Button } from "@/components/primitives";
import { API_BASE_URL } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { Download, X } from "@/tokens/icons";
import type { ExportJob } from "@/features/exports/hooks/use-exports";

interface ExportStatusPanelProps {
  job: ExportJob;
  onDismiss: () => void;
}

export function ExportStatusPanel({ job, onDismiss }: ExportStatusPanelProps) {
  const isActive = job.status === "queued" || job.status === "processing";

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
          {/* Download links for completed parts */}
          {job.status === "completed" &&
            job.parts.map((part) => (
              <a
                key={part.part}
                href={`${API_BASE_URL}/exports/${job.id}/download/${part.part}`}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] bg-[#0d1117] text-[var(--color-text-primary)] hover:bg-[#1c2128] transition-colors border border-[var(--color-border-default)]"
              >
                <Download size={10} />
                Part {part.part}
                <span className="text-[var(--color-text-muted)]">
                  ({formatBytes(part.size_bytes)})
                </span>
              </a>
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
