/**
 * Custom hook for detecting swipe gestures on touch-enabled devices (PRD-55).
 *
 * Tracks touch start/move/end events to determine swipe direction and
 * progress. Returns the current swipe direction and a 0-1 progress value
 * for visual feedback during the drag.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { SWIPE_THRESHOLD_X, SWIPE_THRESHOLD_Y } from "../types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type SwipeDirection = "left" | "right" | "up" | null;

interface SwipeCallbacks {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onSwipeUp: () => void;
}

interface SwipeState {
  swipeDirection: SwipeDirection;
  swipeProgress: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Minimum velocity (px/ms) to count as an intentional swipe. */
const MIN_VELOCITY = 0.3;

/** Maximum distance used for normalizing progress to 0-1. */
const MAX_SWIPE_DISTANCE = 200;

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  callbacks: SwipeCallbacks,
): SwipeState {
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    setSwipeDirection(null);
    setSwipeProgress(0);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine primary axis
    if (absDx > absDy && absDx > 10) {
      const direction: SwipeDirection = dx > 0 ? "right" : "left";
      const progress = Math.min(absDx / MAX_SWIPE_DISTANCE, 1);
      setSwipeDirection(direction);
      setSwipeProgress(progress);
    } else if (absDy > absDx && dy < 0 && absDy > 10) {
      setSwipeDirection("up");
      setSwipeProgress(Math.min(absDy / MAX_SWIPE_DISTANCE, 1));
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    const elapsed = Date.now() - startTime.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Check velocity to prevent accidental swipes
    const velocity = Math.max(absDx, absDy) / Math.max(elapsed, 1);

    if (velocity >= MIN_VELOCITY) {
      if (absDx > absDy && absDx >= SWIPE_THRESHOLD_X) {
        if (dx > 0) {
          callbacksRef.current.onSwipeRight();
        } else {
          callbacksRef.current.onSwipeLeft();
        }
      } else if (absDy > absDx && dy < 0 && absDy >= SWIPE_THRESHOLD_Y) {
        callbacksRef.current.onSwipeUp();
      }
    }

    setSwipeDirection(null);
    setSwipeProgress(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { swipeDirection, swipeProgress };
}
