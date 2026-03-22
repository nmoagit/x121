//! Repository for the `avatar_readiness_cache` table (PRD-107).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::readiness_cache::{AvatarReadinessCache, UpsertReadinessCache};

/// Column list for avatar_readiness_cache queries.
const COLUMNS: &str = "avatar_id, state, missing_items, readiness_pct, computed_at";

/// Provides data access for the avatar readiness cache.
pub struct ReadinessCacheRepo;

impl ReadinessCacheRepo {
    /// Upsert a readiness cache entry. Inserts or updates on conflict.
    pub async fn upsert(
        pool: &PgPool,
        input: &UpsertReadinessCache,
    ) -> Result<AvatarReadinessCache, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatar_readiness_cache
                (avatar_id, state, missing_items, readiness_pct, computed_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (avatar_id) DO UPDATE SET
                state = EXCLUDED.state,
                missing_items = EXCLUDED.missing_items,
                readiness_pct = EXCLUDED.readiness_pct,
                computed_at = NOW()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarReadinessCache>(&query)
            .bind(input.avatar_id)
            .bind(&input.state)
            .bind(&input.missing_items)
            .bind(input.readiness_pct)
            .fetch_one(pool)
            .await
    }

    /// Find a cached readiness entry for a single avatar.
    pub async fn find_by_avatar_id(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Option<AvatarReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_readiness_cache
             WHERE avatar_id = $1"
        );
        sqlx::query_as::<_, AvatarReadinessCache>(&query)
            .bind(avatar_id)
            .fetch_optional(pool)
            .await
    }

    /// Find cached readiness entries for multiple avatars.
    pub async fn find_by_avatar_ids(
        pool: &PgPool,
        avatar_ids: &[DbId],
    ) -> Result<Vec<AvatarReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_readiness_cache
             WHERE avatar_id = ANY($1)"
        );
        sqlx::query_as::<_, AvatarReadinessCache>(&query)
            .bind(avatar_ids)
            .fetch_all(pool)
            .await
    }

    /// Delete the cache entry for a avatar. Returns `true` if a row was deleted.
    pub async fn delete_by_avatar_id(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM avatar_readiness_cache WHERE avatar_id = $1")
            .bind(avatar_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all cache entries for avatars in a given project.
    pub async fn delete_by_project(pool: &PgPool, project_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM avatar_readiness_cache
             WHERE avatar_id IN (
                 SELECT id FROM avatars WHERE project_id = $1
             )",
        )
        .bind(project_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// List cache entries filtered by readiness state.
    pub async fn list_by_state(
        pool: &PgPool,
        state: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AvatarReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_readiness_cache
             WHERE state = $1
             ORDER BY readiness_pct ASC, avatar_id ASC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, AvatarReadinessCache>(&query)
            .bind(state)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Get a summary of readiness states across ALL avatars.
    ///
    /// Returns `(ready_count, partially_ready_count, not_started_count)`.
    pub async fn summary_all(pool: &PgPool) -> Result<(i64, i64, i64), sqlx::Error> {
        let row: (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
            "SELECT
                COUNT(*) FILTER (WHERE crc.state = 'ready'),
                COUNT(*) FILTER (WHERE crc.state = 'partially_ready'),
                COUNT(*) FILTER (WHERE crc.state = 'not_started')
             FROM avatar_readiness_cache crc
             JOIN avatars c ON c.id = crc.avatar_id
             WHERE c.deleted_at IS NULL",
        )
        .fetch_one(pool)
        .await?;

        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
    }

    /// Get a summary of readiness states for avatars in a project.
    ///
    /// Returns `(ready_count, partially_ready_count, not_started_count)`.
    pub async fn summary_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<(i64, i64, i64), sqlx::Error> {
        let row: (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
            "SELECT
                COUNT(*) FILTER (WHERE crc.state = 'ready'),
                COUNT(*) FILTER (WHERE crc.state = 'partially_ready'),
                COUNT(*) FILTER (WHERE crc.state = 'not_started')
             FROM avatar_readiness_cache crc
             JOIN avatars c ON c.id = crc.avatar_id
             WHERE c.project_id = $1",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
    }
}
