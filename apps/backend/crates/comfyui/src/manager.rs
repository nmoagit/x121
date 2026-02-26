//! Multi-instance ComfyUI connection manager.
//!
//! [`ComfyUIManager`] orchestrates persistent WebSocket connections to
//! one or more ComfyUI servers.  It loads enabled instances from the
//! database on startup, spawns a connection task per instance (connect
//! -> process -> reconnect loop), and exposes workflow submission and
//! cancellation APIs.
//!
//! Platform-level events are broadcast via a [`tokio::sync::broadcast`]
//! channel. Call [`ComfyUIManager::subscribe`] to receive them.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};
use tokio_util::sync::CancellationToken;
use x121_core::types::DbId;
use x121_db::repositories::{ComfyUIExecutionRepo, ComfyUIInstanceRepo};

use crate::api::ComfyUIApi;
use crate::client::ComfyUIClient;
use crate::events::ComfyUIEvent;
use crate::processor::process_messages;
use crate::reconnect::{reconnect_loop, ReconnectConfig};

/// Broadcast channel capacity for platform events.
const EVENT_CHANNEL_CAPACITY: usize = 256;

/// Manages persistent connections to multiple ComfyUI instances.
///
/// Created once at application startup via [`ComfyUIManager::start`].
/// The returned `Arc` can be cheaply cloned into request handlers.
pub struct ComfyUIManager {
    /// Active connection tasks indexed by `instance_id`.
    connections: RwLock<HashMap<DbId, ManagedInstance>>,
    pool: sqlx::PgPool,
    event_tx: broadcast::Sender<ComfyUIEvent>,
    /// Master cancellation token -- cancelled during shutdown.
    cancel: CancellationToken,
}

/// Internal bookkeeping for a single ComfyUI instance.
struct ManagedInstance {
    #[allow(dead_code)]
    client: Arc<ComfyUIClient>,
    api: Arc<ComfyUIApi>,
    task_handle: tokio::task::JoinHandle<()>,
    /// Per-instance cancellation token (child of the master token).
    cancel: CancellationToken,
}

impl ComfyUIManager {
    /// Load enabled instances from the database and connect to each.
    ///
    /// Returns a shared handle that is safe to clone into Axum state.
    pub async fn start(pool: sqlx::PgPool) -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        let cancel = CancellationToken::new();

        let manager = Arc::new(Self {
            connections: RwLock::new(HashMap::new()),
            pool,
            event_tx,
            cancel,
        });

