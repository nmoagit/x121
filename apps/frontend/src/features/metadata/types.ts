/**
 * TypeScript types for the dual-metadata system (PRD-13).
 *
 * These types mirror the backend API response shapes for metadata
 * preview, regeneration, and staleness detection.
 */

/* --------------------------------------------------------------------------
   Character metadata
   -------------------------------------------------------------------------- */

export interface BiographicalData {
  description: string | null;
  tags: string[];
}

export interface PhysicalAttributes {
  height: string | null;
  build: string | null;
  hair_color: string | null;
  eye_color: string | null;
}

export interface ImageReference {
  image_id: number;
  filename: string;
  path: string;
  image_type: string;
}

export interface CharacterMetadata {
  schema_version: string;
  character_id: number;
  name: string;
  project_id: number;
  project_name: string;
  biographical: BiographicalData;
  physical_attributes: PhysicalAttributes;
  source_image: ImageReference | null;
  derived_images: ImageReference[];
  custom_fields?: Record<string, unknown> | null;
  generated_at: string;
  source_updated_at: string;
}

/* --------------------------------------------------------------------------
   Video metadata
   -------------------------------------------------------------------------- */

export interface VideoTechnicalInfo {
  duration_seconds: number;
  resolution: string;
  codec: string;
  fps: number;
  segment_count: number;
}

export interface SegmentInfo {
  segment_id: number;
  sequence_index: number;
  seed_frame_path: string;
  output_video_path: string;
  last_frame_path: string;
  status: string;
}

export interface ProvenanceInfo {
  workflow_name: string;
  model_version: string | null;
  lora_versions: string[];
  generation_parameters: Record<string, unknown>;
}

export interface QualityScores {
  overall_score: number;
  per_segment_scores: number[];
}

export interface VideoMetadata {
  schema_version: string;
  scene_id: number;
  character_id: number;
  character_name: string;
  scene_type: string;
  technical: VideoTechnicalInfo;
  segments: SegmentInfo[];
  provenance: ProvenanceInfo;
  quality_scores?: QualityScores | null;
  generated_at: string;
  source_updated_at: string;
}

/* --------------------------------------------------------------------------
   Staleness
   -------------------------------------------------------------------------- */

export interface StaleMetadataEntry {
  entity_type: string;
  entity_id: number;
  file_type: string;
  generated_at: string;
  source_updated_at: string;
  current_entity_updated_at: string;
}

export interface StaleMetadataReport {
  stale_character_metadata: StaleMetadataEntry[];
  stale_video_metadata: StaleMetadataEntry[];
}

/* --------------------------------------------------------------------------
   Regeneration
   -------------------------------------------------------------------------- */

export interface RegenerationReport {
  regenerated: number;
  skipped: number;
  failed: number;
}

export interface RegenerateProjectRequest {
  stale_only?: boolean;
}
