# Task List: Real-time Collaboration Layer

**PRD Reference:** `design/prds/011-prd-real-time-collaboration-layer.md`
**Scope:** Implement user presence indicators, exclusive segment locking, conflict resolution, heartbeat-based stale lock cleanup, and WebSocket multiplexing for real-time user-to-user collaboration.

## Overview

This PRD builds the collaboration layer that prevents users from stepping on each other's work. Presence tracking uses an in-memory store (with database fallback) to show who is viewing which entity. Segment locking uses database-backed exclusive locks with configurable expiration. WebSocket messages deliver presence updates and lock state changes in real-time. Heartbeat monitoring detects disconnected users and automatically releases their locks.

### What Already Exists
- PRD-002: WebSocket `WsManager` with connection tracking, heartbeat infrastructure
- PRD-003: User authentication, `AuthUser` extractor
- PRD-010: Event bus for publishing collaboration events (lock acquired, lock released)
- PRD-001: Entity model (scenes, segments) — the entities being locked

### What We're Building
1. Database tables: `entity_locks`, `user_presence`
2. In-memory presence store with WebSocket broadcast
3. Lock manager with atomic acquisition and expiration
4. Heartbeat tracker for stale session detection
5. Lock cleanup background task
6. Collaboration WebSocket message protocol
7. Presence and lock REST API endpoints
8. React presence and lock UI components

### Key Design Decisions
1. **Database-backed locks** — Locks are stored in PostgreSQL for durability across server restarts. In-memory caching is used for fast lock checks.
2. **Entity-level locking** — Locks are on (entity_type, entity_id) pairs, not just segments. This allows locking scenes, characters, etc. in the future.
3. **30-minute default expiration** — Prevents indefinite lock holding. Users can extend their lock before expiration.
4. **WebSocket multiplexing** — A single WebSocket connection per user carries presence, lock, and notification messages, distinguished by message type.

---

## Phase 1: Database Schema

### Task 1.1: Create Entity Locks Table
**File:** `migrations/20260219000001_create_entity_locks_table.sql`

