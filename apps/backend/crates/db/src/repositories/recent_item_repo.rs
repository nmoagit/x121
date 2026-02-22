//! Repository for the `user_recent_items` table (PRD-31).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::recent_item::UserRecentItem;

/// Column list for `user_recent_items` queries.
const COLUMNS: &str = "\
    id, user_id, entity_type, entity_id, access_count, \
    last_accessed_at, created_at, updated_at";

/// Provides CRUD operations for user recent items (command palette).
pub struct RecentItemRepo;

impl RecentItemRepo {
    /// Record an entity access for a user.
    ///
    /// Uses INSERT ... ON CONFLICT to upsert: if the user+entity combination
    /// already exists, increments `access_count` and updates `last_accessed_at`.
    pub async fn record_access(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<UserRecentItem, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_recent_items (user_id, entity_type, entity_id) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET \
                 access_count = user_recent_items.access_count + 1, \
                 last_accessed_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserRecentItem>(&query)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_one(pool)
            .await
    }

    /// Get recent items for a user, ordered by `last_accessed_at` descending.
    ///
    /// The `limit` should already be validated/clamped by the caller.
    pub async fn get_recent(
        pool: &PgPool,
        user_id: DbId,
        limit: i32,
    ) -> Result<Vec<UserRecentItem>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM user_recent_items \
             WHERE user_id = $1 \
             ORDER BY last_accessed_at DESC \
             LIMIT $2"
        );
        sqlx::query_as::<_, UserRecentItem>(&query)
            .bind(user_id)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Delete a specific recent item for a user.
    pub async fn delete_item(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM user_recent_items \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3",
        )
        .bind(user_id)
        .bind(entity_type)
        .bind(entity_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Clear all recent items for a user.
    pub async fn clear_all(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM user_recent_items WHERE user_id = $1",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
