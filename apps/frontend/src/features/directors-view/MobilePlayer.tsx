/**
 * Full-screen mobile video player wrapper (PRD-55).
 *
 * Provides large touch-friendly play/pause controls and a scrub bar
 * optimized for finger interaction. Includes a pinch-to-zoom placeholder
 * for future implementation.
 */

import { useCallback, useRef, useState } from "react";

import { formatDuration } from "@/features/video-player";
import { cn } from "@/lib/cn";
import { Maximize2, Pause, Play, X } from "@/tokens/icons";

import { MIN_TOUCH_TARGET } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface MobilePlayerProps {
  videoUrl: string;
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MobilePlayer({ videoUrl, onClose }: MobilePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) setCurrentTime(video.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) setDuration(video.duration);
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const PlayPauseIcon = isPlaying ? Pause : Play;

  return (
    <div
      data-testid="mobile-player"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* Video element */}
      <div
        className="relative flex flex-1 items-center justify-center"
        onClick={handleToggleControls}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            togglePlay();
          }
        }}
        role="presentation"
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          playsInline
        />

        {/* Center play/pause overlay */}
        {showControls && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="absolute flex items-center justify-center rounded-full bg-[var(--color-surface-badge-overlay)] p-4"
            style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
          >
            <PlayPauseIcon size={48} className="text-white" />
          </button>
        )}

        {/* Pinch-to-zoom placeholder */}
        <div className="absolute right-3 top-3 rounded-[var(--radius-sm)] bg-black/40 px-2 py-1">
          <Maximize2 size={16} className="text-white/50" aria-hidden="true" />
        </div>
      </div>

      {/* Bottom controls */}
      {showControls && (
        <div className="flex flex-col gap-2 bg-black/80 px-4 pb-6 pt-3">
          {/* Scrub bar */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleScrub}
            aria-label="Video progress"
            className={cn(
              "w-full appearance-none bg-transparent",
              "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full",
              "[&::-webkit-slider-runnable-track]:bg-white/20",
              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
              "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
              "[&::-webkit-slider-thumb]:-mt-1.5",
            )}
            style={{
              background: `linear-gradient(to right, white ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
            }}
          />

          {/* Time display + close */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/70">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player"
              className="rounded-[var(--radius-sm)] p-2 text-white/70 hover:text-white"
              style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