```sql
CREATE TABLE entity_locks (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    lock_type TEXT NOT NULL DEFAULT 'exclusive',
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_entity_locks_active ON entity_locks(entity_type, entity_id)
    WHERE is_active = true;
CREATE INDEX idx_entity_locks_user_id ON entity_locks(user_id);
CREATE INDEX idx_entity_locks_expires_at ON entity_locks(expires_at)
    WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON entity_locks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique partial index ensures only one active lock per entity
- [ ] `expires_at` for automatic expiration
- [ ] `is_active` flag for soft-release (preserves history)
- [ ] `lock_type` defaults to 'exclusive' (extensible for shared locks later)
- [ ] FK index on `user_id`

### Task 1.2: Create User Presence Table
**File:** `migrations/20260219000002_create_user_presence_table.sql`

```sql
CREATE TABLE user_presence (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_presence_user_entity ON user_presence(user_id, entity_type, entity_id)
    WHERE is_active = true;
CREATE INDEX idx_user_presence_entity ON user_presence(entity_type, entity_id)
    WHERE is_active = true;
CREATE INDEX idx_user_presence_user_id ON user_presence(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_presence
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks which user is viewing which entity
- [ ] `last_seen_at` updated on heartbeat for activity detection
- [ ] Unique constraint per user per entity (only one active presence record)
- [ ] Index on entity for "who is viewing this" queries

---

## Phase 2: Lock Manager

### Task 2.1: Lock Manager Service
**File:** `src/collab/lock_manager.rs`

```rust
use crate::types::DbId;
use chrono::{Utc, Duration};

pub struct LockManager {
    pool: PgPool,
    default_lock_duration_mins: i64,
}

impl LockManager {
    pub fn new(pool: PgPool, default_lock_duration_mins: i64) -> Self {
        Self { pool, default_lock_duration_mins }
    }

    pub async fn acquire(
        &self,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<EntityLock, LockError> {
        let expires_at = Utc::now() + Duration::minutes(self.default_lock_duration_mins);

        // Attempt to insert — unique partial index ensures exclusivity
        let result = sqlx::query_as::<_, EntityLock>(
            "INSERT INTO entity_locks (entity_type, entity_id, user_id, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (entity_type, entity_id) WHERE is_active = true
             DO NOTHING
             RETURNING id, entity_type, entity_id, user_id, lock_type, acquired_at,
                       expires_at, released_at, is_active, created_at, updated_at"
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(user_id)
        .bind(expires_at)
        .fetch_optional(&self.pool)
        .await?;

        match result {
            Some(lock) => Ok(lock),
            None => {
                // Lock exists — find who holds it
                let holder = self.get_active_lock(entity_type, entity_id).await?;
                Err(LockError::AlreadyLocked {
                    holder_user_id: holder.user_id,
                    acquired_at: holder.acquired_at,
                    expires_at: holder.expires_at,
                })
            }
        }
    }

    pub async fn release(
        &self,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<(), LockError> {
        let result = sqlx::query(
            "UPDATE entity_locks SET is_active = false, released_at = NOW()
             WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3 AND is_active = true"
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(LockError::NotLockHolder);
        }
        Ok(())
    }

    pub async fn extend(
        &self,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<EntityLock, LockError> {
        let new_expires = Utc::now() + Duration::minutes(self.default_lock_duration_mins);
        sqlx::query_as::<_, EntityLock>(
            "UPDATE entity_locks SET expires_at = $4
             WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3 AND is_active = true
             RETURNING *"
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(user_id)
        .bind(new_expires)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(LockError::NotLockHolder)
    }

    pub async fn get_active_lock(
        &self,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<EntityLock, sqlx::Error> {
        sqlx::query_as::<_, EntityLock>(
            "SELECT * FROM entity_locks
             WHERE entity_type = $1 AND entity_id = $2 AND is_active = true"
        )
        .bind(entity_type)
        .bind(entity_id)
        .fetch_one(&self.pool)
        .await
    }
}

#[derive(Debug)]
pub enum LockError {
    AlreadyLocked {
        holder_user_id: DbId,
        acquired_at: chrono::DateTime<Utc>,
        expires_at: chrono::DateTime<Utc>,
    },
    NotLockHolder,
    DatabaseError(sqlx::Error),
}
```

**Acceptance Criteria:**
- [ ] `acquire` uses INSERT ON CONFLICT DO NOTHING for atomic lock acquisition
- [ ] Lock conflicts return the holder's user_id and expiration time
- [ ] `release` only allows the lock holder to release
- [ ] `extend` resets the expiration timer
- [ ] `get_active_lock` returns current lock for UI display

### Task 2.2: Stale Lock Cleanup
**File:** `src/collab/lock_cleanup.rs`

```rust
pub async fn cleanup_expired_locks(pool: &PgPool) {
    let result = sqlx::query(
        "UPDATE entity_locks SET is_active = false, released_at = NOW()
         WHERE is_active = true AND expires_at < NOW()"
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("Released {} expired locks", r.rows_affected());
        }
        Err(e) => tracing::error!("Lock cleanup failed: {:?}", e),
        _ => {}
    }
}

/// Background task that runs every 60 seconds
pub async fn lock_cleanup_loop(pool: PgPool, cancel_token: CancellationToken) {
    let mut ticker = tokio::time::interval(Duration::from_secs(60));
    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => break,
            _ = ticker.tick() => cleanup_expired_locks(&pool).await,
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Runs every 60 seconds
- [ ] Releases all locks past their `expires_at`
- [ ] Logs released lock count
- [ ] Graceful shutdown via cancellation token

---

## Phase 3: Presence Service

### Task 3.1: In-Memory Presence Store
**File:** `src/collab/presence.rs`

```rust
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub user_id: DbId,
    pub username: String,
    pub last_seen: chrono::DateTime<chrono::Utc>,
}

pub struct PresenceStore {
    /// Key: "{entity_type}:{entity_id}", Value: set of present users
    store: RwLock<HashMap<String, HashMap<DbId, PresenceEntry>>>,
    pool: PgPool,
}

impl PresenceStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            store: RwLock::new(HashMap::new()),
            pool,
        }
    }

    pub async fn join(&self, entity_type: &str, entity_id: DbId, user: PresenceEntry) {
        let key = format!("{}:{}", entity_type, entity_id);
        let user_id = user.user_id;
        self.store.write().await
            .entry(key)
            .or_default()
            .insert(user_id, user);
        // Also persist to database for recovery
    }

    pub async fn leave(&self, entity_type: &str, entity_id: DbId, user_id: DbId) {
        let key = format!("{}:{}", entity_type, entity_id);
        if let Some(entity) = self.store.write().await.get_mut(&key) {
            entity.remove(&user_id);
        }
    }

    pub async fn get_present_users(&self, entity_type: &str, entity_id: DbId) -> Vec<PresenceEntry> {
        let key = format!("{}:{}", entity_type, entity_id);
        self.store.read().await
            .get(&key)
            .map(|m| m.values().cloned().collect())
            .unwrap_or_default()
    }
}
```

**Acceptance Criteria:**
- [ ] In-memory HashMap for fast presence queries
- [ ] `join` and `leave` update both in-memory and database
- [ ] `get_present_users` returns all users currently viewing an entity
- [ ] Thread-safe via `RwLock`
- [ ] Database backup for recovery after restart

### Task 3.2: Presence WebSocket Messages
**File:** `src/collab/ws_protocol.rs`

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CollabMessage {
    #[serde(rename = "presence.join")]
    PresenceJoin { entity_type: String, entity_id: DbId },
    #[serde(rename = "presence.leave")]
    PresenceLeave { entity_type: String, entity_id: DbId },
    #[serde(rename = "presence.update")]
    PresenceUpdate { entity_type: String, entity_id: DbId, users: Vec<PresenceEntry> },
    #[serde(rename = "lock.acquired")]
    LockAcquired { entity_type: String, entity_id: DbId, user_id: DbId },
    #[serde(rename = "lock.released")]
    LockReleased { entity_type: String, entity_id: DbId },
    #[serde(rename = "lock.denied")]
    LockDenied { entity_type: String, entity_id: DbId, holder_user_id: DbId, expires_at: String },
}
```

