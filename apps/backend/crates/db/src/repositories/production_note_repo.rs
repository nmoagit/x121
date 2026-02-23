//! Repository for the `production_notes` table (PRD-95).

use sqlx::PgPool;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;

use crate::models::production_note::{
    CreateProductionNote, ProductionNote, UpdateProductionNote,
};

/// Column list for production_notes queries.
const COLUMNS: &str = "id, entity_type, entity_id, user_id, content_md, category_id, \
    visibility, pinned, parent_note_id, resolved_at, resolved_by, created_at, updated_at";

/// Provides CRUD operations for production notes.
pub struct ProductionNoteRepo;

impl ProductionNoteRepo {
    /// Create a new production note, returning the created row.
    pub async fn create(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateProductionNote,
    ) -> Result<ProductionNote, sqlx::Error> {
        let visibility = input.visibility.as_deref().unwrap_or("team");
        let query = format!(
            "INSERT INTO production_notes
                (entity_type, entity_id, user_id, content_md, category_id, visibility, parent_note_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(user_id)
            .bind(&input.content_md)
            .bind(input.category_id)
            .bind(visibility)
            .bind(input.parent_note_id)
            .fetch_one(pool)
            .await
    }

    /// Find a production note by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionNote>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM production_notes WHERE id = $1");
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List notes for a given entity, ordered by pinned first then newest.
    pub async fn list_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ProductionNote>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let query = format!(
            "SELECT {COLUMNS} FROM production_notes
             WHERE entity_type = $1 AND entity_id = $2 AND parent_note_id IS NULL
             ORDER BY pinned DESC, created_at DESC
             LIMIT $3 OFFSET $4"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List pinned notes for an entity.
    pub async fn list_pinned(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Vec<ProductionNote>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM production_notes
             WHERE entity_type = $1 AND entity_id = $2 AND pinned = TRUE
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_all(pool)
            .await
    }

    /// List child notes (replies) for a parent note.
    pub async fn list_thread(
        pool: &PgPool,
        parent_note_id: DbId,
    ) -> Result<Vec<ProductionNote>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM production_notes
             WHERE parent_note_id = $1
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(parent_note_id)
            .fetch_all(pool)
            .await
    }

    /// Update a production note by ID, returning the updated row.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateProductionNote,
    ) -> Result<Option<ProductionNote>, sqlx::Error> {
        let query = format!(
            "UPDATE production_notes SET
                content_md = COALESCE($2, content_md),
                category_id = COALESCE($3, category_id),
                visibility = COALESCE($4, visibility)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(id)
            .bind(&input.content_md)
            .bind(input.category_id)
            .bind(&input.visibility)
            .fetch_optional(pool)
            .await
    }

    /// Toggle the pinned state of a note.
    pub async fn toggle_pin(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionNote>, sqlx::Error> {
        let query = format!(
            "UPDATE production_notes SET pinned = NOT pinned
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a note as resolved.
    pub async fn resolve(
        pool: &PgPool,
        id: DbId,
        user_id: DbId,
    ) -> Result<Option<ProductionNote>, sqlx::Error> {
        let query = format!(
            "UPDATE production_notes SET resolved_at = NOW(), resolved_by = $2
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(id)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Clear the resolved state of a note.
    pub async fn unresolve(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionNote>, sqlx::Error> {
        let query = format!(
            "UPDATE production_notes SET resolved_at = NULL, resolved_by = NULL
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionNote>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Search notes by content (ILIKE), optionally filtered by entity type.
    pub async fn search(
        pool: &PgPool,
        query_str: &str,
        entity_type_filter: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ProductionNote>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let pattern = format!("%{query_str}%");

        if let Some(entity_type) = entity_type_filter {
            let query = format!(
                "SELECT {COLUMNS} FROM production_notes
                 WHERE content_md ILIKE $1 AND entity_type = $2
                 ORDER BY created_at DESC
                 LIMIT $3 OFFSET $4"
            );
            sqlx::query_as::<_, ProductionNote>(&query)
                .bind(&pattern)
                .bind(entity_type)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM production_notes
                 WHERE content_md ILIKE $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, ProductionNote>(&query)
                .bind(&pattern)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        }
    }

    /// Delete a production note by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM production_notes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
