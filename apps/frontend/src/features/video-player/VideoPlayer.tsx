import { useCallback, useEffect, useRef, useState } from "react";

import { ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { FrameCounter } from "./components/FrameCounter";
import { TimelineScrubber } from "./components/TimelineScrubber";
import { TransportControls } from "./components/TransportControls";
import { useABLoop } from "./hooks/use-ab-loop";
import { useAnnotationPlayback } from "./hooks/use-annotation-playback";
import { useVideoMetadata, getStreamUrl } from "./hooks/use-video-metadata";
import { useVideoPlayer } from "./hooks/use-video-player";
import type { PlaybackQuality, SourceType } from "./types";
import type { TimelineAnnotationRange } from "./components/TimelineScrubber";

/** Imperative control handle for VideoPlayer. */
export interface VideoPlayerControl {
  /** Set A-B loop to the given range, seek to start, and play. Pass null to clear. */
  loopRange: (range: TimelineAnnotationRange | null) => void;
}

interface VideoPlayerProps {
  sourceType: SourceType;
  sourceId: number;
  /** Initial quality level. */
  quality?: PlaybackQuality;
  autoPlay?: boolean;
  showControls?: boolean;
  /** Annotation frame ranges to highlight on the timeline. */
  annotationRanges?: TimelineAnnotationRange[];
  /** Imperative handle ref for controlling the player from outside (e.g. set loop range). */
  controlRef?: React.MutableRefObject<VideoPlayerControl | null>;
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
  annotationRanges,
  controlRef,
  onFrameChange,
  onPlayStateChange,
  className,
}: VideoPlayerProps) {
  const [quality, setQuality] = useState<PlaybackQuality>(initialQuality);
  const [looping, setLooping] = useState(false);
  const restoreTimeRef = useRef<number | null>(null);

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

  const annPlayback = useAnnotationPlayback({
    currentFrame: player.currentFrame,
    annotationRanges,
    setSpeed: player.setSpeed,
    currentSpeed: player.speed,
  });

  // Only expose annotation playback controls when ranges exist.
  const annotationPlayback = annotationRanges?.length ? annPlayback : null;

  // Expose imperative control handle to parent via ref — assigned every render, no effect needed.
  // This calls the EXACT same functions as the timeline's onAnnotationRangeClick handler.
  if (controlRef) {
    controlRef.current = {
      loopRange(range) {
        if (range) {
          loop.setInPoint(range.start);
          loop.setOutPoint(range.end);
          player.seekToFrame(range.start);
          player.play();
        } else {
          loop.clearLoop();
        }
      },
    };
  }

  const streamUrl = getStreamUrl(sourceType, sourceId, quality);
  const containerRef = useRef<HTMLDivElement>(null);

  // Double-click on video area toggles fullscreen
  const handleVideoDoubleClick = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  // YouTube-style keyboard controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          player.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Left: seek back 5 seconds
            player.seekToTime(Math.max(0, player.currentTime - 5));
          } else {
            // Left: step back one frame
            player.stepBackward();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Right: seek forward 5 seconds
            player.seekToTime(Math.min(player.duration, player.currentTime + 5));
          } else {
            // Right: step forward one frame
            player.stepForward();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          // Increase volume
          if (player.videoRef.current) {
            player.videoRef.current.volume = Math.min(1, player.videoRef.current.volume + 0.1);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          // Decrease volume
          if (player.videoRef.current) {
            player.videoRef.current.volume = Math.max(0, player.videoRef.current.volume - 0.1);
          }
          break;
        case "j":
          // Seek back 10 seconds
          e.preventDefault();
          player.seekToTime(Math.max(0, player.currentTime - 10));
          break;
        case "l":
          // Seek forward 10 seconds
          e.preventDefault();
          player.seekToTime(Math.min(player.duration, player.currentTime + 10));
          break;
        case "f":
          // Toggle fullscreen
          e.preventDefault();
          handleVideoDoubleClick();
          break;
        case "m":
          // Toggle mute
          e.preventDefault();
          if (player.videoRef.current) {
            player.videoRef.current.muted = !player.videoRef.current.muted;
          }
          break;
        case "Home":
        case "0":
          // Go to start
          e.preventDefault();
          player.seekToTime(0);
          break;
        case "End":
          // Go to end
          e.preventDefault();
          player.seekToTime(player.duration);
          break;
        case ",":
          // Previous frame (when paused)
          e.preventDefault();
          player.stepBackward();
          break;
        case ".":
          // Next frame (when paused)
          e.preventDefault();
          player.stepForward();
          break;
        case "<":
          // Decrease speed
          e.preventDefault();
          player.setSpeed(Math.max(0.25, player.speed - 0.25));
          break;
        case ">":
          // Increase speed
          e.preventDefault();
          player.setSpeed(Math.min(4, player.speed + 0.25));
          break;
        case "r":
          // Toggle loop
          e.preventDefault();
          setLooping((prev) => !prev);
          break;
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [player, handleVideoDoubleClick]);

  // Save current time before quality switch, restore after new source loads.
  const handleQualityChange = useCallback(
    (newQuality: PlaybackQuality) => {
      restoreTimeRef.current = player.currentTime;
      setQuality(newQuality);
    },
    [player.currentTime],
  );

  useEffect(() => {
    if (restoreTimeRef.current === null) return;
    const video = player.videoRef.current;
    if (!video) return;

    const savedTime = restoreTimeRef.current;
    function handleLoaded() {
      video!.currentTime = savedTime;
      restoreTimeRef.current = null;
    }

    video.addEventListener("loadedmetadata", handleLoaded, { once: true });
    return () => video.removeEventListener("loadedmetadata", handleLoaded);
  }, [quality, player.videoRef]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "relative flex flex-col bg-black rounded-[var(--radius-md)] overflow-hidden outline-none",
        className,
      )}
    >
      {/* Video element — click to play/pause, double-click to fullscreen */}
      <div className="relative">
        <video
          ref={player.videoRef}
          src={streamUrl}
          className="w-full aspect-video bg-black cursor-pointer"
          style={player.isReady ? undefined : { visibility: "hidden", position: "absolute" }}
          loop={looping}
          playsInline
          preload="metadata"
          onClick={player.togglePlay}
          onDoubleClick={handleVideoDoubleClick}
        />
        {/* Placeholder to preserve aspect ratio while video is hidden */}
        {!player.isReady && <div className="w-full aspect-video bg-black" />}
        {/* Loading overlay */}
        {!player.isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <ContextLoader size={32} />
          </div>
        )}
      </div>

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
            annotationRanges={annotationRanges}
            framerate={framerate}
            onSeek={player.seekToTime}
            annotationModeActive={annotationPlayback?.isEnabled && annotationPlayback?.isInZone}
            currentFrame={player.currentFrame}
            onAnnotationRangeClick={(range) => {
              loop.setInPoint(range.start);
              loop.setOutPoint(range.end);
              player.seekToFrame(range.start);
              player.play();
            }}
            className="px-[var(--spacing-2)]"
          />

          {/* Transport controls */}
          <TransportControls
            player={player}
            loop={loop}
            quality={quality}
            onQualityChange={handleQualityChange}
            annotationPlayback={annotationPlayback}
            looping={looping}
            onLoopToggle={() => setLooping((prev) => !prev)}
          />
        </div>
      )}
    </div>
  );
}
