/**
 * SequencePlayer -- plays scene clips sequentially in a modal overlay (PRD-109 A.2).
 *
 * Accepts the character's expanded scene settings (slots) and scenes,
 * resolves the final clip for each slot, then plays them in order.
 * Skipped slots (no final clip) are shown in the progress indicator.
 */

import { Badge, Button } from "@/components/primitives";
import type { ExpandedSceneSetting } from "@/features/scene-catalogue/types";
import { clipKeys } from "@/features/scenes/hooks/useClipManagement";
import { type Scene, type SceneVideoVersion, pickFinalClip, slotLabel } from "@/features/scenes/types";
import { formatDuration } from "@/features/video-player/frame-utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AlertCircle, Pause, Play, SkipForward, Square, X } from "@/tokens/icons";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SequencePlayerProps {
  slots: ExpandedSceneSetting[];
  scenes: Scene[];
  onClose: () => void;
}

/** Resolved clip info for a single slot in the sequence. */
interface ResolvedSlot {
  slot: ExpandedSceneSetting;
  label: string;
  scene: Scene | null;
  clip: SceneVideoVersion | null;
  skipped: boolean;
}

/* --------------------------------------------------------------------------
   Hook: resolve clips for each slot via useQueries
   -------------------------------------------------------------------------- */

function useResolvedSlots(
  slots: ExpandedSceneSetting[],
  scenes: Scene[],
): { resolved: ResolvedSlot[]; isLoading: boolean } {
  // Map each slot to its best matching scene (highest id = latest import)
  const slotScenes = useMemo(() => {
    return slots.map((slot) => {
      const matched = scenes.filter(
        (s) => s.scene_type_id === slot.scene_type_id && s.track_id === (slot.track_id ?? null),
      );
      if (matched.length === 0) return null;
      return matched.reduce((a, b) => (b.id > a.id ? b : a));
    });
  }, [slots, scenes]);

  // Collect unique scene IDs for batch fetching
  const uniqueSceneIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of slotScenes) {
      if (s) ids.add(s.id);
    }
    return [...ids];
  }, [slotScenes]);

  // Batch-fetch versions for all scenes using useQueries
  const versionQueries = useQueries({
    queries: uniqueSceneIds.map((id) => ({
      queryKey: clipKeys.list(id),
      queryFn: () => api.get<SceneVideoVersion[]>(`/scenes/${id}/versions`),
      enabled: id > 0,
    })),
  });

  const isLoading = versionQueries.some((q) => q.isLoading);

  // Build sceneId -> clips map
  const clipMap = useMemo(() => {
    const map = new Map<number, SceneVideoVersion[]>();
    for (let i = 0; i < uniqueSceneIds.length; i++) {
      const data = versionQueries[i]?.data;
      if (data) {
        const id = uniqueSceneIds[i];
        if (id !== undefined) map.set(id, data);
      }
    }
    return map;
  }, [uniqueSceneIds, versionQueries]);

  const resolved = useMemo(() => {
    return slots.map((slot, idx) => {
      const scene = slotScenes[idx] ?? null;
      const label = slotLabel(slot);

      if (!scene) {
        return { slot, label, scene: null, clip: null, skipped: true };
      }

      const versions = clipMap.get(scene.id) ?? [];
      const clip = pickFinalClip(versions);

      return { slot, label, scene, clip, skipped: clip === null };
    });
  }, [slots, slotScenes, clipMap]);

  return { resolved, isLoading };
}

/* --------------------------------------------------------------------------
   SequencePlayer component
   -------------------------------------------------------------------------- */

