//! Repository for the `avatars` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::avatar::{
    Avatar, AvatarDeliverableRow, AvatarWithAvatar, CreateAvatar, LibraryAvatarRow,
    UpdateAvatar,
};

/// Column list shared across queries to avoid repetition.
///
/// Excludes `face_embedding` (vector(512)) which is large and handled by
/// the embedding repo. All other PRD-76 columns have DB defaults so
/// existing INSERT queries remain valid.
const COLUMNS: &str =
    "id, project_id, name, status_id, metadata, settings, group_id, deleted_at, created_at, updated_at, \
     face_detection_confidence, face_bounding_box, embedding_status_id, embedding_extracted_at, review_status_id, is_enabled, \
     blocking_deliverables";

/// Provides CRUD operations for avatars plus settings helpers.
pub struct AvatarRepo;

impl AvatarRepo {
    /// Insert a new avatar, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `settings` is `None`, defaults to `'{}'::jsonb`.
    pub async fn create(pool: &PgPool, input: &CreateAvatar) -> Result<Avatar, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatars (project_id, name, status_id, metadata, settings, group_id)
             VALUES ($1, $2, COALESCE($3, 1), $4, COALESCE($5, '{{}}'::jsonb), $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
            .bind(input.group_id.flatten())
            .fetch_one(pool)
            .await
    }

    /// Bulk-insert avatars by name, returning all created rows.
    ///
    /// All avatars share the same `project_id` and optional `group_id`.
    /// Uses a single multi-row INSERT for efficiency.
    /// Params: $1=project_id, $2=group_id, $3..=$N=names.
    pub async fn create_many(
        pool: &PgPool,
        project_id: DbId,
        names: &[String],
        group_id: Option<DbId>,
    ) -> Result<Vec<Avatar>, sqlx::Error> {
        if names.is_empty() {
            return Ok(Vec::new());
        }

        let values: Vec<String> = names
            .iter()
            .enumerate()
            .map(|(i, _)| format!("($1, ${}, 1, '{{}}'::jsonb, $2)", i + 3))
            .collect();

        let query = format!(
            "INSERT INTO avatars (project_id, name, status_id, settings, group_id)
             VALUES {}
             RETURNING {COLUMNS}",
            values.join(", ")
        );

        let mut q = sqlx::query_as::<_, Avatar>(&query)
            .bind(project_id)
            .bind(group_id);
        for name in names {
            q = q.bind(name);
        }

        q.fetch_all(pool).await
    }

