//! Repository for the `scenes` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::scene::{CreateScene, Scene, UpdateScene};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, scene_type_id, image_variant_id, \
    status_id, transition_mode, deleted_at, created_at, updated_at";

/// Provides CRUD operations for scenes.
pub struct SceneRepo;

impl SceneRepo {
    /// Insert a new scene, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Pending).
    /// If `transition_mode` is `None`, defaults to `'cut'`.
    pub async fn create(pool: &PgPool, input: &CreateScene) -> Result<Scene, sqlx::Error> {
        let query = format!(
            "INSERT INTO scenes
                (character_id, scene_type_id, image_variant_id, status_id, transition_mode)
             VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, 'cut'))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(input.character_id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(input.status_id)
            .bind(&input.transition_mode)
            .fetch_one(pool)
            .await
    }

    /// Find a scene by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scenes WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all scenes for a given character, ordered by creation time ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<Scene>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scenes
             WHERE character_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Update a scene. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateScene,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!(
            "UPDATE scenes SET
                scene_type_id = COALESCE($2, scene_type_id),
                image_variant_id = COALESCE($3, image_variant_id),
                status_id = COALESCE($4, status_id),
                transition_mode = COALESCE($5, transition_mode)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(input.status_id)
            .bind(&input.transition_mode)
            .fetch_optional(pool)
            .await
    }

    /// Find a scene by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scenes WHERE id = $1");
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a scene by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scenes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted scene. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scenes SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a scene by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scenes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
