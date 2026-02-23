//! Character readiness cache model (PRD-107).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `character_readiness_cache` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CharacterReadinessCache {
    pub character_id: DbId,
    pub state: String,
    pub missing_items: serde_json::Value,
    pub readiness_pct: i32,
    pub computed_at: Timestamp,
}

/// DTO for upserting a readiness cache entry.
#[derive(Debug, Deserialize)]
pub struct UpsertReadinessCache {
    pub character_id: DbId,
    pub state: String,
    pub missing_items: serde_json::Value,
    pub readiness_pct: i32,
}
