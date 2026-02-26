//! Repository for the `character_readiness_cache` table (PRD-107).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::readiness_cache::{CharacterReadinessCache, UpsertReadinessCache};

/// Column list for character_readiness_cache queries.
const COLUMNS: &str = "character_id, state, missing_items, readiness_pct, computed_at";

/// Provides data access for the character readiness cache.
pub struct ReadinessCacheRepo;

impl ReadinessCacheRepo {
    /// Upsert a readiness cache entry. Inserts or updates on conflict.
    pub async fn upsert(
        pool: &PgPool,
        input: &UpsertReadinessCache,
    ) -> Result<CharacterReadinessCache, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_readiness_cache
                (character_id, state, missing_items, readiness_pct, computed_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (character_id) DO UPDATE SET
                state = EXCLUDED.state,
                missing_items = EXCLUDED.missing_items,
                readiness_pct = EXCLUDED.readiness_pct,
                computed_at = NOW()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterReadinessCache>(&query)
            .bind(input.character_id)
            .bind(&input.state)
            .bind(&input.missing_items)
            .bind(input.readiness_pct)
            .fetch_one(pool)
            .await
    }

    /// Find a cached readiness entry for a single character.
    pub async fn find_by_character_id(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Option<CharacterReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_readiness_cache
             WHERE character_id = $1"
        );
        sqlx::query_as::<_, CharacterReadinessCache>(&query)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    /// Find cached readiness entries for multiple characters.
    pub async fn find_by_character_ids(
        pool: &PgPool,
        character_ids: &[DbId],
    ) -> Result<Vec<CharacterReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_readiness_cache
             WHERE character_id = ANY($1)"
        );
        sqlx::query_as::<_, CharacterReadinessCache>(&query)
            .bind(character_ids)
            .fetch_all(pool)
            .await
    }

    /// Delete the cache entry for a character. Returns `true` if a row was deleted.
    pub async fn delete_by_character_id(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_readiness_cache WHERE character_id = $1")
            .bind(character_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all cache entries for characters in a given project.
    pub async fn delete_by_project(pool: &PgPool, project_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM character_readiness_cache
             WHERE character_id IN (
                 SELECT id FROM characters WHERE project_id = $1
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
    ) -> Result<Vec<CharacterReadinessCache>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_readiness_cache
             WHERE state = $1
             ORDER BY readiness_pct ASC, character_id ASC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, CharacterReadinessCache>(&query)
            .bind(state)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Get a summary of readiness states for characters in a project.
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
             FROM character_readiness_cache crc
             JOIN characters c ON c.id = crc.character_id
             WHERE c.project_id = $1",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
    }
}
