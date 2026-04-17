//! Repository for the `scene_video_versions` table.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::scene_video_version::{
    ClipBrowseFilters, CreateSceneVideoVersion, SceneVideoVersion,
    SceneVideoVersionWithContext, UpdateSceneVideoVersion,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, scene_id, version_number, source, file_path, \
    file_size_bytes, duration_secs, width, height, frame_rate, preview_path, web_playback_path, video_codec, is_final, notes, \
    qa_status, qa_reviewed_by, qa_reviewed_at, qa_rejection_reason, qa_notes, \
    generation_snapshot, content_hash, file_purged, parent_version_id, clip_index, transcode_state, deleted_at, created_at, updated_at";

/// Shared FROM + WHERE for clip browse / bulk / export / derived-clip list
/// queries (ADR-002). Callers bind positional parameters in the exact order
/// documented by `CLIP_BROWSE_BIND_ORDER`.
///
/// The predicate filters `scene_video_versions` by project / pipeline /
/// scene-type / track / source / QA-status / tags / search / derived-vs-
/// non-derived / parent / no-tags / avatar — the full set used by the
/// browse UI.
///
/// Keep the JOIN aliases (`svv`, `sc`, `c`, `p`, `st`, `t`) stable: callers
/// that SELECT columns above this WHERE rely on them.
const CLIP_BROWSE_WHERE: &str = "\
    FROM scene_video_versions svv \
    JOIN scenes sc ON sc.id = svv.scene_id AND sc.deleted_at IS NULL \
    JOIN avatars c ON c.id = sc.avatar_id AND c.deleted_at IS NULL \
    JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL \
    LEFT JOIN scene_types st ON st.id = sc.scene_type_id \
    LEFT JOIN tracks t ON t.id = sc.track_id \
    WHERE svv.deleted_at IS NULL \
      AND ($1::bigint IS NULL OR p.id = $1) \
      AND ($2::bigint IS NULL OR p.pipeline_id = $2) \
      AND ($3::text IS NULL OR st.name = ANY(string_to_array($3, ','))) \
      AND ($4::text IS NULL OR t.name = ANY(string_to_array($4, ','))) \
      AND ($5::text IS NULL OR svv.source = ANY(string_to_array($5, ','))) \
      AND ($6::text IS NULL OR svv.qa_status = ANY(string_to_array($6, ','))) \
      AND ($7::bool OR c.is_enabled = true) \
      AND ($8::text IS NULL OR svv.id IN ( \
        SELECT et.entity_id FROM entity_tags et \
        WHERE et.entity_type = 'scene_video_version' \
          AND et.tag_id = ANY(string_to_array($8, ',')::bigint[]) \
      )) \
      AND ($9::text IS NULL OR ( \
        c.name ILIKE '%' || $9 || '%' \
        OR st.name ILIKE '%' || $9 || '%' \
        OR t.name ILIKE '%' || $9 || '%' \
        OR p.name ILIKE '%' || $9 || '%' \
      )) \
      AND ($10::text IS NULL OR svv.id NOT IN ( \
        SELECT et.entity_id FROM entity_tags et \
        WHERE et.entity_type = 'scene_video_version' \
          AND et.tag_id = ANY(string_to_array($10, ',')::bigint[]) \
      )) \
      AND ($11::text = 'all' OR ($11::text = 'only_derived' AND svv.parent_version_id IS NOT NULL) OR ($11::text = 'only_non_derived' AND svv.parent_version_id IS NULL)) \
      AND ($12::bigint IS NULL OR svv.parent_version_id = $12) \
      AND (NOT $13::bool OR svv.id NOT IN ( \
        SELECT et.entity_id FROM entity_tags et \
        WHERE et.entity_type = 'scene_video_version' \
      )) \
      AND ($14::bigint IS NULL OR sc.avatar_id = $14)";

