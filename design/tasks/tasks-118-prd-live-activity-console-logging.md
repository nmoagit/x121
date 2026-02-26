# Task List: Live Activity Console & Logging System

**PRD Reference:** `design/prds/118-prd-live-activity-console-logging.md`
**Scope:** Add a real-time, terminal-style activity console that streams structured operational logs from all backend services to the frontend. Includes database persistence with configurable retention, a dedicated WebSocket streaming endpoint, REST query/export API, and a dockable frontend panel plus dedicated full-page view.

## Overview

This implementation adds: (1) an `activity_logs` table with lookup tables for levels and sources, plus an `activity_log_settings` singleton table for retention/batch configuration, (2) an `ActivityLogBroadcaster` in the `events` crate for in-process pub/sub of activity log entries, (3) a custom `tracing::Layer` that captures tracing events and converts them to activity log entries, (4) a batch persistence service that flushes entries to the database on a configurable interval, (5) a retention cleanup background job, (6) a WebSocket endpoint at `/ws/activity-logs` with subscription-based filtering, (7) REST endpoints for querying and exporting persisted logs, (8) a frontend dockable console panel and dedicated page at `/tools/activity-console`.

The implementation follows the existing codebase patterns: zero-sized repository structs with `&PgPool` methods, three-struct models (entity/create/query), Axum handlers with `AppState`/`AppResult`, `EventBus`-style broadcast channels, `EventPersistence`-style background services, `metrics_retention.rs`-style cleanup jobs, and `WsManager`-style WebSocket connection tracking.

### What Already Exists
- `x121_events::bus::EventBus` / `PlatformEvent` -- broadcast channel pattern to reuse for `ActivityLogBroadcaster`
- `x121_events::persistence::EventPersistence` -- background persistence loop pattern (adapt for batch writes)
- `x121_api::background::metrics_retention` -- retention cleanup job pattern with `CancellationToken`
- `x121_api::ws::WsManager` -- WebSocket connection tracking pattern
- `x121_db::models::audit` / `x121_db::repositories::audit_repo` -- log entry model, query parameters, paginated response patterns
- `x121_api::handlers::audit` -- log query/export handler patterns
- `x121_api::state::AppState` -- shared state with `pool`, `event_bus`, `ws_manager`
- `x121_core::types::{DbId, Timestamp}` -- shared type aliases
- `x121_core::metric_names` -- message type constants for agent WebSocket protocol
- `crates/agent/src/sender.rs` -- agent WebSocket message types (`MetricsPayload`, `IncomingMessage`)
- `apps/frontend/src/features/audit/` -- audit log viewer feature pattern (hooks, types, components)
- `apps/frontend/src/app/navigation.ts` -- sidebar navigation configuration

### What We're Building
1. Database migration: `activity_log_levels`, `activity_log_sources`, `activity_logs`, and `activity_log_settings` tables
2. `ActivityLogEntry` domain type in `core` crate
3. `ActivityLogBroadcaster` in `events` crate (broadcast channel like `EventBus`)
4. `ActivityLog` model structs and `ActivityLogRepo` in `db` crate
5. `ActivityLogSettingsRepo` in `db` crate
6. `ActivityTracingLayer` custom `tracing::Layer` in `api` crate
7. `ActivityLogPersistence` batch write background service in `api` crate
8. `ActivityLogRetention` cleanup background job in `api` crate
9. REST handler module for log query, export, and settings management
10. WebSocket handler for `/ws/activity-logs` with subscription filtering
11. Frontend `activity-console` feature module with console panel, console page, Zustand store, and WebSocket hook
12. Navigation and routing wiring

### Key Design Decisions
1. **Separate from audit logs** -- `activity_logs` is a distinct table from `audit_logs` (PRD-45). Different retention, different access patterns, different purpose (operational vs compliance).
2. **Batch persistence** -- Unlike `EventPersistence` which inserts single rows, `ActivityLogPersistence` buffers entries in memory and flushes in batches (default 100 entries or 1 second, whichever comes first) for throughput.
3. **Broadcast channel for WebSocket fan-out** -- `ActivityLogBroadcaster` uses `tokio::sync::broadcast` just like `EventBus`. WebSocket handlers subscribe and apply server-side filters per client.
4. **Role-based filtering server-side** -- Creators only see entries scoped to their own projects/jobs. Admins see everything. Filtering happens in both the WebSocket handler and REST API queries.
5. **Lookup tables for levels and sources** -- Follow the project convention of using FK lookup tables for enumerated values (`activity_log_levels`, `activity_log_sources`).
6. **Agent log forwarding** -- Extend the existing agent WebSocket protocol with a `log` message type (alongside `gpu_metrics` and `restart_result`).

---

## Phase 1: Database Migration

