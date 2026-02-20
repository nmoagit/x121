//! Event and event-type entity models.

use serde::Serialize;
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `event_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EventType {
    pub id: DbId,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub is_critical: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `events` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Event {
    pub id: DbId,
    pub event_type_id: DbId,
    pub source_entity_type: Option<String>,
    pub source_entity_id: Option<DbId>,
    pub actor_user_id: Option<DbId>,
    pub payload: serde_json::Value,
    pub created_at: Timestamp,
}
