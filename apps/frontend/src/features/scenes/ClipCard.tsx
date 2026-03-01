import { Button } from "@/components/primitives/Button";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes } from "@/lib/format";
import { Clapperboard, RotateCcw, Star, Upload } from "lucide-react";
import { ClipQAActions } from "./ClipQAActions";
import type { SceneVideoVersion } from "./types";

interface ClipCardProps {
  clip: SceneVideoVersion;
  onPlay: (clip: SceneVideoVersion) => void;
  onApprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  onSetFinal: (clipId: number) => void;
  onResumeFrom?: (clipId: number) => void;
  showResumeButton: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export function ClipCard({
  clip,
  onPlay,
  onApprove,
  onReject,
  onSetFinal,
  onResumeFrom,
  showResumeButton,
  isApproving,
  isRejecting,
}: ClipCardProps) {
  const sourceIcon = clip.source === "imported" ? <Upload size={14} /> : <Clapperboard size={14} />;
  const sourceLabel = clip.source === "imported" ? "Imported" : "Generated";

  return (
    <div
      className="flex items-center gap-4 rounded-lg border p-4 transition-colors
        border-[var(--color-border-default)] bg-[var(--color-surface-primary)]
        hover:bg-[var(--color-surface-secondary)]"
    >
      {/* Clickable play area */}
      <button
        type="button"
        onClick={() => onPlay(clip)}
        className="flex h-16 w-24 shrink-0 items-center justify-center rounded
          bg-[var(--color-surface-tertiary)]"
      >
        <Clapperboard size={24} className="text-[var(--color-text-muted)]" />
      </button>

      {/* Metadata */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            v{clip.version_number}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs
              bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"
          >
            {sourceIcon} {sourceLabel}
          </span>
          {clip.is_final && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium
                bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
            >
              <Star size={12} /> Final
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
          <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
          <span>{new Date(clip.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* QA Actions */}
      <div className="flex items-center gap-2">
        <ClipQAActions
          clip={clip}
          onApprove={onApprove}
          onReject={onReject}
          isApproving={isApproving}
          isRejecting={isRejecting}
        />
        {!clip.is_final && clip.qa_status !== "rejected" && (
          <Button variant="ghost" size="sm" onClick={() => onSetFinal(clip.id)}>
            Set Final
          </Button>
        )}
        {showResumeButton && onResumeFrom && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onResumeFrom(clip.id)}
            icon={<RotateCcw size={14} />}
          >
            Resume
          </Button>
        )}
      </div>
    </div>
  );
}
