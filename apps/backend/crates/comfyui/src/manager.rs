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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};
use tokio_util::sync::CancellationToken;
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::types::DbId;
use x121_db::repositories::{ComfyUIExecutionRepo, ComfyUIInstanceRepo};
use x121_events::ActivityLogBroadcaster;

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
    /// Optional activity log broadcaster for curated connection events.
    activity: Option<Arc<ActivityLogBroadcaster>>,
}

/// Internal bookkeeping for a single ComfyUI instance.
struct ManagedInstance {
    #[allow(dead_code)]
    client: Arc<ComfyUIClient>,
    api: Arc<ComfyUIApi>,
    task_handle: tokio::task::JoinHandle<()>,
    /// Per-instance cancellation token (child of the master token).
    cancel: CancellationToken,
    /// Whether the WebSocket is currently connected (set by the connection loop).
    connected: Arc<AtomicBool>,
    /// The client_id used by the current WebSocket connection. Updated by the
    /// connection loop on each (re)connect. Workflow submissions must use this
    /// same client_id so ComfyUI routes messages back to our WebSocket listener.
    ws_client_id: Arc<std::sync::RwLock<String>>,
}

impl ComfyUIManager {
    /// Load enabled instances from the database and connect to each.
    ///
    /// Returns a shared handle that is safe to clone into Axum state.
    pub async fn start(pool: sqlx::PgPool) -> Arc<Self> {
        Self::start_with_activity(pool, None).await
    }

