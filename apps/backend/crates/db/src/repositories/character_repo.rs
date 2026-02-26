//! Repository for the `characters` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character::{Character, CreateCharacter, UpdateCharacter};

/// Column list shared across queries to avoid repetition.
///
/// Excludes `face_embedding` (vector(512)) which is large and handled by
/// the embedding repo. All other PRD-76 columns have DB defaults so
/// existing INSERT queries remain valid.
const COLUMNS: &str =
    "id, project_id, name, status_id, metadata, settings, deleted_at, created_at, updated_at, \
     face_detection_confidence, face_bounding_box, embedding_status_id, embedding_extracted_at";

/// Provides CRUD operations for characters plus settings helpers.
pub struct CharacterRepo;

impl CharacterRepo {
    /// Insert a new character, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `settings` is `None`, defaults to `'{}'::jsonb`.
    pub async fn create(pool: &PgPool, input: &CreateCharacter) -> Result<Character, sqlx::Error> {
        let query = format!(
            "INSERT INTO characters (project_id, name, status_id, metadata, settings)
             VALUES ($1, $2, COALESCE($3, 1), $4, COALESCE($5, '{{}}'::jsonb))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
            .fetch_one(pool)
            .await
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

    /// Update a character. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacter,
    ) -> Result<Option<Character>, sqlx::Error> {
        let query = format!(
            "UPDATE characters SET
                name = COALESCE($2, name),
                status_id = COALESCE($3, status_id),
                metadata = COALESCE($4, metadata),
                settings = COALESCE($5, settings)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Character>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.metadata)
            .bind(&input.settings)
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
}
