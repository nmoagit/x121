import { useState } from "react";

import { cn } from "@/lib/cn";

import { FrameCounter } from "./components/FrameCounter";
import { TimelineScrubber } from "./components/TimelineScrubber";
import { TransportControls } from "./components/TransportControls";
import { useABLoop } from "./hooks/use-ab-loop";
import { useVideoMetadata, getStreamUrl } from "./hooks/use-video-metadata";
import { useVideoPlayer } from "./hooks/use-video-player";
import type { PlaybackQuality, SourceType } from "./types";

interface VideoPlayerProps {
  sourceType: SourceType;
  sourceId: number;
  /** Initial quality level. */
  quality?: PlaybackQuality;
  autoPlay?: boolean;
  showControls?: boolean;
  onFrameChange?: (frame: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  className?: string;
}

export function VideoPlayer({
  sourceType,
  sourceId,
  quality: initialQuality = "proxy",
  autoPlay = false,
  showControls = true,
  onFrameChange,
  onPlayStateChange,
  className,
}: VideoPlayerProps) {
  const [quality, setQuality] = useState<PlaybackQuality>(initialQuality);

  const { data: metadata } = useVideoMetadata(sourceType, sourceId);
  const framerate = metadata?.framerate ?? 24;
  const totalFrames = metadata?.total_frames ?? 0;

  const player = useVideoPlayer({
    framerate,
    autoPlay,
    onFrameChange,
    onPlayStateChange,
  });

  const loop = useABLoop(player.videoRef, framerate);

  const streamUrl = getStreamUrl(sourceType, sourceId, quality);

  return (
    <div
      className={cn(
        "relative flex flex-col bg-black rounded-[var(--radius-md)] overflow-hidden",
        className,
      )}
    >
      {/* Video element */}
      <video
        ref={player.videoRef}
        src={streamUrl}
        className="w-full aspect-video bg-black"
        playsInline
        preload="metadata"
        onClick={player.togglePlay}
      />

      {/* Controls overlay */}
      {showControls && (
        <div className="flex flex-col bg-[var(--color-surface-primary)]/90 backdrop-blur-sm">
          {/* Frame counter */}
          <FrameCounter
            currentFrame={player.currentFrame}
            totalFrames={totalFrames}
            currentTime={player.currentTime}
            duration={player.duration}
            framerate={framerate}
          />

          {/* Timeline scrubber */}
          <TimelineScrubber
            currentTime={player.currentTime}
            duration={player.duration}
            inPoint={loop.inPoint}
            outPoint={loop.outPoint}
            framerate={framerate}
            onSeek={player.seekToTime}
            className="px-[var(--spacing-2)]"
          />

          {/* Transport controls */}
          <TransportControls
            player={player}
            loop={loop}
            quality={quality}
            onQualityChange={setQuality}
          />
        </div>
      )}
    </div>
  );
}
