//! Background job dispatcher (PRD-07).
//!
//! Polls for pending jobs every `poll_interval` and dispatches them to
//! available ComfyUI workers.  Uses `SELECT FOR UPDATE SKIP LOCKED` via
//! [`JobRepo::claim_next`] to prevent double-dispatch.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio_util::sync::CancellationToken;
use x121_comfyui::manager::ComfyUIManager;
use x121_db::models::status::JobStatus;
use x121_db::repositories::JobRepo;

/// Default polling interval for the dispatcher loop.
const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Background job dispatcher.
///
/// A single long-lived Tokio task that matches pending jobs with
/// available ComfyUI workers.
pub struct JobDispatcher {
    pool: PgPool,
    comfyui_manager: Arc<ComfyUIManager>,
    poll_interval: Duration,
}

impl JobDispatcher {
    /// Create a new dispatcher with the default 1-second poll interval.
    pub fn new(pool: PgPool, comfyui_manager: Arc<ComfyUIManager>) -> Self {
        Self {
            pool,
            comfyui_manager,
            poll_interval: DEFAULT_POLL_INTERVAL,
        }
    }

    /// Run the dispatcher loop until the cancellation token is triggered.
    pub async fn run(&self, cancel: CancellationToken) {
        let mut ticker = tokio::time::interval(self.poll_interval);
        tracing::info!(
            poll_interval_ms = self.poll_interval.as_millis() as u64,
            "Job dispatcher started",
        );

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    tracing::info!("Job dispatcher shutting down");
                    break;
                }
                _ = ticker.tick() => {
                    if let Err(e) = self.try_dispatch().await {
                        tracing::error!(error = %e, "Dispatch cycle failed");
                    }
                }
            }
        }
    }

    /// One dispatch cycle: check available workers and claim jobs.
    async fn try_dispatch(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let available = self.available_workers().await;
        if available.is_empty() {
            return Ok(());
        }

        for worker_id in available {
            let claimed = JobRepo::claim_next(&self.pool, worker_id).await?;

            if let Some(job) = claimed {
                tracing::info!(
                    job_id = job.id,
                    worker_id,
                    job_type = %job.job_type,
                    "Job claimed by worker",
                );

                // Mark the job as started (sets started_at).
                JobRepo::mark_started(&self.pool, job.id).await?;

                // Submit the workflow to ComfyUI.
                match self
                    .comfyui_manager
                    .submit_workflow(worker_id, &job.parameters, job.id)
                    .await
                {
                    Ok(prompt_id) => {
                        tracing::info!(
                            job_id = job.id,
                            prompt_id = %prompt_id,
                            "Workflow submitted to ComfyUI",
                        );
                    }
                    Err(e) => {
                        // If submission fails, mark the job as failed immediately.
                        tracing::error!(
                            job_id = job.id,
                            worker_id,
                            error = %e,
                            "Failed to submit workflow to ComfyUI",
                        );
                        JobRepo::fail(
                            &self.pool,
                            job.id,
                            &format!("ComfyUI submission failed: {e}"),
                            None,
                        )
                        .await?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Determine which workers are available for job dispatch.
    ///
    /// A worker is available if:
    /// 1. It has an active ComfyUI connection (in the manager's connection map).
    /// 2. It does not currently have a running job assigned to it.
    async fn available_workers(&self) -> Vec<i64> {
        let connected = self.comfyui_manager.connected_instance_ids().await;
        if connected.is_empty() {
            return Vec::new();
        }

        // Query for workers that have active (non-terminal) jobs.
        // Exclude those from the connected list.
        let pending = JobStatus::Pending.id();
        let running = JobStatus::Running.id();
        let busy_workers: Vec<i64> = match sqlx::query_scalar::<_, i64>(
            "SELECT DISTINCT worker_id FROM jobs \
             WHERE worker_id = ANY($1) \
               AND status_id IN ($2, $3) \
               AND completed_at IS NULL",
        )
        .bind(&connected)
        .bind(pending)
        .bind(running)
        .fetch_all(&self.pool)
        .await
        {
            Ok(ids) => ids,
            Err(e) => {
                tracing::error!(error = %e, "Failed to query busy workers");
                return Vec::new();
            }
        };

        connected
            .into_iter()
            .filter(|id| !busy_workers.contains(id))
            .collect()
    }
}