        manager.load_and_connect().await;
        manager
    }

    /// Subscribe to platform-level ComfyUI events.
    pub fn subscribe(&self) -> broadcast::Receiver<ComfyUIEvent> {
        self.event_tx.subscribe()
    }

    /// Return the IDs of all currently connected instances.
    ///
    /// Used by the job dispatcher to determine which workers are available
    /// for job assignment.
    pub async fn connected_instance_ids(&self) -> Vec<DbId> {
        self.connections.read().await.keys().copied().collect()
    }

    /// Submit a workflow to a specific ComfyUI instance.
    ///
    /// Records an execution mapping in the database so that incoming
    /// WebSocket messages can be correlated back to the platform job.
    pub async fn submit_workflow(
        &self,
        instance_id: DbId,
        workflow_json: &serde_json::Value,
        platform_job_id: DbId,
    ) -> Result<String, ComfyUIManagerError> {
        let conns = self.connections.read().await;
        let managed = conns
            .get(&instance_id)
            .ok_or(ComfyUIManagerError::InstanceNotFound(instance_id))?;

        let client_id = uuid::Uuid::new_v4().to_string();

        let response = managed
            .api
            .submit_workflow(workflow_json, &client_id)
            .await
            .map_err(|e| ComfyUIManagerError::SubmitFailed(e.to_string()))?;

        ComfyUIExecutionRepo::create(
            &self.pool,
            instance_id,
            platform_job_id,
            &response.prompt_id,
        )
        .await
        .map_err(|e| ComfyUIManagerError::DatabaseError(e.to_string()))?;

        tracing::info!(
            instance_id,
            platform_job_id,
            prompt_id = %response.prompt_id,
            "Workflow submitted to ComfyUI",
        );

        Ok(response.prompt_id)
    }

    /// Cancel a running or queued job by its platform job ID.
    pub async fn cancel_job(&self, platform_job_id: DbId) -> Result<(), ComfyUIManagerError> {
        let execution = ComfyUIExecutionRepo::find_by_platform_job_id(&self.pool, platform_job_id)
            .await
            .map_err(|e| ComfyUIManagerError::DatabaseError(e.to_string()))?
            .ok_or(ComfyUIManagerError::ExecutionNotFound(platform_job_id))?;

        let conns = self.connections.read().await;
        let managed = conns
            .get(&execution.instance_id)
            .ok_or(ComfyUIManagerError::InstanceNotFound(execution.instance_id))?;

        managed
            .api
            .cancel_execution(&execution.comfyui_prompt_id)
            .await
            .map_err(|e| ComfyUIManagerError::CancelFailed(e.to_string()))?;

        ComfyUIExecutionRepo::mark_cancelled(&self.pool, &execution.comfyui_prompt_id)
            .await
            .map_err(|e| ComfyUIManagerError::DatabaseError(e.to_string()))?;

        let _ = self.event_tx.send(ComfyUIEvent::GenerationCancelled {
            instance_id: execution.instance_id,
            platform_job_id,
            prompt_id: execution.comfyui_prompt_id,
        });

        Ok(())
    }

    /// Gracefully shut down all connection tasks.
    ///
    /// Cancels the master token, then waits up to 5 seconds per task
    /// for a clean exit.
    pub async fn shutdown(&self) {
        tracing::info!("Shutting down ComfyUI manager");
        self.cancel.cancel();

        let mut conns = self.connections.write().await;
        for (id, managed) in conns.drain() {
            tracing::info!(instance_id = id, "Stopping connection task");
            managed.cancel.cancel();
            let _ =
                tokio::time::timeout(std::time::Duration::from_secs(5), managed.task_handle).await;
        }

        tracing::info!("ComfyUI manager shut down complete");
    }

    // ---- private helpers ----

    /// Query the database for enabled instances and spawn a connection
    /// task for each.
    async fn load_and_connect(&self) {
        let instances = match ComfyUIInstanceRepo::list_enabled(&self.pool).await {
            Ok(list) => list,
            Err(e) => {
                tracing::error!(error = %e, "Failed to load ComfyUI instances");
                return;
            }
        };

        tracing::info!(count = instances.len(), "Loading ComfyUI instances");

        for instance in instances {
            self.spawn_connection(
                instance.id,
                instance.name.clone(),
                instance.ws_url.clone(),
                instance.api_url.clone(),
            )
            .await;
        }
    }

    /// Spawn a long-lived task that connects, processes messages, and
    /// automatically reconnects when the connection drops.
    async fn spawn_connection(
        &self,
        instance_id: DbId,
        name: String,
        ws_url: String,
        api_url: String,
    ) {
        let client = Arc::new(ComfyUIClient::new(instance_id, ws_url, api_url.clone()));
        let api = Arc::new(ComfyUIApi::new(api_url));
        let instance_cancel = self.cancel.child_token();
        let pool = self.pool.clone();
        let event_tx = self.event_tx.clone();
        let cancel_clone = instance_cancel.clone();
        let client_clone = Arc::clone(&client);

        let task_handle = tokio::spawn(async move {
            tracing::info!(instance_id, name = %name, "Starting connection task");
            run_connection_loop(&client_clone, instance_id, &pool, &event_tx, &cancel_clone).await;
            tracing::info!(instance_id, "Connection task exited");
        });

        let managed = ManagedInstance {
            client,
            api,
            task_handle,
            cancel: instance_cancel,
        };

        self.connections.write().await.insert(instance_id, managed);
    }
}

/// Core connection loop: connect -> process messages -> reconnect.
///
/// Runs until the cancellation token is triggered.
async fn run_connection_loop(
    client: &ComfyUIClient,
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    cancel: &CancellationToken,
) {
    let reconnect_config = ReconnectConfig::default();

    loop {
        // Attempt to connect (or reconnect).
        let conn = match client.connect().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::warn!(
                    instance_id,
                    error = %e,
                    "Connection failed, entering reconnect loop",
                );
                match reconnect_loop(client, &reconnect_config, cancel).await {
                    Some(conn) => conn,
                    None => return, // cancelled
                }
            }
        };

        // Record the connection in the database.
        if let Err(e) = ComfyUIInstanceRepo::record_connection(pool, instance_id).await {
            tracing::error!(instance_id, error = %e, "Failed to record connection");
        }
        let _ = event_tx.send(ComfyUIEvent::InstanceConnected { instance_id });

        // Process messages until the connection drops.
        let mut ws_stream = conn.ws_stream;
        process_messages(&mut ws_stream, instance_id, pool, event_tx).await;

        // The connection has dropped.
        if let Err(e) = ComfyUIInstanceRepo::record_disconnection(pool, instance_id).await {
            tracing::error!(instance_id, error = %e, "Failed to record disconnection");
        }
        let _ = event_tx.send(ComfyUIEvent::InstanceDisconnected { instance_id });

        if cancel.is_cancelled() {
            return;
        }

        tracing::info!(instance_id, "Connection lost, entering reconnect loop");
        match reconnect_loop(client, &reconnect_config, cancel).await {
            Some(_) => continue, // loop back to process messages
            None => return,      // cancelled
        }
    }
}

/// Errors that can occur when interacting with the manager.
#[derive(Debug, thiserror::Error)]
pub enum ComfyUIManagerError {
    /// The requested instance is not loaded or not connected.
    #[error("Instance {0} not found or not connected")]
    InstanceNotFound(DbId),

    /// No execution record exists for the given platform job.
    #[error("Execution for job {0} not found")]
    ExecutionNotFound(DbId),

    /// The workflow submission HTTP call failed.
    #[error("Failed to submit workflow: {0}")]
    SubmitFailed(String),

    /// The cancellation HTTP call failed.
    #[error("Failed to cancel execution: {0}")]
    CancelFailed(String),

    /// A database query failed.
    #[error("Database error: {0}")]
    DatabaseError(String),
}
