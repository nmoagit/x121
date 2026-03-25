//! Repository for the `export_jobs` table (PRD-151).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::export_job::{CreateExportJob, ExportJob};

const COLUMNS: &str = "id, entity_type, requested_by, pipeline_id, item_count, \
     split_size_mb, filter_snapshot, status, parts, error_message, \
     started_at, completed_at, expires_at, created_at, updated_at";

/// Provides CRUD operations for export jobs.
pub struct ExportJobRepo;

impl ExportJobRepo {
    /// Insert a new export job record.
    pub async fn create(pool: &PgPool, input: &CreateExportJob) -> Result<ExportJob, sqlx::Error> {
        let query = format!(
            "INSERT INTO export_jobs \
                (entity_type, requested_by, pipeline_id, item_count, split_size_mb, filter_snapshot) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ExportJob>(&query)
            .bind(&input.entity_type)
            .bind(input.requested_by)
            .bind(input.pipeline_id)
            .bind(input.item_count)
            .bind(input.split_size_mb)
            .bind(&input.filter_snapshot)
            .fetch_one(pool)
            .await
    }

    /// Find an export job by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ExportJob>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM export_jobs WHERE id = $1");
        sqlx::query_as::<_, ExportJob>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of an export job, optionally setting parts and error message.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
        parts: Option<&serde_json::Value>,
        error_message: Option<&str>,
    ) -> Result<Option<ExportJob>, sqlx::Error> {
        let query = format!(
            "UPDATE export_jobs SET \
                status = $2, \
                parts = COALESCE($3, parts), \
                error_message = COALESCE($4, error_message), \
                started_at = CASE WHEN started_at IS NULL AND $2 = 'processing' THEN NOW() ELSE started_at END, \
                completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ExportJob>(&query)
            .bind(id)
            .bind(status)
            .bind(parts)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }
}
