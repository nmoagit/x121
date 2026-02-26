//! Repository for the `scene_catalog` and `scene_catalog_tracks` tables (PRD-111).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_catalog::{
    CreateSceneCatalogEntry, SceneCatalogEntry, SceneCatalogWithTracks, UpdateSceneCatalogEntry,
};
use crate::models::track::Track;

/// Column list for the `scene_catalog` table.
const COLUMNS: &str = "id, name, slug, description, has_clothes_off_transition, \
    sort_order, is_active, created_at, updated_at";

/// Column list for the `tracks` table (used in JOIN queries).
const TRACK_COLUMNS: &str =
    "t.id, t.name, t.slug, t.sort_order, t.is_active, t.created_at, t.updated_at";

/// Provides CRUD operations for scene catalog entries and their track associations.
pub struct SceneCatalogRepo;

impl SceneCatalogRepo {
    /// Insert a new scene catalog entry.
    ///
    /// If `track_ids` is non-empty, also creates junction rows in a transaction.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSceneCatalogEntry,
    ) -> Result<SceneCatalogEntry, sqlx::Error> {
        let mut tx = pool.begin().await?;

        let insert_query = format!(
            "INSERT INTO scene_catalog \
                (name, slug, description, has_clothes_off_transition, sort_order, is_active) \
             VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, 0), COALESCE($6, true)) \
             RETURNING {COLUMNS}"
        );
        let entry = sqlx::query_as::<_, SceneCatalogEntry>(&insert_query)
            .bind(&input.name)
            .bind(&input.slug)
            .bind(&input.description)
            .bind(input.has_clothes_off_transition)
            .bind(input.sort_order)
            .bind(input.is_active)
            .fetch_one(&mut *tx)
            .await?;

        if !input.track_ids.is_empty() {
            Self::set_tracks_inner(&mut tx, entry.id, &input.track_ids).await?;
        }

        tx.commit().await?;
        Ok(entry)
    }

    /// Find a scene catalog entry by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneCatalogEntry>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scene_catalog WHERE id = $1");
        sqlx::query_as::<_, SceneCatalogEntry>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a scene catalog entry by ID, enriched with its tracks.
    pub async fn find_by_id_with_tracks(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneCatalogWithTracks>, sqlx::Error> {
        let entry = Self::find_by_id(pool, id).await?;
        match entry {
            Some(entry) => {
                let tracks = Self::get_tracks_for_scene(pool, entry.id).await?;
                Ok(Some(SceneCatalogWithTracks { entry, tracks }))
            }
            None => Ok(None),
        }
    }

    /// List all scene catalog entries, optionally including inactive ones.
    pub async fn list(
        pool: &PgPool,
        include_inactive: bool,
    ) -> Result<Vec<SceneCatalogEntry>, sqlx::Error> {
        let query = if include_inactive {
            format!("SELECT {COLUMNS} FROM scene_catalog ORDER BY sort_order, name")
        } else {
            format!(
                "SELECT {COLUMNS} FROM scene_catalog \
                 WHERE is_active = true \
                 ORDER BY sort_order, name"
            )
        };
        sqlx::query_as::<_, SceneCatalogEntry>(&query)
            .fetch_all(pool)
            .await
    }

    /// List all scene catalog entries with their tracks.
    pub async fn list_with_tracks(
        pool: &PgPool,
        include_inactive: bool,
    ) -> Result<Vec<SceneCatalogWithTracks>, sqlx::Error> {
        let entries = Self::list(pool, include_inactive).await?;
        let mut result = Vec::with_capacity(entries.len());

        for entry in entries {
            let tracks = Self::get_tracks_for_scene(pool, entry.id).await?;
            result.push(SceneCatalogWithTracks { entry, tracks });
        }

        Ok(result)
    }

    /// Update a scene catalog entry. Only non-`None` fields are applied.
    ///
    /// If `track_ids` is `Some`, replaces all track associations.
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneCatalogEntry,
    ) -> Result<Option<SceneCatalogEntry>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        let update_query = format!(
            "UPDATE scene_catalog SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                has_clothes_off_transition = COALESCE($4, has_clothes_off_transition), \
                sort_order = COALESCE($5, sort_order), \
                is_active = COALESCE($6, is_active) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        let entry = sqlx::query_as::<_, SceneCatalogEntry>(&update_query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.has_clothes_off_transition)
            .bind(input.sort_order)
            .bind(input.is_active)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some(ref entry) = entry {
            if let Some(ref track_ids) = input.track_ids {
                Self::set_tracks_inner(&mut tx, entry.id, track_ids).await?;
            }
        }

        tx.commit().await?;
        Ok(entry)
    }

    /// Deactivate a scene catalog entry (set is_active = false).
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_catalog SET is_active = false \
             WHERE id = $1 AND is_active = true",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Track association helpers
    // -----------------------------------------------------------------------

    /// Get all tracks associated with a scene catalog entry.
    pub async fn get_tracks_for_scene(
        pool: &PgPool,
        scene_catalog_id: DbId,
    ) -> Result<Vec<Track>, sqlx::Error> {
        let query = format!(
            "SELECT {TRACK_COLUMNS} \
             FROM tracks t \
             JOIN scene_catalog_tracks sct ON sct.track_id = t.id \
             WHERE sct.scene_catalog_id = $1 \
             ORDER BY t.sort_order, t.name"
        );
        sqlx::query_as::<_, Track>(&query)
            .bind(scene_catalog_id)
            .fetch_all(pool)
            .await
    }

    /// Replace all track associations for a scene catalog entry.
    ///
    /// Deletes existing associations, then inserts the new set.
    pub async fn set_tracks(
        pool: &PgPool,
        scene_catalog_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        Self::set_tracks_inner(&mut tx, scene_catalog_id, track_ids).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Add a single track to a scene catalog entry (idempotent).
    pub async fn add_track(
        pool: &PgPool,
        scene_catalog_id: DbId,
        track_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id) \
             VALUES ($1, $2) \
             ON CONFLICT DO NOTHING",
        )
        .bind(scene_catalog_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Remove a single track from a scene catalog entry.
    ///
    /// Returns `true` if the association was removed.
    pub async fn remove_track(
        pool: &PgPool,
        scene_catalog_id: DbId,
        track_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM scene_catalog_tracks \
             WHERE scene_catalog_id = $1 AND track_id = $2",
        )
        .bind(scene_catalog_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Replace track associations within an existing transaction.
    async fn set_tracks_inner(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scene_catalog_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        // Delete existing
        sqlx::query("DELETE FROM scene_catalog_tracks WHERE scene_catalog_id = $1")
            .bind(scene_catalog_id)
            .execute(&mut **tx)
            .await?;

        // Insert new associations
        for &track_id in track_ids {
            sqlx::query(
                "INSERT INTO scene_catalog_tracks (scene_catalog_id, track_id) VALUES ($1, $2)",
            )
            .bind(scene_catalog_id)
            .bind(track_id)
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }
}
