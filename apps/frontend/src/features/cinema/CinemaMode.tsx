/**
 * Cinema Mode — borderless full-screen player with Ambilight glow (PRD-036).
 *
 * Uses the browser Fullscreen API for a distraction-free viewing experience.
 * Overlay controls auto-hide after 3 seconds of mouse inactivity.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { X } from "@/tokens/icons";

import {
  useVideoPlayer,
  useVideoMetadata,
  getStreamUrl,
  formatDuration,
} from "@/features/video-player";
import { useShortcut } from "@/features/shortcuts";

import { useAmbilight, AMBILIGHT_TRANSITION } from "./useAmbilight";
import { CinemaReviewControls } from "./CinemaReviewControls";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Auto-hide controls after this many ms of mouse inactivity. */
const CONTROLS_HIDE_DELAY_MS = 3000;

/** Playback quality used in cinema mode. */
const CINEMA_QUALITY = "proxy" as const;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CinemaModeProps {
  segmentId: number;
  onExit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onFlag: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CinemaMode({
  segmentId,
  onExit,
  onApprove,
  onReject,
  onFlag,
}: CinemaModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef(0);

  const [showControls, setShowControls] = useState(true);

  // Video metadata and player.
  const { data: metadata } = useVideoMetadata("segment", segmentId);
  const framerate = metadata?.framerate ?? 24;

  const player = useVideoPlayer({
    framerate,
    autoPlay: true,
  });

  const streamUrl = getStreamUrl("segment", segmentId, CINEMA_QUALITY);

  // Ambilight effect.
  const ambilight = useAmbilight(player.videoRef);

  /* -- Fullscreen management ------------------------------------------------ */

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      await el.requestFullscreen();
    } catch {
      // Fullscreen denied or not supported; continue without it.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore exit errors.
      }
    }
    onExit();
  }, [onExit]);

  // When the browser exits fullscreen (e.g. user presses Esc natively),
  // also exit cinema mode.
  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        onExit();
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [onExit]);

  // Enter fullscreen on mount.
  useEffect(() => {
    void enterFullscreen();
  }, [enterFullscreen]);

  /* -- Auto-hide controls -------------------------------------------------- */

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  const handleMouseMove = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  // Start the hide timer on mount.
  useEffect(() => {
    resetHideTimer();
    return () => {
      window.clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  /* -- Keyboard shortcuts -------------------------------------------------- */

  useShortcut(
    {
      id: "cinema.exit",
      key: "Escape",
      label: "Exit cinema mode",
      category: "general",
      action: () => void exitFullscreen(),
    },
    [exitFullscreen],
  );

  useShortcut(
    {
      id: "cinema.playPause",
      key: "Space",
      label: "Play / Pause",
      category: "playback",
      action: player.togglePlay,
    },
    [player.togglePlay],
  );

  useShortcut(
    {
      id: "cinema.seekForward",
      key: "ArrowRight",
      label: "Step forward",
      category: "playback",
      action: player.stepForward,
    },
    [player.stepForward],
  );

  useShortcut(
    {
      id: "cinema.seekBackward",
      key: "ArrowLeft",
      label: "Step backward",
      category: "playback",
      action: player.stepBackward,
    },
    [player.stepBackward],
  );

  return (
    <div
      ref={containerRef}
      data-testid="cinema-mode"
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
      style={{
        background: ambilight.gradient || "#000",
        transition: AMBILIGHT_TRANSITION,
      }}
    >
      {/* Video — centered, full viewport */}
      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={player.videoRef}
          src={streamUrl}
          className="max-w-full max-h-full object-contain"
          playsInline
          preload="metadata"
          onClick={player.togglePlay}
        />
      </div>

      {/* Overlay controls */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between pointer-events-none",
          "transition-opacity duration-[var(--duration-normal)]",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Top bar: exit button */}
        <div className="flex items-center justify-end p-[var(--spacing-4)] pointer-events-auto">
          <button
            type="button"
            onClick={() => void exitFullscreen()}
            className={cn(
              "p-[var(--spacing-2)] rounded-[var(--radius-md)]",
              "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]",
              "hover:bg-[var(--color-surface-tertiary)]",
              "transition-colors duration-[var(--duration-fast)]",
            )}
            title="Exit cinema mode (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Bottom bar: transport + review */}
        <div
          className={cn(
            "flex items-center justify-between",
            "px-[var(--spacing-4)] py-[var(--spacing-3)]",
            "bg-gradient-to-t from-black/80 to-transparent",
            "pointer-events-auto",
          )}
        >
          {/* Transport info */}
          <div className="flex items-center gap-[var(--spacing-3)]">
            <button
              type="button"
              onClick={player.togglePlay}
              className="text-[var(--color-text-primary)] hover:text-[var(--color-action-primary)] transition-colors"
              title={player.isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {player.isPlaying ? "Pause" : "Play"}
            </button>

            <span className="text-xs font-mono text-[var(--color-text-secondary)]">
              {formatDuration(player.currentTime)} / {formatDuration(player.duration)}
            </span>
          </div>

          {/* Review controls */}
          <CinemaReviewControls
            onApprove={onApprove}
            onReject={onReject}
            onFlag={onFlag}
          />
        </div>
      </div>
    </div>
  );
}

