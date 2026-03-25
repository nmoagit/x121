import { useRef, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { ContextLoader } from "@/components/primitives";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDate } from "@/lib/format";
import { Ban, ChevronDown, ChevronRight, Layers, Play, RotateCcw } from "@/tokens/icons";
import { ArtifactTimeline } from "./ArtifactTimeline";
import { ClipQAActions } from "./ClipQAActions";
import { GenerationSnapshotPanel } from "./GenerationSnapshotPanel";
import { type SceneVideoVersion, isEmptyClip, isPurgedClip } from "./types";

/** Video thumbnail with ContextLoader overlay while loading. */
function VideoThumbnail({ clipId, onPlay }: { clipId: number; onPlay: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group/play relative h-16 w-24 shrink-0 rounded overflow-hidden bg-[var(--color-surface-tertiary)]"
    >
      <video
        ref={videoRef}
        src={getStreamUrl("version", clipId, "proxy")}
        className="absolute inset-0 w-full h-full object-cover"
        preload="metadata"
        muted
        onLoadedData={() => setLoaded(true)}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <ContextLoader size={16} />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
        <Play size={20} className="text-white" />
      </div>
    </button>
  );
}

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
  const sourceLabel = clip.source === "imported" ? "Imported" : "Generated";
  const hasSnapshot = clip.generation_snapshot != null && Object.keys(clip.generation_snapshot).length > 0;

  return (
    <div
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[#0d1117] hover:bg-[#161b22] ${
        clip.qa_status === "approved"
          ? "border-green-500"
          : clip.qa_status === "rejected"
            ? "border-red-500"
            : "border-[var(--color-border-default)]"
      }`}
    >
    <div className="flex items-center gap-4 p-3">
      {/* Clickable play area with video thumbnail */}
      {purged ? (
        <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded bg-[var(--color-surface-tertiary)]">
          <Ban size={20} className="text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <VideoThumbnail clipId={clip.id} onPlay={() => onPlay(clip)} />
      )}

      {/* Metadata */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-cyan-400">v{clip.version_number}</span>
          <span className="text-[var(--color-text-muted)]">{sourceLabel.toLowerCase()}</span>
          {clip.is_final && (
            <span className="text-green-400 font-medium">final</span>
          )}
          {purged && <span className="text-orange-400">purged</span>}
          {!purged && isEmptyClip(clip) && <span className="text-orange-400">empty</span>}
          {annotationCount > 0 && (
            <span className="text-orange-400">{annotationCount} annotated</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
          {clip.video_codec && (
            <><span className="uppercase">{clip.video_codec}</span><span className="opacity-30">|</span></>
          )}
          <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
          <span className="opacity-30">|</span>
          <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
          <span className="opacity-30">|</span>
          <span>{formatDate(clip.created_at)}</span>
        </div>
      </div>

      {/* QA Actions */}
      <div className="flex items-center gap-1">
        {!clip.is_final && clip.qa_status !== "rejected" && (
          <Button variant="ghost" size="xs" onClick={() => onSetFinal(clip.id)}>
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
              size="xs"
              onClick={() => { onDelete(clip.id); setConfirmDelete(false); }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </span>
        )}
        {showResumeButton && onResumeFrom && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onResumeFrom(clip.id)}
            icon={<RotateCcw size={12} />}
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
            className="flex w-full items-center gap-1 border-t border-[var(--color-border-default)]/30 px-3 py-1.5
              text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showSnapshot ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Generation Parameters
          </button>
          {showSnapshot && (
            <div className="border-t border-[var(--color-border-default)]/30 px-3 py-3">
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
            className="flex w-full items-center gap-1 border-t border-[var(--color-border-default)]/30 px-3 py-1.5
              text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showArtifacts ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Layers size={12} />
            Pipeline Artifacts
          </button>
          {showArtifacts && (
            <div className="border-t border-[var(--color-border-default)]/30 px-3 py-3">
              <ArtifactTimeline sceneId={clip.scene_id} versionId={clip.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
