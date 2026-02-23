//! Repository for the `resolution_tiers` table (PRD-59).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::resolution_tier::{CreateResolutionTier, ResolutionTier};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, display_name, width, height, \
    quality_settings, speed_factor, is_default, sort_order, \
    created_at, updated_at";

/// Provides CRUD operations for resolution tiers.
pub struct ResolutionTierRepo;

impl ResolutionTierRepo {
    /// List all resolution tiers, ordered by sort_order ascending.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<ResolutionTier>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM resolution_tiers ORDER BY sort_order ASC");
        sqlx::query_as::<_, ResolutionTier>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a resolution tier by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ResolutionTier>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM resolution_tiers WHERE id = $1");
        sqlx::query_as::<_, ResolutionTier>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a resolution tier by its unique name.
    pub async fn find_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<ResolutionTier>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM resolution_tiers WHERE name = $1");
        sqlx::query_as::<_, ResolutionTier>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Find the default resolution tier (the one with `is_default = true`).
    pub async fn find_default(pool: &PgPool) -> Result<Option<ResolutionTier>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM resolution_tiers WHERE is_default = true LIMIT 1");
        sqlx::query_as::<_, ResolutionTier>(&query)
            .fetch_optional(pool)
            .await
    }

    /// Insert a new resolution tier, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateResolutionTier,
    ) -> Result<ResolutionTier, sqlx::Error> {
        let query = format!(
            "INSERT INTO resolution_tiers
                (name, display_name, width, height, quality_settings,
                 speed_factor, is_default, sort_order)
             VALUES ($1, $2, $3, $4, COALESCE($5, '{{}}'::jsonb),
                     COALESCE($6, 1.0), COALESCE($7, false), COALESCE($8, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ResolutionTier>(&query)
            .bind(&input.name)
            .bind(&input.display_name)
            .bind(input.width)
            .bind(input.height)
            .bind(&input.quality_settings)
            .bind(input.speed_factor)
            .bind(input.is_default)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Update the resolution tier on a scene.
    pub async fn update_scene_tier(
        pool: &PgPool,
        scene_id: DbId,
        tier_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE scenes SET resolution_tier_id = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .bind(tier_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Set the upscale provenance link on a scene.
    pub async fn set_upscaled_from(
        pool: &PgPool,
        scene_id: DbId,
        from_scene_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE scenes SET upscaled_from_scene_id = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .bind(from_scene_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
