import { Badge } from "@/components/primitives";
import { Button } from "@/components/primitives/Button";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDate } from "@/lib/format";
import { Ban, ChevronDown, ChevronRight, Clapperboard, Edit3, Layers, Play, RotateCcw, Star, Upload } from "@/tokens/icons";
import { useState } from "react";
import { ArtifactTimeline } from "./ArtifactTimeline";
import { ClipQAActions } from "./ClipQAActions";
import { GenerationSnapshotPanel } from "./GenerationSnapshotPanel";
import { type SceneVideoVersion, isEmptyClip, isPurgedClip } from "./types";

interface ClipCardProps {
  clip: SceneVideoVersion;
  onPlay: (clip: SceneVideoVersion) => void;
  onApprove: (clipId: number) => void;
  onUnapprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  onExport?: (clipId: number) => void;
  onSetFinal: (clipId: number) => void;
  onDelete?: (clipId: number) => void;
  onResumeFrom?: (clipId: number) => void;
  showResumeButton: boolean;
  isApproving?: boolean;
  isUnapproving?: boolean;
  isRejecting?: boolean;
  isDeleting?: boolean;
  /** Number of annotated frames on this clip (0 = no annotations). */
  annotationCount?: number;
}

export function ClipCard({
  clip,
  onPlay,
  onApprove,
  onUnapprove,
  onReject,
  onExport,
  onSetFinal,
  onDelete,
  onResumeFrom,
  showResumeButton,
  isApproving,
  isUnapproving,
  isRejecting,
  isDeleting,
  annotationCount = 0,
}: ClipCardProps) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const purged = isPurgedClip(clip);
  const sourceIcon = clip.source === "imported" ? <Upload size={14} /> : <Clapperboard size={14} />;
  const sourceLabel = clip.source === "imported" ? "Imported" : "Generated";
  const hasSnapshot = clip.generation_snapshot != null && Object.keys(clip.generation_snapshot).length > 0;

  return (
    <div
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        clip.qa_status === "approved"
          ? "border-[var(--color-action-success)]"
          : clip.qa_status === "rejected"
            ? "border-[var(--color-action-danger)]"
            : "border-[var(--color-border-default)]"
      }`}
    >
    <div className="flex items-center gap-4 p-4">
      {/* Clickable play area with video thumbnail */}
      {purged ? (
        <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded bg-[var(--color-surface-tertiary)]">
          <Ban size={20} className="text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPlay(clip)}
          className="group/play relative h-16 w-24 shrink-0 rounded overflow-hidden
            bg-[var(--color-surface-tertiary)]"
        >
          <video
            src={getStreamUrl("version", clip.id, "proxy")}
            className="absolute inset-0 w-full h-full object-cover"
            preload="metadata"
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
            <Play size={20} className="text-white" />
          </div>
        </button>
      )}

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
          {purged && (
            <Badge variant="warning" size="sm">Purged</Badge>
          )}
          {!purged && isEmptyClip(clip) && (
            <Badge variant="warning" size="sm">Empty file</Badge>
          )}
          {annotationCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-[var(--color-action-warning)] text-[var(--color-text-inverse)]">
              <Edit3 size={10} /> {annotationCount} annotated
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
          <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
          <span>{formatDate(clip.created_at)}</span>
        </div>
      </div>

      {/* QA Actions */}
      <div className="flex items-center gap-2">
        {!clip.is_final && clip.qa_status !== "rejected" && (
          <Button variant="ghost" size="sm" onClick={() => onSetFinal(clip.id)}>
            Set Final
          </Button>
        )}
        <ClipQAActions
          clip={clip}
          onApprove={onApprove}
          onUnapprove={onUnapprove}
          onReject={onReject}
          onExport={onExport}
          onDelete={onDelete ? () => setConfirmDelete(true) : undefined}
          isDeleteDisabled={clip.is_final}
          isApproving={isApproving}
          isUnapproving={isUnapproving}
          isRejecting={isRejecting}
        />
        {confirmDelete && onDelete && (
          <span className="flex items-center gap-1">
            <Button
              variant="danger"
              size="sm"
              onClick={() => { onDelete(clip.id); setConfirmDelete(false); }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </span>
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

      {/* Generation snapshot toggle */}
      {hasSnapshot && (
        <>
          <button
            type="button"
            onClick={() => setShowSnapshot((v) => !v)}
            className="flex w-full items-center gap-1 border-t border-[var(--color-border-default)] px-4 py-2
              text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showSnapshot ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Generation Parameters
          </button>
          {showSnapshot && (
            <div className="border-t border-[var(--color-border-default)] px-4 py-3">
              <GenerationSnapshotPanel snapshot={clip.generation_snapshot!} />
            </div>
          )}
        </>
      )}

      {/* Pipeline artifacts toggle */}
      {clip.source === "generated" && (
        <>
          <button
            type="button"
            onClick={() => setShowArtifacts((v) => !v)}
            className="flex w-full items-center gap-1 border-t border-[var(--color-border-default)] px-4 py-2
              text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showArtifacts ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Layers size={14} />
            Pipeline Artifacts
          </button>
          {showArtifacts && (
            <div className="border-t border-[var(--color-border-default)] px-4 py-3">
              <ArtifactTimeline sceneId={clip.scene_id} versionId={clip.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
