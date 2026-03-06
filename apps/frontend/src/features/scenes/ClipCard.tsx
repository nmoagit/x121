import { Badge } from "@/components/primitives";
import { Button } from "@/components/primitives/Button";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDate } from "@/lib/format";
import { ChevronDown, ChevronRight, Clapperboard, Layers, RotateCcw, Star, Upload } from "@/tokens/icons";
import { useState } from "react";
import { ArtifactTimeline } from "./ArtifactTimeline";
import { ClipQAActions } from "./ClipQAActions";
import { type SceneVideoVersion, isEmptyClip } from "./types";

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
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const sourceIcon = clip.source === "imported" ? <Upload size={14} /> : <Clapperboard size={14} />;
  const sourceLabel = clip.source === "imported" ? "Imported" : "Generated";
  const hasSnapshot = clip.generation_snapshot != null && Object.keys(clip.generation_snapshot).length > 0;

  return (
    <div
      className="rounded-lg border transition-colors
        border-[var(--color-border-default)] bg-[var(--color-surface-primary)]
        hover:bg-[var(--color-surface-secondary)]"
    >
    <div className="flex items-center gap-4 p-4">
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
          {isEmptyClip(clip) && (
            <Badge variant="warning" size="sm">Empty file</Badge>
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
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {Object.entries(clip.generation_snapshot!).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="font-medium text-[var(--color-text-secondary)]">{key}</dt>
                    <dd className="text-[var(--color-text-primary)] break-all">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
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