**Acceptance Criteria:**
- [ ] Message types for presence join/leave/update and lock acquired/released/denied
- [ ] All messages include entity_type and entity_id for routing
- [ ] Serialized as JSON over WebSocket
- [ ] Presence updates broadcast to all users viewing the same entity

---

## Phase 4: Collaboration API

### Task 4.1: Lock API Endpoints
**File:** `src/api/handlers/collab.rs`

```rust
pub async fn acquire_lock(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<LockRequest>,
) -> Result<Json<EntityLock>, AppError> {
    match state.lock_manager.acquire(&input.entity_type, input.entity_id, auth.user_id).await {
        Ok(lock) => {
            // Broadcast lock.acquired to all present users
            Ok(Json(lock))
        }
        Err(LockError::AlreadyLocked { holder_user_id, acquired_at, expires_at }) => {
            Err(AppError::Conflict(format!(
                "Entity is locked by user {} until {}",
                holder_user_id, expires_at
            )))
        }
        Err(e) => Err(AppError::InternalError(format!("{:?}", e))),
    }
}

pub async fn release_lock(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<LockRequest>,
) -> Result<StatusCode, AppError> {
    state.lock_manager.release(&input.entity_type, input.entity_id, auth.user_id).await
        .map_err(|e| AppError::BadRequest(format!("{:?}", e)))?;
    // Broadcast lock.released
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_lock_status(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
) -> Result<Json<Option<EntityLock>>, AppError> {
    let lock = sqlx::query_as::<_, EntityLock>(
        "SELECT * FROM entity_locks WHERE entity_type = $1 AND entity_id = $2 AND is_active = true"
    )
    .bind(&entity_type)
    .bind(entity_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(lock))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/locks/acquire` — acquire exclusive lock
