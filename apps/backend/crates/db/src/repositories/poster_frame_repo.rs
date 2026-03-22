//! Repository for the `poster_frames` table (PRD-96).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::poster_frame::{PosterFrame, UpdatePosterFrameAdjustments, UpsertPosterFrame};

/// Column list for the `poster_frames` table.
const COLUMNS: &str = "id, entity_type, entity_id, segment_id, frame_number, \
    image_path, crop_settings_json, brightness, contrast, created_by, \
    created_at, updated_at";

/// Column list prefixed with `pf.` for joins.
const COLUMNS_PF: &str = "pf.id, pf.entity_type, pf.entity_id, pf.segment_id, \
    pf.frame_number, pf.image_path, pf.crop_settings_json, pf.brightness, \
    pf.contrast, pf.created_by, pf.created_at, pf.updated_at";

/// Provides CRUD operations for poster frames.
pub struct PosterFrameRepo;

impl PosterFrameRepo {
    /// Upsert a poster frame for a given entity.
    ///
    /// If a poster frame already exists for the `(entity_type, entity_id)` pair,
    /// it is replaced with the new values. Otherwise a new row is inserted.
    pub async fn upsert(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        created_by: DbId,
        input: &UpsertPosterFrame,
    ) -> Result<PosterFrame, sqlx::Error> {
        let query = format!(
            "INSERT INTO poster_frames
                (entity_type, entity_id, segment_id, frame_number, image_path,
                 crop_settings_json, brightness, contrast, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 1.0), COALESCE($8, 1.0), $9)
             ON CONFLICT (entity_type, entity_id)
             DO UPDATE SET
                segment_id = EXCLUDED.segment_id,
                frame_number = EXCLUDED.frame_number,
                image_path = EXCLUDED.image_path,
                crop_settings_json = EXCLUDED.crop_settings_json,
                brightness = EXCLUDED.brightness,
                contrast = EXCLUDED.contrast,
                created_by = EXCLUDED.created_by
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PosterFrame>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(input.segment_id)
            .bind(input.frame_number)
            .bind(&input.image_path)
            .bind(&input.crop_settings_json)
            .bind(input.brightness)
            .bind(input.contrast)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Find the poster frame for a given entity, if one exists.
    pub async fn find_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<PosterFrame>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM poster_frames \
             WHERE entity_type = $1 AND entity_id = $2"
        );
        sqlx::query_as::<_, PosterFrame>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    /// List all avatar poster frames for a given project.
    ///
    /// Joins through `avatars` to filter by `project_id`.
    pub async fn get_project_gallery(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<PosterFrame>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS_PF} FROM poster_frames pf \
             JOIN avatars c ON pf.entity_id = c.id \
             WHERE pf.entity_type = 'avatar' \
               AND c.project_id = $1 \
               AND c.deleted_at IS NULL \
             ORDER BY c.name ASC"
        );
        sqlx::query_as::<_, PosterFrame>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update only the crop/brightness/contrast adjustments on a poster frame.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update_adjustments(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePosterFrameAdjustments,
    ) -> Result<Option<PosterFrame>, sqlx::Error> {
        let query = format!(
            "UPDATE poster_frames SET
                crop_settings_json = COALESCE($2, crop_settings_json),
                brightness = COALESCE($3, brightness),
                contrast = COALESCE($4, contrast)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PosterFrame>(&query)
            .bind(id)
            .bind(&input.crop_settings_json)
            .bind(input.brightness)
            .bind(input.contrast)
            .fetch_optional(pool)
            .await
    }

    /// Delete the poster frame for a given entity.
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM poster_frames WHERE entity_type = $1 AND entity_id = $2")
                .bind(entity_type)
                .bind(entity_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }
}
