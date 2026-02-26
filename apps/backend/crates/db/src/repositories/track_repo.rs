//! Repository for the `tracks` table (PRD-111).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::track::{CreateTrack, Track, UpdateTrack};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, slug, sort_order, is_active, created_at, updated_at";

/// Provides CRUD operations for tracks.
pub struct TrackRepo;

impl TrackRepo {
    /// Insert a new track, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateTrack) -> Result<Track, sqlx::Error> {
        let query = format!(
            "INSERT INTO tracks (name, slug, sort_order, is_active) \
             VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, true)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Track>(&query)
            .bind(&input.name)
            .bind(&input.slug)
            .bind(input.sort_order)
            .bind(input.is_active)
            .fetch_one(pool)
            .await
    }

    /// Find a track by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Track>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM tracks WHERE id = $1");
        sqlx::query_as::<_, Track>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all tracks, optionally including inactive ones.
    ///
    /// Ordered by sort_order, then name.
    pub async fn list(pool: &PgPool, include_inactive: bool) -> Result<Vec<Track>, sqlx::Error> {
        let query = if include_inactive {
            format!("SELECT {COLUMNS} FROM tracks ORDER BY sort_order, name")
        } else {
            format!("SELECT {COLUMNS} FROM tracks WHERE is_active = true ORDER BY sort_order, name")
        };
        sqlx::query_as::<_, Track>(&query).fetch_all(pool).await
    }

    /// Update a track. Only non-`None` fields are applied. Slug is immutable.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateTrack,
    ) -> Result<Option<Track>, sqlx::Error> {
        let query = format!(
            "UPDATE tracks SET \
                name = COALESCE($2, name), \
                sort_order = COALESCE($3, sort_order), \
                is_active = COALESCE($4, is_active) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Track>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.sort_order)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Deactivate a track (set is_active = false).
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE tracks SET is_active = false WHERE id = $1 AND is_active = true")
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }
}
