//! Repository for the `characters` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character::{
    Character, CharacterDeliverableRow, CharacterWithAvatar, CreateCharacter, LibraryCharacterRow,
    UpdateCharacter,
};

/// Column list shared across queries to avoid repetition.
///
/// Excludes `face_embedding` (vector(512)) which is large and handled by
/// the embedding repo. All other PRD-76 columns have DB defaults so
/// existing INSERT queries remain valid.
const COLUMNS: &str =
    "id, project_id, name, status_id, metadata, settings, group_id, deleted_at, created_at, updated_at, \
     face_detection_confidence, face_bounding_box, embedding_status_id, embedding_extracted_at, review_status_id, is_enabled";

/// Provides CRUD operations for characters plus settings helpers.
pub struct CharacterRepo;

impl CharacterRepo {
    /// Insert a new character, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `settings` is `None`, defaults to `'{}'::jsonb`.
    pub async fn create(pool: &PgPool, input: &CreateCharacter) -> Result<Character, sqlx::Error> {
        let query = format!(
            "INSERT INTO characters (project_id, name, status_id, metadata, settings, group_id)
             VALUES ($1, $2, COALESCE($3, 1), $4, COALESCE($5, '{{}}'::jsonb), $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
            .bind(input.group_id.flatten())
            .fetch_one(pool)
            .await
    }

    /// Bulk-insert characters by name, returning all created rows.
    ///
    /// All characters share the same `project_id` and optional `group_id`.
    /// Uses a single multi-row INSERT for efficiency.
    /// Params: $1=project_id, $2=group_id, $3..=$N=names.
    pub async fn create_many(
        pool: &PgPool,
        project_id: DbId,
        names: &[String],
        group_id: Option<DbId>,
    ) -> Result<Vec<Character>, sqlx::Error> {
        if names.is_empty() {
            return Ok(Vec::new());
        }

        let values: Vec<String> = names
            .iter()
            .enumerate()
            .map(|(i, _)| format!("($1, ${}, 1, '{{}}'::jsonb, $2)", i + 3))
            .collect();

        let query = format!(
            "INSERT INTO characters (project_id, name, status_id, settings, group_id)
             VALUES {}
             RETURNING {COLUMNS}",
            values.join(", ")
        );

        let mut q = sqlx::query_as::<_, Character>(&query)
            .bind(project_id)
            .bind(group_id);
        for name in names {
            q = q.bind(name);
        }

        q.fetch_all(pool).await
    }

    /// Find a character by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Character>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM characters WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all characters for a given project, ordered by name ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<Character>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM characters
             WHERE project_id = $1 AND deleted_at IS NULL
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List characters for a project with the best avatar variant ID per character.
    ///
    /// Uses a LATERAL subquery to pick the single best variant per character:
    /// clothed hero > any hero > clothed approved > any approved.
    /// This eliminates the N+1 query pattern where the frontend fetches
    /// all variants for each character just to find the avatar.
    pub async fn list_by_project_with_avatar(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<CharacterWithAvatar>, sqlx::Error> {
        // Prefix COLUMNS with table alias c.
        let cols = COLUMNS
            .split(", ")
            .map(|c| format!("c.{c}"))
            .collect::<Vec<_>>()
            .join(", ");
        sqlx::query_as::<_, CharacterWithAvatar>(&format!(
            "SELECT {cols}, av.id AS hero_variant_id
                 FROM characters c
                 LEFT JOIN LATERAL (
                     SELECT iv.id
                     FROM image_variants iv
                     WHERE iv.character_id = c.id
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

    /// Update a character. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacter,
    ) -> Result<Option<Character>, sqlx::Error> {
        // group_id uses a special pattern: outer Option = provided?, inner Option = nullable value.
        // When outer is None we keep the current value; when outer is Some we set to inner.
        let (group_id_provided, group_id_value) = match &input.group_id {
            Some(inner) => (true, *inner),
            None => (false, None),
        };

        let query = format!(
            "UPDATE characters SET
                name = COALESCE($2, name),
                status_id = COALESCE($3, status_id),
                metadata = COALESCE($4, metadata),
                settings = COALESCE($5, settings),
                group_id = CASE WHEN $6 THEN $7 ELSE group_id END
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
            .bind(group_id_provided)
            .bind(group_id_value)
            .fetch_optional(pool)
            .await
    }

    /// Find a character by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Character>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM characters WHERE id = $1");
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a character by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE characters SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted character. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE characters SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a character by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM characters WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Return just the `settings` JSONB value for a character.
    pub async fn get_settings(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT settings FROM characters WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Fully replace the `settings` column for a character.
    pub async fn update_settings(
        pool: &PgPool,
        id: DbId,
        settings: &serde_json::Value,
    ) -> Result<Option<Character>, sqlx::Error> {
        let query = format!(
            "UPDATE characters SET settings = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
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
    ) -> Result<Option<Character>, sqlx::Error> {
        let query = format!(
            "UPDATE characters SET settings = settings || $2::jsonb
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .bind(patch)
            .fetch_optional(pool)
            .await
    }

    /// List all characters across all projects for the library browser.
    ///
    /// Returns enriched rows with project name, group name, hero variant,
    /// and scene count. Supports optional text search and scene-type / track
    /// filtering.
    pub async fn list_all_for_library(
        pool: &PgPool,
        search: Option<&str>,
        scene_type_id: Option<DbId>,
        track_id: Option<DbId>,
    ) -> Result<Vec<LibraryCharacterRow>, sqlx::Error> {
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
                "EXISTS (SELECT 1 FROM scenes s WHERE s.character_id = c.id AND s.scene_type_id = ${bind_idx})"
            ));
            bind_idx += 1;
        }

        if track_id.is_some() {
            conditions.push(format!(
                "EXISTS (SELECT 1 FROM scenes s WHERE s.character_id = c.id AND s.track_id = ${bind_idx})"
            ));
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
             FROM characters c
             JOIN projects p ON p.id = c.project_id
             LEFT JOIN character_groups g ON g.id = c.group_id
             LEFT JOIN LATERAL (
                 SELECT iv.id
                 FROM image_variants iv
                 WHERE iv.character_id = c.id
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
                 WHERE s.character_id = c.id
             ) sc ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS cnt
                 FROM image_variants iv
                 WHERE iv.character_id = c.id
                   AND iv.deleted_at IS NULL
             ) ic ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS cnt
                 FROM scene_video_versions svv
                 JOIN scenes s ON s.id = svv.scene_id
                 WHERE s.character_id = c.id
             ) cc ON true
             WHERE {where_clause}
             ORDER BY c.name ASC"
        );

        let mut q = sqlx::query_as::<_, LibraryCharacterRow>(&sql);

        if let Some(s) = search {
            q = q.bind(s);
        }
        if let Some(st) = scene_type_id {
            q = q.bind(st);
        }
        if let Some(t) = track_id {
            q = q.bind(t);
        }

        q.fetch_all(pool).await
    }

    /// Toggle `is_enabled` for a character. Returns the updated row.
    pub async fn toggle_enabled(
        pool: &PgPool,
        id: DbId,
        enabled: bool,
    ) -> Result<Option<Character>, sqlx::Error> {
        let query = format!(
            "UPDATE characters SET is_enabled = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .bind(enabled)
            .fetch_optional(pool)
            .await
    }

    /// Per-character deliverable status for a project.
    ///
    /// Single query with LEFT JOINs + aggregates across image_variants, scenes,
    /// scene_video_versions, and character_metadata_versions. Excludes archived
    /// characters (status_id = 3).
    pub async fn list_deliverable_status(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<CharacterDeliverableRow>, sqlx::Error> {
        sqlx::query_as::<_, CharacterDeliverableRow>(
            "SELECT
                c.id,
                c.name,
                c.group_id,
                c.status_id,
                COALESCE(img.total, 0) AS images_count,
                COALESCE(img.approved, 0) AS images_approved,
                COALESCE(sc.total, 0) AS scenes_total,
                COALESCE(sc.with_video, 0) AS scenes_with_video,
                COALESCE(sc.vid_approved, 0) AS scenes_approved,
                COALESCE(meta.has_active, false) AS has_active_metadata,
                meta.approval_status AS metadata_approval_status,
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
             FROM characters c
             LEFT JOIN LATERAL (
                 SELECT
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE iv.status_id = 2) AS approved
                 FROM image_variants iv
                 WHERE iv.character_id = c.id AND iv.deleted_at IS NULL
             ) img ON true
             LEFT JOIN LATERAL (
                 SELECT
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE EXISTS (
                         SELECT 1 FROM scene_video_versions svv
                         WHERE svv.scene_id = s.id AND svv.deleted_at IS NULL
                     )) AS with_video,
                     COUNT(*) FILTER (WHERE EXISTS (
                         SELECT 1 FROM scene_video_versions svv
                         WHERE svv.scene_id = s.id AND svv.deleted_at IS NULL
                           AND svv.qa_status = 'approved'
                     )) AS vid_approved
                 FROM scenes s
                 WHERE s.character_id = c.id
             ) sc ON true
             LEFT JOIN LATERAL (
                 SELECT
                     EXISTS (
                         SELECT 1 FROM character_metadata_versions cmv
                         WHERE cmv.character_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                     ) AS has_active,
                     (
                         SELECT cmv.approval_status FROM character_metadata_versions cmv
                         WHERE cmv.character_id = c.id
                           AND cmv.is_active = true
                           AND cmv.deleted_at IS NULL
                         LIMIT 1
                     ) AS approval_status
             ) meta ON true
             LEFT JOIN LATERAL (
                 SELECT iv.id
                 FROM image_variants iv
                 WHERE iv.character_id = c.id
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