- [ ] `POST /api/v1/locks/release` — release held lock
- [ ] `POST /api/v1/locks/extend` — extend lock expiration
- [ ] `GET /api/v1/locks/:entity_type/:entity_id` — check lock status
- [ ] Lock conflicts return 409 with holder info
- [ ] Lock state changes broadcast via WebSocket

### Task 4.2: Presence API Endpoints
**File:** `src/api/handlers/collab.rs` (extend)

```rust
pub async fn get_presence(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
) -> Result<Json<Vec<PresenceEntry>>, AppError> {
    let users = state.presence_store.get_present_users(&entity_type, entity_id).await;
    Ok(Json(users))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/presence/:entity_type/:entity_id` — who is viewing this entity
- [ ] Returns list of users with timestamps
- [ ] Authenticated access required

### Task 4.3: Register Collaboration Routes
**File:** `src/api/routes.rs` (update)

**Acceptance Criteria:**
- [ ] Lock routes under `/api/v1/locks`
- [ ] Presence routes under `/api/v1/presence`
- [ ] All routes require authentication

---

## Phase 5: WebSocket Integration

### Task 5.1: Collaboration WebSocket Handler
**File:** `src/ws/collab_handler.rs`

Handle collaboration-specific WebSocket messages (presence join/leave).

```rust
pub async fn handle_collab_message(
    msg: CollabMessage,
    user: &AuthUser,
    state: &AppState,
) {
    match msg {
        CollabMessage::PresenceJoin { entity_type, entity_id } => {
            let entry = PresenceEntry {
                user_id: user.user_id,
                username: user.username.clone(),
                last_seen: Utc::now(),
            };
            state.presence_store.join(&entity_type, entity_id, entry).await;

            // Broadcast updated presence to all users viewing this entity
            let users = state.presence_store.get_present_users(&entity_type, entity_id).await;
            broadcast_to_entity(&state.ws_manager, &entity_type, entity_id,
                CollabMessage::PresenceUpdate { entity_type, entity_id, users }
            ).await;
        }
        CollabMessage::PresenceLeave { entity_type, entity_id } => {
            state.presence_store.leave(&entity_type, entity_id, user.user_id).await;
            // Broadcast updated presence
        }
        _ => {}
    }
}
```

**Acceptance Criteria:**
- [ ] Presence join messages add user to entity's presence list
- [ ] Presence leave messages remove user
- [ ] Updated presence broadcast to all users viewing the same entity
- [ ] WebSocket disconnection triggers leave for all entities

---

## Phase 6: Frontend Components

### Task 6.1: Presence Indicator Component
**File:** `frontend/src/components/collab/PresenceIndicator.tsx`

```typescript
interface PresenceIndicatorProps {
  entityType: string;
  entityId: number;
}

const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({ entityType, entityId }) => {
  const { presentUsers } = usePresence(entityType, entityId);

  return (
    <div className="presence-indicator">
      {presentUsers.map(user => (
        <Avatar key={user.user_id} name={user.username} size="sm" />
      ))}
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Shows user avatars/initials for users viewing the same entity
- [ ] Updates in real-time via WebSocket
- [ ] Small and unobtrusive (corner of entity view)

### Task 6.2: Lock Status Component
**File:** `frontend/src/components/collab/LockStatus.tsx`

**Acceptance Criteria:**
- [ ] Shows lock icon with holder name when entity is locked
- [ ] "Lock" button for acquiring lock before editing
- [ ] "Unlock" button for releasing held lock
- [ ] Lock conflict message: "Locked by [Name] until [time]"
- [ ] Disabled action buttons when entity is locked by another user

### Task 6.3: Presence and Lock Hooks
**File:** `frontend/src/hooks/usePresence.ts`, `frontend/src/hooks/useLock.ts`

**Acceptance Criteria:**
- [ ] `usePresence(entityType, entityId)` — sends join on mount, leave on unmount
- [ ] `useLock(entityType, entityId)` — acquire, release, extend, check lock
- [ ] WebSocket message handling for real-time updates
- [ ] Automatic lock extension before expiration (if user is still active)

---

## Phase 7: Integration Tests

### Task 7.1: Lock Manager Tests
**File:** `tests/lock_tests.rs`

```rust
#[tokio::test]
async fn test_acquire_and_release() {
    // User A acquires lock, succeeds
    // User A releases lock, succeeds
}

