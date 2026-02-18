# Task List: ComfyUI WebSocket Bridge

**PRD Reference:** `design/prds/005-prd-comfyui-websocket-bridge.md`
**Scope:** Build a Rust WebSocket client that connects to one or more ComfyUI instances, submits workflows, receives real-time progress events, handles cancellation, and automatically reconnects on failure.

## Overview

This PRD creates the bridge between the platform's orchestration layer and ComfyUI generation engines. The bridge is implemented as a set of Rust modules using `tokio-tungstenite` for WebSocket client connections. Each ComfyUI instance gets a managed connection with automatic reconnection, and the bridge translates ComfyUI's native WebSocket messages into platform events that flow through the event bus (PRD-010). The bridge also provides an internal API for workflow submission and cancellation used by the job scheduler (PRD-008).

### What Already Exists
- PRD-002: Axum server with WebSocket infrastructure (`WsManager`), `AppState`, Tokio runtime
- PRD-002: Graceful shutdown signaling

### What We're Building
1. Database table: `comfyui_instances` for instance configuration
2. ComfyUI WebSocket client with `tokio-tungstenite`
3. Connection manager for multiple instances with reconnection
4. Message parser for ComfyUI WebSocket protocol
5. Workflow submission via ComfyUI REST API
6. Progress event translation and forwarding
7. Interrupt/cancel signal forwarding
8. Job ID mapping (platform job ID to ComfyUI execution ID)

### Key Design Decisions
1. **Persistent connections** — Connections to ComfyUI stay open, not per-job. This reduces latency and avoids reconnection overhead per generation.
2. **Exponential backoff reconnect** — On disconnection, retry at 1s, 2s, 4s, 8s... up to 30s max. Prevents thundering herd on ComfyUI restart.
3. **Internal API only** — The bridge exposes no user-facing endpoints. Job submission comes from the scheduler; progress goes to the event bus.
4. **tokio-tungstenite** — Async WebSocket client that integrates natively with Tokio. No additional runtime needed.

---

## Phase 1: Database Schema

### Task 1.1: Create ComfyUI Instances Table
**File:** `migrations/20260218400001_create_comfyui_instances_table.sql`

