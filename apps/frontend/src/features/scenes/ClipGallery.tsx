import { ContextLoader, Tooltip } from "@/components/primitives";
import { useCallback, useMemo, useState } from "react";

import { EmptyState } from "@/components/domain/EmptyState";
import { Button } from "@/components/primitives/Button";
import { getStreamUrl } from "@/features/video-player";
import { Play, Upload } from "@/tokens/icons";

import { GenerationTerminal } from "@/features/generation/GenerationTerminal";
import { InfrastructurePanel } from "@/features/generation/InfrastructurePanel";

import { ClipCard } from "./ClipCard";
import { ClipPlaybackModal } from "./ClipPlaybackModal";
import { ClipRejectionDialog } from "./ClipRejectionDialog";
import { ImportClipDialog } from "./ImportClipDialog";
import { ResumeFromDialog } from "./ResumeFromDialog";
import {
  useApproveClip,
  useDeleteClip,
  useRejectClip,
  useResumeFromClip,
  useSceneVersions,
  useSetFinalClip,
  useUnapproveClip,
} from "./hooks/useClipManagement";
import type { SceneVideoVersion } from "./types";

interface ClipGalleryProps {
  sceneId: number;
  onGenerate?: () => void;
  generateLoading?: boolean;
  generateDisabled?: boolean;
  /** Reason generation is disabled — shown as tooltip. */
  generateDisabledReason?: string;
  /** Whether the scene is currently generating — enables real-time log polling. */
  isGenerating?: boolean;
  /** Extra actions rendered on the left side of the toolbar, after the title. */
  leftActions?: React.ReactNode;
}

export function ClipGallery({ sceneId, onGenerate, generateLoading, generateDisabled, generateDisabledReason, isGenerating, leftActions }: ClipGalleryProps) {
  const { data: clips, isLoading, isError, refetch } = useSceneVersions(sceneId);
  const approveMutation = useApproveClip(sceneId);
  const unapproveMutation = useUnapproveClip(sceneId);
  const rejectMutation = useRejectClip(sceneId);
  const setFinalMutation = useSetFinalClip(sceneId);
  const resumeFromMutation = useResumeFromClip(sceneId);
  const deleteMutation = useDeleteClip(sceneId);

  const handleExportClip = useCallback((clipId: number) => {
    const url = getStreamUrl("version", clipId, "full");
    const a = document.createElement("a");
    a.href = url;
    a.download = `clip-${clipId}.mp4`;
    a.click();
  }, []);

  const [playingClip, setPlayingClip] = useState<SceneVideoVersion | null>(null);
  const [rejectingClipId, setRejectingClipId] = useState<number | null>(null);
  const [resumeClip, setResumeClip] = useState<SceneVideoVersion | null>(null);
  const [showImport, setShowImport] = useState(false);

  // An approved clip is resume-eligible if there is at least one rejected
  // clip at a higher version number.
  const resumeEligibleIds = useMemo(() => {
    if (!clips?.length) return new Set<number>();
    const sorted = [...clips].sort((a, b) => a.version_number - b.version_number);
    const eligible = new Set<number>();
    let hasRejectedAfter = false;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const item = sorted[i];
      if (!item) continue;
      if (item.qa_status === "rejected") hasRejectedAfter = true;
      if (item.qa_status === "approved" && hasRejectedAfter) eligible.add(item.id);
    }
    return eligible;
  }, [clips]);

  const clipsToDiscardCount = useMemo(() => {
    if (!resumeClip || !clips) return 0;
    return clips.filter((c) => c.version_number > resumeClip.version_number).length;
  }, [resumeClip, clips]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ContextLoader size={64} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-[var(--color-action-danger)]">Failed to load clips</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
          Clips
        </span>
        {clips && clips.length > 0 && (
          <span className="text-[10px] font-mono text-[var(--color-data-cyan)]">{clips.length}</span>
        )}
        {leftActions}
        <div className="flex-1" />
        <div className="flex items-center gap-[var(--spacing-2)]">
          {onGenerate && (
            generateDisabled && generateDisabledReason ? (
              <Tooltip content={generateDisabledReason}>
                <Button
                  size="xs"
                  onClick={onGenerate}
                  loading={generateLoading}
                  disabled={generateDisabled}
                  icon={<Play size={12} />}
                >
                  Generate New
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="xs"
                onClick={onGenerate}
                loading={generateLoading}
                disabled={generateDisabled}
                icon={<Play size={12} />}
              >
                Generate New
              </Button>
            )
          )}
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setShowImport(true)}
            icon={<Upload size={12} />}
          >
            Import Clip
          </Button>
        </div>
      </div>

      {/* Generation infrastructure + terminal */}
      <InfrastructurePanel />
      <GenerationTerminal sceneId={sceneId} isGenerating={isGenerating ?? false} />

      {/* Clip list or empty state */}
      {!clips?.length ? (
        <EmptyState
          title="No clips"
          description="Generate a video or import a clip to get started."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onPlay={(c) => setPlayingClip(c)}
              onApprove={(id) => approveMutation.mutate(id)}
              onUnapprove={(id) => unapproveMutation.mutate(id)}
              onReject={(id) => setRejectingClipId(id)}
              onExport={handleExportClip}
              onSetFinal={(id) => setFinalMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === clip.id}
              onResumeFrom={(id) => {
                const c = clips.find((x) => x.id === id);
                if (c) setResumeClip(c);
              }}
              showResumeButton={resumeEligibleIds.has(clip.id)}
              isApproving={approveMutation.isPending && approveMutation.variables === clip.id}
              isUnapproving={unapproveMutation.isPending && unapproveMutation.variables === clip.id}
              isRejecting={
                rejectMutation.isPending && rejectMutation.variables?.versionId === clip.id
              }
              annotationCount={clip.annotation_count}
            />
          ))}
        </div>
      )}

      {/* Rejection dialog */}
      <ClipRejectionDialog
        isOpen={rejectingClipId !== null}
        onClose={() => setRejectingClipId(null)}
        onSubmit={(reason, notes) => {
          if (rejectingClipId === null) return;
          rejectMutation.mutate(
            {
              versionId: rejectingClipId,
              input: { reason, notes },
            },
            { onSuccess: () => setRejectingClipId(null) },
          );
        }}
        isSubmitting={rejectMutation.isPending}
      />

      {/* Resume dialog */}
      <ResumeFromDialog
        isOpen={resumeClip !== null}
        onClose={() => setResumeClip(null)}
        onConfirm={() => {
          if (!resumeClip) return;
          resumeFromMutation.mutate(resumeClip.id, {
            onSuccess: () => setResumeClip(null),
          });
        }}
        clip={resumeClip}
        clipsToDiscard={clipsToDiscardCount}
        isSubmitting={resumeFromMutation.isPending}
      />

      {/* Import dialog */}
      <ImportClipDialog
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        sceneId={sceneId}
        onSuccess={() => {}}
      />

      {/* Clip playback modal */}
      <ClipPlaybackModal
        clip={playingClip}
        onClose={() => setPlayingClip(null)}
      />
    </div>
  );
}
