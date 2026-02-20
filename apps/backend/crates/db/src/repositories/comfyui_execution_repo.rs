//! Repository for the `comfyui_executions` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::comfyui::ComfyUIExecution;

/// Column list for `comfyui_executions` queries.
const COLUMNS: &str = "\
    id, instance_id, platform_job_id, comfyui_prompt_id, status, \
    progress_percent, current_node, error_message, \
    submitted_at, started_at, completed_at, created_at, updated_at";

/// Provides query operations for ComfyUI execution tracking.
pub struct ComfyUIExecutionRepo;

impl ComfyUIExecutionRepo {
    // ── Queries ──────────────────────────────────────────────────────

    /// Create a new execution record, returning the inserted row.
    pub async fn create(
        pool: &PgPool,
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: &str,
    ) -> Result<ComfyUIExecution, sqlx::Error> {
        let query = format!(
            "INSERT INTO comfyui_executions (instance_id, platform_job_id, comfyui_prompt_id) \
             VALUES ($1, $2, $3) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ComfyUIExecution>(&query)
            .bind(instance_id)
            .bind(platform_job_id)
            .bind(prompt_id)
            .fetch_one(pool)
            .await
    }

    /// Find an execution by its ComfyUI prompt ID.
    pub async fn find_by_prompt_id(
        pool: &PgPool,
        prompt_id: &str,
    ) -> Result<Option<ComfyUIExecution>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM comfyui_executions WHERE comfyui_prompt_id = $1");
        sqlx::query_as::<_, ComfyUIExecution>(&query)
            .bind(prompt_id)
            .fetch_optional(pool)
            .await
    }

    /// Find the most recent execution for a platform job ID.
    pub async fn find_by_platform_job_id(
        pool: &PgPool,
        platform_job_id: DbId,
    ) -> Result<Option<ComfyUIExecution>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM comfyui_executions \
             WHERE platform_job_id = $1 \
             ORDER BY id DESC LIMIT 1"
        );
        sqlx::query_as::<_, ComfyUIExecution>(&query)
            .bind(platform_job_id)
            .fetch_optional(pool)
            .await
    }

    // ── Progress mutations ───────────────────────────────────────────

    /// Update progress percentage and optionally the current node.
    pub async fn update_progress(
        pool: &PgPool,
        prompt_id: &str,
        progress_percent: i16,
        current_node: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_executions \
             SET progress_percent = $2, current_node = $3 \
             WHERE comfyui_prompt_id = $1",
        )
        .bind(prompt_id)
        .bind(progress_percent)
        .bind(current_node)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update the current node being executed.
    pub async fn update_current_node(
        pool: &PgPool,
        prompt_id: &str,
        node: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE comfyui_executions SET current_node = $2 WHERE comfyui_prompt_id = $1")
            .bind(prompt_id)
            .bind(node)
            .execute(pool)
            .await?;
        Ok(())
    }

    // ── Status transitions ───────────────────────────────────────────

    /// Mark an execution as started (status = 'running', records `started_at`).
    pub async fn mark_started(pool: &PgPool, prompt_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_executions \
             SET status = 'running', started_at = NOW() \
             WHERE comfyui_prompt_id = $1",
        )
        .bind(prompt_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark an execution as completed (status = 'completed', progress = 100%).
    pub async fn mark_completed(pool: &PgPool, prompt_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_executions \
             SET status = 'completed', progress_percent = 100, completed_at = NOW() \
             WHERE comfyui_prompt_id = $1",
        )
        .bind(prompt_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark an execution as failed with an error message.
    pub async fn mark_failed(
        pool: &PgPool,
        prompt_id: &str,
        error_message: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_executions \
             SET status = 'failed', error_message = $2, completed_at = NOW() \
             WHERE comfyui_prompt_id = $1",
        )
        .bind(prompt_id)
        .bind(error_message)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark an execution as cancelled.
    pub async fn mark_cancelled(pool: &PgPool, prompt_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_executions \
             SET status = 'cancelled', completed_at = NOW() \
             WHERE comfyui_prompt_id = $1",
        )
        .bind(prompt_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
