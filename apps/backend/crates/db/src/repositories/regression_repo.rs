//! Repository for regression testing tables (PRD-65).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::regression::{
    CreateRegressionReference, CreateRegressionResult, RegressionReference, RegressionResult,
    RegressionRun, TriggerRegressionRun,
};

/// Column list for `regression_references` queries.
const REF_COLUMNS: &str = "id, character_id, scene_type_id, reference_scene_id, \
    baseline_scores, notes, created_by, created_at, updated_at";

/// Column list for `regression_runs` queries.
const RUN_COLUMNS: &str = "id, trigger_type, trigger_description, status, \
    total_references, completed_count, passed_count, failed_count, \
    started_at, completed_at, triggered_by, created_at, updated_at";

/// Column list for `regression_results` queries.
const RESULT_COLUMNS: &str = "id, run_id, reference_id, new_scene_id, \
    baseline_scores, new_scores, score_diffs, verdict, error_message, \
    created_at, updated_at";

/// Provides CRUD operations for regression testing entities.
pub struct RegressionRepo;

impl RegressionRepo {
    // =======================================================================
    // References
    // =======================================================================

    /// Insert a new regression reference, returning the created row.
    pub async fn create_reference(
        pool: &PgPool,
        dto: &CreateRegressionReference,
        created_by: DbId,
    ) -> Result<RegressionReference, sqlx::Error> {
        let query = format!(
            "INSERT INTO regression_references
                (character_id, scene_type_id, reference_scene_id, baseline_scores, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {REF_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionReference>(&query)
            .bind(dto.character_id)
            .bind(dto.scene_type_id)
            .bind(dto.reference_scene_id)
            .bind(&dto.baseline_scores)
            .bind(&dto.notes)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// List all regression references, ordered by creation time descending.
    pub async fn list_references(pool: &PgPool) -> Result<Vec<RegressionReference>, sqlx::Error> {
        let query =
            format!("SELECT {REF_COLUMNS} FROM regression_references ORDER BY created_at DESC");
        sqlx::query_as::<_, RegressionReference>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a single regression reference by its primary key.
    pub async fn find_reference_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<RegressionReference>, sqlx::Error> {
        let query = format!("SELECT {REF_COLUMNS} FROM regression_references WHERE id = $1");
        sqlx::query_as::<_, RegressionReference>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a regression reference by ID. Returns `true` if a row was deleted.
    pub async fn delete_reference(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM regression_references WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Update the baseline scores for an existing reference.
    pub async fn update_baseline(
        pool: &PgPool,
        id: DbId,
        scores: &serde_json::Value,
    ) -> Result<Option<RegressionReference>, sqlx::Error> {
        let query = format!(
            "UPDATE regression_references SET baseline_scores = $1 WHERE id = $2
             RETURNING {REF_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionReference>(&query)
            .bind(scores)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // =======================================================================
    // Runs
    // =======================================================================

    /// Create a new regression run, returning the created row.
    pub async fn create_run(
        pool: &PgPool,
        dto: &TriggerRegressionRun,
        total_refs: i32,
        triggered_by: DbId,
    ) -> Result<RegressionRun, sqlx::Error> {
        let query = format!(
            "INSERT INTO regression_runs
                (trigger_type, trigger_description, total_references, triggered_by)
             VALUES ($1, $2, $3, $4)
             RETURNING {RUN_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionRun>(&query)
            .bind(&dto.trigger_type)
            .bind(&dto.trigger_description)
            .bind(total_refs)
            .bind(triggered_by)
            .fetch_one(pool)
            .await
    }

    /// Find a single regression run by its primary key.
    pub async fn find_run_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<RegressionRun>, sqlx::Error> {
        let query = format!("SELECT {RUN_COLUMNS} FROM regression_runs WHERE id = $1");
        sqlx::query_as::<_, RegressionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all regression runs, ordered by creation time descending.
    pub async fn list_runs(pool: &PgPool) -> Result<Vec<RegressionRun>, sqlx::Error> {
        let query = format!("SELECT {RUN_COLUMNS} FROM regression_runs ORDER BY created_at DESC");
        sqlx::query_as::<_, RegressionRun>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update the status of a regression run.
    pub async fn update_run_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<Option<RegressionRun>, sqlx::Error> {
        let query =
            format!("UPDATE regression_runs SET status = $1 WHERE id = $2 RETURNING {RUN_COLUMNS}");
        sqlx::query_as::<_, RegressionRun>(&query)
            .bind(status)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the progress counters of a running regression run.
    pub async fn update_run_progress(
        pool: &PgPool,
        id: DbId,
        completed: i32,
        passed: i32,
        failed: i32,
    ) -> Result<Option<RegressionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE regression_runs SET
                completed_count = $1, passed_count = $2, failed_count = $3
             WHERE id = $4
             RETURNING {RUN_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionRun>(&query)
            .bind(completed)
            .bind(passed)
            .bind(failed)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a regression run as completed (or failed), setting final counts
    /// and the `completed_at` timestamp.
    pub async fn complete_run(
        pool: &PgPool,
        id: DbId,
        status: &str,
        passed: i32,
        failed: i32,
    ) -> Result<Option<RegressionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE regression_runs SET
                status = $1,
                passed_count = $2,
                failed_count = $3,
                completed_count = passed_count + failed_count,
                completed_at = NOW()
             WHERE id = $4
             RETURNING {RUN_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionRun>(&query)
            .bind(status)
            .bind(passed)
            .bind(failed)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // =======================================================================
    // Results
    // =======================================================================

    /// Insert a new regression result, returning the created row.
    pub async fn create_result(
        pool: &PgPool,
        dto: &CreateRegressionResult,
    ) -> Result<RegressionResult, sqlx::Error> {
        let query = format!(
            "INSERT INTO regression_results
                (run_id, reference_id, new_scene_id, baseline_scores,
                 new_scores, score_diffs, verdict, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING {RESULT_COLUMNS}"
        );
        sqlx::query_as::<_, RegressionResult>(&query)
            .bind(dto.run_id)
            .bind(dto.reference_id)
            .bind(dto.new_scene_id)
            .bind(&dto.baseline_scores)
            .bind(&dto.new_scores)
            .bind(&dto.score_diffs)
            .bind(&dto.verdict)
            .bind(&dto.error_message)
            .fetch_one(pool)
            .await
    }

    /// List all results for a given regression run, ordered by creation time.
    pub async fn list_results_for_run(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<RegressionResult>, sqlx::Error> {
        let query = format!(
            "SELECT {RESULT_COLUMNS} FROM regression_results
             WHERE run_id = $1
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, RegressionResult>(&query)
            .bind(run_id)
            .fetch_all(pool)
            .await
    }

    /// Find a single regression result by its primary key.
    pub async fn find_result_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<RegressionResult>, sqlx::Error> {
        let query = format!("SELECT {RESULT_COLUMNS} FROM regression_results WHERE id = $1");
        sqlx::query_as::<_, RegressionResult>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}
