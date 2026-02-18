# Task List: Event Bus & Notification System

**PRD Reference:** `design/prds/010-prd-event-bus-notification-system.md`
**Scope:** Build a centralized publish/subscribe event bus with in-app notifications, external delivery (webhooks, email), per-user notification preferences, do-not-disturb, and digest mode.

## Overview

This PRD creates the platform's nervous system: a centralized event bus that all modules publish to, and a notification system that routes events to users through their preferred channels. The event bus uses Tokio broadcast channels for in-process pub/sub with database persistence for replay and history. Notifications are delivered via WebSocket (in-app toasts), stored in an activity feed, and optionally forwarded to external channels (webhooks, email). User preferences control which events reach them, through which channels, and whether they receive real-time or digest delivery.

### What Already Exists
- PRD-002: WebSocket infrastructure (`WsManager`), Axum server, `AppState`
- PRD-003: Auth middleware, user model
- PRD-005: ComfyUI events (generation progress, completed, error)
- PRD-006: Hardware alert events (threshold exceeded)
- PRD-007: Job lifecycle events (submitted, running, completed, failed)

### What We're Building
1. Database tables: `events`, `notifications`, `notification_preferences`, `notification_channels`
2. In-process event bus using Tokio broadcast channels
3. Event persistence layer for history and replay
4. Notification routing engine (event -> preferences -> delivery channels)
5. In-app notification delivery via WebSocket
6. External delivery: webhook sender, email sender
7. Per-user notification preferences API
8. Do-not-disturb mode with critical alert bypass
9. Digest scheduler and aggregator
10. React notification components (toasts, activity feed, unread badge)

### Key Design Decisions
1. **In-process event bus first** — Use `tokio::sync::broadcast` for zero-latency event delivery within the process. External broker (Redis) is a post-MVP enhancement for multi-instance.
2. **Events persisted for history** — All events are written to the `events` table for activity feed and replay. The broadcast channel handles real-time delivery.
3. **Notification routing as a service** — A dedicated `NotificationRouter` subscribes to the event bus, evaluates user preferences, and fans out to delivery channels.
4. **Critical events bypass DND** — Events tagged as `critical` (disk full, GPU overheating, system errors) always reach admins regardless of DND setting.

---

## Phase 1: Database Schema

### Task 1.1: Create Events Table
**File:** `migrations/20260218900001_create_events_table.sql`

```sql
CREATE TABLE event_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    is_critical BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON event_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO event_types (name, category, is_critical, description) VALUES
    ('job.submitted', 'job', false, 'A job was submitted to the queue'),
    ('job.started', 'job', false, 'A job started executing'),
    ('job.progress', 'job', false, 'Job progress update'),
    ('job.completed', 'job', false, 'A job completed successfully'),
    ('job.failed', 'job', false, 'A job failed'),
    ('job.cancelled', 'job', false, 'A job was cancelled'),
    ('review.submitted', 'review', false, 'Content submitted for review'),
    ('review.approved', 'review', false, 'Content approved'),
    ('review.rejected', 'review', false, 'Content rejected'),
    ('review.comment', 'review', false, 'Review comment added'),
    ('system.disk_warning', 'system', true, 'Disk space below threshold'),
    ('system.gpu_warning', 'system', true, 'GPU temperature above threshold'),
    ('system.gpu_critical', 'system', true, 'GPU temperature critical'),
    ('system.restart', 'system', true, 'Service restarted'),
    ('collab.mention', 'collaboration', false, 'User was mentioned'),
    ('collab.lock', 'collaboration', false, 'Entity locked by another user');

CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    event_type_id BIGINT NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_entity_type TEXT,
    source_entity_id BIGINT,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_event_type_id ON events(event_type_id);
CREATE INDEX idx_events_actor_user_id ON events(actor_user_id);
CREATE INDEX idx_events_source_entity ON events(source_entity_type, source_entity_id);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
```

**Acceptance Criteria:**
- [ ] `event_types` lookup table with category, is_critical flag
- [ ] Seed data for job, review, system, and collaboration event types
- [ ] `events` table with FK to event_types, source entity reference, payload
- [ ] `actor_user_id` tracks who triggered the event
- [ ] Indexes on event_type, actor, source entity, and created_at
- [ ] No `updated_at` on `events` (append-only)

### Task 1.2: Create Notifications Tables
**File:** `migrations/20260218900002_create_notifications_tables.sql`

