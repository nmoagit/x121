-- Rename all character-related tables and FK columns to avatar.
-- PostgreSQL automatically updates FK constraint definitions when
-- tables/columns are renamed, so no constraint recreation is needed.

BEGIN;

-- ============================================================
-- Phase 1: Rename tables
-- ============================================================

ALTER TABLE IF EXISTS characters RENAME TO avatars;
ALTER TABLE IF EXISTS character_statuses RENAME TO avatar_statuses;
ALTER TABLE IF EXISTS character_groups RENAME TO avatar_groups;
ALTER TABLE IF EXISTS character_readiness_cache RENAME TO avatar_readiness_cache;
ALTER TABLE IF EXISTS character_scene_overrides RENAME TO avatar_scene_overrides;
ALTER TABLE IF EXISTS character_scene_prompt_overrides RENAME TO avatar_scene_prompt_overrides;
ALTER TABLE IF EXISTS character_ingest_statuses RENAME TO avatar_ingest_statuses;
ALTER TABLE IF EXISTS character_ingest_sessions RENAME TO avatar_ingest_sessions;
ALTER TABLE IF EXISTS character_ingest_entries RENAME TO avatar_ingest_entries;
ALTER TABLE IF EXISTS character_metadata_versions RENAME TO avatar_metadata_versions;
ALTER TABLE IF EXISTS character_deliverable_ignores RENAME TO avatar_deliverable_ignores;
ALTER TABLE IF EXISTS character_speeches RENAME TO avatar_speeches;
ALTER TABLE IF EXISTS character_review_statuses RENAME TO avatar_review_statuses;
ALTER TABLE IF EXISTS character_review_assignments RENAME TO avatar_review_assignments;
ALTER TABLE IF EXISTS character_review_decisions RENAME TO avatar_review_decisions;
ALTER TABLE IF EXISTS character_review_audit_log RENAME TO avatar_review_audit_log;
ALTER TABLE IF EXISTS character_video_settings RENAME TO avatar_video_settings;
ALTER TABLE IF EXISTS library_characters RENAME TO library_avatars;
ALTER TABLE IF EXISTS project_character_links RENAME TO project_avatar_links;

-- ============================================================
-- Phase 2: Rename character_id → avatar_id FK columns
-- ============================================================

ALTER TABLE source_images RENAME COLUMN character_id TO avatar_id;
ALTER TABLE derived_images RENAME COLUMN character_id TO avatar_id;
ALTER TABLE image_variants RENAME COLUMN character_id TO avatar_id;
ALTER TABLE scenes RENAME COLUMN character_id TO avatar_id;
ALTER TABLE image_quality_scores RENAME COLUMN character_id TO avatar_id;
ALTER TABLE performance_metrics RENAME COLUMN character_id TO avatar_id;
ALTER TABLE detected_faces RENAME COLUMN character_id TO avatar_id;
ALTER TABLE embedding_history RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_readiness_cache RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_scene_overrides RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_scene_prompt_overrides RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_metadata_versions RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_deliverable_ignores RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_speeches RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_review_assignments RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_review_decisions RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_review_audit_log RENAME COLUMN character_id TO avatar_id;
ALTER TABLE avatar_video_settings RENAME COLUMN character_id TO avatar_id;

-- ============================================================
-- Phase 3: Rename other character-related columns
-- ============================================================

ALTER TABLE library_avatars RENAME COLUMN source_character_id TO source_avatar_id;
ALTER TABLE project_avatar_links RENAME COLUMN project_character_id TO project_avatar_id;
ALTER TABLE duplicate_checks RENAME COLUMN source_character_id TO source_avatar_id;
ALTER TABLE duplicate_checks RENAME COLUMN matched_character_id TO matched_avatar_id;
ALTER TABLE avatar_ingest_entries RENAME COLUMN created_character_id TO created_avatar_id;

COMMIT;
