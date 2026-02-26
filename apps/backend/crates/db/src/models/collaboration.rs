//! Entity lock and user presence models and DTOs (PRD-11).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// EntityLock
// ---------------------------------------------------------------------------

/// A row from the `entity_locks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EntityLock {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub user_id: DbId,
    pub lock_type: String,
    pub acquired_at: Timestamp,
    pub expires_at: Timestamp,
    pub released_at: Option<Timestamp>,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for acquiring a lock.
#[derive(Debug, Deserialize)]
pub struct AcquireLockRequest {
    pub entity_type: String,
    pub entity_id: DbId,
}

/// DTO for releasing or extending a lock.
#[derive(Debug, Deserialize)]
pub struct LockActionRequest {
    pub entity_type: String,
    pub entity_id: DbId,
}

// ---------------------------------------------------------------------------
// UserPresence
// ---------------------------------------------------------------------------

/// A row from the `user_presence` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserPresence {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub last_seen_at: Timestamp,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
