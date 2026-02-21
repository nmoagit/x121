import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { detectCodecCapabilities } from "../codec-detector";
import type { CodecCapability, SourceType, VideoMetadata } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const videoKeys = {
  all: ["video"] as const,
  metadata: (sourceType: SourceType, sourceId: number) =>
    [...videoKeys.all, "metadata", sourceType, sourceId] as const,
  thumbnails: (sourceType: SourceType, sourceId: number) =>
    [...videoKeys.all, "thumbnails", sourceType, sourceId] as const,
  codecCapabilities: () => [...videoKeys.all, "codec-capabilities"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch video metadata (duration, codec, resolution, framerate, audio). */
export function useVideoMetadata(sourceType: SourceType, sourceId: number) {
  return useQuery({
    queryKey: videoKeys.metadata(sourceType, sourceId),
    queryFn: () =>
      api.get<VideoMetadata>(`/videos/${sourceType}/${sourceId}/metadata`),
    staleTime: 5 * 60 * 1000, // metadata doesn't change
    enabled: sourceId > 0,
  });
}

/** Detect browser codec capabilities (cached for session). */
export function useCodecCapabilities() {
  return useQuery<CodecCapability[]>({
    queryKey: videoKeys.codecCapabilities(),
    queryFn: detectCodecCapabilities,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Build the streaming URL for a video source. */
export function getStreamUrl(
  sourceType: SourceType,
  sourceId: number,
  quality: "proxy" | "full" = "proxy",
): string {
  return `/api/v1/videos/${sourceType}/${sourceId}/stream?quality=${quality}`;
}

/** Build the thumbnail URL for a specific frame. */
export function getThumbnailUrl(
  sourceType: SourceType,
  sourceId: number,
  frame: number,
): string {
  return `/api/v1/videos/${sourceType}/${sourceId}/thumbnails/${frame}`;
}
