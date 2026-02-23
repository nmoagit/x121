//! Repository for the `prompt_library` table (PRD-63).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::prompt_library_entry::{
    CreateLibraryEntry, PromptLibraryEntry, UpdateLibraryEntry,
};

/// Column list for prompt_library queries.
const COLUMNS: &str = "id, name, description, positive_prompt, negative_prompt, \
    tags, model_compatibility, usage_count, avg_rating, owner_id, \
    created_at, updated_at";

/// Provides CRUD operations for prompt library entries.
pub struct PromptLibraryRepo;

impl PromptLibraryRepo {
    /// Insert a new prompt library entry. Returns the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateLibraryEntry,
    ) -> Result<PromptLibraryEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO prompt_library
                (name, description, positive_prompt, negative_prompt,
                 tags, model_compatibility, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PromptLibraryEntry>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.positive_prompt)
            .bind(&input.negative_prompt)
            .bind(&input.tags)
            .bind(&input.model_compatibility)
            .bind(input.owner_id)
            .fetch_one(pool)
            .await
    }

    /// Find a prompt library entry by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PromptLibraryEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM prompt_library WHERE id = $1"
        );
        sqlx::query_as::<_, PromptLibraryEntry>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List prompt library entries with optional name search and pagination.
    pub async fn list(
        pool: &PgPool,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<PromptLibraryEntry>, sqlx::Error> {
        if let Some(term) = search {
            let pattern = format!("%{term}%");
            let query = format!(
                "SELECT {COLUMNS} FROM prompt_library
                 WHERE name ILIKE $1
                 ORDER BY usage_count DESC, created_at DESC
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, PromptLibraryEntry>(&query)
                .bind(&pattern)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM prompt_library
                 ORDER BY usage_count DESC, created_at DESC
                 LIMIT $1 OFFSET $2"
            );
            sqlx::query_as::<_, PromptLibraryEntry>(&query)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        }
    }

    /// Update a prompt library entry. Only provided fields are updated.
    /// Returns `None` if the entry does not exist.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateLibraryEntry,
    ) -> Result<Option<PromptLibraryEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE prompt_library SET
                name              = COALESCE($1, name),
                description       = COALESCE($2, description),
                positive_prompt   = COALESCE($3, positive_prompt),
                negative_prompt   = COALESCE($4, negative_prompt),
                tags              = COALESCE($5, tags),
                model_compatibility = COALESCE($6, model_compatibility)
             WHERE id = $7
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PromptLibraryEntry>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.positive_prompt)
            .bind(&input.negative_prompt)
            .bind(&input.tags)
            .bind(&input.model_compatibility)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a prompt library entry by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM prompt_library WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Increment the usage count for a library entry. Returns `true` if updated.
    pub async fn increment_usage(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE prompt_library SET usage_count = usage_count + 1 WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Update the average rating for a library entry. Returns `true` if updated.
    pub async fn update_rating(
        pool: &PgPool,
        id: DbId,
        new_avg: f64,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE prompt_library SET avg_rating = $1 WHERE id = $2")
                .bind(new_avg)
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }
}
