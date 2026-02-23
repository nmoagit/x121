//! Repository for the `note_categories` table (PRD-95).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::note_category::{CreateNoteCategory, NoteCategory, UpdateNoteCategory};

/// Column list for note_categories queries.
const COLUMNS: &str = "id, name, color, icon, created_at, updated_at";

/// Provides CRUD operations for note categories.
pub struct NoteCategoryRepo;

impl NoteCategoryRepo {
    /// List all note categories, ordered by name ascending.
    pub async fn list(pool: &PgPool) -> Result<Vec<NoteCategory>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM note_categories ORDER BY name ASC");
        sqlx::query_as::<_, NoteCategory>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a note category by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<NoteCategory>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM note_categories WHERE id = $1");
        sqlx::query_as::<_, NoteCategory>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new note category, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateNoteCategory,
    ) -> Result<NoteCategory, sqlx::Error> {
        let query = format!(
            "INSERT INTO note_categories (name, color, icon)
             VALUES ($1, COALESCE($2, '#888888'), $3)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, NoteCategory>(&query)
            .bind(&input.name)
            .bind(&input.color)
            .bind(&input.icon)
            .fetch_one(pool)
            .await
    }

    /// Update a note category by ID, returning the updated row.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateNoteCategory,
    ) -> Result<Option<NoteCategory>, sqlx::Error> {
        let query = format!(
            "UPDATE note_categories SET
                name = COALESCE($2, name),
                color = COALESCE($3, color),
                icon = COALESCE($4, icon)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, NoteCategory>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.color)
            .bind(&input.icon)
            .fetch_optional(pool)
            .await
    }

    /// Delete a note category by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM note_categories WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
