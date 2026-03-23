/**
 * Hook to detect single-track pipelines.
 *
 * Returns `{ isSingleTrack, singleTrack }` based on the current pipeline
 * context. When the pipeline has exactly one active track, components can
 * auto-select it and hide track selection UI.
 */

import { useMemo } from "react";

import { usePipelineContextSafe } from "@/features/pipelines";

import { useTracks } from "./use-tracks";
import type { Track } from "../types";

interface SingleTrackResult {
  /** True when the current pipeline has exactly one active track. */
  isSingleTrack: boolean;
  /** The single track when `isSingleTrack` is true; otherwise null. */
  singleTrack: Track | null;
  /** All active tracks for the current pipeline. */
  tracks: Track[];
  /** Loading state. */
  isLoading: boolean;
}

export function useSingleTrack(pipelineIdOverride?: number): SingleTrackResult {
  const pipelineCtx = usePipelineContextSafe();
  const { data: tracks, isLoading } = useTracks(false, pipelineIdOverride ?? pipelineCtx?.pipelineId);

  return useMemo(() => {
    const activeTracks = (tracks ?? []).filter((t) => t.is_active);
    const isSingleTrack = activeTracks.length === 1;
    return {
      isSingleTrack,
      singleTrack: isSingleTrack ? activeTracks[0]! : null,
      tracks: activeTracks,
      isLoading,
    };
  }, [tracks, isLoading]);
}
