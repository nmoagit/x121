//! Repository for the `integrity_scans` table (PRD-43).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::integrity_scan::{
    CreateIntegrityScan, IntegrityScan, UpdateIntegrityScanResults,
};
use crate::models::status::StatusId;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, worker_id, scan_type, status_id, results_json, \
    models_found, models_missing, models_corrupted, nodes_found, nodes_missing, \
    started_at, completed_at, triggered_by, created_at, updated_at";

/// Provides CRUD operations for integrity scans.
pub struct IntegrityScanRepo;

impl IntegrityScanRepo {
    /// Insert a new integrity scan record, returning the created row.
    pub async fn create(
        pool: &PgPool,
        body: &CreateIntegrityScan,
    ) -> Result<IntegrityScan, sqlx::Error> {
        let query = format!(
            "INSERT INTO integrity_scans (worker_id, scan_type, triggered_by, started_at)
             VALUES ($1, $2, $3, NOW())
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(body.worker_id)
            .bind(&body.scan_type)
            .bind(body.triggered_by)
            .fetch_one(pool)
            .await
    }

    /// Find a single integrity scan by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<IntegrityScan>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM integrity_scans WHERE id = $1");
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List integrity scans for a specific worker, ordered newest first.
    pub async fn list_by_worker(
        pool: &PgPool,
        worker_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<IntegrityScan>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM integrity_scans
             WHERE worker_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(worker_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List all integrity scans, ordered newest first.
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<IntegrityScan>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM integrity_scans
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update scan results and mark the scan as completed.
    pub async fn update_results(
        pool: &PgPool,
        id: DbId,
        body: &UpdateIntegrityScanResults,
    ) -> Result<IntegrityScan, sqlx::Error> {
        let query = format!(
            "UPDATE integrity_scans
             SET results_json = $2,
                 models_found = $3,
                 models_missing = $4,
                 models_corrupted = $5,
                 nodes_found = $6,
                 nodes_missing = $7,
                 completed_at = $8
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(id)
            .bind(&body.results_json)
            .bind(body.models_found)
            .bind(body.models_missing)
            .bind(body.models_corrupted)
            .bind(body.nodes_found)
            .bind(body.nodes_missing)
            .bind(body.completed_at)
            .fetch_one(pool)
            .await
    }

    /// Update only the status of a scan (e.g. mark as completed/failed).
    pub async fn mark_completed(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<IntegrityScan, sqlx::Error> {
        let query = format!(
            "UPDATE integrity_scans
             SET status_id = $2, completed_at = NOW()
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, IntegrityScan>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_one(pool)
            .await
    }
}