/// Expose the shared WHERE clause fragment so handlers outside the repo
/// (e.g. bulk actions, export) can compose it without duplicating the SQL.
///
/// ### Bind order (14 positional parameters)
///
/// Callers MUST bind these exact parameters before any LIMIT/OFFSET binds
/// they add to their own SELECT. See `list_with_context` in this module for
/// the canonical binding order.
///
/// 1.  `project_id`          `Option<DbId>`
/// 2.  `pipeline_id`         `Option<DbId>`
/// 3.  `scene_type` CSV      `Option<&str>`
/// 4.  `track` CSV           `Option<&str>`
/// 5.  `source` CSV          `Option<&str>`
/// 6.  `qa_status` CSV       `Option<&str>`
/// 7.  `show_disabled`       `bool`
/// 8.  `tag_ids` CSV         `Option<&str>`
/// 9.  `search`              `Option<&str>`
/// 10. `exclude_tag_ids` CSV `Option<&str>`
/// 11. `has_parent_filter`   `&str`  — one of `"all"`, `"only_derived"`, `"only_non_derived"`
/// 12. `parent_version_id`   `Option<DbId>`
/// 13. `no_tags`             `bool`
/// 14. `avatar_id`           `Option<DbId>`
pub fn clip_browse_where_clause() -> &'static str {
    CLIP_BROWSE_WHERE
}

/// Translate `ClipBrowseFilters::has_parent` tri-state into the string the
/// WHERE clause expects (`$11`).
fn has_parent_filter_str(has_parent: Option<bool>) -> &'static str {
    match has_parent {
        Some(true) => "only_derived",
        Some(false) => "only_non_derived",
        None => "all",
    }
}

/// Provides CRUD and version-management operations for scene video versions.
pub struct SceneVideoVersionRepo;

impl SceneVideoVersionRepo {
    // ── Standard CRUD ────────────────────────────────────────────────

