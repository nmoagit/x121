import { Badge, Button } from "@/components/primitives";
import { Card, Modal } from "@/components/composite";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes } from "@/lib/format";
import { ChevronRight, Play } from "@/tokens/icons";
import { useState } from "react";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { useVersionArtifacts } from "./hooks/useArtifacts";
import {
  ARTIFACT_ROLE_LABEL,
  ARTIFACT_ROLE_VARIANT,
} from "./types";
import type { SceneVideoVersionArtifact } from "./types";

interface ArtifactTimelineProps {
  sceneId: number;
  versionId: number;
}

export function ArtifactTimeline({ sceneId, versionId }: ArtifactTimelineProps) {
  const { data: artifacts, isLoading } = useVersionArtifacts(sceneId, versionId);
  const [playingArtifact, setPlayingArtifact] = useState<SceneVideoVersionArtifact | null>(null);

  if (isLoading || !artifacts || artifacts.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-start gap-2 overflow-x-auto pb-1">
        {artifacts.map((artifact, index) => (
          <div key={artifact.id} className="flex shrink-0 items-center gap-2">
            {index > 0 && (
              <ChevronRight
                size={16}
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            )}
            <Card elevation="flat" padding="sm" className="w-48">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={ARTIFACT_ROLE_VARIANT[artifact.role]}
                    size="sm"
                  >
                    {ARTIFACT_ROLE_LABEL[artifact.role]}
                  </Badge>
                  {artifact.file_purged ? (
                    <Badge variant="warning" size="sm">Purged</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Play size={14} />}
                      onClick={() => setPlayingArtifact(artifact)}
                      title="Play artifact"
                      className="!p-1"
                    />
                  )}
                </div>
                <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                  {artifact.label}
                </span>
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  {artifact.duration_secs != null && (
                    <span>{formatDuration(artifact.duration_secs)}</span>
                  )}
                  {artifact.file_size_bytes != null && (
                    <span>{formatBytes(artifact.file_size_bytes)}</span>
                  )}
                  {artifact.width != null && artifact.height != null && (
                    <span>
                      {artifact.width}x{artifact.height}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Artifact playback modal */}
      <Modal
        open={playingArtifact !== null}
        onClose={() => setPlayingArtifact(null)}
        title={playingArtifact ? `Artifact: ${playingArtifact.label}` : ""}
        size="3xl"
      >
        {playingArtifact && (
          <div className="flex flex-col gap-3">
            <VideoPlayer
              sourceType="version"
              sourceId={playingArtifact.version_id}
              autoPlay
              showControls
            />
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <Badge
                variant={ARTIFACT_ROLE_VARIANT[playingArtifact.role]}
                size="sm"
              >
                {ARTIFACT_ROLE_LABEL[playingArtifact.role]}
              </Badge>
              {playingArtifact.node_id && (
                <span>Node: {playingArtifact.node_id}</span>
              )}
              <span>{playingArtifact.file_path}</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
