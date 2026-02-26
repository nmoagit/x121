# PRD-118: Live Activity Console & Logging System

## 1. Introduction/Overview

When a multi-segment generation is running across three ComfyUI instances, a creator wants to see exactly what the system is doing at every step -- not just "Job 73% complete" but "Loading LoRA weights on Worker-2", "Node KSampler executing step 14/20", "Saving intermediate frame to /data/scene-3/seg-007.png". The Background Job Tray (PRD-54) provides job-level progress, the Audit Log (PRD-45) provides immutable compliance records, and the Event Bus (PRD-10) routes domain events -- but none of these offer a live, terminal-style, streaming view of granular operational activity.

This PRD introduces a Live Activity Console: a dockable panel (and dedicated page) that streams real-time, structured operational logs from all backend services to the frontend. Think VS Code's Output panel or browser DevTools console -- color-coded, filterable by level/source/entity, searchable, with auto-scroll and pause. All activity log entries are persisted to the database with configurable retention policies and are queryable through a history API. The console complements existing systems without replacing them: the Job Tray remains the glanceable status indicator, the Audit Log remains the compliance trail, and the Activity Console becomes the operator's window into the system's live behavior.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-02 (Backend Foundation -- Axum server, WebSocket infrastructure, `tracing` setup)
  - PRD-10 (Event Bus -- `PlatformEvent` types, `EventBus` broadcast channel, `EventPersistence` pattern)
  - PRD-29 (Design System -- component primitives, token system, panel components)
- **Extends:**
  - PRD-10 -- adds a dedicated "activity log" WebSocket channel alongside event notifications
  - PRD-06 -- captures GPU agent operational logs alongside hardware metrics
  - PRD-46 -- captures worker process lifecycle logs alongside health monitoring
- **Integrates with:**
  - PRD-05 (ComfyUI Bridge) -- captures bridge connection events, execution progress, node-level detail
  - PRD-07 (Task Execution Engine) -- captures job dispatch, assignment, completion events
  - PRD-30 (Panel Management) -- dockable panel integration
  - PRD-45 (Audit Logging) -- shares retention pattern; distinct concern (compliance vs operations)
  - PRD-54 (Job Tray) -- complementary: tray shows status, console shows detail
  - PRD-117 (System Status Footer Bar) -- console openable from footer bar
- **Depended on by:** None
- **Part:** Part 4 -- Design System & UX Patterns

## 3. Goals

- Provide a real-time, terminal-style console in the UI showing granular operational activity from all backend services.
- Capture and stream structured log entries from the API server, ComfyUI bridge, job dispatcher, pipeline stages, GPU agents, and worker processes.
- Persist all activity log entries to the database with queryable history and configurable retention.
- Support role-based visibility: admins see all logs; creators see only logs related to their own projects and jobs.
- Offer two viewing modes: curated activity view (structured, high-level operational events) and verbose debug view (all tracing output at info+ level).
- Provide filtering by log level, source service, entity type/ID, and free-text search.

## 4. User Stories

- As a Creator, I want to see a live stream of what the system is doing for my generation jobs so that I understand each step the pipeline is taking without guessing from a progress bar.
- As an Admin, I want a system-wide activity console showing logs from all services so that I can diagnose issues without SSH-ing into backend servers.
- As an Admin, I want to filter activity logs by source (API, ComfyUI, Worker, Agent) and level (debug, info, warn, error) so that I can quickly isolate relevant entries during troubleshooting.
- As a Creator, I want to pause auto-scroll and search through recent log entries so that I can find a specific event that flashed by.
- As an Admin, I want to query persisted activity log history by time range, source, and entity so that I can investigate issues that occurred hours or days ago.
- As an Admin, I want to configure activity log retention periods so that storage usage is controlled without losing recent operational data.
- As a Creator, I want to toggle between "curated activity" and "verbose debug" modes so that I see structured summaries by default but can drill into full detail when needed.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Activity Log Data Model

**Description:** Structured log entries captured from all backend services and persisted to the database.