export function SequencePlayer({ slots, scenes, onClose }: SequencePlayerProps) {
  const { resolved, isLoading } = useResolvedSlots(slots, scenes);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Playable slots (not skipped)
  const playableIndices = useMemo(
    () => resolved.map((r, i) => (r.skipped ? -1 : i)).filter((i) => i >= 0),
    [resolved],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const currentSlot = resolved[currentIndex];
  const totalSlots = resolved.length;
  const playableCount = playableIndices.length;

  // Find next playable index from a given position
  const findNextPlayable = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex + 1; i < resolved.length; i++) {
        if (!resolved[i]?.skipped) return i;
      }
      return null;
    },
    [resolved],
  );

  // Find first playable index
  const firstPlayable = useMemo(() => {
    for (let i = 0; i < resolved.length; i++) {
      if (!resolved[i]?.skipped) return i;
    }
    return null;
  }, [resolved]);

  // Start playback
  const startPlayback = useCallback(() => {
    if (firstPlayable === null) return;
    setCurrentIndex(firstPlayable);
    setHasStarted(true);
    setIsPlaying(true);
    setIsFinished(false);
  }, [firstPlayable]);

  // When clip ends, advance to next
  const handleEnded = useCallback(() => {
    const next = findNextPlayable(currentIndex);
    if (next !== null) {
      setCurrentIndex(next);
    } else {
      setIsPlaying(false);
      setIsFinished(true);
    }
  }, [currentIndex, findNextPlayable]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!hasStarted) {
      startPlayback();
      return;
    }
    setIsPlaying((p) => !p);
  }, [hasStarted, startPlayback]);

  // Stop playback
  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setHasStarted(false);
    setIsFinished(false);
    if (firstPlayable !== null) setCurrentIndex(firstPlayable);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [firstPlayable]);

  // Skip to next clip
  const handleSkipNext = useCallback(() => {
    const next = findNextPlayable(currentIndex);
    if (next !== null) {
      setCurrentIndex(next);
    }
  }, [currentIndex, findNextPlayable]);

  // Sync video element with play state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex triggers re-play when clip changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying && hasStarted && currentSlot && !currentSlot.skipped) {
      video.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, hasStarted, currentSlot, currentIndex]);

  // Keyboard: space to toggle, escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, togglePlay]);

  // Progress: which playable index are we at?
  const currentPlayableIndex = playableIndices.indexOf(currentIndex);

  const handleBackdropClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("target" in e && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[var(--color-surface-overlay)] backdrop-blur-sm",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropClick}
    >
      <div
        className={cn(
          "relative w-full max-w-3xl mx-[var(--spacing-4)]",
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
          "rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]",
          "flex flex-col overflow-hidden",
          "animate-[scaleIn_var(--duration-fast)_var(--ease-default)]",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--spacing-4)] py-[var(--spacing-3)] border-b border-[var(--color-border-default)]">
          <div className="flex items-center gap-[var(--spacing-3)]">
            <h2 className="text-base font-semibold">Sequence Player</h2>
            {hasStarted && !isFinished && currentSlot && (
              <Badge variant="info" size="sm">
                Scene {currentIndex + 1} of {totalSlots}
              </Badge>
            )}
            {isFinished && (
              <Badge variant="success" size="sm">
                Complete
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={20} />}
            onClick={onClose}
            aria-label="Close"
          />
        </div>

        {/* Video area */}
        <div className="bg-black flex items-center justify-center min-h-[300px]">
          {isLoading ? (
            <p className="text-[var(--color-text-muted)] text-sm">Loading clips...</p>
          ) : playableCount === 0 ? (
            <div className="flex flex-col items-center gap-[var(--spacing-3)] text-[var(--color-text-muted)]">
              <AlertCircle size={32} />
              <p className="text-sm">No final clips available to play.</p>
            </div>
          ) : !hasStarted && !isFinished ? (
            <div className="flex flex-col items-center gap-[var(--spacing-3)]">
              <p className="text-[var(--color-text-muted)] text-sm">
                {playableCount} clip{playableCount !== 1 ? "s" : ""} ready
                {resolved.length - playableCount > 0 &&
                  ` (${resolved.length - playableCount} skipped)`}
              </p>
              <Button variant="primary" size="md" icon={<Play size={16} />} onClick={startPlayback}>
                Play Sequence
              </Button>
            </div>
          ) : (
            // biome-ignore lint/a11y/useMediaCaption: scene clips have no caption tracks
            <video
              ref={videoRef}
              key={currentSlot?.clip?.file_path}
              src={currentSlot?.clip?.file_path ?? undefined}
              className="w-full aspect-video bg-black"
              playsInline
              preload="auto"
              onEnded={handleEnded}
            />
          )}
        </div>

        {/* Now-playing label */}
        {hasStarted && currentSlot && !isFinished && (
          <div className="px-[var(--spacing-4)] py-[var(--spacing-2)] border-t border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {currentSlot.label}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {currentSlot.clip?.duration_secs != null &&
                  formatDuration(currentSlot.clip.duration_secs)}
                {currentSlot.clip && <> &middot; v{currentSlot.clip.version_number}</>}
              </span>
            </div>
          </div>
        )}

        {/* Transport controls */}
        <div className="flex items-center justify-center gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-3)] border-t border-[var(--color-border-default)]">
          <Button
            variant="ghost"
            size="sm"
            icon={<Square size={14} />}
            onClick={handleStop}
            disabled={!hasStarted && !isFinished}
          >
            Stop
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={isPlaying ? <Pause size={14} /> : <Play size={14} />}
            onClick={togglePlay}
            disabled={playableCount === 0 || isLoading}
          >
            {!hasStarted ? "Play" : isPlaying ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<SkipForward size={14} />}
            onClick={handleSkipNext}
            disabled={!hasStarted || isFinished || findNextPlayable(currentIndex) === null}
          >
            Next
          </Button>
        </div>

        {/* Progress track */}
        {resolved.length > 0 && (
          <div className="px-[var(--spacing-4)] pb-[var(--spacing-3)]">
            <div className="flex gap-[var(--spacing-1)]">
              {resolved.map((r, idx) => {
                const isCurrent = hasStarted && idx === currentIndex && !isFinished;
                const isPast = isFinished || (hasStarted && idx < currentIndex);

                return (
                  <div
                    key={`${r.slot.scene_type_id}-${r.slot.track_id ?? "none"}`}
                    title={`${r.label}${r.skipped ? " (skipped)" : ""}`}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors duration-200",
                      r.skipped
                        ? "bg-[var(--color-surface-tertiary)]"
                        : isCurrent
                          ? "bg-[var(--color-action-primary)]"
                          : isPast
                            ? "bg-[var(--color-action-success)]"
                            : "bg-[var(--color-border-secondary)]",
                    )}
                  />
                );
              })}
            </div>
            {hasStarted && !isFinished && (
              <p className="text-xs text-[var(--color-text-muted)] mt-[var(--spacing-1)] text-center">
                Playing clip {currentPlayableIndex + 1} of {playableCount}
              </p>
            )}
            {isFinished && (
              <p className="text-xs text-[var(--color-text-muted)] mt-[var(--spacing-1)] text-center">
                Sequence complete -- {playableCount} clip{playableCount !== 1 ? "s" : ""} played
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
