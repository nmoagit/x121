//! Repository for the `legacy_import_entity_log` table (PRD-86).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::legacy_import_entity_log::{CreateLegacyImportEntityLog, LegacyImportEntityLog};

/// Column list for legacy_import_entity_log queries.
const COLUMNS: &str = "id, run_id, entity_type, entity_id, source_path, action, \
    details, created_at, updated_at";

/// Provides CRUD operations for legacy import entity log entries.
pub struct LegacyImportEntityLogRepo;

impl LegacyImportEntityLogRepo {
    /// Create a new entity log entry, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateLegacyImportEntityLog,
    ) -> Result<LegacyImportEntityLog, sqlx::Error> {
        let details = input
            .details
            .clone()
            .unwrap_or_else(|| serde_json::json!({}));
        let query = format!(
            "INSERT INTO legacy_import_entity_log
                (run_id, entity_type, entity_id, source_path, action, details)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportEntityLog>(&query)
            .bind(input.run_id)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(&input.source_path)
            .bind(&input.action)
            .bind(&details)
            .fetch_one(pool)
            .await
    }

    /// List entity log entries for a given run, ordered by creation time.
    pub async fn list_by_run(
        pool: &PgPool,
        run_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<LegacyImportEntityLog>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let query = format!(
            "SELECT {COLUMNS} FROM legacy_import_entity_log
             WHERE run_id = $1
             ORDER BY created_at ASC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, LegacyImportEntityLog>(&query)
            .bind(run_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count entity log entries grouped by action for a run.
    ///
    /// Returns tuples of (action, count).
    pub async fn count_by_action(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<(String, i64)>, sqlx::Error> {
        let rows: Vec<ActionCount> = sqlx::query_as(
            "SELECT action, COUNT(*) as count FROM legacy_import_entity_log
             WHERE run_id = $1
             GROUP BY action
             ORDER BY action",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| (r.action, r.count)).collect())
    }

    /// Find entity log entries for a specific entity type and entity ID.
    pub async fn find_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Vec<LegacyImportEntityLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM legacy_import_entity_log
             WHERE entity_type = $1 AND entity_id = $2
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, LegacyImportEntityLog>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_all(pool)
            .await
    }
}

/// Helper struct for the count_by_action query.
#[derive(sqlx::FromRow)]
struct ActionCount {
    action: String,
    count: i64,
}