### Task 1.1: Create activity log tables migration
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_activity_logs.sql`

Create the lookup tables, main activity logs table, and settings singleton table.

```sql
-- Activity log lookup: levels (PRD-118 Req 1.1)
CREATE TABLE activity_log_levels (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO activity_log_levels (name, label) VALUES
    ('debug', 'Debug'),
    ('info', 'Info'),
    ('warn', 'Warn'),
    ('error', 'Error');

-- Activity log lookup: sources (PRD-118 Req 1.1)
CREATE TABLE activity_log_sources (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO activity_log_sources (name, label) VALUES
    ('api', 'API Server'),
    ('comfyui', 'ComfyUI Bridge'),
    ('worker', 'Worker Process'),
    ('agent', 'GPU Agent'),
    ('pipeline', 'Pipeline Engine');

-- Activity logs (PRD-118 Req 1.1)
CREATE TABLE activity_logs (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    level_id        SMALLINT NOT NULL REFERENCES activity_log_levels(id),
    source_id       SMALLINT NOT NULL REFERENCES activity_log_sources(id),
    message         TEXT NOT NULL,
    fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
    category        TEXT NOT NULL DEFAULT 'verbose',
    entity_type     TEXT,
    entity_id       BIGINT,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    job_id          BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    project_id      BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    trace_id        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at trigger: activity logs are append-only

CREATE INDEX idx_activity_logs_timestamp ON activity_logs (timestamp DESC);
CREATE INDEX idx_activity_logs_level_id ON activity_logs (level_id);
CREATE INDEX idx_activity_logs_source_id ON activity_logs (source_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs (entity_type, entity_id) WHERE entity_type IS NOT NULL;
CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_activity_logs_job_id ON activity_logs (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_activity_logs_project_id ON activity_logs (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_activity_logs_trace_id ON activity_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_activity_logs_category ON activity_logs (category);
CREATE INDEX idx_activity_logs_fields ON activity_logs USING GIN (fields);

-- Activity log settings (singleton row) (PRD-118 Req 1.5)
CREATE TABLE activity_log_settings (
    id                      BIGSERIAL PRIMARY KEY,
    retention_days_debug    INT NOT NULL DEFAULT 7,
    retention_days_info     INT NOT NULL DEFAULT 30,
    retention_days_warn     INT NOT NULL DEFAULT 30,
    retention_days_error    INT NOT NULL DEFAULT 90,
    batch_size              INT NOT NULL DEFAULT 100,
    flush_interval_ms       INT NOT NULL DEFAULT 1000,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO activity_log_settings (id) VALUES (1);

CREATE TRIGGER trg_activity_log_settings_updated_at
    BEFORE UPDATE ON activity_log_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] `activity_log_levels` lookup table created with 4 seed rows (debug, info, warn, error)
- [ ] `activity_log_sources` lookup table created with 5 seed rows (api, comfyui, worker, agent, pipeline)
- [ ] `activity_logs` table created with `BIGSERIAL` PK, `created_at` TIMESTAMPTZ, no `updated_at` (append-only)
- [ ] FKs to `activity_log_levels(id)`, `activity_log_sources(id)`, `users(id)`, `jobs(id)`, `projects(id)`
- [ ] `category` column defaults to `'verbose'`, used for `'curated'` vs `'verbose'` distinction
- [ ] All 9 indexes created: timestamp DESC, level_id, source_id, entity composite, user_id, job_id, project_id, trace_id, category, fields GIN
- [ ] `activity_log_settings` singleton table created with default retention values and `set_updated_at()` trigger
- [ ] Migration runs cleanly via `sqlx migrate run`

---

## Phase 2: Core Domain Types

### Task 2.1: Create `ActivityLogEntry` domain type in core crate
**File:** `apps/backend/crates/core/src/activity.rs`

Define the shared domain type used across crates. This goes in `core` because it has zero internal deps and is referenced by `events` (broadcaster), `api` (tracing layer, handlers), and `db` (models).

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Log level for an activity log entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

/// Source service that produced an activity log entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogSource {
    Api,
    Comfyui,
    Worker,
    Agent,
    Pipeline,
}

/// Category distinguishing curated (explicit) from verbose (tracing) entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogCategory {
    Curated,
    Verbose,
}

/// A structured activity log entry flowing through the broadcast channel.
///
/// This is the in-memory representation used by `ActivityLogBroadcaster`.
/// It is converted to/from the database model by the persistence layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: ActivityLogLevel,
    pub source: ActivityLogSource,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: ActivityLogCategory,
    pub entity_type: Option<String>,
    pub entity_id: Option<i64>,
    pub user_id: Option<i64>,
    pub job_id: Option<i64>,
    pub project_id: Option<i64>,
    pub trace_id: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] `ActivityLogLevel` enum with 4 variants, derives `Serialize`/`Deserialize` with lowercase rename
- [ ] `ActivityLogSource` enum with 5 variants matching the lookup table seed data
- [ ] `ActivityLogCategory` enum with `Curated` and `Verbose` variants
- [ ] `ActivityLogEntry` struct with all fields matching the database column set
- [ ] All types derive `Debug, Clone, Serialize, Deserialize`
- [ ] `ActivityLogLevel` and `ActivityLogSource` derive `Copy, PartialEq, Eq` for use as filter predicates
- [ ] Module registered in `core/src/lib.rs` as `pub mod activity`
- [ ] Helper methods on enums: `as_str(&self) -> &'static str` and `from_str` for mapping to/from lookup table `name` values

### Task 2.2: Add `activity!()` convenience helper
**File:** `apps/backend/crates/core/src/activity.rs` (append)

Add a helper function (not a macro for simplicity) that creates a curated `ActivityLogEntry` with required fields. Used by backend services to emit structured activity events.

```rust
impl ActivityLogEntry {
    /// Create a new curated activity log entry.
    pub fn curated(
        level: ActivityLogLevel,
        source: ActivityLogSource,
        message: impl Into<String>,
    ) -> Self {
        Self {
            timestamp: Utc::now(),
            level,
            source,
            message: message.into(),
            fields: serde_json::Value::Object(Default::default()),
            category: ActivityLogCategory::Curated,
            entity_type: None,
            entity_id: None,
            user_id: None,
            job_id: None,
            project_id: None,
            trace_id: None,
        }
    }

    /// Builder: attach an entity reference.
    pub fn with_entity(mut self, entity_type: impl Into<String>, entity_id: i64) -> Self { ... }

    /// Builder: attach a user ID.
    pub fn with_user(mut self, user_id: i64) -> Self { ... }

    /// Builder: attach a job ID.
    pub fn with_job(mut self, job_id: i64) -> Self { ... }

    /// Builder: attach a project ID.
    pub fn with_project(mut self, project_id: i64) -> Self { ... }

    /// Builder: attach a trace ID.
    pub fn with_trace(mut self, trace_id: impl Into<String>) -> Self { ... }

    /// Builder: set structured fields.
    pub fn with_fields(mut self, fields: serde_json::Value) -> Self { ... }
}
```

**Acceptance Criteria:**
- [ ] `ActivityLogEntry::curated()` factory creates a curated entry with default empty fields
- [ ] Builder methods chain correctly: `.with_entity().with_user().with_job()`
- [ ] Builder pattern matches `PlatformEvent::new().with_source().with_actor()` from `EventBus`
- [ ] Unit tests verify builder chain produces correct field values
- [ ] Unit tests verify serialization/deserialization round-trip

---

## Phase 3: Events Crate -- Broadcaster

### Task 3.1: Create `ActivityLogBroadcaster`
**File:** `apps/backend/crates/events/src/activity.rs`

Create a broadcast channel for `ActivityLogEntry` following the `EventBus` pattern.

```rust
use tokio::sync::broadcast;
use x121_core::activity::ActivityLogEntry;

const DEFAULT_CAPACITY: usize = 4096;

/// In-process broadcast channel for activity log entries.
///
/// Similar to [`EventBus`](crate::bus::EventBus) but carries
/// [`ActivityLogEntry`] instead of [`PlatformEvent`].
pub struct ActivityLogBroadcaster {
    sender: broadcast::Sender<ActivityLogEntry>,
}

impl ActivityLogBroadcaster {
    pub fn new(capacity: usize) -> Self { ... }
    pub fn publish(&self, entry: ActivityLogEntry) { ... }
    pub fn subscribe(&self) -> broadcast::Receiver<ActivityLogEntry> { ... }
}

impl Default for ActivityLogBroadcaster {
    fn default() -> Self { Self::new(DEFAULT_CAPACITY) }
}
```

**Acceptance Criteria:**
- [ ] `ActivityLogBroadcaster` wraps `broadcast::Sender<ActivityLogEntry>`
- [ ] `publish` silently drops if no subscribers (same as `EventBus`)
- [ ] `subscribe` returns a `broadcast::Receiver<ActivityLogEntry>`
- [ ] Default capacity is 4096 (higher than `EventBus` 1024, since activity logs are higher volume)
- [ ] Module registered in `events/src/lib.rs` as `pub mod activity` with `pub use activity::ActivityLogBroadcaster`
- [ ] Unit tests verify publish/subscribe single and multiple subscribers
- [ ] Unit test verifies no panic when publishing with zero subscribers

---

## Phase 4: Database Models & Repositories

### Task 4.1: Create `ActivityLog` model structs
**File:** `apps/backend/crates/db/src/models/activity_log.rs`

Follow the model pattern from `models/audit.rs` -- append-only entries with no `updated_at`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A single activity log entry from the `activity_logs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLog {
    pub id: DbId,
    pub timestamp: Timestamp,
    pub level_id: i16,
    pub source_id: i16,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub trace_id: Option<String>,
    pub created_at: Timestamp,
}

/// DTO for inserting a new activity log entry (batch-friendly).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateActivityLog {
    pub level_id: i16,
    pub source_id: i16,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub trace_id: Option<String>,
}

/// Query parameters for filtering activity logs.
#[derive(Debug, Clone, Deserialize)]
pub struct ActivityLogQuery {
    pub level: Option<String>,
    pub source: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub from: Option<Timestamp>,
    pub to: Option<Timestamp>,
    pub search: Option<String>,
    pub mode: Option<String>,   // "curated" or "verbose"
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Paginated response for activity log queries.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityLogPage {
    pub items: Vec<ActivityLog>,
    pub total: i64,
}

/// Activity log settings (singleton row).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLogSettings {
    pub id: DbId,
    pub retention_days_debug: i32,
    pub retention_days_info: i32,
    pub retention_days_warn: i32,
    pub retention_days_error: i32,
    pub batch_size: i32,
    pub flush_interval_ms: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for updating activity log settings.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateActivityLogSettings {
    pub retention_days_debug: Option<i32>,
    pub retention_days_info: Option<i32>,
    pub retention_days_warn: Option<i32>,
    pub retention_days_error: Option<i32>,
    pub batch_size: Option<i32>,
    pub flush_interval_ms: Option<i32>,
}
```

**Acceptance Criteria:**
- [ ] `ActivityLog` derives `Debug, Clone, FromRow, Serialize`
- [ ] `CreateActivityLog` derives `Debug, Clone, Deserialize` (batch-friendly, no auto fields)
- [ ] `ActivityLogQuery` has all filter fields matching the PRD API spec
- [ ] `ActivityLogPage` wraps `items` + `total` (same pattern as `AuditLogPage`)
- [ ] `ActivityLogSettings` matches the `activity_log_settings` table schema
- [ ] `UpdateActivityLogSettings` has all fields as `Option<i32>` for partial updates
- [ ] Module registered in `models/mod.rs` as `pub mod activity_log`

### Task 4.2: Create `ActivityLogRepo` with batch insert and query operations
**File:** `apps/backend/crates/db/src/repositories/activity_log_repo.rs`

Follow the `AuditLogRepo` pattern for batch inserts and dynamic query building. Activity logs are append-only (no update/delete by users).

```rust
pub struct ActivityLogRepo;

impl ActivityLogRepo {
    /// Batch insert multiple activity log entries.
    /// Uses a single INSERT with multiple value rows for throughput.
    pub async fn batch_insert(
        pool: &PgPool,
        entries: &[CreateActivityLog],
    ) -> Result<u64, sqlx::Error>;

    /// Query activity logs with filtering and pagination.
    pub async fn query(
        pool: &PgPool,
        params: &ActivityLogQuery,
    ) -> Result<Vec<ActivityLog>, sqlx::Error>;

    /// Count activity logs matching the given filter.
    pub async fn count(
        pool: &PgPool,
        params: &ActivityLogQuery,
    ) -> Result<i64, sqlx::Error>;

    /// Export activity logs within a time range.
    pub async fn export_range(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
        params: &ActivityLogQuery,
    ) -> Result<Vec<ActivityLog>, sqlx::Error>;

    /// Delete entries older than a given timestamp for a specific level.
    /// Used by the retention cleanup job.
    pub async fn delete_older_than(
        pool: &PgPool,
        level_id: i16,
        cutoff: Timestamp,
    ) -> Result<u64, sqlx::Error>;

    /// Resolve a level name (e.g. "info") to its `activity_log_levels.id`.
    pub async fn resolve_level_id(pool: &PgPool, name: &str) -> Result<Option<i16>, sqlx::Error>;

    /// Resolve a source name (e.g. "api") to its `activity_log_sources.id`.
    pub async fn resolve_source_id(pool: &PgPool, name: &str) -> Result<Option<i16>, sqlx::Error>;
}
```

Key query details:
- `batch_insert` builds a multi-row INSERT statement like `AuditLogRepo::batch_insert`, but returns `rows_affected` count instead of the inserted rows (for throughput)
- `query` builds dynamic WHERE clauses: `level_id` resolved from `level` name, `source_id` resolved from `source` name, `mode` maps to `category` filter, `search` uses `message ILIKE`
- `delete_older_than` uses `DELETE FROM activity_logs WHERE level_id = $1 AND timestamp < $2`
- For non-admin users, the caller adds `user_id` or `project_id IN (...)` filter conditions

**Acceptance Criteria:**
- [ ] Zero-sized `ActivityLogRepo` struct with `COLUMNS` and `INSERT_COLUMNS` consts
- [ ] `batch_insert` builds multi-row INSERT, handles empty input gracefully, returns affected count
- [ ] `query` supports all filter parameters from `ActivityLogQuery` with dynamic WHERE building
- [ ] `query` orders by `timestamp DESC` with LIMIT/OFFSET pagination (default 25, max 100)
- [ ] `count` returns total matching rows for pagination metadata
- [ ] `export_range` returns entries within `from`/`to` ordered by `timestamp ASC`
- [ ] `delete_older_than` deletes entries by level_id and cutoff timestamp
- [ ] `resolve_level_id` / `resolve_source_id` query the lookup tables by `name`
- [ ] Module registered in `repositories/mod.rs` with `pub use`

### Task 4.3: Create `ActivityLogSettingsRepo`
**File:** `apps/backend/crates/db/src/repositories/activity_log_settings_repo.rs`

Singleton pattern -- always reads/updates the row with `id = 1`.

```rust
pub struct ActivityLogSettingsRepo;

impl ActivityLogSettingsRepo {
    /// Get the current settings (singleton row id=1).
    pub async fn get(pool: &PgPool) -> Result<ActivityLogSettings, sqlx::Error>;

    /// Update settings (partial update, only non-None fields).
    pub async fn update(
        pool: &PgPool,
        dto: &UpdateActivityLogSettings,
    ) -> Result<ActivityLogSettings, sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] `get` always queries `WHERE id = 1`
- [ ] `update` uses dynamic SET clause for non-None fields (same pattern as `AuditRetentionPolicyRepo::update`)
- [ ] `update` returns the updated row via `RETURNING`
- [ ] Module registered in `repositories/mod.rs` with `pub use`

---

## Phase 5: Backend Services & Tracing Layer

### Task 5.1: Create `ActivityTracingLayer` custom tracing layer
**File:** `apps/backend/crates/api/src/background/activity_tracing.rs`

Create a custom `tracing::Layer` that captures tracing events at INFO level and above and publishes them as `ActivityLogEntry` to the `ActivityLogBroadcaster`.

```rust
use std::sync::Arc;
use tracing::Level;
use tracing_subscriber::Layer;
use x121_core::activity::{ActivityLogCategory, ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_events::ActivityLogBroadcaster;

/// A tracing subscriber layer that captures events and publishes them
/// to the activity log broadcast channel.
pub struct ActivityTracingLayer {
    broadcaster: Arc<ActivityLogBroadcaster>,
}

impl ActivityTracingLayer {
    pub fn new(broadcaster: Arc<ActivityLogBroadcaster>) -> Self { ... }
}

impl<S> Layer<S> for ActivityTracingLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Map tracing level to ActivityLogLevel
        // Extract message from event fields
        // Extract source from event target (x121_api → Api, x121_comfyui → Comfyui, etc.)
        // Build ActivityLogEntry with category = Verbose
        // Publish to broadcaster
    }
}
```

**Acceptance Criteria:**
- [ ] Layer captures tracing events at INFO, WARN, and ERROR levels (not DEBUG by default)
- [ ] Maps tracing `Level::INFO` → `ActivityLogLevel::Info`, etc.
- [ ] Extracts event target module to determine `ActivityLogSource` (e.g. `x121_comfyui::` → `Comfyui`)
- [ ] Falls back to `ActivityLogSource::Api` for unrecognized targets
- [ ] Extracts `message` field from event (the primary text content)
- [ ] Extracts structured fields from event into a `serde_json::Value` object
- [ ] All entries are tagged `ActivityLogCategory::Verbose`
- [ ] Publishes to `ActivityLogBroadcaster` (non-blocking, drop on no subscribers)
- [ ] Does not panic or block the tracing pipeline

### Task 5.2: Create `ActivityLogPersistence` batch write service
**File:** `apps/backend/crates/api/src/background/activity_persistence.rs`

Background service that subscribes to `ActivityLogBroadcaster`, buffers entries, and flushes them to the database in batches. Follows the `EventPersistence` pattern but adds batching.

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use x121_core::activity::ActivityLogEntry;
use x121_db::DbPool;

pub struct ActivityLogPersistence;

impl ActivityLogPersistence {
    /// Run the persistence loop.
    ///
    /// Buffers incoming entries and flushes to DB when either:
    /// - Buffer reaches `batch_size` entries, or
    /// - `flush_interval` elapses since last flush
    pub async fn run(
        pool: DbPool,
        receiver: broadcast::Receiver<ActivityLogEntry>,
        cancel: CancellationToken,
        batch_size: usize,
        flush_interval: Duration,
    ) { ... }
}
```

Key implementation details:
- Maintains an in-memory `Vec<CreateActivityLog>` buffer
- Uses `tokio::select!` with `interval.tick()` and `receiver.recv()`
- On `RecvError::Lagged(n)`, logs a warning (entries were dropped)
- On flush: resolves level/source names to IDs (cache them at startup), calls `ActivityLogRepo::batch_insert`
- Backpressure: if buffer exceeds `10 * batch_size`, drops oldest verbose entries (keep curated)
- On cancellation: flushes remaining buffer before exiting

**Acceptance Criteria:**
- [ ] Subscribes to `ActivityLogBroadcaster` and buffers incoming entries
- [ ] Flushes buffer when `batch_size` is reached OR `flush_interval` elapses
- [ ] Converts `ActivityLogEntry` to `CreateActivityLog` (resolving level/source to IDs)
- [ ] Caches level_id and source_id lookups at startup to avoid repeated DB queries
- [ ] Handles `RecvError::Lagged` by logging a warning
- [ ] Backpressure: drops oldest verbose entries when buffer exceeds 10x batch_size
- [ ] Flushes remaining buffer on cancellation (graceful shutdown)
- [ ] Logs flush statistics (entries flushed, time taken) at debug level

### Task 5.3: Create `ActivityLogRetention` cleanup background job
**File:** `apps/backend/crates/api/src/background/activity_retention.rs`

Periodic cleanup job following the `metrics_retention.rs` pattern. Deletes entries older than the configured retention period, per level.

```rust
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use x121_db::DbPool;

const CLEANUP_INTERVAL: Duration = Duration::from_secs(3600); // 1 hour

pub async fn run(pool: DbPool, cancel: CancellationToken) {
    // Load settings from activity_log_settings
    // Run on interval, for each level:
    //   cutoff = now() - retention_days_X
    //   ActivityLogRepo::delete_older_than(pool, level_id, cutoff)
    // Log purged row counts
}
```

**Acceptance Criteria:**
- [ ] Runs on a 1-hour interval (matching `metrics_retention.rs` pattern)
- [ ] Reads retention settings from `ActivityLogSettingsRepo::get` at each cycle
- [ ] Deletes entries per level: debug (7 days default), info (30), warn (30), error (90)
- [ ] Logs the number of purged rows per level
- [ ] Uses `CancellationToken` for graceful shutdown
- [ ] Does not fail if `activity_log_settings` is missing (uses hardcoded defaults)

### Task 5.4: Add `activity_broadcaster` to `AppState`
**File:** `apps/backend/crates/api/src/state.rs` (modify)

Add `pub activity_broadcaster: Arc<ActivityLogBroadcaster>` to `AppState`.

**Acceptance Criteria:**
- [ ] `activity_broadcaster: Arc<ActivityLogBroadcaster>` field added to `AppState`
- [ ] `AppState` construction in `main.rs` creates the broadcaster and adds it to state
- [ ] `ActivityTracingLayer` instantiated with the broadcaster and added to the tracing subscriber
- [ ] `ActivityLogPersistence::run` spawned as a background task with a subscriber from the broadcaster
- [ ] `activity_retention::run` spawned as a background task with the pool and cancel token

---

## Phase 6: WebSocket Streaming Endpoint

### Task 6.1: Create WebSocket handler for `/ws/activity-logs`
**File:** `apps/backend/crates/api/src/handlers/activity_log.rs` (WebSocket section)

Implement a WebSocket endpoint that authenticates the connection, subscribes to the `ActivityLogBroadcaster`, and streams filtered entries to the client.

```rust
/// WS /ws/activity-logs
///
/// Subscription message from client:
/// { "action": "subscribe", "levels": ["info","warn","error"], "sources": ["api","comfyui"], "mode": "curated" }
///
/// Filter update:
/// { "action": "update_filter", "levels": ["debug","info","warn","error"] }
///
/// Server sends:
/// { "type": "entry", ... } for each matching entry
/// { "type": "lagged", "skipped": N } when backpressure drops entries
pub async fn ws_activity_logs(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: AuthUser,
) -> impl IntoResponse { ... }
```

Key implementation details:
- Authenticate via JWT (same as other WS endpoints)
- Parse subscription message to determine filter criteria
- Subscribe to `ActivityLogBroadcaster`
- Apply server-side filter: level, source, category (mode), and role-based scope
- Role-based: admin sees all; creator sees entries where `user_id = auth.user_id` OR `project_id IN (user's projects)` OR `user_id IS NULL AND project_id IS NULL` (system entries)
- Backpressure: on `RecvError::Lagged(n)`, send `{ "type": "lagged", "skipped": N }` to client
- Support `update_filter` action to change filters without reconnecting

**Acceptance Criteria:**
- [ ] WebSocket endpoint at `/ws/activity-logs` requires authentication
- [ ] Client sends `subscribe` action with `levels`, `sources`, `mode`, optional `entity_type`/`entity_id`, `search`
- [ ] Client sends `update_filter` action to change filters without reconnecting
- [ ] Server applies filter predicates on each entry before sending
- [ ] Admin users receive all matching entries; creators receive only scoped entries
- [ ] Backpressure: `{ "type": "lagged", "skipped": N }` sent when broadcast channel lags
- [ ] Connection lifecycle events (connect, disconnect) are logged as curated activity entries
- [ ] WebSocket route registered in the router

---

## Phase 7: REST API Handlers

### Task 7.1: Create activity log REST handlers
**File:** `apps/backend/crates/api/src/handlers/activity_log.rs` (REST section)

Follow the `handlers/audit.rs` pattern for query, export, and settings endpoints.

```rust
/// GET /api/v1/activity-logs
/// Query persisted log entries with filters. Role-based scoping applied.
pub async fn query_activity_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ActivityLogQueryParams>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/activity-logs/export
/// Download filtered log entries as JSON or plain text.
pub async fn export_activity_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ExportParams>,
) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/activity-logs/settings
/// Get current retention/batch settings. Admin only.
pub async fn get_settings(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
) -> AppResult<impl IntoResponse>;

/// PUT /api/v1/admin/activity-logs/settings
/// Update retention/batch settings. Admin only.
pub async fn update_settings(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
    Json(input): Json<UpdateActivityLogSettings>,
) -> AppResult<impl IntoResponse>;

/// DELETE /api/v1/admin/activity-logs
/// Manual purge of entries older than a specified date. Admin only.
pub async fn manual_purge(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
    Query(params): Query<PurgeParams>,
) -> AppResult<impl IntoResponse>;
```

**Acceptance Criteria:**
- [ ] `query_activity_logs` returns paginated results with `{ data, meta }` envelope
- [ ] `query_activity_logs` applies role-based filtering: admin sees all, creator scoped to own projects/jobs
- [ ] `query_activity_logs` supports all query parameters: `level`, `source`, `entity_type`, `entity_id`, `job_id`, `user_id`, `from`, `to`, `search`, `mode`, `page`, `per_page`
- [ ] `export_activity_logs` returns JSON or plain text download (Content-Disposition header)
- [ ] `get_settings` returns the singleton settings row (admin only)
- [ ] `update_settings` validates minimum retention: 1 day for debug, 7 days for error
- [ ] `update_settings` returns updated settings (admin only)
- [ ] `manual_purge` accepts `before` date parameter and deletes matching entries (admin only)
- [ ] Handler module registered in `handlers/mod.rs` as `pub mod activity_log`

### Task 7.2: Register activity log routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify routes)

Add REST and WebSocket routes to the router.

```rust
// REST routes
.nest("/activity-logs", activity_log_routes())
// Under /admin
.nest("/admin/activity-logs", admin_activity_log_routes())
// WebSocket route
.route("/ws/activity-logs", get(handlers::activity_log::ws_activity_logs))
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/activity-logs` → `query_activity_logs`
- [ ] `GET /api/v1/activity-logs/export` → `export_activity_logs`
- [ ] `GET /api/v1/admin/activity-logs/settings` → `get_settings`
- [ ] `PUT /api/v1/admin/activity-logs/settings` → `update_settings`
- [ ] `DELETE /api/v1/admin/activity-logs` → `manual_purge`
- [ ] `WS /ws/activity-logs` → `ws_activity_logs`
- [ ] All routes require authentication
- [ ] Admin routes require admin role via `RequireAdmin` extractor

---

## Phase 8: Agent & Worker Log Forwarding

### Task 8.1: Extend agent WebSocket protocol with `log` message type
**Files:**
- `apps/backend/crates/core/src/metric_names.rs` (add constant)
- `apps/backend/crates/agent/src/sender.rs` (add log payload type)

Add a `MSG_TYPE_AGENT_LOG` constant and a `LogPayload` struct for agents to forward operational logs to the backend.

```rust
// core/src/metric_names.rs
pub const MSG_TYPE_AGENT_LOG: &str = "agent_log";

// agent/src/sender.rs
#[derive(Debug, Serialize)]
struct LogPayload {
    r#type: &'static str,
    worker_id: i64,
    level: String,      // "info", "warn", "error"
    message: String,
    fields: serde_json::Value,
    timestamp: String,
}
```

**Acceptance Criteria:**
- [ ] `MSG_TYPE_AGENT_LOG` constant added to `core/src/metric_names.rs`
- [ ] `LogPayload` struct added to `agent/src/sender.rs`
- [ ] Agent can send log messages alongside GPU metrics via the existing WebSocket connection
- [ ] Backend handler for agent WebSocket parses `agent_log` messages and publishes them to `ActivityLogBroadcaster` with `source = Agent`
- [ ] Agent logs are tagged with `category = Curated` (they are explicitly emitted)

### Task 8.2: Capture ComfyUI bridge events as activity log entries
**File:** `apps/backend/crates/api/src/engine/dispatcher.rs` (modify) or dedicated adapter

Map existing `ComfyUIEvent` variants to `ActivityLogEntry` publications.

```rust
// Example: when ComfyUI reports execution progress
ComfyUIEvent::Progress { node_id, step, total } => {
    broadcaster.publish(
        ActivityLogEntry::curated(ActivityLogLevel::Info, ActivityLogSource::Comfyui, format!("Node {node_id} executing step {step}/{total}"))
            .with_job(job_id)
            .with_project(project_id)
    );
}
```

**Acceptance Criteria:**
- [ ] ComfyUI connection events (connect, disconnect) emitted as curated activity entries
- [ ] ComfyUI execution progress events emitted as curated activity entries
- [ ] ComfyUI error events emitted as error-level activity entries
- [ ] All ComfyUI entries have `source = Comfyui` and include `job_id`/`project_id` when available
- [ ] Entries include relevant structured fields (node_id, step, total, etc.)

---

## Phase 9: Frontend -- Activity Console Feature Module

### Task 9.1: Create activity console Zustand store
**File:** `apps/frontend/src/features/activity-console/stores/activityConsoleStore.ts`

Manage filter state, panel open/close, mode toggle, and the client-side ring buffer.

```typescript
interface ActivityConsoleState {
  // Panel state
  isOpen: boolean;
  isPanelDocked: boolean;
  panelPosition: 'bottom' | 'right';

  // Filter state
  levels: Set<string>;          // active level filters
  sources: Set<string>;         // active source filters
  mode: 'curated' | 'verbose';
  entityFilter: { type?: string; id?: number } | null;
  searchText: string;

  // Buffer
  entries: ActivityLogEntry[];   // ring buffer
  maxEntries: number;            // default 10000
  isPaused: boolean;

  // Actions
  togglePanel: () => void;
  setMode: (mode: 'curated' | 'verbose') => void;
  toggleLevel: (level: string) => void;
  toggleSource: (source: string) => void;
  setSearchText: (text: string) => void;
  setEntityFilter: (filter: { type?: string; id?: number } | null) => void;
  addEntry: (entry: ActivityLogEntry) => void;
  clearEntries: () => void;
  setPaused: (paused: boolean) => void;
}
```

**Acceptance Criteria:**
- [ ] Store manages panel open/close and dock position
- [ ] Level and source filters are toggle-based (Set of active values)
- [ ] Mode toggle between `curated` and `verbose`
- [ ] Ring buffer stores entries up to `maxEntries` (default 10,000), drops oldest when full
- [ ] `addEntry` respects the paused state (entries still accumulate but auto-scroll stops)
- [ ] `clearEntries` clears the visible buffer without affecting persisted data
- [ ] Store is a Zustand store following project conventions (named export, no default export)

### Task 9.2: Create `useActivityLogStream` WebSocket hook
**File:** `apps/frontend/src/features/activity-console/hooks/useActivityLogStream.ts`

Manage the WebSocket connection to `/ws/activity-logs`, subscription lifecycle, and reconnection.

```typescript
export function useActivityLogStream() {
  // Connect to /ws/activity-logs
  // Send subscription message based on store filter state
  // On message: parse and add to store ring buffer
  // On filter change: send update_filter message
  // Auto-reconnect with exponential backoff
  // Handle "lagged" messages
}
```

**Acceptance Criteria:**
- [ ] Connects to `ws://host/ws/activity-logs` with auth token
- [ ] Sends `subscribe` action with current filter state on connection
- [ ] Sends `update_filter` action when filters change (debounced)
- [ ] Parses incoming `entry` messages and calls `addEntry` on the store
- [ ] Handles `lagged` messages by showing a "skipped N entries" indicator
- [ ] Auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] Cleans up WebSocket connection on unmount
- [ ] Returns connection status (`connecting`, `connected`, `disconnected`)

### Task 9.3: Create `useActivityLogHistory` REST query hook
**File:** `apps/frontend/src/features/activity-console/hooks/useActivityLogHistory.ts`

TanStack Query hook for querying persisted activity logs via the REST API.

```typescript
export function useActivityLogHistory(params: ActivityLogQueryParams) {
  return useQuery({
    queryKey: ['activity-logs', params],
    queryFn: () => api.get('/activity-logs', { params }),
  });
}

export function useActivityLogSettings() { ... }
export function useUpdateActivityLogSettings() { ... }
```

**Acceptance Criteria:**
- [ ] `useActivityLogHistory` returns paginated results from `GET /api/v1/activity-logs`
- [ ] Query key includes all filter parameters for proper cache invalidation
- [ ] `useActivityLogSettings` fetches `GET /api/v1/admin/activity-logs/settings`
- [ ] `useUpdateActivityLogSettings` mutation for `PUT /api/v1/admin/activity-logs/settings` with invalidation
- [ ] Export function for downloading logs as JSON or text
- [ ] All hooks follow project conventions (named exports, `api` client usage)

### Task 9.4: Create `ActivityConsolePanel` component
**File:** `apps/frontend/src/features/activity-console/ActivityConsolePanel.tsx`

Terminal-style console panel that renders log entries in a virtualized list with color-coding, auto-scroll, and filter toolbar.

```typescript
export function ActivityConsolePanel() {
  // Renders:
  // - Filter toolbar (level toggles, source toggles, mode toggle, search, entity filter)
  // - Virtualized log entry list with auto-scroll
  // - Entry count indicator ("Showing N entries (M filtered)")
  // - Pause/Resume and Clear buttons
  // - "Jump to latest" button when paused/scrolled up
}
```

**Acceptance Criteria:**
- [ ] Renders entries in monospace font with terminal-style appearance
- [ ] Entries color-coded by level: debug (gray), info (default), warn (amber), error (red)
- [ ] Entries color-coded by source: API (blue), ComfyUI (purple), Worker (green), Agent (orange), Pipeline (teal)
- [ ] Each entry displays: timestamp (HH:MM:SS.mmm), level badge, source badge, message
- [ ] Entries are expandable to show structured `fields` JSON
- [ ] Auto-scroll follows new entries; scrolling up pauses auto-scroll
- [ ] "Jump to latest" button appears when not at bottom
- [ ] "Pause" button stops auto-scroll; "Resume" re-enables it
- [ ] "Clear" button clears the visible buffer
- [ ] Entry count indicator showing filtered vs total count
- [ ] Uses a virtualized list for performance (only render visible entries)
- [ ] Respects design system tokens for colors (uses `--color-*` CSS variables)

### Task 9.5: Create `ConsoleFilterToolbar` component
**File:** `apps/frontend/src/features/activity-console/ConsoleFilterToolbar.tsx`

Compact toolbar with toggle pills for levels and sources, search field, and mode toggle.

**Acceptance Criteria:**
- [ ] Level toggle buttons (Debug, Info, Warn, Error) that toggle active state in the store
- [ ] Source toggle buttons (API, ComfyUI, Worker, Agent, Pipeline) with distinct accent colors
- [ ] Mode toggle: "Activity" (curated) / "Debug" (verbose)
- [ ] Free-text search field that filters entries by message content
- [ ] Entity scope dropdown (optional: entity_type + entity_id filter)
- [ ] All toggles reflect current store state
- [ ] Compact design -- fits in a single toolbar row

### Task 9.6: Create `ActivityConsolePage` full-page view
**File:** `apps/frontend/src/features/activity-console/ActivityConsolePage.tsx`

Dedicated page at `/tools/activity-console` with live stream pane and history query pane.

```typescript
export function ActivityConsolePage() {
  // Top pane: Live stream (reuses ActivityConsolePanel)
  // Bottom pane / tab: History query with date range picker, filters, paginated results
  // Export button for downloading filtered results
}
```

**Acceptance Criteria:**
- [ ] Full-page layout with resizable split between live and history panes
- [ ] Live pane reuses `ActivityConsolePanel` component
- [ ] History pane provides date range picker, level/source/entity filters, full-text search
- [ ] History results loaded from REST API via `useActivityLogHistory` (not WebSocket)
- [ ] Paginated results with page size selector
- [ ] Export button downloads filtered results as JSON or plain text
- [ ] Route registered at `/tools/activity-console`

### Task 9.7: Create types and index file
**Files:**
- `apps/frontend/src/features/activity-console/types.ts`
- `apps/frontend/src/features/activity-console/index.ts`

**Acceptance Criteria:**
- [ ] `ActivityLogEntry` TypeScript interface matching the backend JSON shape
- [ ] `ActivityLogLevel`, `ActivityLogSource`, `ActivityLogCategory` string union types
- [ ] `ActivityLogQueryParams` interface matching the REST API query parameters
- [ ] `ActivityLogSettings` interface matching the settings response
- [ ] `index.ts` re-exports public components and types

---

## Phase 10: Navigation & Routing Wiring

### Task 10.1: Add console page to routing
**File:** `apps/frontend/src/app/router.tsx` (modify)

Add route for `/tools/activity-console` pointing to `ActivityConsolePage`.

**Acceptance Criteria:**
- [ ] Route `/tools/activity-console` renders `ActivityConsolePage`
- [ ] Route is accessible to all authenticated users
- [ ] Lazy-loaded for code splitting

### Task 10.2: Add console to sidebar navigation
**File:** `apps/frontend/src/app/navigation.ts` (modify)

Add "Activity Console" item to the "Tools" nav group.

```typescript
// In the "Tools" group items array:
{ label: "Activity Console", path: "/tools/activity-console", icon: Terminal },
```

**Acceptance Criteria:**
- [ ] "Activity Console" appears in the "Tools" sidebar group
- [ ] Uses `Terminal` icon from Lucide React (or similar appropriate icon)
- [ ] No role restriction (accessible to all authenticated users)

### Task 10.3: Update WIRING-STATUS.md
**File:** `design/progress/WIRING-STATUS.md` (modify)

Mark PRD-118 route and navigation as wired.

**Acceptance Criteria:**
- [ ] PRD-118 entry added to wiring status with route, navigation, and panel status

---

## Phase 11: Integration Tests

### Task 11.1: Backend unit tests for `ActivityLogEntry` and builder
**File:** `apps/backend/crates/core/src/activity.rs` (inline `#[cfg(test)]` module)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_curated_entry_defaults();
    #[test]
    fn test_builder_chain();
    #[test]
    fn test_level_as_str();
    #[test]
    fn test_source_as_str();
    #[test]
    fn test_serde_roundtrip();
}
```

**Acceptance Criteria:**
- [ ] `curated()` factory sets correct defaults (category = Curated, empty fields, None optional fields)
- [ ] Builder chain sets all optional fields correctly
- [ ] `as_str()` mappings match lookup table `name` values
- [ ] Serialization/deserialization preserves all fields

### Task 11.2: Backend unit tests for `ActivityLogBroadcaster`
**File:** `apps/backend/crates/events/src/activity.rs` (inline `#[cfg(test)]` module)

