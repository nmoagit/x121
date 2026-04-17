/**
 * Full-player overlay shown when a `scene_video_versions` row's
 * `transcode_state !== 'completed'` (PRD-169 Requirement 1.10).
 *
 * The `<video>` element is NOT mounted while this overlay is rendered —
 * callsites pick `<VideoPlayer>` vs `<TranscodeOverlay>` based on state.
 */

import type { TranscodeState } from "@/components/domain/TranscodeStatusBadge";
import { Button, Spinner } from "@/components/primitives";
import { api } from "@/lib/api";
import { AlertTriangle, RefreshCw } from "@/tokens/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface TranscodeOverlayProps {
  state: TranscodeState;
  error?: string | null;
  startedAt?: string | null;
  /** Transcode job id — required to offer retry. */
  jobId?: number | null;
  /** Whether the current user has permission to retry failed jobs. */
  canRetry?: boolean;
  /** Optional override for the invalidated query keys on retry success. */
  invalidateKeys?: Array<readonly unknown[]>;
  /** Owning SVV id, used for the default query invalidation. */
  svvId?: number;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

export function TranscodeOverlay({
  state,
  error,
  startedAt,
  jobId,
  canRetry = false,
  invalidateKeys,
  svvId,
}: TranscodeOverlayProps) {
  const qc = useQueryClient();

  const retry = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error("No job id");
      }
      return api.post(`/transcode-jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      const keys: Array<readonly unknown[]> =
        invalidateKeys ??
        [["scene-video-versions"], svvId != null ? ["scene-video-version", svvId] : []].filter(
          (k) => k.length > 0,
        );
      for (const key of keys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });

  if (state === "pending" || state === "in_progress") {
    return (
      <div
        aria-live="polite"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-surface-primary)] p-6 text-center text-[var(--color-text-secondary)]"
      >
        <Spinner size="lg" />
        <p className="text-base text-[var(--color-text-primary)]">
          This video is being processed for browser playback.
        </p>
        {startedAt ? <p className="text-xs">Started {formatRelative(startedAt)}</p> : null}
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div
        aria-live="polite"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-surface-primary)] p-6 text-center"
      >
        <AlertTriangle size={32} className="text-[var(--color-action-danger)]" aria-hidden="true" />
        <p className="text-base text-[var(--color-text-primary)]">Transcoding failed.</p>
        {error ? (
          <pre className="max-w-full whitespace-pre-wrap text-xs text-[var(--color-text-secondary)]">
            {error}
          </pre>
        ) : null}
        {canRetry && jobId ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
            {retry.isPending ? "Retrying..." : "Retry"}
          </Button>
        ) : null}
        {retry.isError ? (
          <p className="text-xs text-[var(--color-action-danger)]">
            Retry failed. Try again in a moment.
          </p>
        ) : null}
      </div>
    );
  }

  // state === "completed" — overlay should not be rendered.
  return null;
}
