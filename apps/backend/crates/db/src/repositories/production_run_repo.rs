//! Repository for the `production_runs` and `production_run_cells` tables (PRD-57).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::production_run::{
    CreateProductionRun, CreateProductionRunCell, ProductionRun, ProductionRunCell,
};

const COLUMNS: &str = "id, project_id, name, description, matrix_config, status_id, \
     total_cells, completed_cells, failed_cells, estimated_gpu_hours, estimated_disk_gb, \
     created_by_id, started_at, completed_at, created_at, updated_at";

const CELL_COLUMNS: &str = "id, run_id, character_id, scene_type_id, variant_label, \
     status_id, scene_id, job_id, blocking_reason, error_message, created_at, updated_at";

/// Provides CRUD operations for production runs and cells.
pub struct ProductionRunRepo;

impl ProductionRunRepo {
    // -----------------------------------------------------------------------
    // Production Run CRUD
    // -----------------------------------------------------------------------

    /// Insert a new production run.
    pub async fn create(
        pool: &PgPool,
        input: &CreateProductionRun,
    ) -> Result<ProductionRun, sqlx::Error> {
        let query = format!(
            "INSERT INTO production_runs \
                (project_id, name, description, matrix_config, total_cells, \
                 estimated_gpu_hours, estimated_disk_gb, created_by_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.matrix_config)
            .bind(input.total_cells)
            .bind(input.estimated_gpu_hours)
            .bind(input.estimated_disk_gb)
            .bind(input.created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find a production run by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM production_runs WHERE id = $1");
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List production runs for a project, ordered by most recent first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProductionRun>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM production_runs \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count production runs for a project.
    pub async fn count_by_project(pool: &PgPool, project_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM production_runs WHERE project_id = $1")
                .bind(project_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// Update the status of a production run.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                status_id = $2, \
                started_at = CASE WHEN started_at IS NULL AND $2 > 1 THEN NOW() ELSE started_at END \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a production run as completed.
    pub async fn mark_completed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                status_id = $2, \
                completed_at = NOW() \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .bind(trulience_core::batch_production::RUN_STATUS_ID_COMPLETED)
            .fetch_optional(pool)
            .await
    }

    /// Delete a production run by ID. Returns true if deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM production_runs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Increment the completed_cells count by 1 and return the updated run.
    pub async fn increment_completed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                completed_cells = completed_cells + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Increment the failed_cells count by 1 and return the updated run.
    pub async fn increment_failed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                failed_cells = failed_cells + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Production Run Cell CRUD
    // -----------------------------------------------------------------------

    /// Insert a new production run cell.
    pub async fn create_cell(
        pool: &PgPool,
        input: &CreateProductionRunCell,
    ) -> Result<ProductionRunCell, sqlx::Error> {
        let query = format!(
            "INSERT INTO production_run_cells \
                (run_id, character_id, scene_type_id, variant_label) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(input.run_id)
            .bind(input.character_id)
            .bind(input.scene_type_id)
            .bind(&input.variant_label)
            .fetch_one(pool)
            .await
    }

    /// Batch-insert multiple cells for a production run.
    pub async fn create_cells_batch(
        pool: &PgPool,
        cells: &[CreateProductionRunCell],
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        if cells.is_empty() {
            return Ok(vec![]);
        }

        // Build a multi-row INSERT using unnest for efficiency.
        let run_ids: Vec<DbId> = cells.iter().map(|c| c.run_id).collect();
        let char_ids: Vec<DbId> = cells.iter().map(|c| c.character_id).collect();
        let st_ids: Vec<DbId> = cells.iter().map(|c| c.scene_type_id).collect();
        let labels: Vec<String> = cells.iter().map(|c| c.variant_label.clone()).collect();

        let query = format!(
            "INSERT INTO production_run_cells \
                (run_id, character_id, scene_type_id, variant_label) \
             SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::text[]) \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(&run_ids)
            .bind(&char_ids)
            .bind(&st_ids)
            .bind(&labels)
            .fetch_all(pool)
            .await
    }

    /// List all cells for a production run.
    pub async fn list_cells_by_run(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .fetch_all(pool)
            .await
    }

    /// Find a single cell by ID.
    pub async fn find_cell_by_id(
        pool: &PgPool,
        cell_id: DbId,
    ) -> Result<Option<ProductionRunCell>, sqlx::Error> {
        let query = format!("SELECT {CELL_COLUMNS} FROM production_run_cells WHERE id = $1");
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(cell_id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of a cell, optionally setting blocking reason or error.
    pub async fn update_cell_status(
        pool: &PgPool,
        cell_id: DbId,
        status_id: DbId,
        blocking_reason: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<Option<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "UPDATE production_run_cells SET \
                status_id = $2, \
                blocking_reason = COALESCE($3, blocking_reason), \
                error_message = COALESCE($4, error_message) \
             WHERE id = $1 \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(cell_id)
            .bind(status_id)
            .bind(blocking_reason)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// List cells by run filtered to specific cell IDs (for partial submission).
    pub async fn list_cells_by_ids(
        pool: &PgPool,
        run_id: DbId,
        cell_ids: &[DbId],
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 AND id = ANY($2) \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .bind(cell_ids)
            .fetch_all(pool)
            .await
    }

    /// List failed cells for a run (for resubmission).
    pub async fn list_failed_cells(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 AND status_id = $2 \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .bind(trulience_core::batch_production::RUN_STATUS_ID_FAILED)
            .fetch_all(pool)
            .await
    }

    /// Count cells by status for a production run (for progress tracking).
    pub async fn count_cells_by_status(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<(DbId, i64)>, sqlx::Error> {
        sqlx::query_as::<_, (DbId, i64)>(
            "SELECT status_id, COUNT(*) FROM production_run_cells \
             WHERE run_id = $1 \
             GROUP BY status_id \
             ORDER BY status_id",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await
    }
}