    /// Load enabled instances and connect, with an optional activity broadcaster.
    pub async fn start_with_activity(
        pool: sqlx::PgPool,
        activity: Option<Arc<ActivityLogBroadcaster>>,
    ) -> Arc<Self> {
        let (event_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        let cancel = CancellationToken::new();

        let manager = Arc::new(Self {
            connections: RwLock::new(HashMap::new()),
            pool,
            event_tx,
            cancel,
            activity,
        });

        manager.load_and_connect().await;
        manager
    }

    /// Publish a curated activity log entry if a broadcaster is configured.
    fn emit(&self, level: ActivityLogLevel, message: impl Into<String>) {
        if let Some(ref broadcaster) = self.activity {
            broadcaster.publish(ActivityLogEntry::curated(
                level,
                ActivityLogSource::Comfyui,
                message,
            ));
        }
    }

    /// Publish a curated activity log entry with structured fields.
    fn emit_with_fields(
        &self,
        level: ActivityLogLevel,
        message: impl Into<String>,
        fields: serde_json::Value,
    ) {
        if let Some(ref broadcaster) = self.activity {
            broadcaster.publish(
                ActivityLogEntry::curated(level, ActivityLogSource::Comfyui, message)
                    .with_fields(fields),
            );
        }
    }

    /// Subscribe to platform-level ComfyUI events.
    pub fn subscribe(&self) -> broadcast::Receiver<ComfyUIEvent> {
        self.event_tx.subscribe()
    }

    /// Return the IDs of all currently connected instances.
    ///
    /// Only includes instances whose WebSocket is actively connected,
    /// not those that are spawned but still in the reconnect loop.
    pub async fn connected_instance_ids(&self) -> Vec<DbId> {
        self.connections
            .read()
            .await
            .iter()
            .filter(|(_, m)| m.connected.load(Ordering::Relaxed))
            .map(|(id, _)| *id)
            .collect()
    }

    /// Get the API client for a specific instance.
    ///
    /// Returns `None` if the instance is not connected.
    pub async fn api_for_instance(&self, instance_id: DbId) -> Option<Arc<ComfyUIApi>> {
        self.connections
            .read()
            .await
            .get(&instance_id)
            .map(|m| Arc::clone(&m.api))
    }

    /// Get an API client for any connected instance.
    ///
    /// Used for operations that don't target a specific instance, such as
    /// querying available node types for workflow validation.
    /// Returns `None` if no instances are connected.
    pub async fn get_any_api(&self) -> Option<Arc<ComfyUIApi>> {
        self.connections
            .read()
            .await
            .values()
            .next()
            .map(|m| Arc::clone(&m.api))
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

        // Use the same client_id as the WebSocket connection so ComfyUI
        // routes execution messages back to our listener.
        let client_id = managed
            .ws_client_id
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone();

        if client_id.is_empty() {
            return Err(ComfyUIManagerError::SubmitFailed(
                "WebSocket not connected — no client_id available".to_string(),
            ));
        }

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

    /// Interrupt the currently running execution on a specific instance (PRD-132).
    ///
    /// Sends `POST /interrupt` to the instance's ComfyUI API. This stops
    /// whatever is executing immediately without targeting a specific prompt.
    pub async fn interrupt_instance(&self, instance_id: DbId) -> Result<(), ComfyUIManagerError> {
        let conns = self.connections.read().await;
        let managed = conns
            .get(&instance_id)
            .ok_or(ComfyUIManagerError::InstanceNotFound(instance_id))?;

        managed
            .api
            .interrupt()
            .await
            .map_err(|e| ComfyUIManagerError::InterruptFailed(e.to_string()))?;

        tracing::info!(instance_id, "Interrupted ComfyUI instance");
        Ok(())
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

    /// Force-reconnect a specific ComfyUI instance.
    ///
    /// Cancels the existing connection task for the given instance, looks up
    /// fresh connection details from the database, and spawns a new connection
    /// task with a reset backoff.
    ///
    /// Returns an error if the instance is not found in the database.
    pub async fn force_reconnect(&self, instance_id: DbId) -> Result<(), ComfyUIManagerError> {
        // 1. Cancel and remove the existing connection task (if any).
        if let Some(managed) = self.connections.write().await.remove(&instance_id) {
            tracing::info!(
                instance_id,
                "Cancelling existing connection task for reconnect"
            );
            managed.cancel.cancel();
            let _ =
                tokio::time::timeout(std::time::Duration::from_secs(5), managed.task_handle).await;
        }

        // 2. Look up instance from DB to get fresh ws_url / api_url.
        let instance = ComfyUIInstanceRepo::find_by_id(&self.pool, instance_id)
            .await
            .map_err(|e| ComfyUIManagerError::DatabaseError(e.to_string()))?
            .ok_or(ComfyUIManagerError::InstanceNotFound(instance_id))?;

        if !instance.is_enabled {
            return Err(ComfyUIManagerError::InstanceNotFound(instance_id));
        }

        // 3. Emit activity log before spawning (values are moved into spawn_connection).
        self.emit_with_fields(
            ActivityLogLevel::Info,
            format!("Force reconnect triggered for instance {}", instance.name),
            serde_json::json!({
                "instance_id": instance_id,
                "name": &instance.name,
                "ws_url": &instance.ws_url,
            }),
        );

        // 4. Spawn a new connection task.
        self.spawn_connection(
            instance.id,
            instance.name,
            instance.ws_url,
            instance.api_url,
        )
        .await;

        tracing::info!(
            instance_id,
            "Force reconnect initiated — new connection task spawned"
        );
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

    /// Reload enabled instances from the database, spawning connection
    /// tasks for any newly discovered instances.
    ///
    /// This is useful when the worker process registers a new ComfyUI
    /// instance (e.g. a RunPod pod) after the API server has started.
    pub async fn refresh_instances(&self) {
        let instances = match ComfyUIInstanceRepo::list_enabled(&self.pool).await {
            Ok(list) => list,
            Err(e) => {
                tracing::error!(error = %e, "Failed to refresh ComfyUI instances");
                return;
            }
        };

        let conns = self.connections.read().await;
        let existing_ids: Vec<DbId> = conns.keys().copied().collect();
        drop(conns);

        let mut added = 0usize;
        for instance in instances {
            if !existing_ids.contains(&instance.id) {
                self.spawn_connection(
                    instance.id,
                    instance.name.clone(),
                    instance.ws_url.clone(),
                    instance.api_url.clone(),
                )
                .await;
                added += 1;
            }
        }

        if added > 0 {
            tracing::info!(
                added,
                "Refreshed ComfyUI instances — new connections spawned"
            );
        }
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
        let connected = Arc::new(AtomicBool::new(false));
        let connected_clone = Arc::clone(&connected);
        let ws_client_id = Arc::new(std::sync::RwLock::new(String::new()));
        let ws_client_id_clone = Arc::clone(&ws_client_id);

        let activity_clone = self.activity.clone();
        let task_handle = tokio::spawn(async move {
            tracing::info!(instance_id, name = %name, "Starting connection task");
            run_connection_loop(
                &client_clone,
                instance_id,
                &name,
                &pool,
                &event_tx,
                &cancel_clone,
                activity_clone.as_deref(),
                &connected_clone,
                &ws_client_id_clone,
            )
            .await;
            tracing::info!(instance_id, "Connection task exited");
        });

        let managed = ManagedInstance {
            client,
            api,
            task_handle,
            cancel: instance_cancel,
            connected,
            ws_client_id,
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
    instance_name: &str,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    cancel: &CancellationToken,
    activity: Option<&ActivityLogBroadcaster>,
    connected: &AtomicBool,
    shared_client_id: &std::sync::RwLock<String>,
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

        // Publish the WebSocket client_id so submit_workflow uses the same one.
        if let Ok(mut id) = shared_client_id.write() {
            *id = conn.client_id.clone();
        }

        // Mark as connected and record in the database.
        connected.store(true, Ordering::Relaxed);
        if let Err(e) = ComfyUIInstanceRepo::record_connection(pool, instance_id).await {
            tracing::error!(instance_id, error = %e, "Failed to record connection");
        }
        let _ = event_tx.send(ComfyUIEvent::InstanceConnected { instance_id });

        if let Some(broadcaster) = activity {
            broadcaster.publish(
                ActivityLogEntry::curated(
                    ActivityLogLevel::Info,
                    ActivityLogSource::Comfyui,
                    format!("WebSocket connected to {instance_name}"),
                )
                .with_fields(serde_json::json!({
                    "instance_id": instance_id,
                    "name": instance_name,
                    "ws_url": client.ws_url(),
                })),
            );
        }

        // Check for executions that completed while we were disconnected.
        recover_missed_completions(instance_id, pool, event_tx, client).await;

        // Process messages until the connection drops.
        let mut ws_stream = conn.ws_stream;
        process_messages(&mut ws_stream, instance_id, pool, event_tx).await;

        // The connection has dropped — clear the shared client_id.
        if let Ok(mut id) = shared_client_id.write() {
            id.clear();
        }
        connected.store(false, Ordering::Relaxed);
        if let Err(e) = ComfyUIInstanceRepo::record_disconnection(pool, instance_id).await {
            tracing::error!(instance_id, error = %e, "Failed to record disconnection");
        }
        let _ = event_tx.send(ComfyUIEvent::InstanceDisconnected { instance_id });

        let will_reconnect = !cancel.is_cancelled();
        if let Some(broadcaster) = activity {
            broadcaster.publish(
                ActivityLogEntry::curated(
                    ActivityLogLevel::Warn,
                    ActivityLogSource::Comfyui,
                    format!("WebSocket disconnected from {instance_name}"),
                )
                .with_fields(serde_json::json!({
                    "instance_id": instance_id,
                    "name": instance_name,
                    "will_reconnect": will_reconnect,
                })),
            );
        }

        if !will_reconnect {
            return;
        }

        tracing::info!(instance_id, "Connection lost, entering reconnect loop");
        match reconnect_loop(client, &reconnect_config, cancel).await {
            Some(_) => continue, // loop back to process messages
            None => return,      // cancelled
        }
    }
}

/// Check for executions that completed on ComfyUI while we were disconnected.
///
/// Queries the database for any executions in "submitted" or "running" status
/// on this instance, then checks ComfyUI's history API to see if they've
/// actually finished. If so, emits the appropriate completion or error event
/// so the event loop can process them.
async fn recover_missed_completions(
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    client: &ComfyUIClient,
) {
    // Find outstanding executions for this instance.
    let rows: Vec<(i64, String)> = match sqlx::query_as(
        "SELECT id, comfyui_prompt_id FROM comfyui_executions \
         WHERE instance_id = $1 AND status IN ('submitted', 'running') \
         ORDER BY id",
    )
    .bind(instance_id)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(instance_id, error = %e, "Failed to query outstanding executions");
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    tracing::info!(
        instance_id,
        count = rows.len(),
        "Checking {} outstanding execution(s) after reconnect",
        rows.len(),
    );

    let api = crate::api::ComfyUIApi::new(client.api_url().to_string());

    for (exec_id, prompt_id) in &rows {
        match api.get_history(prompt_id).await {
            Ok(history) => {
                if let Some(entry) = history.get(prompt_id.as_str()) {
                    // Check if there's a status field indicating completion.
                    let status_info = entry.get("status");
                    let completed = status_info
                        .and_then(|s| s.get("completed"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let status_msg = status_info
                        .and_then(|s| s.get("status_str"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Also check if outputs exist (non-empty outputs means it completed).
                    let has_outputs = entry
                        .get("outputs")
                        .and_then(|o| o.as_object())
                        .map(|o| !o.is_empty())
                        .unwrap_or(false);

                    if completed || has_outputs {
                        // Check for error status
                        if status_msg == "error" {
                            let error_msg = entry
                                .pointer("/status/messages")
                                .and_then(|m| m.as_array())
                                .and_then(|arr| {
                                    arr.iter().find_map(|msg| {
                                        let msg_type = msg.as_array()?.first()?.as_str()?;
                                        if msg_type == "execution_error" {
                                            msg.as_array()?.get(1)?.get("exception_message")?.as_str().map(|s| s.to_string())
                                        } else {
                                            None
                                        }
                                    })
                                })
                                .unwrap_or_else(|| "Unknown error".to_string());

                            tracing::warn!(
                                instance_id,
                                exec_id,
                                %prompt_id,
                                "Recovered missed execution error: {error_msg}",
                            );

                            if let Err(e) = ComfyUIExecutionRepo::mark_failed(pool, prompt_id, &error_msg).await {
                                tracing::error!(error = %e, "Failed to mark recovered execution as failed");
                            }

                            if let Ok(Some(exec)) = ComfyUIExecutionRepo::find_by_prompt_id(pool, prompt_id).await {
                                let _ = event_tx.send(ComfyUIEvent::GenerationError {
                                    instance_id,
                                    platform_job_id: exec.platform_job_id,
                                    prompt_id: prompt_id.clone(),
                                    error: error_msg,
                                });
                            }
                        } else {
                            tracing::info!(
                                instance_id,
                                exec_id,
                                %prompt_id,
                                "Recovered missed completion from history",
                            );

                            if let Err(e) = ComfyUIExecutionRepo::mark_completed(pool, prompt_id).await {
                                tracing::error!(error = %e, "Failed to mark recovered execution as completed");
                            }

                            if let Ok(Some(exec)) = ComfyUIExecutionRepo::find_by_prompt_id(pool, prompt_id).await {
                                let _ = event_tx.send(ComfyUIEvent::GenerationCompleted {
                                    instance_id,
                                    platform_job_id: exec.platform_job_id,
                                    prompt_id: prompt_id.clone(),
                                    outputs: serde_json::Value::Null,
                                });
                            }
                        }
                    } else {
                        tracing::debug!(
                            instance_id,
                            exec_id,
                            %prompt_id,
                            "Execution still in progress on ComfyUI",
                        );
                    }
                } else {
                    // No history entry — ComfyUI may have restarted and lost it.
                    tracing::warn!(
                        instance_id,
                        exec_id,
                        %prompt_id,
                        "No history found on ComfyUI — execution may have been lost",
                    );
                }
            }
            Err(e) => {
                tracing::warn!(
                    instance_id,
                    exec_id,
                    %prompt_id,
                    error = %e,
                    "Failed to check execution history",
                );
            }
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

    /// The interrupt HTTP call failed.
    #[error("Failed to interrupt instance: {0}")]
    InterruptFailed(String),

    /// A database query failed.
    #[error("Database error: {0}")]
    DatabaseError(String),
}
