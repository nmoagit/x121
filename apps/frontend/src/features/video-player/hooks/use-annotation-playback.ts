/**
 * Annotation playback mode hook (PRD-152).
 *
 * Automatically switches playback speed when the playhead enters/exits
 * annotation frame ranges. Merges overlapping ranges into contiguous zones.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TimelineAnnotationRange } from "../components/TimelineScrubber";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface UseAnnotationPlaybackOptions {
  /** Current frame number from the video player. */
  currentFrame: number;
  /** Annotation frame ranges passed to the player. */
  annotationRanges: TimelineAnnotationRange[] | undefined;
  /** Callback to set the video playback speed. */
  setSpeed: (speed: number) => void;
  /** Current playback speed from the player. */
  currentSpeed: number;
}

export interface AnnotationPlaybackControls {
  /** Whether annotation playback mode is enabled. */
  isEnabled: boolean;
  /** Toggle annotation mode on/off. */
  toggle: () => void;
  /** The configured slow-motion speed. */
  slowSpeed: number;
  /** Change the slow-motion speed preset. */
  setSlowSpeed: (speed: number) => void;
  /** Whether the playhead is currently inside an annotation zone. */
  isInZone: boolean;
  /** Merged annotation zones (for timeline glow). */
  mergedZones: { start: number; end: number }[];
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Merge overlapping/adjacent annotation ranges into contiguous zones. */
function mergeRanges(ranges: TimelineAnnotationRange[]): { start: number; end: number }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges]
    .map((r) => ({ start: r.start, end: Math.max(r.start, r.end) }))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = merged[merged.length - 1]!;
    const next = sorted[i]!;

    if (next.start <= current.end + 1) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push({ start: next.start, end: next.end });
    }
  }

  return merged;
}

/** Check if a frame is inside any merged zone. */
function isFrameInZone(frame: number, zones: { start: number; end: number }[]): boolean {
  for (const zone of zones) {
    if (frame >= zone.start && frame <= zone.end) return true;
    if (zone.start > frame) break; // zones are sorted — no need to check further
  }
  return false;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useAnnotationPlayback(options: UseAnnotationPlaybackOptions): AnnotationPlaybackControls {
  const { currentFrame, annotationRanges, setSpeed, currentSpeed } = options;

  const [isEnabled, setIsEnabled] = useState(false);
  const [slowSpeed, setSlowSpeedState] = useState(0.25);

  // Use refs for speeds to avoid re-render loops from our own setSpeed calls.
  const baseSpeedRef = useRef(1);
  const slowSpeedRef = useRef(0.25);
  const wasInZoneRef = useRef(false);
  const isEnabledRef = useRef(false);

  // Keep refs in sync with state.
  useEffect(() => {
    slowSpeedRef.current = slowSpeed;
  }, [slowSpeed]);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  // Merge overlapping ranges — recomputed only when ranges change.
  const mergedZones = useMemo(
    () => mergeRanges(annotationRanges ?? []),
    [annotationRanges],
  );

  const isInZone = useMemo(
    () => isEnabled && mergedZones.length > 0 && isFrameInZone(currentFrame, mergedZones),
    [isEnabled, currentFrame, mergedZones],
  );

  // Track manual speed changes as base speed when outside a zone.
  // This ensures that if the user picks 2x while outside an annotation zone,
  // the player returns to 2x (not 1x) after exiting the next zone.
  const prevSpeedRef = useRef(currentSpeed);
  useEffect(() => {
    if (isEnabledRef.current && !wasInZoneRef.current && currentSpeed !== prevSpeedRef.current) {
      baseSpeedRef.current = currentSpeed;
    }
    prevSpeedRef.current = currentSpeed;
  }, [currentSpeed]);

  // Speed switching effect — fires when zone state changes while enabled.
  useEffect(() => {
    if (!isEnabledRef.current) return;

    if (isInZone && !wasInZoneRef.current) {
      // Entering zone — capture current speed as base before switching
      baseSpeedRef.current = currentSpeed;
      setSpeed(slowSpeedRef.current);
    } else if (!isInZone && wasInZoneRef.current) {
      // Exiting zone
      setSpeed(baseSpeedRef.current);
    }

    wasInZoneRef.current = isInZone;
  }, [isInZone, setSpeed, currentSpeed]);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => {
      if (!prev) {
        // Enabling — capture current speed as base speed
        baseSpeedRef.current = currentSpeed;
        wasInZoneRef.current = false;

        // If already in a zone, immediately apply slow speed
        if (mergedZones.length > 0 && isFrameInZone(currentFrame, mergedZones)) {
          wasInZoneRef.current = true;
          setSpeed(slowSpeedRef.current);
        }
        return true;
      } else {
        // Disabling — restore base speed
        wasInZoneRef.current = false;
        setSpeed(baseSpeedRef.current);
        return false;
      }
    });
  }, [currentSpeed, currentFrame, mergedZones, setSpeed]);

  const setSlowSpeed = useCallback(
    (speed: number) => {
      setSlowSpeedState(speed);
      slowSpeedRef.current = speed;

      // If currently in a zone, immediately apply the new slow speed
      if (isEnabledRef.current && wasInZoneRef.current) {
        setSpeed(speed);
      }
    },
    [setSpeed],
  );

  return {
    isEnabled,
    toggle,
    slowSpeed,
    setSlowSpeed,
    isInZone,
    mergedZones,
  };
}