    /// Find a avatar by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Avatar>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM avatars WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all avatars for a given project, ordered by name ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<Avatar>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatars
             WHERE project_id = $1 AND deleted_at IS NULL
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List avatars for a project with the best avatar variant ID per avatar.
    ///
    /// Uses a LATERAL subquery to pick the single best variant per avatar:
    /// clothed hero > any hero > clothed approved > any approved.
    /// This eliminates the N+1 query pattern where the frontend fetches
    /// all variants for each avatar just to find the avatar.
    pub async fn list_by_project_with_avatar(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<AvatarWithAvatar>, sqlx::Error> {
        // Prefix COLUMNS with table alias c.
        let cols = COLUMNS
            .split(", ")
            .map(|c| format!("c.{c}"))
            .collect::<Vec<_>>()
            .join(", ");
        sqlx::query_as::<_, AvatarWithAvatar>(&format!(
            "SELECT {cols}, av.id AS hero_variant_id
                 FROM avatars c
                 LEFT JOIN LATERAL (
                     SELECT iv.id
                     FROM image_variants iv
                     WHERE iv.avatar_id = c.id
                       AND iv.deleted_at IS NULL
                       AND iv.file_path IS NOT NULL
                       AND (iv.is_hero = true OR iv.status_id = 2)
                     ORDER BY
                         iv.is_hero DESC,
                         CASE WHEN lower(iv.variant_type) = 'clothed' THEN 0 ELSE 1 END,
                         iv.status_id = 2 DESC,
                         iv.id DESC
                     LIMIT 1
                 ) av ON true
                 WHERE c.project_id = $1 AND c.deleted_at IS NULL
                 ORDER BY c.name ASC"
        ))
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Update a avatar. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAvatar,
    ) -> Result<Option<Avatar>, sqlx::Error> {
        // group_id uses a special pattern: outer Option = provided?, inner Option = nullable value.
        // When outer is None we keep the current value; when outer is Some we set to inner.
        let (group_id_provided, group_id_value) = match &input.group_id {
            Some(inner) => (true, *inner),
            None => (false, None),
        };

        let (bd_value, bd_set_null) = crate::resolve_nullable_array(&input.blocking_deliverables);

        let query = format!(
            "UPDATE avatars SET
                name = COALESCE($2, name),
                status_id = COALESCE($3, status_id),
                metadata = COALESCE($4, metadata),
                settings = COALESCE($5, settings),
                group_id = CASE WHEN $6 THEN $7 ELSE group_id END,
                blocking_deliverables = CASE
                    WHEN $9 THEN NULL
                    ELSE COALESCE($8, blocking_deliverables)
                END
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
            .bind(group_id_provided)
            .bind(group_id_value)
            .bind(&bd_value)
            .bind(bd_set_null)
            .fetch_optional(pool)
            .await
    }

    /// Find a avatar by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Avatar>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM avatars WHERE id = $1");
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a avatar by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE avatars SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted avatar. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE avatars SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a avatar by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM avatars WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Return just the `settings` JSONB value for a avatar.
    pub async fn get_settings(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT settings FROM avatars WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Fully replace the `settings` column for a avatar.
    pub async fn update_settings(
        pool: &PgPool,
        id: DbId,
        settings: &serde_json::Value,
    ) -> Result<Option<Avatar>, sqlx::Error> {
        let query = format!(
            "UPDATE avatars SET settings = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .bind(settings)
            .fetch_optional(pool)
            .await
    }

    /// Merge a JSON patch into the existing `settings` using PostgreSQL `||`.
    pub async fn patch_settings(
        pool: &PgPool,
        id: DbId,
        patch: &serde_json::Value,
    ) -> Result<Option<Avatar>, sqlx::Error> {
        let query = format!(
            "UPDATE avatars SET settings = settings || $2::jsonb
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .bind(patch)
            .fetch_optional(pool)
            .await
    }

    /// List all avatars across all projects for the library browser.
    ///
    /// Returns enriched rows with project name, group name, hero variant,
    /// and scene count. Supports optional text search and scene-type / track
    /// filtering.
    pub async fn list_all_for_library(
        pool: &PgPool,
        search: Option<&str>,
        scene_type_id: Option<DbId>,
        track_id: Option<DbId>,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<LibraryAvatarRow>, sqlx::Error> {
        // Build optional WHERE clauses.
        let mut conditions = vec!["c.deleted_at IS NULL".to_string()];
        let mut bind_idx: usize = 1;

        if search.is_some() {
            conditions.push(format!(
                "(c.name ILIKE '%' || ${bind_idx} || '%' \
                 OR p.name ILIKE '%' || ${bind_idx} || '%' \
                 OR g.name ILIKE '%' || ${bind_idx} || '%')"
            ));
            bind_idx += 1;
        }

        if scene_type_id.is_some() {
            conditions.push(format!(
                "EXISTS (SELECT 1 FROM scenes s WHERE s.avatar_id = c.id AND s.scene_type_id = ${bind_idx})"
            ));
            bind_idx += 1;
        }

        if track_id.is_some() {
            conditions.push(format!(
                "EXISTS (SELECT 1 FROM scenes s WHERE s.avatar_id = c.id AND s.track_id = ${bind_idx})"
            ));
            bind_idx += 1;
        }

        if pipeline_id.is_some() {
            conditions.push(format!("p.pipeline_id = ${bind_idx}"));
            bind_idx += 1;
        }

        let _ = bind_idx; // suppress unused warning

        let where_clause = conditions.join(" AND ");

        let sql = format!(
            "SELECT
                c.id,
                c.name,
                c.project_id,
                p.name AS project_name,
                g.name AS group_name,
                av.id AS hero_variant_id,
                COALESCE(sc.cnt, 0) AS scene_count,
                COALESCE(ic.cnt, 0) AS image_count,
                COALESCE(cc.cnt, 0) AS clip_count,
                (c.metadata IS NOT NULL AND c.metadata != '{{}}'::jsonb) AS has_metadata,
                c.status_id,
                c.is_enabled,
                c.created_at
             FROM avatars c
             JOIN projects p ON p.id = c.project_id
             LEFT JOIN avatar_groups g ON g.id = c.group_id
             LEFT JOIN LATERAL (
                 SELECT iv.id
                 FROM image_variants iv
                 WHERE iv.avatar_id = c.id
                   AND iv.deleted_at IS NULL
                   AND iv.file_path IS NOT NULL
                   AND (iv.is_hero = true OR iv.status_id = 2)
                 ORDER BY
                     iv.is_hero DESC,
                     CASE WHEN lower(iv.variant_type) = 'clothed' THEN 0 ELSE 1 END,
                     iv.status_id = 2 DESC,
                     iv.id DESC
                 LIMIT 1
             ) av ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS cnt
                 FROM scenes s
                 WHERE s.avatar_id = c.id
             ) sc ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS cnt
                 FROM image_variants iv
                 WHERE iv.avatar_id = c.id
                   AND iv.deleted_at IS NULL
             ) ic ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS cnt
                 FROM scene_video_versions svv
                 JOIN scenes s ON s.id = svv.scene_id
                 WHERE s.avatar_id = c.id
             ) cc ON true
             WHERE {where_clause}
             ORDER BY c.name ASC"
        );

        let mut q = sqlx::query_as::<_, LibraryAvatarRow>(&sql);

        if let Some(s) = search {
            q = q.bind(s);
        }
        if let Some(st) = scene_type_id {
            q = q.bind(st);
        }
        if let Some(t) = track_id {
            q = q.bind(t);
        }
        if let Some(pid) = pipeline_id {
            q = q.bind(pid);
        }

        q.fetch_all(pool).await
    }

    /// Toggle `is_enabled` for a avatar. Returns the updated row.
    pub async fn toggle_enabled(
        pool: &PgPool,
        id: DbId,
        enabled: bool,
    ) -> Result<Option<Avatar>, sqlx::Error> {
        let query = format!(
            "UPDATE avatars SET is_enabled = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Avatar>(&query)
            .bind(id)
            .bind(enabled)
            .fetch_optional(pool)
            .await
    }

    /// Per-avatar deliverable status for a project.
    ///
    /// Single query with LEFT JOINs + aggregates across image_variants, scenes,
    /// scene_video_versions, and avatar_metadata_versions. Excludes archived
    /// avatars (status_id = 3).
    pub async fn list_deliverable_status(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<AvatarDeliverableRow>, sqlx::Error> {
        sqlx::query_as::<_, AvatarDeliverableRow>(
            "SELECT
                c.id,
                c.name,
                c.group_id,
                c.status_id,
                COALESCE(img.total, 0) AS images_count,
                COALESCE(img.approved, 0) AS images_approved,
                (SELECT COUNT(*) FROM tracks t WHERE t.is_active = true) AS required_images_count,
                COALESCE(sc.total, 0) AS scenes_total,
                COALESCE(sc.with_video, 0) AS scenes_with_video,
                COALESCE(sc.vid_approved, 0) AS scenes_approved,
                COALESCE(meta.has_active, false) AS has_active_metadata,
                meta.approval_status AS metadata_approval_status,
                meta.source AS metadata_source,
                COALESCE(meta.has_source_files, false) AS has_source_files,
                COALESCE(
                    c.settings->>'elevenlabs_voice' IS NOT NULL
                    AND LENGTH(c.settings->>'elevenlabs_voice') > 0,
                    false
                ) AS has_voice_id,
                -- Build blocking_reasons array
                ARRAY_REMOVE(ARRAY[
                    CASE WHEN COALESCE(img.total, 0) = 0 THEN 'Missing Seed Image' END,
                    CASE WHEN COALESCE(img.total, 0) > 0 AND COALESCE(img.approved, 0) < COALESCE(img.total, 0) THEN 'Images Not Approved' END,
                    CASE WHEN COALESCE(sc.total, 0) = 0 THEN 'No Scenes' END,
                    CASE WHEN COALESCE(sc.with_video, 0) > 0 AND COALESCE(sc.vid_approved, 0) < COALESCE(sc.with_video, 0) THEN 'Videos Not Approved' END,
                    CASE WHEN NOT COALESCE(meta.has_active, false) THEN 'Missing Metadata' END,
                    CASE WHEN COALESCE(meta.has_active, false) AND COALESCE(meta.approval_status, 'pending') != 'approved' THEN 'Metadata Not Approved' END
                ], NULL) AS blocking_reasons,
                -- Readiness: average of 3 sections (metadata, images, scenes).
                -- Speech is tracked but not blocking, so excluded from the percentage.
                -- Metadata/images: 0 or 1 (binary).
                -- Scenes: ratio of approved to total (proportional progress).
                ROUND(
                    ((CASE WHEN COALESCE(meta.has_active, false)
                               AND COALESCE(meta.approval_status, 'pending') = 'approved'
                          THEN 1.0 ELSE 0.0 END
                    + CASE WHEN COALESCE(img.total, 0) > 0
                           THEN COALESCE(img.approved, 0)::numeric / img.total
                           ELSE 0.0 END
                    + CASE WHEN COALESCE(sc.total, 0) > 0
                           THEN COALESCE(sc.vid_approved, 0)::numeric / sc.total
                           ELSE 0.0 END
                    ) / 3.0 * 100)::numeric
                , 1)::float8 AS readiness_pct,
                av.id AS hero_variant_id
             FROM avatars c
             LEFT JOIN LATERAL (
                 SELECT
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE iv.status_id = 2) AS approved
                 FROM image_variants iv
                 WHERE iv.avatar_id = c.id AND iv.deleted_at IS NULL
             ) img ON true
             LEFT JOIN LATERAL (
                 -- Count enabled scene slots from the settings hierarchy,
                 -- then check which have actual scenes with videos/approvals.
                 -- Mirrors the dashboard query's enabled_combos CTE logic.
                 SELECT
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE sc.id IS NOT NULL AND EXISTS (
                         SELECT 1 FROM scene_video_versions svv
                         WHERE svv.scene_id = sc.id AND svv.deleted_at IS NULL
                     )) AS with_video,
                     COUNT(*) FILTER (WHERE sc.id IS NOT NULL AND EXISTS (
                         SELECT 1 FROM scene_video_versions svv
                         WHERE svv.scene_id = sc.id AND svv.deleted_at IS NULL
                           AND svv.is_final = true AND svv.qa_status = 'approved'
                     )) AS vid_approved
                 FROM scene_types st
                 JOIN scene_type_tracks stt ON stt.scene_type_id = st.id
                 JOIN tracks t ON t.id = stt.track_id AND t.is_active = true
                 LEFT JOIN project_scene_settings pss
                     ON pss.scene_type_id = st.id AND pss.track_id = t.id
                        AND pss.project_id = c.project_id
                 LEFT JOIN group_scene_settings gss
                     ON gss.scene_type_id = st.id AND gss.track_id = t.id
                        AND gss.group_id = c.group_id
                 LEFT JOIN avatar_scene_overrides cso
                     ON cso.scene_type_id = st.id AND cso.track_id = t.id
                        AND cso.avatar_id = c.id
                 LEFT JOIN scenes sc
                     ON sc.scene_type_id = st.id AND sc.track_id = t.id
                        AND sc.avatar_id = c.id AND sc.deleted_at IS NULL
                 WHERE st.is_active = true AND st.deleted_at IS NULL
                   AND COALESCE(cso.is_enabled, gss.is_enabled, pss.is_enabled, st.is_active) = true
             ) sc ON true
             LEFT JOIN LATERAL (
                 SELECT
                     EXISTS (
                         SELECT 1 FROM avatar_metadata_versions cmv
                         WHERE cmv.avatar_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                     ) AS has_active,
                     (
                         SELECT cmv.approval_status FROM avatar_metadata_versions cmv
                         WHERE cmv.avatar_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                         LIMIT 1
                     ) AS approval_status,
                     (
                         SELECT cmv.source FROM avatar_metadata_versions cmv
                         WHERE cmv.avatar_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                         LIMIT 1
                     ) AS source,
                     (
                         SELECT cmv.source_bio IS NOT NULL AND cmv.source_tov IS NOT NULL
                         FROM avatar_metadata_versions cmv
                         WHERE cmv.avatar_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                         LIMIT 1
                     ) AS has_source_files
             ) meta ON true
             LEFT JOIN LATERAL (
                 SELECT iv.id
                 FROM image_variants iv
                 WHERE iv.avatar_id = c.id
                   AND iv.deleted_at IS NULL
                   AND iv.file_path IS NOT NULL
                   AND (iv.is_hero = true OR iv.status_id = 2)
                 ORDER BY
                     iv.is_hero DESC,
                     CASE WHEN lower(iv.variant_type) = 'clothed' THEN 0 ELSE 1 END,
                     iv.status_id = 2 DESC,
                     iv.id DESC
                 LIMIT 1
             ) av ON true
             WHERE c.project_id = $1 AND c.deleted_at IS NULL AND c.is_enabled = true
             ORDER BY c.name ASC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }
}