```sql
CREATE TABLE comfyui_instance_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON comfyui_instance_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO comfyui_instance_statuses (name, description) VALUES
    ('connected', 'WebSocket connection is active'),
    ('disconnected', 'WebSocket connection is down'),
    ('reconnecting', 'Attempting to reconnect'),
    ('disabled', 'Instance is manually disabled');

CREATE TABLE comfyui_instances (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    ws_url TEXT NOT NULL,
    api_url TEXT NOT NULL,
    status_id BIGINT NOT NULL REFERENCES comfyui_instance_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    last_connected_at TIMESTAMPTZ,
    last_disconnected_at TIMESTAMPTZ,
    reconnect_attempts INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comfyui_instances_status_id ON comfyui_instances(status_id);
CREATE UNIQUE INDEX uq_comfyui_instances_name ON comfyui_instances(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON comfyui_instances
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `comfyui_instance_statuses` lookup table with connected/disconnected/reconnecting/disabled
- [ ] `comfyui_instances` table with `ws_url`, `api_url`, `status_id`, connection tracking
- [ ] `is_enabled BOOLEAN` for manual enable/disable
- [ ] FK index on `status_id`
- [ ] Unique constraint on `name`

### Task 1.2: Create Job-to-Execution Mapping Table
**File:** `migrations/20260218400002_create_comfyui_executions_table.sql`

```sql
CREATE TABLE comfyui_executions (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL REFERENCES comfyui_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
    platform_job_id BIGINT NOT NULL,
    comfyui_prompt_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    progress_percent SMALLINT NOT NULL DEFAULT 0,
    current_node TEXT,
    error_message TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comfyui_executions_instance_id ON comfyui_executions(instance_id);
CREATE INDEX idx_comfyui_executions_platform_job_id ON comfyui_executions(platform_job_id);
CREATE INDEX idx_comfyui_executions_comfyui_prompt_id ON comfyui_executions(comfyui_prompt_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON comfyui_executions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Maps `platform_job_id` to `comfyui_prompt_id`
- [ ] Tracks `progress_percent`, `current_node`, `error_message`
- [ ] `instance_id` FK cascades on delete
- [ ] Indexes on all FK and lookup columns
- [ ] Timestamps for submission, start, and completion

---

## Phase 2: ComfyUI Client

### Task 2.1: WebSocket Client Connection
**File:** `src/comfyui/client.rs`

Implement the WebSocket client that connects to a single ComfyUI instance.

```rust
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{StreamExt, SinkExt};

pub struct ComfyUIClient {
    instance_id: DbId,
    ws_url: String,
    api_url: String,
}

impl ComfyUIClient {
    pub fn new(instance_id: DbId, ws_url: String, api_url: String) -> Self {
        Self { instance_id, ws_url, api_url }
    }

    pub async fn connect(&self) -> Result<ComfyUIConnection, Box<dyn std::error::Error>> {
        let client_id = uuid::Uuid::new_v4().to_string();
        let url = format!("{}/ws?clientId={}", self.ws_url, client_id);
        let (ws_stream, _) = connect_async(&url).await?;
        let (write, read) = ws_stream.split();

        tracing::info!(instance_id = self.instance_id, "Connected to ComfyUI at {}", self.ws_url);

        Ok(ComfyUIConnection {
            instance_id: self.instance_id,
            client_id,
            api_url: self.api_url.clone(),
            writer: write,
            reader: read,
        })
    }
}
```

**Acceptance Criteria:**
- [ ] Connects to ComfyUI WebSocket endpoint with unique client ID
- [ ] Returns split read/write streams for concurrent processing
- [ ] `tokio-tungstenite` added to `Cargo.toml`
- [ ] `futures-util` added for stream utilities
- [ ] Connection errors are propagated with clear context

### Task 2.2: Message Parser
**File:** `src/comfyui/messages.rs`

Parse ComfyUI WebSocket messages into typed Rust structs.

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ComfyUIMessage {
    #[serde(rename = "status")]
    Status(StatusData),
    #[serde(rename = "execution_start")]
    ExecutionStart(ExecutionData),
    #[serde(rename = "execution_cached")]
    ExecutionCached(ExecutionData),
    #[serde(rename = "executing")]
    Executing(ExecutingData),
    #[serde(rename = "progress")]
    Progress(ProgressData),
    #[serde(rename = "executed")]
    Executed(ExecutedData),
    #[serde(rename = "execution_error")]
    ExecutionError(ErrorData),
}

#[derive(Debug, Deserialize)]
pub struct StatusData {
    pub status: QueueStatus,
}

#[derive(Debug, Deserialize)]
pub struct QueueStatus {
    pub exec_info: ExecInfo,
}

#[derive(Debug, Deserialize)]
pub struct ExecInfo {
    pub queue_remaining: i32,
}

#[derive(Debug, Deserialize)]
pub struct ProgressData {
    pub value: i32,
    pub max: i32,
}

#[derive(Debug, Deserialize)]
pub struct ExecutingData {
    pub node: Option<String>,
    pub prompt_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ExecutedData {
    pub node: String,
    pub output: serde_json::Value,
    pub prompt_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ErrorData {
    pub prompt_id: String,
    pub node_id: String,
    pub exception_message: String,
    pub exception_type: String,
}

pub fn parse_message(text: &str) -> Result<ComfyUIMessage, serde_json::Error> {
    serde_json::from_str(text)
}
```

**Acceptance Criteria:**
- [ ] Parses all ComfyUI message types: status, execution_start, executing, progress, executed, execution_error
- [ ] `ProgressData` includes value/max for percentage calculation
- [ ] `ExecutingData` includes current node name
- [ ] `ErrorData` includes exception message and type
- [ ] Unknown message types are handled gracefully (logged, not panicked)

### Task 2.3: Workflow Submission via REST API
**File:** `src/comfyui/api.rs`

Submit workflows to ComfyUI's HTTP API.

```rust
use reqwest::Client;

pub struct ComfyUIApi {
    client: Client,
    api_url: String,
}

impl ComfyUIApi {
    pub fn new(api_url: String) -> Self {
        Self {
            client: Client::new(),
            api_url,
        }
    }

    pub async fn submit_workflow(
        &self,
        workflow_json: &serde_json::Value,
        client_id: &str,
    ) -> Result<SubmitResponse, Box<dyn std::error::Error>> {
        let payload = serde_json::json!({
            "prompt": workflow_json,
            "client_id": client_id,
        });

        let response = self.client
            .post(format!("{}/prompt", self.api_url))
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("ComfyUI API error: {}", error_text).into());
        }

        let result: SubmitResponse = response.json().await?;
        Ok(result)
    }

    pub async fn cancel_execution(
        &self,
        prompt_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let payload = serde_json::json!({ "delete": [prompt_id] });
        self.client
            .post(format!("{}/queue", self.api_url))
            .json(&payload)
            .send()
            .await?;
        Ok(())
    }

    pub async fn interrupt(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.client
            .post(format!("{}/interrupt", self.api_url))
            .send()
            .await?;
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct SubmitResponse {
    pub prompt_id: String,
    pub number: i32,
}
```

**Acceptance Criteria:**
- [ ] `submit_workflow` sends POST to `/prompt` with workflow JSON and client ID
- [ ] Returns `prompt_id` for tracking
- [ ] `cancel_execution` sends POST to `/queue` with delete payload
- [ ] `interrupt` sends POST to `/interrupt`
- [ ] `reqwest` crate added to `Cargo.toml`
- [ ] API errors include the ComfyUI error response text

---

## Phase 3: Connection Manager

### Task 3.1: Multi-Instance Connection Manager
**File:** `src/comfyui/manager.rs`

Manage connections to multiple ComfyUI instances with lifecycle tracking.

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ComfyUIManager {
    connections: RwLock<HashMap<DbId, Arc<ManagedConnection>>>,
    pool: PgPool,
}

struct ManagedConnection {
    instance_id: DbId,
    client: ComfyUIClient,
    api: ComfyUIApi,
    status: RwLock<ConnectionStatus>,
    cancel_token: tokio_util::sync::CancellationToken,
}

#[derive(Debug, Clone)]
enum ConnectionStatus {
    Connected,
    Disconnected,
    Reconnecting { attempt: u32 },
}

impl ComfyUIManager {
    pub async fn start(pool: PgPool) -> Arc<Self> {
        let manager = Arc::new(Self {
            connections: RwLock::new(HashMap::new()),
            pool,
        });

        // Load enabled instances from database
        // Spawn connection tasks for each
        manager.load_and_connect().await;
        manager
    }

    async fn load_and_connect(&self) {
        // Query comfyui_instances WHERE is_enabled = true
        // For each, spawn a managed connection task
    }

    pub async fn submit_workflow(
        &self,
        instance_id: DbId,
        workflow_json: &serde_json::Value,
        platform_job_id: DbId,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let conns = self.connections.read().await;
        let conn = conns.get(&instance_id)
            .ok_or("Instance not found or not connected")?;
        // Submit via API, record mapping in comfyui_executions table
        Ok("prompt_id".to_string())
    }

    pub async fn cancel_job(&self, platform_job_id: DbId) -> Result<(), Box<dyn std::error::Error>> {
        // Look up comfyui_prompt_id from comfyui_executions
        // Find instance, call cancel
        Ok(())
    }
}
```

**Acceptance Criteria:**
- [ ] Manages connections to multiple ComfyUI instances concurrently
- [ ] Loads instance configuration from database on startup
- [ ] `submit_workflow` routes to the correct instance
- [ ] `cancel_job` maps platform job ID to ComfyUI prompt ID and cancels
- [ ] Connection status tracked per instance
- [ ] Thread-safe via `RwLock<HashMap>`

### Task 3.2: Automatic Reconnection
**File:** `src/comfyui/reconnect.rs`

Implement exponential backoff reconnection logic.

```rust
use tokio::time::{sleep, Duration};

pub struct ReconnectConfig {
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub multiplier: f64,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            initial_delay_ms: 1000,
            max_delay_ms: 30_000,
            multiplier: 2.0,
        }
    }
}

pub async fn reconnect_loop(
    client: &ComfyUIClient,
    config: &ReconnectConfig,
    cancel_token: &CancellationToken,
) -> Option<ComfyUIConnection> {
    let mut delay = config.initial_delay_ms;
    let mut attempt = 0u32;

    loop {
        attempt += 1;
        tracing::info!(
            instance_id = client.instance_id,
            attempt = attempt,
            delay_ms = delay,
            "Reconnecting to ComfyUI"
        );

        tokio::select! {
            _ = cancel_token.cancelled() => return None,
            result = client.connect() => {
                match result {
                    Ok(conn) => {
                        tracing::info!(instance_id = client.instance_id, "Reconnected after {} attempts", attempt);
                        return Some(conn);
                    }
                    Err(e) => {
                        tracing::warn!(instance_id = client.instance_id, error = %e, "Reconnect failed");
                    }
                }
            }
        }

        sleep(Duration::from_millis(delay)).await;
        delay = ((delay as f64 * config.multiplier) as u64).min(config.max_delay_ms);
    }
}
```

**Acceptance Criteria:**
- [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
- [ ] Reconnection attempts logged with instance ID and attempt count
- [ ] Cancellation token stops reconnection during shutdown
- [ ] Successful reconnection resets the backoff
- [ ] Instance status updated in database on each state change
- [ ] `tokio-util` added to `Cargo.toml` for `CancellationToken`

---

## Phase 4: Event Processing

### Task 4.1: Message Processing Loop
**File:** `src/comfyui/processor.rs`

Process incoming ComfyUI messages and translate to platform events.

```rust
pub async fn process_messages(
    mut reader: SplitStream<WebSocketStream<...>>,
    instance_id: DbId,
    pool: &PgPool,
    event_sender: &EventSender,
) {
    while let Some(msg) = reader.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match parse_message(&text) {
                    Ok(ComfyUIMessage::Progress(data)) => {
                        let percent = ((data.value as f64 / data.max as f64) * 100.0) as i16;
                        // Update comfyui_executions progress
                        // Emit progress event to event bus
                        event_sender.send(PlatformEvent::GenerationProgress {
                            instance_id,
                            prompt_id: data.prompt_id,
                            percent,
                        }).await;
                    }
                    Ok(ComfyUIMessage::Executing(data)) => {
                        // Update current_node in comfyui_executions
                        event_sender.send(PlatformEvent::NodeExecuting {
                            instance_id,
                            prompt_id: data.prompt_id,
                            node: data.node,
                        }).await;
                    }
                    Ok(ComfyUIMessage::ExecutionError(data)) => {
                        // Update execution status to failed
                        event_sender.send(PlatformEvent::GenerationError {
                            instance_id,
                            prompt_id: data.prompt_id,
                            error: data.exception_message,
                        }).await;
                    }
                    Ok(ComfyUIMessage::Executed(data)) => {
                        // Mark execution as completed
                        // Capture output paths
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse ComfyUI message: {}", e);
                    }
                    _ => {}
                }
            }
            Ok(Message::Close(_)) => {
                tracing::info!(instance_id, "ComfyUI WebSocket closed");
                break;
            }
            Err(e) => {
                tracing::error!(instance_id, error = %e, "WebSocket error");
                break;
            }
            _ => {}
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Progress messages calculate percentage and update DB + event bus
- [ ] Executing messages track current node
- [ ] Error messages update execution status and emit error event
- [ ] Completed messages capture output and mark execution done
- [ ] Unknown messages are logged but don't crash the loop
- [ ] Connection close triggers reconnection flow

### Task 4.2: Platform Event Translation
**File:** `src/comfyui/events.rs`

Define the platform events emitted by the ComfyUI bridge.

```rust
#[derive(Debug, Clone, Serialize)]
pub enum ComfyUIEvent {
    InstanceConnected { instance_id: DbId },
    InstanceDisconnected { instance_id: DbId },
    GenerationProgress {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        percent: i16,
        current_node: Option<String>,
    },
    GenerationCompleted {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        outputs: serde_json::Value,
    },
    GenerationError {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        error: String,
    },
    GenerationCancelled {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
    },
}
```

**Acceptance Criteria:**
- [ ] Events cover: connected, disconnected, progress, completed, error, cancelled
- [ ] All events include `instance_id` for routing
- [ ] Progress events include `platform_job_id` for UI mapping
- [ ] Events are `Serialize` for forwarding to the event bus (PRD-010)

---

## Phase 5: Instance Repository and Configuration

### Task 5.1: ComfyUI Instance Repository
**File:** `src/repositories/comfyui_repo.rs`

```rust
pub struct ComfyUIRepo;

impl ComfyUIRepo {
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<ComfyUIInstance>, sqlx::Error> {
        sqlx::query_as::<_, ComfyUIInstance>(
            "SELECT id, name, ws_url, api_url, status_id, last_connected_at,
                    last_disconnected_at, reconnect_attempts, is_enabled, metadata,
                    created_at, updated_at
             FROM comfyui_instances WHERE is_enabled = true"
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_instances SET status_id = $2 WHERE id = $1"
        )
        .bind(id)
        .bind(status_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn record_connection(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE comfyui_instances SET last_connected_at = NOW(), reconnect_attempts = 0 WHERE id = $1"
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
```

**Acceptance Criteria:**
- [ ] `list_enabled` returns all enabled instances
- [ ] `update_status` changes instance connection status
- [ ] `record_connection` updates `last_connected_at` and resets reconnect counter
- [ ] `record_disconnection` updates `last_disconnected_at`
- [ ] All queries use explicit column lists

### Task 5.2: Execution Tracking Repository
**File:** `src/repositories/comfyui_execution_repo.rs`

```rust
pub struct ExecutionRepo;

impl ExecutionRepo {
    pub async fn create(
        pool: &PgPool,
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: &str,
    ) -> Result<ComfyUIExecution, sqlx::Error> { ... }

    pub async fn update_progress(
        pool: &PgPool,
        prompt_id: &str,
        progress_percent: i16,
        current_node: Option<&str>,
    ) -> Result<(), sqlx::Error> { ... }

    pub async fn find_by_platform_job_id(
        pool: &PgPool,
        platform_job_id: DbId,
    ) -> Result<Option<ComfyUIExecution>, sqlx::Error> { ... }
}
```

**Acceptance Criteria:**
- [ ] Create execution record linking platform job to ComfyUI prompt
- [ ] Update progress percentage and current node
- [ ] Look up execution by platform job ID (for cancellation)
- [ ] Mark execution as completed, failed, or cancelled

---

## Phase 6: Integration with AppState

### Task 6.1: Wire ComfyUI Manager into AppState
**File:** `src/app_state.rs` (update), `src/main.rs` (update)

```rust
// In AppState:
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub ws_manager: Arc<WsManager>,
    pub comfyui_manager: Arc<ComfyUIManager>,
}

// In main.rs:
let comfyui_manager = ComfyUIManager::start(pool.clone()).await;
```

**Acceptance Criteria:**
- [ ] `ComfyUIManager` added to `AppState`
- [ ] Manager started during server bootstrap after database is ready
- [ ] Manager is shut down during graceful shutdown (cancel tokens)
- [ ] All connection tasks are spawned as Tokio tasks

---

## Phase 7: Integration Tests

### Task 7.1: Message Parsing Tests
**File:** `src/comfyui/messages.rs` (test module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_progress() {
        let json = r#"{"type": "progress", "data": {"value": 5, "max": 20}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Progress(data) => {
                assert_eq!(data.value, 5);
                assert_eq!(data.max, 20);
            }
            _ => panic!("Expected Progress message"),
        }
    }

    #[test]
    fn test_parse_execution_error() {
        let json = r#"{"type": "execution_error", "data": {"prompt_id": "abc", "node_id": "1", "exception_message": "OOM", "exception_type": "RuntimeError"}}"#;
        let msg = parse_message(json).unwrap();
        // Verify fields
    }

    #[test]
    fn test_parse_unknown_type() {
        let json = r#"{"type": "unknown_future_type", "data": {}}"#;
        // Should not panic
    }
}
```

**Acceptance Criteria:**
- [ ] Test: parse progress message with value/max
- [ ] Test: parse execution_start, executing, executed messages
- [ ] Test: parse execution_error with error details
- [ ] Test: unknown message types handled gracefully
- [ ] Test: malformed JSON returns error (not panic)

### Task 7.2: Reconnection Logic Tests
**File:** `tests/comfyui_reconnect_tests.rs`

**Acceptance Criteria:**
- [ ] Test: exponential backoff delays are correct (1s, 2s, 4s, 8s, ...)
- [ ] Test: delay caps at max (30s)
- [ ] Test: cancellation token stops reconnection
- [ ] Test: successful reconnection resets backoff

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218400001_create_comfyui_instances_table.sql` | Instance config and status tables |
| `migrations/20260218400002_create_comfyui_executions_table.sql` | Job-to-execution mapping |
| `src/comfyui/mod.rs` | ComfyUI module barrel file |
| `src/comfyui/client.rs` | WebSocket client connection |
| `src/comfyui/messages.rs` | Message type definitions and parser |
| `src/comfyui/api.rs` | REST API client (submit, cancel, interrupt) |
| `src/comfyui/manager.rs` | Multi-instance connection manager |
| `src/comfyui/reconnect.rs` | Exponential backoff reconnection |
| `src/comfyui/processor.rs` | Message processing and event translation |
| `src/comfyui/events.rs` | Platform event definitions |
| `src/repositories/comfyui_repo.rs` | Instance CRUD |
| `src/repositories/comfyui_execution_repo.rs` | Execution tracking CRUD |
| `src/models/comfyui.rs` | ComfyUIInstance, ComfyUIExecution model structs |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: Tokio runtime, `AppState`, graceful shutdown signaling
- PRD-002: `AppError` for error handling
- PRD-000: `trigger_set_updated_at()`, `DbId = i64`, status lookup pattern

### New Infrastructure Needed
- `tokio-tungstenite` crate for async WebSocket client
- `reqwest` crate for ComfyUI REST API calls
- `tokio-util` crate for `CancellationToken`
- `futures-util` crate for stream splitting

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2
2. Phase 2: ComfyUI Client — Tasks 2.1–2.3
3. Phase 3: Connection Manager — Tasks 3.1–3.2
4. Phase 4: Event Processing — Tasks 4.1–4.2

**MVP Success Criteria:**
- Connects to configured ComfyUI instances on startup
- Submits workflows and receives progress updates
- Automatic reconnection on disconnection (within 30s)
- Cancel requests forwarded to ComfyUI
- Job ID mapping tracked in database

### Post-MVP Enhancements
1. Phase 5: Repositories — Tasks 5.1–5.2
2. Phase 6: AppState Integration — Task 6.1
3. Phase 7: Integration Tests — Tasks 7.1–7.2

---

## Notes

1. **ComfyUI protocol:** The WebSocket messages are JSON with a `type` field. The protocol is not formally documented, so the message parser should be tolerant of unknown fields and new message types.
2. **Client ID:** Each connection uses a unique UUID as the ComfyUI `client_id`. This ensures only our bridge receives messages for workflows it submitted.
3. **Instance configuration:** Initially, ComfyUI instance URLs are configured via database seed data. An admin UI for managing instances is a future enhancement.
4. **Preview images:** ComfyUI can send binary WebSocket messages containing preview images. For MVP, these are ignored. PRD-034 (Interactive Debugger) will add support for viewing these.
5. **Event bus integration:** The events defined here will be consumed by PRD-010 (Event Bus). Until PRD-010 is implemented, events can be logged for debugging.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
