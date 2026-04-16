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

  // Refs for synchronous access in the timeupdate listener.
  // State setters are async (batched), so the listener needs refs
  // to see the latest values immediately after they're set.
  const inPointRef = useRef<number | null>(null);
  const outPointRef = useRef<number | null>(null);

  const isLooping = inPoint !== null && outPoint !== null;

  // Listen for timeupdate to enforce the loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleTimeUpdate() {
      const inPt = inPointRef.current;
      const outPt = outPointRef.current;
      if (inPt === null || outPt === null) return;
      if (framerate <= 0) return;

      const outTime = frameToSeconds(outPt, framerate);
      if (video && video.currentTime >= outTime) {
        video.currentTime = frameToSeconds(inPt, framerate);
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoRef, framerate]);

  const setInPoint = useCallback((frame: number) => {
    inPointRef.current = frame;
    setInPointState(frame);
  }, []);

  const setOutPoint = useCallback((frame: number) => {
    outPointRef.current = frame;
    setOutPointState(frame);
  }, []);

  const clearLoop = useCallback(() => {
    inPointRef.current = null;
    outPointRef.current = null;
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