#[tokio::test]
async fn test_concurrent_acquire() {
    // User A acquires lock, succeeds
    // User B tries to acquire same lock, fails with holder info
}

#[tokio::test]
async fn test_expired_lock_cleanup() {
    // Create lock with past expires_at
    // Run cleanup
    // Verify lock is released
}

#[tokio::test]
async fn test_only_holder_can_release() {
    // User A acquires, User B tries to release, fails
}
```

**Acceptance Criteria:**
- [ ] Test: successful acquire and release
- [ ] Test: concurrent acquire conflict
- [ ] Test: expired lock cleanup
- [ ] Test: non-holder release rejection
- [ ] Test: lock extension resets timer

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260219000001_create_entity_locks_table.sql` | Entity locks DDL |
| `migrations/20260219000002_create_user_presence_table.sql` | User presence DDL |
| `src/collab/mod.rs` | Collaboration module barrel file |
| `src/collab/lock_manager.rs` | Exclusive lock manager |
| `src/collab/lock_cleanup.rs` | Expired lock cleanup task |
| `src/collab/presence.rs` | In-memory presence store |
| `src/collab/ws_protocol.rs` | WebSocket message types |
| `src/ws/collab_handler.rs` | Collaboration WebSocket handling |
| `src/api/handlers/collab.rs` | Lock and presence API handlers |
| `frontend/src/components/collab/PresenceIndicator.tsx` | Presence UI |
| `frontend/src/components/collab/LockStatus.tsx` | Lock status UI |
| `frontend/src/hooks/usePresence.ts` | Presence hook |
| `frontend/src/hooks/useLock.ts` | Lock management hook |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: WebSocket `WsManager`, Axum server, Tokio runtime
- PRD-003: `AuthUser` for user identity in locks/presence
- PRD-010: Event bus for publishing lock/presence events

### New Infrastructure Needed
- No new Rust crates needed
- No new frontend dependencies

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2
2. Phase 2: Lock Manager — Tasks 2.1–2.2
3. Phase 3: Presence Service — Task 3.1
4. Phase 4: Collaboration API — Tasks 4.1–4.3

**MVP Success Criteria:**
- Exclusive locks acquired and released atomically
- Lock conflicts return holder info
- Expired locks cleaned up within 60 seconds
- Presence API shows who is viewing an entity

### Post-MVP Enhancements
1. Phase 3: Presence WebSocket Messages — Task 3.2
2. Phase 5: WebSocket Integration — Task 5.1
3. Phase 6: Frontend Components — Tasks 6.1–6.3
4. Phase 7: Integration Tests — Task 7.1

---

## Notes

1. **Lock durability:** Locks survive server restarts because they are in the database. In-memory presence is lost on restart but rebuilds as users reconnect and send presence.join messages.
2. **Lock extension:** The frontend should automatically extend the lock every `(lock_duration / 2)` minutes while the user is active (has focus on the locked entity). If the user loses focus or disconnects, the lock expires naturally.
3. **Heartbeat integration:** The PRD-002 WebSocket heartbeat (30s ping) also refreshes `user_presence.last_seen_at`. If heartbeats stop, presence is removed and locks are released by the cleanup task.
4. **Broadcast scoping:** Presence updates should only go to users viewing the same entity, not all connected users. This requires tracking which entities each WebSocket connection is subscribed to.
5. **Lock wait queue:** For MVP, users get a simple "locked by X" message. Post-MVP, a FIFO wait queue can notify the next user when the lock is released.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
