/**
 * Sync-play coordinator hook (PRD-036).
 *
 * Synchronizes play/pause/seek/speed across multiple HTMLVideoElement refs.
 * Keeps all cells within 1 frame of each other by monitoring drift on each
 * animation frame and correcting lagging players.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Max allowable drift between players (in seconds) before correction. */
const MAX_DRIFT_SECONDS = 0.042; // ~1 frame at 24fps

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface SyncPlayControls {
  /** Play all synchronized players. */
  syncPlay: () => void;
  /** Pause all synchronized players. */
  syncPause: () => void;
  /** Seek all players to a specific time (seconds). */
  syncSeek: (time: number) => void;
  /** Set playback speed for all players. */
  syncSpeed: (speed: number) => void;
  /** Whether any player is currently playing. */
  isPlaying: boolean;
  /** Current playback speed. */
  speed: number;
  /** Current leader time (seconds) used for the shared timeline. */
  currentTime: number;
  /** Duration of the shortest video (shared timeline length). */
  duration: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getActiveVideos(
  refs: React.RefObject<HTMLVideoElement | null>[],
): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = [];
  for (const ref of refs) {
    if (ref.current) {
      videos.push(ref.current);
    }
  }
  return videos;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useSyncPlay(
  playerRefs: React.RefObject<HTMLVideoElement | null>[],
): SyncPlayControls {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(0);

  // Track the "leader" — we use the first ref as the reference clock.
  const leaderRef = playerRefs[0];

  // Compute shared duration (shortest of all loaded videos).
  useEffect(() => {
    const videos = getActiveVideos(playerRefs);
    if (videos.length === 0) return;

    function updateDuration() {
      const durations = getActiveVideos(playerRefs)
        .filter((v) => v.readyState >= 1)
        .map((v) => v.duration)
        .filter((d) => Number.isFinite(d));

      if (durations.length > 0) {
        setDuration(Math.min(...durations));
      }
    }

    for (const v of videos) {
      v.addEventListener("loadedmetadata", updateDuration);
    }
    updateDuration();

    return () => {
      for (const v of videos) {
        v.removeEventListener("loadedmetadata", updateDuration);
      }
    };
  }, [playerRefs]);

  // Drift correction loop — runs while playing.
  const driftCorrection = useCallback(() => {
    const leader = leaderRef?.current;
    if (!leader || leader.paused) return;

    const leaderTime = leader.currentTime;
    setCurrentTime(leaderTime);

    const videos = getActiveVideos(playerRefs);
    for (const video of videos) {
      if (video === leader) continue;
      const drift = Math.abs(video.currentTime - leaderTime);
      if (drift > MAX_DRIFT_SECONDS) {
        video.currentTime = leaderTime;
      }
    }

    rafRef.current = requestAnimationFrame(driftCorrection);
  }, [playerRefs, leaderRef]);

  // Clean up rAF on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const syncPlay = useCallback(() => {
    const videos = getActiveVideos(playerRefs);
    if (videos.length === 0) return;

    // Align all to leader time before starting.
    const leader = leaderRef?.current;
    const startTime = leader?.currentTime ?? 0;
    for (const video of videos) {
      video.currentTime = startTime;
    }

    // Start playback on all.
    const playPromises = videos.map((v) => v.play().catch(() => {}));
    void Promise.all(playPromises);

    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(driftCorrection);
  }, [playerRefs, leaderRef, driftCorrection]);

  const syncPause = useCallback(() => {
    const videos = getActiveVideos(playerRefs);
    for (const video of videos) {
      video.pause();
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
  }, [playerRefs]);

  const syncSeek = useCallback(
    (time: number) => {
      const videos = getActiveVideos(playerRefs);
      for (const video of videos) {
        video.currentTime = time;
      }
      setCurrentTime(time);
    },
    [playerRefs],
  );

  const syncSpeed = useCallback(
    (newSpeed: number) => {
      const clamped = Math.max(0.1, Math.min(4, newSpeed));
      const videos = getActiveVideos(playerRefs);
      for (const video of videos) {
        video.playbackRate = clamped;
        video.preservesPitch = true;
      }
      setSpeedState(clamped);
    },
    [playerRefs],
  );

  return {
    syncPlay,
    syncPause,
    syncSeek,
    syncSpeed,
    isPlaying,
    speed,
    currentTime,
    duration,
  };
}