```sql
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    channel TEXT NOT NULL DEFAULT 'in_app',
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    is_delivered BOOLEAN NOT NULL DEFAULT false,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_event_id ON notifications(event_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

CREATE TABLE notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_type_id BIGINT NOT NULL REFERENCES event_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    channels JSONB NOT NULL DEFAULT '["in_app"]',
    scope TEXT NOT NULL DEFAULT 'all',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_notification_preferences_user_event ON notification_preferences(user_id, event_type_id);
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE user_notification_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    dnd_enabled BOOLEAN NOT NULL DEFAULT false,
    dnd_until TIMESTAMPTZ,
    digest_enabled BOOLEAN NOT NULL DEFAULT false,
    digest_interval TEXT NOT NULL DEFAULT 'daily',
    digest_last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_notification_settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `notifications` table: per-user event delivery with read/delivered tracking
- [ ] `notification_preferences`: per-event-type channel and scope settings per user
- [ ] `user_notification_settings`: DND mode, digest mode, global settings
- [ ] Partial index on unread notifications for fast count queries
- [ ] Unique constraint on (user_id, event_type_id) in preferences
- [ ] `scope TEXT` values: 'all', 'my_jobs', 'my_projects'

---

## Phase 2: Event Bus Core

### Task 2.1: Event Bus Service
**File:** `src/events/bus.rs`

```rust
use tokio::sync::broadcast;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformEvent {
    pub event_type: String,
    pub source_entity_type: Option<String>,
    pub source_entity_id: Option<DbId>,
    pub actor_user_id: Option<DbId>,
    pub payload: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct EventBus {
    sender: broadcast::Sender<PlatformEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: PlatformEvent) {
        // Non-blocking send; if no subscribers, event is still persisted by the persistence layer
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PlatformEvent> {
        self.sender.subscribe()
    }
}
```

**Acceptance Criteria:**
- [ ] `EventBus` wraps `tokio::sync::broadcast` channel
- [ ] `publish` is non-blocking (fire and forget for the publisher)
- [ ] `subscribe` returns a receiver for any component that needs events
- [ ] Capacity configurable (default 1024 events buffered)
- [ ] Events include type, source, actor, payload, timestamp

### Task 2.2: Event Persistence Service
**File:** `src/events/persistence.rs`

```rust
pub struct EventPersistence {
    pool: PgPool,
}

impl EventPersistence {
    /// Subscribe to the event bus and persist all events to the database.
    pub async fn run(pool: PgPool, mut receiver: broadcast::Receiver<PlatformEvent>) {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if let Err(e) = Self::persist(&pool, &event).await {
                        tracing::error!("Failed to persist event: {:?}", e);
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("Event persistence lagged by {} events", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }

    async fn persist(pool: &PgPool, event: &PlatformEvent) -> Result<DbId, sqlx::Error> {
        let event_type_id: DbId = sqlx::query_scalar(
            "SELECT id FROM event_types WHERE name = $1"
        )
        .bind(&event.event_type)
        .fetch_one(pool)
        .await?;

        let id: DbId = sqlx::query_scalar(
            "INSERT INTO events (event_type_id, source_entity_type, source_entity_id, actor_user_id, payload)
             VALUES ($1, $2, $3, $4, $5) RETURNING id"
        )
        .bind(event_type_id)
        .bind(&event.source_entity_type)
        .bind(event.source_entity_id)
        .bind(event.actor_user_id)
        .bind(&event.payload)
        .fetch_one(pool)
        .await?;

        Ok(id)
    }
}
```

**Acceptance Criteria:**
- [ ] Subscribes to event bus and writes all events to `events` table
- [ ] Handles lagged receiver (logs warning, continues)
- [ ] Maps event type name to event_type_id via lookup
- [ ] Runs as a spawned background task

---

## Phase 3: Notification Router

### Task 3.1: Notification Routing Engine
**File:** `src/events/router.rs`

```rust
pub struct NotificationRouter {
    pool: PgPool,
    ws_manager: Arc<WsManager>,
}

impl NotificationRouter {
    pub async fn run(self, mut receiver: broadcast::Receiver<PlatformEvent>) {
        loop {
            match receiver.recv().await {
                Ok(event) => self.route_event(&event).await,
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("Notification router lagged by {} events", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }

    async fn route_event(&self, event: &PlatformEvent) {
        // 1. Determine target users based on event type and source entity
        let target_users = self.determine_targets(event).await;

        for user_id in target_users {
            // 2. Check user preferences
            let prefs = self.get_user_preferences(user_id, &event.event_type).await;

            if !prefs.is_enabled {
                continue;
            }

            // 3. Check DND mode
            let settings = self.get_user_settings(user_id).await;
            let is_critical = self.is_critical_event(&event.event_type).await;

            if settings.dnd_enabled && !is_critical {
                // Queue for later delivery
                continue;
            }

            // 4. Check digest mode
            if settings.digest_enabled && !is_critical {
                // Will be included in next digest
                continue;
            }

            // 5. Deliver through configured channels
            for channel in &prefs.channels {
                match channel.as_str() {
                    "in_app" => self.deliver_in_app(user_id, event).await,
                    "webhook" => self.deliver_webhook(user_id, event).await,
                    "email" => self.deliver_email(user_id, event).await,
                    _ => tracing::warn!("Unknown channel: {}", channel),
                }
            }
        }
    }

    async fn deliver_in_app(&self, user_id: DbId, event: &PlatformEvent) {
        let msg = serde_json::json!({
            "type": "notification",
            "event_type": event.event_type,
            "payload": event.payload,
            "timestamp": event.timestamp,
        });
        let senders = self.ws_manager.get_by_user(user_id).await;
        for sender in senders {
            let _ = sender.send(axum::extract::ws::Message::Text(msg.to_string()));
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Routes events to affected users based on event type and source
- [ ] Respects per-user notification preferences (enabled, channels, scope)
- [ ] DND mode blocks non-critical events; critical events bypass DND
- [ ] Digest mode queues events for periodic summary
- [ ] In-app delivery via WebSocket
- [ ] Runs as a spawned background task

### Task 3.2: Target User Determination
**File:** `src/events/router.rs` (extend)

```rust
impl NotificationRouter {
    async fn determine_targets(&self, event: &PlatformEvent) -> Vec<DbId> {
        match event.event_type.as_str() {
            // Job events: notify the submitter
            t if t.starts_with("job.") => {
                if let Some(user_id) = event.actor_user_id {
                    vec![user_id]
                } else { vec![] }
            }
            // Review events: notify the content owner
            t if t.starts_with("review.") => {
                // Look up entity owner from source_entity
                vec![]
            }
            // System events: notify all admins
            t if t.starts_with("system.") => {
                self.get_admin_user_ids().await
            }
            // Collaboration: notify mentioned users
            "collab.mention" => {
                event.payload.get("mentioned_user_ids")
                    .and_then(|v| serde_json::from_value::<Vec<DbId>>(v.clone()).ok())
                    .unwrap_or_default()
            }
            _ => vec![],
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Job events -> job submitter
- [ ] Review events -> content owner
- [ ] System events -> all admin users
- [ ] Mention events -> mentioned users
- [ ] Scope filtering applied: "my_jobs" = only events for user's own jobs

---

## Phase 4: Notification API

### Task 4.1: Notification Endpoints
**File:** `src/api/handlers/notifications.rs`

```rust
pub async fn list_notifications(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<NotificationQuery>,
) -> Result<Json<Vec<Notification>>, AppError> {
    let notifications = NotificationRepo::list_for_user(
        &state.pool, auth.user_id, params.unread_only, params.limit, params.offset
    ).await?;
    Ok(Json(notifications))
}

pub async fn mark_read(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(notification_id): Path<DbId>,
) -> Result<StatusCode, AppError> {
    NotificationRepo::mark_read(&state.pool, notification_id, auth.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_read(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<StatusCode, AppError> {
    NotificationRepo::mark_all_read(&state.pool, auth.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unread_count(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<UnreadCount>, AppError> {
    let count = NotificationRepo::unread_count(&state.pool, auth.user_id).await?;
    Ok(Json(UnreadCount { count }))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/notifications` — list user's notifications (with unread_only filter)
- [ ] `POST /api/v1/notifications/:id/read` — mark single as read
- [ ] `POST /api/v1/notifications/read-all` — mark all as read
- [ ] `GET /api/v1/notifications/unread-count` — get unread count
- [ ] All endpoints require authentication

### Task 4.2: Notification Preferences API
**File:** `src/api/handlers/notifications.rs` (extend)

```rust
pub async fn get_preferences(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<NotificationPreference>>, AppError> { ... }

pub async fn update_preference(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_type_id): Path<DbId>,
    Json(input): Json<UpdatePreference>,
) -> Result<Json<NotificationPreference>, AppError> { ... }

pub async fn update_settings(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<UpdateNotificationSettings>,
) -> Result<Json<UserNotificationSettings>, AppError> {
    // Toggle DND, digest mode, etc.
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/notifications/preferences` — list all preferences for user
- [ ] `PUT /api/v1/notifications/preferences/:event_type_id` — update preference for event type
- [ ] `PUT /api/v1/notifications/settings` — update DND, digest settings
- [ ] Default preferences created on first access (all enabled, in_app, all scope)

### Task 4.3: Register Event and Notification Routes
**File:** `src/api/routes.rs` (update)

**Acceptance Criteria:**
- [ ] Notification routes under `/api/v1/notifications`
- [ ] Preference routes under `/api/v1/notifications/preferences`
- [ ] Settings routes under `/api/v1/notifications/settings`

---

## Phase 5: External Delivery

### Task 5.1: Webhook Delivery
**File:** `src/events/delivery/webhook.rs`

```rust
pub struct WebhookDelivery {
    client: reqwest::Client,
}

impl WebhookDelivery {
    pub async fn deliver(
        &self,
        url: &str,
        event: &PlatformEvent,
    ) -> Result<(), DeliveryError> {
        let response = self.client
            .post(url)
            .json(&serde_json::json!({
                "event_type": event.event_type,
                "payload": event.payload,
                "timestamp": event.timestamp,
            }))
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(DeliveryError::HttpError(response.status().as_u16()));
        }
        Ok(())
    }
}
```

**Acceptance Criteria:**
- [ ] Posts event payload as JSON to configured webhook URL
- [ ] 10-second timeout per delivery attempt
- [ ] Retries with exponential backoff on failure (1s, 2s, 4s, max 3 attempts)
- [ ] Delivery failures logged

### Task 5.2: Email Delivery
**File:** `src/events/delivery/email.rs`

```rust
pub struct EmailDelivery {
    smtp_host: String,
    smtp_port: u16,
    from_address: String,
}

impl EmailDelivery {
    pub async fn deliver(
        &self,
        to_email: &str,
        subject: &str,
        body: &str,
    ) -> Result<(), DeliveryError> {
        // Use lettre crate for SMTP
        todo!()
    }
}
```

**Acceptance Criteria:**
- [ ] Sends email via configured SMTP server
- [ ] Subject includes event type for filtering
- [ ] Body includes event details in readable format
- [ ] `lettre` crate added to `Cargo.toml`
- [ ] SMTP configuration via env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`

---

## Phase 6: Digest Scheduler

### Task 6.1: Digest Aggregator
**File:** `src/events/digest.rs`

```rust
pub struct DigestScheduler {
    pool: PgPool,
}

impl DigestScheduler {
    pub async fn run(&self, cancel_token: CancellationToken) {
        let mut ticker = tokio::time::interval(Duration::from_secs(3600)); // Check hourly
        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = ticker.tick() => self.process_digests().await,
            }
        }
    }

    async fn process_digests(&self) {
        // Find users with digest_enabled = true
        // For each, check if it's time to send (based on digest_interval and last_sent_at)
        // Aggregate events since last digest
        // Format and deliver digest via preferred channel
    }
}
```

**Acceptance Criteria:**
- [ ] Runs every hour, checks for users due for digest delivery
- [ ] Aggregates events by type: X jobs completed, Y failed, Z awaiting review
- [ ] Delivers via user's preferred channel
- [ ] Updates `digest_last_sent_at` after sending
- [ ] Hourly and daily intervals supported

---

## Phase 7: Frontend Components

### Task 7.1: Toast Notification Component
**File:** `frontend/src/components/notifications/Toast.tsx`

**Acceptance Criteria:**
- [ ] Appears in top-right corner
- [ ] Auto-dismisses after configurable duration (default 5s)
- [ ] Manually dismissible with close button
- [ ] Color-coded by event category (job=blue, review=green, system=red)
- [ ] Stacks vertically for multiple concurrent notifications

### Task 7.2: Activity Feed Component
**File:** `frontend/src/components/notifications/ActivityFeed.tsx`

**Acceptance Criteria:**
- [ ] Chronological list of notifications
- [ ] Infinite scroll with lazy loading
- [ ] Unread items visually distinct
- [ ] Click to mark as read and navigate to related entity
- [ ] Filter by category (job, review, system, collaboration)

### Task 7.3: Unread Badge
**File:** `frontend/src/components/notifications/UnreadBadge.tsx`

**Acceptance Criteria:**
- [ ] Shows unread count in the header/navbar
- [ ] Updates in real-time via WebSocket
- [ ] Click opens Activity Feed panel
- [ ] Count > 99 shows "99+"

### Task 7.4: Notification Preferences Page
**File:** `frontend/src/pages/settings/NotificationPreferences.tsx`

**Acceptance Criteria:**
- [ ] Lists all event types with per-type channel toggles
- [ ] Scope selector (All, My Jobs, My Projects)
- [ ] DND toggle with optional end time
- [ ] Digest mode toggle with interval selector

---

## Phase 8: Integration with AppState

### Task 8.1: Wire Event Bus into AppState
**File:** `src/app_state.rs` (update), `src/main.rs` (update)

```rust
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub ws_manager: Arc<WsManager>,
    pub comfyui_manager: Arc<ComfyUIManager>,
    pub event_bus: Arc<EventBus>,
}
```

**Acceptance Criteria:**
- [ ] `EventBus` added to `AppState`
- [ ] Persistence service, notification router, digest scheduler spawned in main
- [ ] All existing event publishers (ComfyUI bridge, job engine, hardware monitor) publish to the bus
- [ ] Graceful shutdown cancels all background tasks

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218900001_create_events_table.sql` | Events and event_types DDL |
| `migrations/20260218900002_create_notifications_tables.sql` | Notifications, preferences, settings DDL |
| `src/events/mod.rs` | Events module barrel file |
| `src/events/bus.rs` | Event bus (broadcast channel) |
| `src/events/persistence.rs` | Event persistence to database |
| `src/events/router.rs` | Notification routing engine |
| `src/events/digest.rs` | Digest aggregation and scheduling |
| `src/events/delivery/mod.rs` | Delivery module barrel |
| `src/events/delivery/webhook.rs` | Webhook delivery |
| `src/events/delivery/email.rs` | Email delivery via SMTP |
| `src/repositories/event_repo.rs` | Event CRUD |
| `src/repositories/notification_repo.rs` | Notification CRUD |
| `src/api/handlers/notifications.rs` | Notification API handlers |
| `frontend/src/components/notifications/Toast.tsx` | Toast notification component |
| `frontend/src/components/notifications/ActivityFeed.tsx` | Activity feed panel |
| `frontend/src/components/notifications/UnreadBadge.tsx` | Unread count badge |
| `frontend/src/pages/settings/NotificationPreferences.tsx` | Preferences page |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: `WsManager` for in-app delivery, Axum server
- PRD-003: `AuthUser` for per-user endpoints, user model
- PRD-005: ComfyUI events as event sources
- PRD-007: Job lifecycle events as event sources
- PRD-006: Hardware alert events as event sources

### New Infrastructure Needed
- `lettre` crate for SMTP email delivery
- `reqwest` (likely already added by PRD-005) for webhook delivery
- No new frontend dependencies beyond existing React setup

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2
2. Phase 2: Event Bus Core — Tasks 2.1–2.2
3. Phase 3: Notification Router — Tasks 3.1–3.2
4. Phase 4: Notification API — Tasks 4.1–4.3
5. Phase 8: AppState Integration — Task 8.1

**MVP Success Criteria:**
- Events published by any module flow through the bus
- Events persisted to database for history
- In-app notifications delivered via WebSocket
- User preferences control which events are delivered
- Unread count endpoint works

### Post-MVP Enhancements
1. Phase 5: External Delivery — Tasks 5.1–5.2
2. Phase 6: Digest Scheduler — Task 6.1
3. Phase 7: Frontend Components — Tasks 7.1–7.4

---

## Notes

1. **Broadcast channel capacity:** Default 1024 events. If a subscriber falls behind (e.g., slow persistence), it receives a `Lagged` error. The subscriber should log the gap and continue.
2. **Event type extensibility:** New event types can be added with INSERT into `event_types`. No code changes needed for the bus or persistence layer.
3. **Multi-instance scaling:** For multiple backend instances, replace in-process broadcast with Redis pub/sub. The `EventBus` interface remains the same; only the implementation changes.
4. **Notification retention:** Notifications older than 90 days should be archived or deleted. This can be a background job similar to metrics retention.
5. **Real-time updates:** The unread count should update instantly when a new notification arrives. The WebSocket message includes both the notification and the new unread count.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
