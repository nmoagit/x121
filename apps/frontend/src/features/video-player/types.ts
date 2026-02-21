/** Video source type — matches backend `video_sources` constants. */
export type SourceType = "segment" | "version";

/** Playback quality level. */
export type PlaybackQuality = "proxy" | "full";

/** Video metadata returned by `GET /videos/{type}/{id}/metadata`. */
export interface VideoMetadata {
  duration_seconds: number;
  codec: string;
  width: number;
  height: number;
  framerate: number;
  total_frames: number;
  file_size_bytes: number | null;
  audio_tracks: AudioTrackInfo[];
}

/** Information about a single audio track. */
export interface AudioTrackInfo {
  index: number;
  codec: string;
  channels: number;
  sample_rate: number;
  language: string | null;
}

/** Codec capability detected at runtime. */
export interface CodecCapability {
  codec: string;
  label: string;
  hardwareAccelerated: boolean;
  supported: boolean;
}

/** Thumbnail record from the backend. */
export interface VideoThumbnail {
  id: number;
  source_type: SourceType;
  source_id: number;
  frame_number: number;
  thumbnail_path: string;
  interval_seconds: number | null;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}