    /// Insert a new scene video version, auto-assigning the next version number.
    ///
    /// If `is_final` is `None`, defaults to `false`.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSceneVideoVersion,
    ) -> Result<SceneVideoVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_video_versions
                (scene_id, version_number, source, file_path, file_size_bytes, duration_secs, is_final, notes, generation_snapshot, content_hash, parent_version_id, clip_index)
             VALUES (
                $1,
                (SELECT COALESCE(MAX(version_number), 0) + 1 FROM scene_video_versions WHERE scene_id = $1),
                $2, $3, $4, $5, COALESCE($6, false), $7, $8, $9, $10, $11
             )
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(input.scene_id)
            .bind(&input.source)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.duration_secs)
            .bind(input.is_final)
            .bind(&input.notes)
            .bind(&input.generation_snapshot)
            .bind(&input.content_hash)
            .bind(input.parent_version_id)
            .bind(input.clip_index)
            .fetch_one(pool)
            .await
    }

    /// Find a scene video version by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions WHERE id = $1 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all versions for a given scene, ordered by version number descending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS},
                    COALESCE((SELECT COUNT(*) FROM frame_annotations fa
                              WHERE fa.version_id = scene_video_versions.id), 0) AS annotation_count
             FROM scene_video_versions
             WHERE scene_id = $1 AND deleted_at IS NULL AND parent_version_id IS NULL
             ORDER BY version_number DESC"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Update a scene video version. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists (or is soft-deleted).
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneVideoVersion,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "UPDATE scene_video_versions SET
                is_final = COALESCE($2, is_final),
                notes = COALESCE($3, notes),
                qa_status = COALESCE($4, qa_status),
                qa_reviewed_by = COALESCE($5, qa_reviewed_by),
                qa_reviewed_at = COALESCE($6, qa_reviewed_at),
                qa_rejection_reason = COALESCE($7, qa_rejection_reason),
                qa_notes = COALESCE($8, qa_notes)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(id)
            .bind(input.is_final)
            .bind(&input.notes)
            .bind(&input.qa_status)
            .bind(input.qa_reviewed_by)
            .bind(input.qa_reviewed_at)
            .bind(&input.qa_rejection_reason)
            .bind(&input.qa_notes)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a scene video version by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted scene video version. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NULL \
             WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft-delete all versions for a scene with version_number > the given threshold.
    pub async fn soft_delete_after_version(
        pool: &PgPool,
        scene_id: DbId,
        version_number: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NOW() \
             WHERE scene_id = $1 AND version_number > $2 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .bind(version_number)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Permanently delete a scene video version by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_video_versions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set video metadata (duration, resolution, frame rate) extracted via ffprobe.
    pub async fn set_video_metadata(
        pool: &PgPool,
        id: DbId,
        duration_secs: f64,
        width: i32,
        height: i32,
        frame_rate: f64,
        video_codec: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions \
             SET duration_secs = $2, width = $3, height = $4, frame_rate = $5, video_codec = $6 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(duration_secs)
        .bind(width)
        .bind(height)
        .bind(frame_rate)
        .bind(video_codec)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all versions that have no duration_secs. Useful for backfilling
    /// duration metadata on existing data. Limited to avoid OOM on large datasets.
    pub async fn list_missing_duration(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE (duration_secs IS NULL OR width IS NULL OR frame_rate IS NULL OR video_codec IS NULL) \
             AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List generated versions that have no generation_snapshot.
    pub async fn list_missing_snapshots(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE source = 'generated' \
               AND generation_snapshot IS NULL \
               AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Set the generation_snapshot for a scene video version.
    pub async fn set_generation_snapshot(
        pool: &PgPool,
        id: DbId,
        snapshot: &serde_json::Value,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET generation_snapshot = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(snapshot)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set the preview_path for a scene video version. Returns `true` if a row was updated.
    pub async fn set_preview_path(
        pool: &PgPool,
        id: DbId,
        path: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET preview_path = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(path)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set the web_playback_path for a scene video version. Returns `true` if a row was updated.
    pub async fn set_web_playback_path(
        pool: &PgPool,
        id: DbId,
        path: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET web_playback_path = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(path)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Version-specific operations ──────────────────────────────────

    /// Get the next version number for a scene (max existing + 1, or 1 if none).
    pub async fn next_version_number(pool: &PgPool, scene_id: DbId) -> Result<i32, sqlx::Error> {
        let row: (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_number), 0) + 1 \
             FROM scene_video_versions WHERE scene_id = $1",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    /// Mark a version as final, un-marking any previously final version for the
    /// same scene. Uses a transaction to ensure atomicity.
    ///
    /// Returns `None` if `version_id` does not exist for the given `scene_id`.
    pub async fn set_final(
        pool: &PgPool,
        scene_id: DbId,
        version_id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Unmark current final (if any)
        sqlx::query(
            "UPDATE scene_video_versions SET is_final = false \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .execute(&mut *tx)
        .await?;

        // Mark the specified version as final
        let query = format!(
            "UPDATE scene_video_versions SET is_final = true \
             WHERE id = $1 AND scene_id = $2 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        let result = sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(version_id)
            .bind(scene_id)
            .fetch_optional(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(result)
    }

    /// Find the current final version for a scene (if any).
    pub async fn find_final_for_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(scene_id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new version and automatically mark it as final, un-marking any
    /// previously final version in the same transaction.
    pub async fn create_as_final(
        pool: &PgPool,
        input: &CreateSceneVideoVersion,
    ) -> Result<SceneVideoVersion, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Get next version number
        let next_ver: (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_number), 0) + 1 \
             FROM scene_video_versions WHERE scene_id = $1",
        )
        .bind(input.scene_id)
        .fetch_one(&mut *tx)
        .await?;

        // Unmark current final
        sqlx::query(
            "UPDATE scene_video_versions SET is_final = false \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL",
        )
        .bind(input.scene_id)
        .execute(&mut *tx)
        .await?;

        // Insert new version as final
        let query = format!(
            "INSERT INTO scene_video_versions
                (scene_id, version_number, source, file_path, file_size_bytes, duration_secs, is_final, notes, generation_snapshot, content_hash, parent_version_id, clip_index)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11)
             RETURNING {COLUMNS}"
        );
        let version = sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(input.scene_id)
            .bind(next_ver.0)
            .bind(&input.source)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.duration_secs)
            .bind(&input.notes)
            .bind(&input.generation_snapshot)
            .bind(&input.content_hash)
            .bind(input.parent_version_id)
            .bind(input.clip_index)
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(version)
    }

    /// List all versions that have a video file but no preview. Useful for
    /// backfilling previews on existing data. Limited to avoid OOM on large datasets.
    pub async fn list_missing_previews(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE preview_path IS NULL AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List versions that have no web_playback_path yet.
    pub async fn list_missing_web_playback(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE web_playback_path IS NULL AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List final video versions in a project that use a non-H.264 codec.
    pub async fn list_non_h264_finals(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let prefixed = COLUMNS
            .split(", ")
            .map(|c| format!("svv.{}", c.trim()))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT {prefixed} FROM scene_video_versions svv \
             JOIN scenes s ON s.id = svv.scene_id AND s.deleted_at IS NULL \
             JOIN avatars c ON c.id = s.avatar_id AND c.deleted_at IS NULL \
             WHERE c.project_id = $1 \
               AND svv.is_final = true \
               AND svv.deleted_at IS NULL \
               AND svv.video_codec IS NOT NULL \
               AND svv.video_codec != 'h264' \
             ORDER BY svv.id"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Find scene IDs in a project that have no final video version with
    /// actual content (non-empty file).
    ///
    /// A version is considered "empty" if `file_size_bytes` is NULL or 0.
    /// Empty versions are excluded so they are not treated as completed
    /// deliverables.
    pub async fn find_scenes_missing_final(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<DbId>, sqlx::Error> {
        let rows: Vec<(DbId,)> = sqlx::query_as(
            "SELECT s.id \
             FROM scenes s \
             JOIN avatars c ON s.avatar_id = c.id \
             WHERE c.project_id = $1 \
               AND s.deleted_at IS NULL \
               AND c.deleted_at IS NULL \
               AND NOT EXISTS ( \
                   SELECT 1 FROM scene_video_versions v \
                   WHERE v.scene_id = s.id \
                     AND v.is_final = true \
                     AND v.deleted_at IS NULL \
                     AND v.file_size_bytes IS NOT NULL \
                     AND v.file_size_bytes > 0 \
               )",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    /// Mark video files as purged for the given version IDs.
    /// Sets `file_purged = true` without soft-deleting the DB rows.
    pub async fn mark_files_purged(
        pool: &PgPool,
        version_ids: &[DbId],
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET file_purged = true \
             WHERE id = ANY($1) AND deleted_at IS NULL",
        )
        .bind(version_ids)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Mark all artifact files as purged for a given version ID.
    pub async fn mark_artifact_files_purged(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_version_artifacts SET file_purged = true \
             WHERE version_id = $1 AND deleted_at IS NULL",
        )
        .bind(version_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Count non-empty video versions for a scene (versions with actual file content).
    ///
    /// Excludes soft-deleted versions and versions where `file_size_bytes` is NULL or 0.
    pub async fn count_non_empty_versions(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM scene_video_versions \
             WHERE scene_id = $1 \
               AND deleted_at IS NULL \
               AND file_size_bytes IS NOT NULL \
               AND file_size_bytes > 0",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    // ── Transcode state (PRD-169) ────────────────────────────────────

    /// Set the `transcode_state` for a version. Accepts a transaction so
    /// callers can couple the update to a `transcode_jobs` row mutation.
    pub async fn set_transcode_state<'c>(
        tx: &mut sqlx::Transaction<'c, sqlx::Postgres>,
        id: DbId,
        state: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET transcode_state = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(state)
        .execute(&mut **tx)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Atomic: update `file_path` + flip `transcode_state` to `'completed'`
    /// in the same row update. Used by the worker on successful transcode.
    pub async fn set_transcoded<'c>(
        tx: &mut sqlx::Transaction<'c, sqlx::Postgres>,
        id: DbId,
        new_file_path: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions \
             SET file_path = $2, transcode_state = 'completed' \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(new_file_path)
        .execute(&mut **tx)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Look up the owning project_id for a version via
    /// `scene_video_versions → scenes → avatars → project_id`.
    /// Used by the transcode worker to populate broadcaster events.
    pub async fn find_project_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<DbId>, sqlx::Error> {
        let row: Option<(Option<DbId>,)> = sqlx::query_as(
            "SELECT a.project_id FROM scene_video_versions svv \
             JOIN scenes s ON s.id = svv.scene_id \
             JOIN avatars a ON a.id = s.avatar_id \
             WHERE svv.id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(row.and_then(|(pid,)| pid))
    }

    // ── Context-enriched list (ADR-001 / ADR-002) ───────────────────

    /// Count clips matching `filters`. Binds the 14-parameter contract
    /// documented in `CLIP_BROWSE_BIND_ORDER`.
    pub async fn count_with_context(
        pool: &PgPool,
        filters: &ClipBrowseFilters,
    ) -> Result<i64, sqlx::Error> {
        let show_disabled = filters.show_disabled.unwrap_or(false);
        let no_tags = filters.no_tags.unwrap_or(false);
        let sql = format!("SELECT COUNT(*) {CLIP_BROWSE_WHERE}");
        sqlx::query_scalar::<_, i64>(&sql)
            .bind(filters.project_id)
            .bind(filters.pipeline_id)
            .bind(&filters.scene_type)
            .bind(&filters.track)
            .bind(&filters.source)
            .bind(&filters.qa_status)
            .bind(show_disabled)
            .bind(&filters.tag_ids)
            .bind(&filters.search)
            .bind(&filters.exclude_tag_ids)
            .bind(has_parent_filter_str(filters.has_parent))
            .bind(filters.parent_version_id)
            .bind(no_tags)
            .bind(filters.avatar_id)
            .fetch_one(pool)
            .await
    }

    /// List clips with avatar / scene / track / project context and latest
    /// transcode-job enrichment, in one SELECT.
    ///
    /// Ordering:
    /// - When `filters.avatar_id` is set (derived-clip list for an avatar),
    ///   orders by `parent_version_id, clip_index NULLS LAST, id`.
    /// - Otherwise, orders by `created_at DESC` (browse page).
    ///
    /// Selects the full canonical column set via `COLUMNS` so adding a
    /// column to `scene_video_versions` flows through without further
    /// changes (ADR-001).
    pub async fn list_with_context(
        pool: &PgPool,
        filters: &ClipBrowseFilters,
    ) -> Result<Vec<SceneVideoVersionWithContext>, sqlx::Error> {
        let show_disabled = filters.show_disabled.unwrap_or(false);
        let no_tags = filters.no_tags.unwrap_or(false);
        let limit = filters.limit.unwrap_or(200).clamp(1, 500) as i64;
        let offset = filters.offset.unwrap_or(0).max(0) as i64;

        // Prefix canonical SVV columns with `svv.` for disambiguation in JOIN.
        let prefixed_columns = COLUMNS
            .split(", ")
            .map(|c| format!("svv.{}", c.trim()))
            .collect::<Vec<_>>()
            .join(", ");

        // Derived-clip mode (avatar-scoped) orders by parent grouping so
        // the UI renders natural clip-index sequences; browse mode orders
        // by recency.
        let order_by = if filters.avatar_id.is_some() {
            "ORDER BY svv.parent_version_id, svv.clip_index NULLS LAST, svv.id"
        } else {
            "ORDER BY svv.created_at DESC"
        };

        // The shared CLIP_BROWSE_WHERE constant starts with `FROM ... WHERE
        // ...`. We need two extra JOINs (transcode LATERAL + parent-version
        // LEFT JOIN) between the FROM-block and the WHERE clause. Split on
        // the first `WHERE` to insert them cleanly without duplicating the
        // base JOINs.
        let (from_block, where_block) = CLIP_BROWSE_WHERE
            .split_once(" WHERE ")
            .expect("CLIP_BROWSE_WHERE contains ' WHERE '");
        let extra_joins = "\
             LEFT JOIN LATERAL ( \
                 SELECT tj.id, tj.error_message, tj.started_at, tj.attempts \
                 FROM transcode_jobs tj \
                 WHERE tj.entity_type = 'scene_video_version' \
                   AND tj.entity_id = svv.id \
                   AND tj.deleted_at IS NULL \
                 ORDER BY tj.created_at DESC LIMIT 1 \
             ) tj ON TRUE \
             LEFT JOIN scene_video_versions pvv ON pvv.id = svv.parent_version_id";

        let sql = format!(
            "SELECT {prefixed_columns}, \
                    COALESCE((SELECT COUNT(*) FROM frame_annotations fa \
                              WHERE fa.version_id = svv.id), 0) AS annotation_count, \
                    tj.error_message AS transcode_error, \
                    tj.started_at AS transcode_started_at, \
                    tj.attempts AS transcode_attempts, \
                    tj.id AS transcode_job_id, \
                    c.id AS avatar_id, \
                    c.name AS avatar_name, \
                    c.is_enabled AS avatar_is_enabled, \
                    COALESCE(st.name, '') AS scene_type_name, \
                    COALESCE(t.name, '') AS track_name, \
                    p.id AS project_id, \
                    p.name AS project_name, \
                    pvv.version_number AS parent_version_number \
             {from_block} {extra_joins} WHERE {where_block} \
             {order_by} \
             LIMIT $15 OFFSET $16"
        );

        sqlx::query_as::<_, SceneVideoVersionWithContext>(&sql)
            .bind(filters.project_id)
            .bind(filters.pipeline_id)
            .bind(&filters.scene_type)
            .bind(&filters.track)
            .bind(&filters.source)
            .bind(&filters.qa_status)
            .bind(show_disabled)
            .bind(&filters.tag_ids)
            .bind(&filters.search)
            .bind(&filters.exclude_tag_ids)
            .bind(has_parent_filter_str(filters.has_parent))
            .bind(filters.parent_version_id)
            .bind(no_tags)
            .bind(filters.avatar_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Enrich a list of SVV rows with transcode job fields (error, started_at,
    /// attempts, job_id) from the most recent row in `transcode_jobs` per entity.
    ///
    /// Mutates the input in place. Cheap for small lists (< 200 rows) —
    /// single `WHERE id = ANY($1)` lookup. API list endpoints with larger
    /// result sets should prefer a single enriched SELECT instead.
    pub async fn enrich_with_transcode_fields(
        pool: &PgPool,
        versions: &mut [SceneVideoVersion],
    ) -> Result<(), sqlx::Error> {
        if versions.is_empty() {
            return Ok(());
        }
        let ids: Vec<DbId> = versions.iter().map(|v| v.id).collect();

        #[derive(sqlx::FromRow)]
        struct JobRow {
            entity_id: DbId,
            id: DbId,
            attempts: i32,
            error_message: Option<String>,
            started_at: Option<Timestamp>,
        }
        let rows: Vec<JobRow> = sqlx::query_as::<_, JobRow>(
            "SELECT DISTINCT ON (entity_id) \
                 entity_id, id, attempts, error_message, started_at \
             FROM transcode_jobs \
             WHERE entity_type = 'scene_video_version' \
               AND entity_id = ANY($1) \
               AND deleted_at IS NULL \
             ORDER BY entity_id, created_at DESC",
        )
        .bind(&ids)
        .fetch_all(pool)
        .await?;

        let mut by_entity: std::collections::HashMap<DbId, JobRow> =
            rows.into_iter().map(|r| (r.entity_id, r)).collect();

        for v in versions.iter_mut() {
            if let Some(job) = by_entity.remove(&v.id) {
                v.transcode_job_id = Some(job.id);
                v.transcode_attempts = Some(job.attempts);
                v.transcode_error = job.error_message;
                v.transcode_started_at = job.started_at;
            }
        }
        Ok(())
    }
}
