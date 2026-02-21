import { useCallback, useEffect, useRef, useState } from "react";

import { frameToSeconds } from "../frame-utils";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ABLoopControls {
  /** In-point frame number, or null if not set. */
  inPoint: number | null;
  /** Out-point frame number, or null if not set. */
  outPoint: number | null;
  /** Whether the loop is currently active. */
  isLooping: boolean;
  /** Set the in-point to the given frame. */
  setInPoint: (frame: number) => void;
  /** Set the out-point to the given frame. */
  setOutPoint: (frame: number) => void;
  /** Clear both in and out points. */
  clearLoop: () => void;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/**
 * A-B loop hook for the video player.
 *
 * When both in-point and out-point are set, the video loops between them.
 * The hook listens to `timeupdate` events and seeks back to the in-point
 * when playback reaches the out-point.
 */
export function useABLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  framerate: number,
): ABLoopControls {
  const [inPoint, setInPointState] = useState<number | null>(null);
  const [outPoint, setOutPointState] = useState<number | null>(null);
  const isLooping = inPoint !== null && outPoint !== null;
  const loopActiveRef = useRef(false);

  // Keep ref in sync.
  useEffect(() => {
    loopActiveRef.current = isLooping;
  }, [isLooping]);

  // Listen for timeupdate to enforce the loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleTimeUpdate() {
      if (!loopActiveRef.current || outPoint === null || inPoint === null) return;
      if (framerate <= 0) return;

      const outTime = frameToSeconds(outPoint, framerate);
      if (video && video.currentTime >= outTime) {
        video.currentTime = frameToSeconds(inPoint, framerate);
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoRef, inPoint, outPoint, framerate]);

  const setInPoint = useCallback((frame: number) => {
    setInPointState(frame);
  }, []);

  const setOutPoint = useCallback((frame: number) => {
    setOutPointState(frame);
  }, []);

  const clearLoop = useCallback(() => {
    setInPointState(null);
    setOutPointState(null);
  }, []);

  return {
    inPoint,
    outPoint,
    isLooping,
    setInPoint,
    setOutPoint,
    clearLoop,
  };
}
