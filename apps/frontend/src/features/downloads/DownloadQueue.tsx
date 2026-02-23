/**
 * Download queue panel showing all model downloads with progress,
 * status badges, and action controls (PRD-104).
 */

import { useState } from "react";

import { Input } from "@/components/primitives";
import { Download, Plus } from "@/tokens/icons";

import { DownloadItem } from "./DownloadItem";
import {
  useCancelDownload,
  useCreateDownload,
  useDownloads,
  usePauseDownload,
  useResumeDownload,
  useRetryDownload,
} from "./hooks/use-downloads";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DownloadQueue() {
  const { data: downloads, isLoading } = useDownloads();
  const createDownload = useCreateDownload();
  const pauseDownload = usePauseDownload();
  const resumeDownload = useResumeDownload();
  const cancelDownload = useCancelDownload();
  const retryDownload = useRetryDownload();

  const [newUrl, setNewUrl] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    createDownload.mutate({ url: trimmed });
    setNewUrl("");
  }

  return (
    <div className="space-y-[var(--spacing-4)]">
      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Download size={20} className="text-[var(--color-text-muted)]" aria-hidden />
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Download Queue
        </h2>
      </div>

      {/* URL input form */}
      <form onSubmit={handleSubmit} className="flex gap-[var(--spacing-2)]">
        <div className="flex-1">
          <Input
            type="url"
            placeholder="Paste model URL (CivitAI, HuggingFace, or direct)..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={!newUrl.trim() || createDownload.isPending}
          className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Plus size={14} aria-hidden />
          Download
        </button>
      </form>

      {/* Download list */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading downloads...</p>
      ) : !downloads || downloads.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No downloads yet. Paste a model URL above to get started.
        </p>
      ) : (
        <div className="space-y-[var(--spacing-2)]">
          {downloads.map((dl) => (
            <DownloadItem
              key={dl.id}
              download={dl}
              onPause={(id) => pauseDownload.mutate(id)}
              onResume={(id) => resumeDownload.mutate(id)}
              onCancel={(id) => cancelDownload.mutate(id)}
              onRetry={(id) => retryDownload.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