```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn publish_and_receive_single_subscriber();
    #[tokio::test]
    async fn multiple_subscribers_receive_same_entry();
    #[test]
    fn publish_with_no_subscribers_does_not_panic();
}
```

**Acceptance Criteria:**
- [ ] Single subscriber receives published entry
- [ ] Multiple subscribers each receive the same entry
- [ ] No panic when publishing with zero subscribers

### Task 11.3: DB-level activity log tests
**File:** `apps/backend/crates/db/tests/activity_log.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_batch_insert(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_with_level_filter(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_with_source_filter(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_with_time_range(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_with_mode_filter(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_older_than(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_settings_get_and_update(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] `batch_insert` inserts multiple entries and returns correct affected count
- [ ] Level filter returns only entries matching the specified level_id
- [ ] Source filter returns only entries matching the specified source_id
- [ ] Time range filter returns entries within `from`/`to` bounds
- [ ] Mode filter returns only `curated` or `verbose` entries
- [ ] `delete_older_than` removes entries beyond the cutoff for the specified level
- [ ] Settings get returns default values; update changes them and returns updated row
- [ ] All tests pass

### Task 11.4: API-level activity log endpoint tests
**File:** `apps/backend/crates/api/tests/activity_log_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_activity_logs(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_query_activity_logs_filtered(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_export_activity_logs_json(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_settings_admin_only(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_settings_validates_minimums(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_manual_purge_admin_only(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/activity-logs` returns paginated results with `{ data, meta }` envelope
- [ ] Filtering by level, source, mode returns correct subsets
- [ ] Export endpoint returns JSON with correct Content-Type
- [ ] Settings endpoints require admin role (403 for non-admin)
- [ ] Update settings rejects retention values below minimums (1 day debug, 7 days error)
- [ ] Manual purge requires admin role and deletes correct entries
- [ ] All tests use `common::build_test_app` and shared HTTP helpers

### Task 11.5: Frontend component tests
**Files:**
- `apps/frontend/src/features/activity-console/__tests__/ActivityConsolePanel.test.tsx`
- `apps/frontend/src/features/activity-console/__tests__/ConsoleFilterToolbar.test.tsx`

```typescript
test('renders log entries with correct color coding');
test('auto-scrolls to bottom on new entries');
test('pauses auto-scroll when user scrolls up');
test('shows jump to latest button when paused');
test('clears entries on clear button click');
test('toggles level filter');
test('toggles source filter');
test('switches between curated and verbose mode');
test('applies search text filter');
```

**Acceptance Criteria:**
- [ ] Console panel renders entries with correct level and source color classes
- [ ] Auto-scroll behavior tested (scrolls to bottom, pauses on manual scroll)
- [ ] Filter toolbar toggles update store state correctly
- [ ] Mode toggle switches between curated and verbose
- [ ] Clear button empties the entry list
- [ ] All tests use Testing Library and follow project test conventions

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/YYYYMMDDHHMMSS_create_activity_logs.sql` | New tables migration |
| `apps/backend/crates/core/src/activity.rs` | `ActivityLogEntry` domain type and builder |
| `apps/backend/crates/core/src/lib.rs` | Register `activity` module |
| `apps/backend/crates/core/src/metric_names.rs` | Add `MSG_TYPE_AGENT_LOG` constant |
| `apps/backend/crates/events/src/activity.rs` | `ActivityLogBroadcaster` broadcast channel |
| `apps/backend/crates/events/src/lib.rs` | Register `activity` module and re-export |
| `apps/backend/crates/db/src/models/activity_log.rs` | Model structs (entity, create, query, settings) |
| `apps/backend/crates/db/src/models/mod.rs` | Register model module |
| `apps/backend/crates/db/src/repositories/activity_log_repo.rs` | Batch insert, query, count, export, delete |
| `apps/backend/crates/db/src/repositories/activity_log_settings_repo.rs` | Settings singleton CRUD |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register repo modules with `pub use` |
| `apps/backend/crates/api/src/state.rs` | Add `activity_broadcaster` to `AppState` |
| `apps/backend/crates/api/src/main.rs` | Wire broadcaster, tracing layer, persistence, retention |
| `apps/backend/crates/api/src/background/activity_tracing.rs` | Custom `tracing::Layer` |
| `apps/backend/crates/api/src/background/activity_persistence.rs` | Batch write background service |
| `apps/backend/crates/api/src/background/activity_retention.rs` | Retention cleanup job |
| `apps/backend/crates/api/src/handlers/activity_log.rs` | REST + WebSocket handlers |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register handler module |
| `apps/backend/crates/api/src/lib.rs` | Register routes |
| `apps/backend/crates/agent/src/sender.rs` | Add `LogPayload` and log sending |
| `apps/frontend/src/features/activity-console/types.ts` | TypeScript types |
| `apps/frontend/src/features/activity-console/stores/activityConsoleStore.ts` | Zustand store |
| `apps/frontend/src/features/activity-console/hooks/useActivityLogStream.ts` | WebSocket hook |
| `apps/frontend/src/features/activity-console/hooks/useActivityLogHistory.ts` | REST query hooks |
| `apps/frontend/src/features/activity-console/ActivityConsolePanel.tsx` | Dockable console panel |
| `apps/frontend/src/features/activity-console/ConsoleFilterToolbar.tsx` | Filter toolbar |
| `apps/frontend/src/features/activity-console/ActivityConsolePage.tsx` | Full-page view |
| `apps/frontend/src/features/activity-console/index.ts` | Module re-exports |
| `apps/frontend/src/app/router.tsx` | Add `/tools/activity-console` route |
| `apps/frontend/src/app/navigation.ts` | Add sidebar nav item |
| `apps/backend/crates/db/tests/activity_log.rs` | DB integration tests |
| `apps/backend/crates/api/tests/activity_log_api.rs` | API integration tests |
| `apps/frontend/src/features/activity-console/__tests__/ActivityConsolePanel.test.tsx` | Component tests |
| `apps/frontend/src/features/activity-console/__tests__/ConsoleFilterToolbar.test.tsx` | Toolbar tests |
| `design/progress/WIRING-STATUS.md` | Update wiring status |

---

## Dependencies

### Existing Components to Reuse
- `x121_events::bus::EventBus` -- pattern for `ActivityLogBroadcaster` (broadcast channel)
- `x121_events::persistence::EventPersistence` -- pattern for `ActivityLogPersistence` (background loop)
- `x121_api::background::metrics_retention` -- pattern for `activity_retention` (cleanup job)
- `x121_api::ws::WsManager` / `WsConnection` -- pattern for WebSocket connection tracking
- `x121_db::repositories::audit_repo` -- pattern for batch inserts and dynamic query building
- `x121_db::models::audit` -- pattern for log entry models and query params
- `x121_api::handlers::audit` -- pattern for query/export/settings handlers
- `x121_core::types::{DbId, Timestamp}` -- shared type aliases
- `x121_core::metric_names` -- message type constants
- `x121_api::middleware::rbac::RequireAdmin` -- admin-only route protection
- `x121_api::response::DataResponse` -- standard response envelope
- `tests/common/mod.rs` -- `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`

### New Infrastructure Needed
- `activity_logs`, `activity_log_levels`, `activity_log_sources`, `activity_log_settings` tables
- `ActivityLogEntry` domain type in `core`
- `ActivityLogBroadcaster` in `events`
- `ActivityTracingLayer` custom tracing layer in `api`
- `ActivityLogPersistence` batch write service in `api`
- `ActivityLogRetention` cleanup job in `api`
- `ActivityLogRepo` + `ActivityLogSettingsRepo` in `db`
- Activity log REST + WebSocket handler module in `api`
- `activity-console` frontend feature module (store, hooks, components, page)
- Agent log forwarding via `LogPayload` message type

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration -- Task 1.1
2. Phase 2: Core Domain Types -- Tasks 2.1-2.2
3. Phase 3: Events Crate Broadcaster -- Task 3.1
4. Phase 4: Database Models & Repositories -- Tasks 4.1-4.3
5. Phase 5: Backend Services & Tracing Layer -- Tasks 5.1-5.4
6. Phase 7: REST API Handlers -- Tasks 7.1-7.2
7. Phase 6: WebSocket Streaming -- Task 6.1
8. Phase 9: Frontend Feature Module -- Tasks 9.1-9.7
9. Phase 10: Navigation & Routing -- Tasks 10.1-10.3
10. Phase 11: Integration Tests -- Tasks 11.1-11.5

### Deferred (do after MVP live stream works end-to-end)
- Phase 8: Agent & Worker Log Forwarding -- Tasks 8.1-8.2

**MVP Success Criteria:**
- Activity log entries are captured from the API server tracing pipeline and persisted to the database in batches
- WebSocket endpoint streams filtered entries to connected clients in real-time
- REST API supports querying, exporting, and managing activity log settings
- Frontend console panel renders color-coded, filterable, auto-scrolling log entries
- Full-page console view provides both live stream and history query
- Retention cleanup job runs hourly and respects per-level retention settings
- Role-based filtering enforced server-side in both WebSocket and REST API
- All integration tests pass

### Post-MVP Enhancements (PRD-118 Phase 2)
- Raw ComfyUI server log capture (Req 2.1)
- Log bookmarking & annotation (Req 2.2)
- Log alerting rules (Req 2.3)
- Log correlation & trace view (Req 2.4)

---

## Notes

1. **Migration ordering:** The activity logs migration depends on `users`, `jobs`, and `projects` tables existing (FK references). Ensure the migration timestamp is after those tables.
2. **Broadcast capacity:** The `ActivityLogBroadcaster` default capacity is 4096 (vs EventBus 1024) because activity logs are expected to be much higher volume. This is tunable.
3. **Batch persistence performance:** The batch insert approach avoids per-entry transaction overhead. With a default batch of 100 entries and 1-second flush interval, sustained throughput of ~100 entries/second is achievable without special tuning.
4. **Tracing layer priority:** The `ActivityTracingLayer` must be added as a layer to the tracing subscriber stack, not as a replacement. It runs alongside the existing `fmt::Layer` for stdout logging.
5. **WebSocket backpressure:** The broadcast channel's built-in `Lagged` error provides automatic backpressure. Slow clients will miss entries rather than causing memory growth. The client is notified via the `lagged` message.
6. **Ring buffer size:** The client-side ring buffer of 10,000 entries is sufficient for most debugging sessions. Users needing more history should use the REST query API.
7. **Role-based scoping:** For non-admin users, the WebSocket handler builds a filter predicate that includes `user_id = current_user OR project_id IN (user's project memberships) OR (user_id IS NULL AND project_id IS NULL)`. The last condition allows system-level entries (like "ComfyUI instance connected") to be visible to all.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-118