**Acceptance Criteria:**
- [ ] Each log entry contains: timestamp, level (debug/info/warn/error), source (api/comfyui/worker/agent/pipeline), message, structured fields (JSON), optional entity references (entity_type, entity_id), optional user_id, optional job_id, optional trace_id for request correlation
- [ ] Log entries are written to an `activity_logs` table with appropriate indexes for time-range, source, level, and entity queries
- [ ] Log entries support two categories: `curated` (explicitly emitted structured activity events) and `verbose` (auto-captured tracing output)
- [ ] All timestamps are UTC with microsecond precision

**Technical Notes:**
- Reuse the `tracing` subscriber infrastructure: add a custom `tracing::Layer` that captures spans/events and writes them to the activity log system.
- Curated entries are emitted via a dedicated `activity!()` macro or helper function that sets the `curated` flag.
- The `activity_logs` table is separate from `audit_logs` (PRD-45) and `events` (PRD-10) -- different retention, different access patterns.

#### Requirement 1.2: Backend Log Collection & Broadcast

**Description:** A service that collects log entries from all sources and broadcasts them to connected WebSocket clients in real-time.

**Acceptance Criteria:**
- [ ] A `tracing::Layer` captures tracing events from the API server and emits them as activity log entries
- [ ] ComfyUI bridge events (connection, progress, completion, error, node execution) are captured as activity log entries
- [ ] Job dispatcher events (dispatch, assignment, state transitions) are captured as activity log entries
- [ ] Pipeline stage transitions (pre-processing, generation, post-processing, QA) are captured as activity log entries
- [ ] GPU agent logs (metric collection, restart commands, connection state) are forwarded to the API server and captured as activity log entries
- [ ] Worker process lifecycle logs (startup, shutdown, job acceptance, completion) are captured as activity log entries
- [ ] Activity log entries are published to a dedicated `tokio::sync::broadcast` channel for WebSocket distribution
- [ ] WebSocket delivery filters entries based on the connected user's role and project scope

**Technical Notes:**
- Add an `ActivityLogBroadcaster` to `AppState` -- similar in structure to `EventBus` but carrying `ActivityLogEntry` instead of `PlatformEvent`.
- GPU agent already connects via WebSocket (`crates/agent/src/sender.rs`); extend the agent protocol to include a `log` message type alongside `gpu_metrics` and `restart_result`.
- Worker process logs are collected via the existing worker WebSocket connection.

#### Requirement 1.3: WebSocket Log Streaming

**Description:** A dedicated WebSocket endpoint that streams activity log entries to the frontend in real-time.

**Acceptance Criteria:**
- [ ] A WebSocket endpoint at `/ws/activity-logs` authenticates the connection and streams filtered log entries
- [ ] Clients send a subscription message specifying: levels (array of levels to include), sources (array of sources), entity_type + entity_id (optional scope), mode (`curated` or `verbose`), and search (optional text filter)
- [ ] Clients can update their subscription filters without reconnecting
- [ ] Server-side filtering ensures creators only receive entries related to their own projects/jobs; admins receive all entries
- [ ] Backpressure handling: if a client cannot keep up, older entries are dropped (with a "skipped N entries" indicator) rather than buffering unboundedly
- [ ] Connection lifecycle events (connect, disconnect, filter change) are themselves logged

**Technical Notes:**
- Reuse the `WsManager` pattern from `crates/api/src/ws/manager.rs` for connection tracking.
- The subscription message is a JSON object: `{ "action": "subscribe", "levels": ["info", "warn", "error"], "sources": ["api", "comfyui"], "mode": "curated" }`.
- Filter changes: `{ "action": "update_filter", "levels": ["debug", "info", "warn", "error"] }`.

#### Requirement 1.4: Activity Log Persistence & Query API

**Description:** All activity log entries are persisted and queryable through a REST API.

**Acceptance Criteria:**
- [ ] All activity log entries (both curated and verbose) are written to the `activity_logs` table
- [ ] Batch insert for high-throughput: entries are buffered in-memory and flushed to the database in batches (configurable batch size, default 100; configurable flush interval, default 1 second)
- [ ] REST API: `GET /api/v1/activity-logs` with query parameters: `level`, `source`, `entity_type`, `entity_id`, `job_id`, `user_id`, `from`, `to`, `search`, `mode`, `page`, `per_page`
- [ ] REST API: `GET /api/v1/activity-logs/export` returns entries as JSON or plain text download
- [ ] Role-based filtering enforced server-side: creators see only their own entries
- [ ] Pagination follows project conventions (default 25, max 100)

