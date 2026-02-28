//! Repository for the `prompt_fragments` and `prompt_fragment_scene_pins` tables (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::prompt_fragment::{
    CreatePromptFragment, PromptFragment, PromptFragmentListParams, UpdatePromptFragment,
};

/// Column list for the `prompt_fragments` table.
const COLUMNS: &str = "id, text, description, category, tags, usage_count, \
    created_by, created_at, updated_at";

/// Provides data access for prompt fragments and scene-type pinning.
pub struct PromptFragmentRepo;

impl PromptFragmentRepo {
    /// Insert a new prompt fragment, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreatePromptFragment,
    ) -> Result<PromptFragment, sqlx::Error> {
        let query = format!(
            "INSERT INTO prompt_fragments (text, description, category, tags, created_by) \
             VALUES ($1, $2, $3, COALESCE($4, '[]'::jsonb), $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PromptFragment>(&query)
            .bind(&input.text)
            .bind(&input.description)
            .bind(&input.category)
            .bind(&input.tags)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a prompt fragment by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PromptFragment>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM prompt_fragments WHERE id = $1");
        sqlx::query_as::<_, PromptFragment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List prompt fragments with optional filters.
    ///
    /// Supports:
    /// - `search`: full-text search on the `text` column
    /// - `category`: exact match on category
    /// - `scene_type_id`: pinned fragments appear first, then all others
    pub async fn list(
        pool: &PgPool,
        params: &PromptFragmentListParams,
    ) -> Result<Vec<PromptFragment>, sqlx::Error> {
        // Build the query dynamically based on which filters are present.
        // When scene_type_id is provided, add a LEFT JOIN to surface pinned
        // fragments first via ORDER BY.
        let mut conditions = Vec::new();
        let mut bind_idx: u32 = 1;

        let join_clause = if params.scene_type_id.is_some() {
            let clause = format!(
                "LEFT JOIN prompt_fragment_scene_pins pin \
                 ON pin.fragment_id = pf.id AND pin.scene_type_id = ${bind_idx}"
            );
            bind_idx += 1;
            clause
        } else {
            String::new()
        };

        if params.search.is_some() {
            conditions.push(format!(
                "to_tsvector('english', pf.text) @@ plainto_tsquery('english', ${bind_idx})"
            ));
            bind_idx += 1;
        }

        if params.category.is_some() {
            conditions.push(format!("pf.category = ${bind_idx}"));
            // bind_idx not needed after last use, but keep for consistency
            let _ = bind_idx;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let order_clause = if params.scene_type_id.is_some() {
            "ORDER BY (pin.fragment_id IS NOT NULL) DESC, pf.usage_count DESC, pf.id"
        } else {
            "ORDER BY pf.usage_count DESC, pf.id"
        };

        let prefixed_columns = COLUMNS
            .split(", ")
            .map(|c| format!("pf.{c}"))
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT {prefixed_columns} FROM prompt_fragments pf \
             {join_clause} {where_clause} {order_clause}"
        );

        let mut query = sqlx::query_as::<_, PromptFragment>(&sql);

        // Bind parameters in order: scene_type_id first (if present), then search, then category.
        if let Some(scene_type_id) = params.scene_type_id {
            query = query.bind(scene_type_id);
        }
        if let Some(ref search) = params.search {
            query = query.bind(search);
        }
        if let Some(ref category) = params.category {
            query = query.bind(category);
        }

        query.fetch_all(pool).await
    }

    /// Update a prompt fragment. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePromptFragment,
    ) -> Result<Option<PromptFragment>, sqlx::Error> {
        let query = format!(
            "UPDATE prompt_fragments SET
                text = COALESCE($2, text),
                description = COALESCE($3, description),
                category = COALESCE($4, category),
                tags = COALESCE($5, tags)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PromptFragment>(&query)
            .bind(id)
            .bind(&input.text)
            .bind(&input.description)
            .bind(&input.category)
            .bind(&input.tags)
            .fetch_optional(pool)
            .await
    }

    /// Delete a prompt fragment by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM prompt_fragments WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Increment the `usage_count` of a prompt fragment by 1.
    pub async fn increment_usage(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE prompt_fragments SET usage_count = usage_count + 1 WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // -------------------------------------------------------------------
    // Scene-type pinning
    // -------------------------------------------------------------------

    /// Pin a fragment to a scene type. Idempotent (ignores conflicts).
    pub async fn pin_to_scene_type(
        pool: &PgPool,
        fragment_id: DbId,
        scene_type_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO prompt_fragment_scene_pins (fragment_id, scene_type_id) \
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(fragment_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Unpin a fragment from a scene type. Returns `true` if a pin was removed.
    pub async fn unpin_from_scene_type(
        pool: &PgPool,
        fragment_id: DbId,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM prompt_fragment_scene_pins \
             WHERE fragment_id = $1 AND scene_type_id = $2",
        )
        .bind(fragment_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all scene type IDs that a fragment is pinned to.
    pub async fn list_pinned_scene_types(
        pool: &PgPool,
        fragment_id: DbId,
    ) -> Result<Vec<DbId>, sqlx::Error> {
        let rows: Vec<(DbId,)> = sqlx::query_as(
            "SELECT scene_type_id FROM prompt_fragment_scene_pins \
             WHERE fragment_id = $1 ORDER BY scene_type_id",
        )
        .bind(fragment_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}
