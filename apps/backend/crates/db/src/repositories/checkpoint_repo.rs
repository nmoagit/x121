//! Repository for the `checkpoints` table (PRD-28).
//!
//! Provides CRUD operations for pipeline checkpoint metadata.
//! Actual checkpoint data lives on the filesystem at the `data_path`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::checkpoint::{Checkpoint, CreateCheckpoint};

/// Column list for `checkpoints` queries.
const COLUMNS: &str = "\
    id, job_id, stage_index, stage_name, data_path, \
    metadata, size_bytes, created_at, updated_at";

/// Provides CRUD operations for pipeline checkpoints.
pub struct CheckpointRepo;

impl CheckpointRepo {
    /// Create a new checkpoint for a pipeline stage.
    ///
    /// Uses `ON CONFLICT` to upsert — if a checkpoint already exists for
    /// the same job + stage_index, it is replaced.
    pub async fn create(
        pool: &PgPool,
        job_id: DbId,
        input: &CreateCheckpoint,
    ) -> Result<Checkpoint, sqlx::Error> {
        let query = format!(
            "INSERT INTO checkpoints \
                 (job_id, stage_index, stage_name, data_path, metadata, size_bytes) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (job_id, stage_index) DO UPDATE SET \
                 stage_name = EXCLUDED.stage_name, \
                 data_path  = EXCLUDED.data_path, \
                 metadata   = EXCLUDED.metadata, \
                 size_bytes = EXCLUDED.size_bytes \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Checkpoint>(&query)
            .bind(job_id)
            .bind(input.stage_index)
            .bind(&input.stage_name)
            .bind(&input.data_path)
            .bind(&input.metadata)
            .bind(input.size_bytes)
            .fetch_one(pool)
            .await
    }

    /// Find a checkpoint by its ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Checkpoint>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM checkpoints WHERE id = $1");
        sqlx::query_as::<_, Checkpoint>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all checkpoints for a job, ordered by stage index ascending.
    pub async fn list_by_job(pool: &PgPool, job_id: DbId) -> Result<Vec<Checkpoint>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM checkpoints \
             WHERE job_id = $1 ORDER BY stage_index ASC"
        );
        sqlx::query_as::<_, Checkpoint>(&query)
            .bind(job_id)
            .fetch_all(pool)
            .await
    }

    /// Find the latest (highest stage_index) checkpoint for a job.
    pub async fn find_latest_for_job(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Option<Checkpoint>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM checkpoints \
             WHERE job_id = $1 ORDER BY stage_index DESC LIMIT 1"
        );
        sqlx::query_as::<_, Checkpoint>(&query)
            .bind(job_id)
            .fetch_optional(pool)
            .await
    }

    /// Delete all checkpoints for a job (used after successful completion).
    ///
    /// Returns the number of rows deleted.
    pub async fn delete_by_job(pool: &PgPool, job_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM checkpoints WHERE job_id = $1")
            .bind(job_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