**Technical Notes:**
- Follow the `EventPersistence` pattern from `crates/events/src/persistence.rs` for the persistence service, but with batch writes instead of single-row inserts for throughput.
- Export endpoint streams results to avoid loading the full result set into memory.

#### Requirement 1.5: Retention Management

**Description:** Configurable retention policies for activity logs with automatic cleanup.

**Acceptance Criteria:**
- [ ] Default retention period: 30 days
- [ ] Admin-configurable retention period via `PUT /api/v1/admin/activity-logs/retention`
- [ ] Background cleanup job runs periodically (default: every hour) and deletes entries older than the retention period
- [ ] Separate retention periods configurable per log level (e.g., keep error logs for 90 days, debug logs for 7 days)
- [ ] Retention configuration stored in `activity_log_settings` table
- [ ] Cleanup job logs the number of purged rows

**Technical Notes:**
- Follow the `metrics_retention.rs` pattern from `crates/api/src/background/metrics_retention.rs` for the cleanup job.
- Use `CancellationToken` for graceful shutdown.

#### Requirement 1.6: Frontend Console Panel (Dockable)

**Description:** A terminal-style console panel that can be docked at the bottom, side, or viewed fullscreen.

**Acceptance Criteria:**
- [ ] Console panel renders log entries in a monospace, terminal-style display
- [ ] Entries are color-coded by level: debug (gray), info (white/default), warn (amber/yellow), error (red)
- [ ] Entries are color-coded by source with a distinct accent per service: API (blue), ComfyUI (purple), Worker (green), Agent (orange), Pipeline (teal)
- [ ] Each entry displays: timestamp (HH:MM:SS.mmm), level badge, source badge, message, and expandable structured fields
- [ ] Auto-scroll follows new entries at the bottom; clicking "Pause" or scrolling up stops auto-scroll with a "Jump to latest" button
- [ ] Filter toolbar at the top: level toggle buttons, source toggle buttons, entity filter (type+ID), free-text search field
- [ ] Mode toggle: "Activity" (curated entries only) and "Debug" (all tracing entries)
- [ ] Panel is dockable: bottom dock (default), right dock, or fullscreen via PRD-30 panel management integration
- [ ] "Clear" button clears the visible buffer without affecting persisted data
- [ ] Entry count indicator showing "Showing N entries (M filtered)"
- [ ] Panel is accessible via keyboard shortcut (default: Ctrl+`)
- [ ] Panel can be opened from the PRD-117 footer bar by clicking the activity indicator

**Technical Notes:**
- Use a virtualized list for performance (only render visible entries); maintain a client-side ring buffer of configurable size (default: 10,000 entries).
- Feature module: `apps/frontend/src/features/activity-console/`.
- WebSocket connection managed by a Zustand store that handles reconnection, subscription filter state, and the ring buffer.
- Reuse PRD-29 design system tokens for colors (map level/source colors to existing semantic tokens where possible, add new tokens for source-specific accents).

#### Requirement 1.7: Frontend Console Page (Dedicated Route)

**Description:** A full-page console view at `/tools/activity-console` for extended log investigation.

**Acceptance Criteria:**
- [ ] Full-page layout with: live stream pane (top), history query pane (bottom/tabbed)
- [ ] Live stream pane reuses the same console component from Requirement 1.6
- [ ] History query pane provides: date range picker, level/source/entity filters, full-text search, paginated results
- [ ] History results are loaded from the REST API (Requirement 1.4), not the WebSocket stream
- [ ] Export button downloads filtered results as JSON or plain text
- [ ] Route: `/tools/activity-console`
- [ ] Accessible from sidebar navigation under "Tools" group

**Technical Notes:**
- The page composes two instances of the console component: one connected to the live WebSocket, one connected to the REST query API.
- TanStack Query for history data fetching with infinite scroll or pagination.

#### Requirement 1.8: Role-Based Visibility

**Description:** Log visibility is scoped based on the user's role.

**Acceptance Criteria:**
- [ ] Admin users see all activity log entries across all users, projects, and services
- [ ] Creator users see only entries that are: associated with their own jobs, associated with projects they are a member of, or system-level entries with no user/project scope (e.g., "ComfyUI instance connected")
- [ ] Reviewer users have the same visibility as creators (scoped to their projects)
- [ ] Role-based filtering is enforced server-side in both the WebSocket stream and the REST API -- the client never receives entries it should not see
- [ ] The "verbose debug" mode is available to all roles, but still scoped (creators see verbose logs only for their own operations)

**Technical Notes:**
- The WebSocket handler resolves the user's role and project memberships at connection time and applies a server-side filter predicate to the broadcast channel.
- The REST API injects a `WHERE user_id = $1 OR project_id IN (...)` clause for non-admin users.

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Raw ComfyUI Server Log Capture

**Description:** Capture and stream the raw stdout/stderr output from ComfyUI server processes.

**Acceptance Criteria:**
- [ ] ComfyUI server stdout/stderr is captured and forwarded to the activity log system
- [ ] Raw logs are tagged with source `comfyui-raw` and displayed in a separate tab/filter in the console
- [ ] Available only in "Debug" mode to avoid flooding the curated view

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Log Bookmarking & Annotation

**Description:** Users can bookmark specific log entries and add notes for later reference.

**Acceptance Criteria:**
- [ ] Bookmark button on each log entry saves a reference with optional note
- [ ] Bookmarked entries are exempt from retention cleanup
- [ ] Bookmarks are accessible from a "Saved Entries" tab in the console page

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Log Alerting Rules

**Description:** Configurable rules that trigger notifications when specific log patterns appear.

**Acceptance Criteria:**
- [ ] Admin can define alert rules: pattern (regex or keyword), level threshold, source filter, notification channel
- [ ] Triggered alerts are delivered via PRD-10 event bus (toast, email, webhook)
- [ ] Alert history is visible in the console

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Log Correlation & Trace View

**Description:** Group related log entries by trace_id into a tree/timeline view showing the full lifecycle of a request or job.

**Acceptance Criteria:**
- [ ] Clicking an entry with a trace_id shows all related entries in chronological order
- [ ] Timeline view shows span durations and nesting
- [ ] Useful for understanding the full path of a generation request across services

## 6. Non-Goals (Out of Scope)

- **Audit logging replacement** -- this is not a compliance/audit trail. PRD-45 covers immutable, tamper-resistant audit records. Activity logs are operational and subject to retention cleanup.
- **Job progress replacement** -- PRD-54 (Job Tray) remains the primary glanceable progress indicator. This console shows granular detail, not summary status.
- **External log aggregation** -- Shipping logs to external systems (Elasticsearch, Datadog, Splunk) is not in scope for MVP. The system stores logs in PostgreSQL.
- **Application Performance Monitoring (APM)** -- Distributed tracing, flame graphs, latency histograms are not in scope. PRD-41 (Performance Dashboard) and PRD-106 (API Observability) cover those concerns.
- **Log-based alerting in MVP** -- Alert rules on log patterns are post-MVP (Requirement 2.3).

## 7. Design Considerations

- The console panel should feel like a developer tool -- monospace font, dark background (respects theme tokens), dense information display.
- Level badges should use universally recognized colors: gray for debug, blue/white for info, amber for warn, red for error.
- Source badges should use distinct colors that are visually differentiable. Use the design system's extended color palette.
- The panel should not feel intrusive when docked -- collapsed state shows a single thin bar with an entry count and latest error indicator.
- The fullscreen/dedicated page should be comfortable for long investigation sessions: no distracting animations, stable scroll behavior, keyboard navigation between entries.
- The filter toolbar should be compact -- toggle pills for levels and sources, a search field, and an entity scope dropdown.

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `WsManager` | `crates/api/src/ws/manager.rs` | Pattern for WebSocket connection tracking; extend or create parallel `ActivityWsManager` |
| `EventBus` / `PlatformEvent` | `crates/events/src/bus.rs` | Pattern for broadcast channel; `ActivityLogBroadcaster` follows same design |
| `EventPersistence` | `crates/events/src/persistence.rs` | Pattern for background persistence service; adapt for batch writes |
| `metrics_retention.rs` | `crates/api/src/background/` | Pattern for retention cleanup background job |
| `AuditLog` / `AuditQuery` | `crates/db/src/models/audit.rs` | Pattern for log entry model, query parameters, paginated response |
| `AppState` | `crates/api/src/state.rs` | Add `activity_broadcaster: Arc<ActivityLogBroadcaster>` |
| Agent WebSocket protocol | `crates/agent/src/sender.rs` | Extend with `log` message type for agent-originating entries |
| `ComfyUIEvent` | `crates/comfyui/src/events.rs` | Map these events to activity log entries |
| PRD-29 design tokens | `apps/frontend/src/tokens/` | Color tokens for level/source coding |
| PRD-30 panel system | `apps/frontend/src/features/layout/` | Dockable panel integration |

### New Infrastructure Needed

| Component | Crate | Description |
|-----------|-------|-------------|
| `ActivityLogEntry` struct | `core` | Domain type for a structured activity log entry |
| `ActivityLogBroadcaster` | `events` | Broadcast channel for activity log entries (like `EventBus` but for logs) |
| `ActivityTracingLayer` | `api` | Custom `tracing::Layer` that captures spans/events and emits `ActivityLogEntry` |
| `ActivityLogPersistence` | `api` | Background service that batch-writes entries to the database |
| `ActivityLogRetention` | `api` | Background job for retention cleanup |
| `activity_log` handler module | `api` | REST endpoints for log query/export and WebSocket endpoint for streaming |
| `ActivityLogRepo` | `db` | Repository for `activity_logs` table CRUD and query |
| `activity-console` feature | `frontend` | Console panel component, console page, Zustand store, WebSocket hook |

### Database Changes

**New table: `activity_log_levels`** (lookup)
```sql
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
```

**New table: `activity_log_sources`** (lookup)
```sql
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
```

**New table: `activity_logs`**
```sql
CREATE TABLE activity_logs (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    level_id        SMALLINT NOT NULL REFERENCES activity_log_levels(id),
    source_id       SMALLINT NOT NULL REFERENCES activity_log_sources(id),
    message         TEXT NOT NULL,
    fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
    category        TEXT NOT NULL DEFAULT 'verbose',  -- 'curated' or 'verbose'
    entity_type     TEXT,
    entity_id       BIGINT,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    job_id          BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    project_id      BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    trace_id        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No updated_at trigger: activity logs are append-only (like audit_logs)

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
```

**New table: `activity_log_settings`**
```sql
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

-- Singleton row
INSERT INTO activity_log_settings (id) VALUES (1);

CREATE TRIGGER trg_activity_log_settings_updated_at
    BEFORE UPDATE ON activity_log_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### API Changes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/activity-logs` | Query persisted log entries with filters |
| `GET` | `/api/v1/activity-logs/export` | Download filtered log entries as JSON or text |
| `GET` | `/api/v1/admin/activity-logs/settings` | Get current retention/batch settings |
| `PUT` | `/api/v1/admin/activity-logs/settings` | Update retention/batch settings |
| `DELETE` | `/api/v1/admin/activity-logs` | Manual purge of entries older than a specified date |
| `WS` | `/ws/activity-logs` | Real-time streaming with subscription filters |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| High log volume overwhelms WebSocket client | Server-side backpressure: drop oldest undelivered entries, send `{ "type": "lagged", "skipped": N }` indicator to client |
| High log volume overwhelms database writes | Batch buffer grows; if buffer exceeds 10x batch_size, drop oldest verbose entries (keep curated); log a warning |
| Database unavailable during persistence flush | Buffer entries in memory, retry on next flush cycle; if memory buffer exceeds limit (configurable, default 50,000), drop oldest verbose entries |
| WebSocket disconnection during streaming | Client auto-reconnects (exponential backoff); on reconnect, client can query REST API for entries missed during the gap |
| Activity log table grows very large | Retention job runs hourly; partitioning by month recommended for tables exceeding 10M rows (post-MVP optimization) |
| Creator requests logs for a project they do not belong to | Server-side filter silently excludes entries; no error, just empty results |
| Admin changes retention settings to very short period | Minimum enforced: 1 day for debug, 7 days for error. Validation rejects values below minimums. |
| Multiple browser tabs open with the console | Each tab gets its own WebSocket connection and ring buffer. No cross-tab synchronization needed. |
| Agent or worker disconnects | "Disconnected" event logged as a curated activity entry. Console shows the event. Reconnection events are also logged. |

## 10. Success Metrics

- Activity log entries appear in the frontend console within 500ms of the backend event.
- WebSocket streaming handles 100+ entries/second without client lag on modern browsers.
- REST API history queries return results in under 2 seconds for 7-day ranges with source/level filters.
- Retention cleanup keeps the `activity_logs` table under the configured retention window, verified by periodic row count monitoring.
- Database write throughput sustains 500+ entries/second via batch inserts without impacting API request latency.
- Creator users see zero entries from other users' private jobs or projects.

## 11. Testing Requirements

### Backend

| Test Type | Coverage |
|-----------|----------|
| Unit: `ActivityLogEntry` validation | Verify required fields, category enum, trace_id format |
| Unit: `ActivityTracingLayer` | Verify tracing events are captured and converted to `ActivityLogEntry` |
| Unit: `ActivityLogBroadcaster` | Verify publish/subscribe, backpressure (lagged), no-subscriber case |
| Integration: REST API `/activity-logs` | Verify filtering by level, source, entity, time range, role-based scoping |
| Integration: REST API export | Verify JSON and text format output |
| Integration: WebSocket `/ws/activity-logs` | Verify subscription, filter updates, role-based filtering |
| Integration: Retention cleanup | Verify entries older than retention period are deleted, per-level retention |
| Integration: Batch persistence | Verify entries are flushed in batches, no data loss under normal operation |

### Frontend

| Test Type | Coverage |
|-----------|----------|
| Component: `ActivityConsolePanel` | Renders entries, color-codes by level/source, auto-scroll, pause |
| Component: `ConsoleFilterToolbar` | Level toggles, source toggles, search field, mode toggle |
| Component: `ActivityConsolePage` | Live stream pane + history query pane, export button |
| Hook: `useActivityLogStream` | WebSocket connection, reconnection, subscription management, ring buffer |
| Hook: `useActivityLogHistory` | REST API query with filters, pagination |
| Store: `activityConsoleStore` | Filter state, panel open/close, mode toggle, buffer management |

## 12. Open Questions

- Should the verbose mode capture `tracing` spans at the `DEBUG` level, or only `INFO` and above? DEBUG-level tracing can be extremely high volume. Consider a server-side toggle to enable DEBUG capture.
- What is the expected steady-state log volume per minute during active generation? This drives the batch_size and buffer configuration defaults.
- Should activity log entries include the full structured `tracing` span context (parent spans, field values), or only the leaf event message? Full context is more useful for debugging but significantly increases storage.
- Should the console support regex-based search, or is substring matching sufficient for MVP?

## 13. Quality Assurance

### DRY-GUY Agent Enforcement

**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** -- no PR should be merged without a DRY-GUY audit of the changed files.

### Key DRY Risks

| Risk | Mitigation |
|------|------------|
| Duplicating `EventPersistence` pattern | Extract shared batch-persistence helper if patterns diverge less than 30% |
| Duplicating `AuditLog` query patterns | Consider a shared `LogQueryBuilder` if query shapes are similar |
| Duplicating WebSocket connection management | Reuse `WsManager` or extract a generic WS subscription handler |
| Duplicating retention cleanup logic | Extract a generic `RetentionJob<T>` if `metrics_retention` and this cleanup share >70% logic |

## 14. Version History

- **v1.0** (2026-02-25): Initial PRD creation
