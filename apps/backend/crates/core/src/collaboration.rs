//! Real-time collaboration constants, types, and validation (PRD-11).
//!
//! This module lives in `core` (zero internal deps) so that the API/repository
//! layer, WebSocket handlers, and any future worker tooling can all reference
//! the same lock durations, entity/lock types, and message protocol.

use serde::{Deserialize, Serialize};

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Lock duration constants
// ---------------------------------------------------------------------------

/// Default lock duration in minutes (30 minutes).
pub const DEFAULT_LOCK_DURATION_MINS: i64 = 30;

/// Maximum allowed lock duration in minutes (4 hours).
pub const MAX_LOCK_DURATION_MINS: i64 = 240;

/// Minimum lock duration in minutes (1 minute).
pub const MIN_LOCK_DURATION_MINS: i64 = 1;

/// How often the stale-lock cleanup task runs (in seconds).
pub const LOCK_CLEANUP_INTERVAL_SECS: u64 = 60;

// ---------------------------------------------------------------------------
// Presence constants
// ---------------------------------------------------------------------------

/// Presence entries older than this many seconds are considered stale.
pub const PRESENCE_STALE_TIMEOUT_SECS: i64 = 120;

// ---------------------------------------------------------------------------
// Entity types (the things that can be locked / have presence)
// ---------------------------------------------------------------------------

/// Known entity types for locking and presence.
pub mod entity_types {
    pub const SCENE: &str = "scene";
    pub const SEGMENT: &str = "segment";
    pub const CHARACTER: &str = "character";
    pub const PROJECT: &str = "project";
}

/// The set of all valid entity types for collaboration.
pub const VALID_ENTITY_TYPES: &[&str] = &[
    entity_types::SCENE,
    entity_types::SEGMENT,
    entity_types::CHARACTER,
    entity_types::PROJECT,
];

/// Returns `true` if the given entity type is valid for collaboration.
pub fn is_valid_entity_type(entity_type: &str) -> bool {
    VALID_ENTITY_TYPES.contains(&entity_type)
}

// ---------------------------------------------------------------------------
// Lock types
// ---------------------------------------------------------------------------

/// Known lock types.
pub mod lock_types {
    /// Only one user can hold the lock at a time.
    pub const EXCLUSIVE: &str = "exclusive";
}

/// The set of all valid lock types.
pub const VALID_LOCK_TYPES: &[&str] = &[lock_types::EXCLUSIVE];

/// Returns `true` if the given lock type is valid.
pub fn is_valid_lock_type(lock_type: &str) -> bool {
    VALID_LOCK_TYPES.contains(&lock_type)
}

// ---------------------------------------------------------------------------
// Collaboration WebSocket message protocol
// ---------------------------------------------------------------------------

/// Messages exchanged over WebSocket for real-time collaboration.
///
/// Serialized as JSON with an internally-tagged `"type"` discriminator so
/// that the frontend can route messages by type string.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum CollabMessage {
    /// Client sends: user is now viewing this entity.
    #[serde(rename = "presence.join")]
    PresenceJoin {
        entity_type: String,
        entity_id: DbId,
    },

    /// Client sends: user is no longer viewing this entity.
    #[serde(rename = "presence.leave")]
    PresenceLeave {
        entity_type: String,
        entity_id: DbId,
    },

    /// Server broadcasts: updated list of users viewing an entity.
    #[serde(rename = "presence.update")]
    PresenceUpdate {
        entity_type: String,
        entity_id: DbId,
        users: Vec<PresenceUser>,
    },

    /// Server broadcasts: a lock was acquired on an entity.
    #[serde(rename = "lock.acquired")]
    LockAcquired {
        entity_type: String,
        entity_id: DbId,
        user_id: DbId,
    },

    /// Server broadcasts: a lock was released on an entity.
    #[serde(rename = "lock.released")]
    LockReleased {
        entity_type: String,
        entity_id: DbId,
    },

    /// Server sends to the requesting client: lock acquisition denied.
    #[serde(rename = "lock.denied")]
    LockDenied {
        entity_type: String,
        entity_id: DbId,
        holder_user_id: DbId,
        expires_at: String,
    },
}

/// A user entry in a presence update broadcast.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PresenceUser {
    pub user_id: DbId,
    pub last_seen_at: String,
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate a lock duration in minutes. Returns `Ok(())` or an error message.
pub fn validate_lock_duration(minutes: i64) -> Result<(), String> {
    if minutes < MIN_LOCK_DURATION_MINS {
        return Err(format!(
            "Lock duration must be at least {MIN_LOCK_DURATION_MINS} minute(s), got {minutes}"
        ));
    }
    if minutes > MAX_LOCK_DURATION_MINS {
        return Err(format!(
            "Lock duration must be at most {MAX_LOCK_DURATION_MINS} minutes, got {minutes}"
        ));
    }
    Ok(())
}

/// Validate that both entity_type and entity_id are acceptable.
pub fn validate_entity_ref(entity_type: &str, entity_id: DbId) -> Result<(), String> {
    if !is_valid_entity_type(entity_type) {
        return Err(format!(
            "Invalid entity_type '{entity_type}'. Must be one of: {}",
            VALID_ENTITY_TYPES.join(", ")
        ));
    }
    if entity_id <= 0 {
        return Err(format!("entity_id must be positive, got {entity_id}"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Entity type validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_valid_entity_types() {
        assert!(is_valid_entity_type("scene"));
        assert!(is_valid_entity_type("segment"));
        assert!(is_valid_entity_type("character"));
        assert!(is_valid_entity_type("project"));
    }

    #[test]
    fn test_invalid_entity_types() {
        assert!(!is_valid_entity_type(""));
        assert!(!is_valid_entity_type("unknown"));
        assert!(!is_valid_entity_type("SCENE"));
        assert!(!is_valid_entity_type("Scene"));
    }

    // -----------------------------------------------------------------------
    // Lock type validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_valid_lock_types() {
        assert!(is_valid_lock_type("exclusive"));
    }

    #[test]
    fn test_invalid_lock_types() {
        assert!(!is_valid_lock_type(""));
        assert!(!is_valid_lock_type("shared"));
        assert!(!is_valid_lock_type("EXCLUSIVE"));
    }

    // -----------------------------------------------------------------------
    // Lock duration validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_valid_lock_durations() {
        assert!(validate_lock_duration(1).is_ok());
        assert!(validate_lock_duration(30).is_ok());
        assert!(validate_lock_duration(240).is_ok());
    }

    #[test]
    fn test_lock_duration_too_short() {
        let result = validate_lock_duration(0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least"));
    }

    #[test]
    fn test_lock_duration_too_long() {
        let result = validate_lock_duration(241);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at most"));
    }

    #[test]
    fn test_lock_duration_negative() {
        assert!(validate_lock_duration(-5).is_err());
    }

    // -----------------------------------------------------------------------
    // Entity ref validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_valid_entity_ref() {
        assert!(validate_entity_ref("scene", 1).is_ok());
        assert!(validate_entity_ref("segment", 42).is_ok());
    }

    #[test]
    fn test_invalid_entity_type_in_ref() {
        let result = validate_entity_ref("unknown", 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid entity_type"));
    }

    #[test]
    fn test_zero_entity_id() {
        let result = validate_entity_ref("scene", 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("positive"));
    }

    #[test]
    fn test_negative_entity_id() {
        let result = validate_entity_ref("scene", -1);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // CollabMessage serialization round-trip
    // -----------------------------------------------------------------------

    #[test]
    fn test_presence_join_serialization() {
        let msg = CollabMessage::PresenceJoin {
            entity_type: "scene".to_string(),
            entity_id: 42,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"presence.join"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn test_presence_leave_serialization() {
        let msg = CollabMessage::PresenceLeave {
            entity_type: "segment".to_string(),
            entity_id: 7,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"presence.leave"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn test_presence_update_serialization() {
        let msg = CollabMessage::PresenceUpdate {
            entity_type: "scene".to_string(),
            entity_id: 1,
            users: vec![PresenceUser {
                user_id: 10,
                last_seen_at: "2026-02-21T00:00:00Z".to_string(),
            }],
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"presence.update"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn test_lock_acquired_serialization() {
        let msg = CollabMessage::LockAcquired {
            entity_type: "scene".to_string(),
            entity_id: 5,
            user_id: 99,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"lock.acquired"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn test_lock_released_serialization() {
        let msg = CollabMessage::LockReleased {
            entity_type: "scene".to_string(),
            entity_id: 5,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"lock.released"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    #[test]
    fn test_lock_denied_serialization() {
        let msg = CollabMessage::LockDenied {
            entity_type: "scene".to_string(),
            entity_id: 5,
            holder_user_id: 42,
            expires_at: "2026-02-21T01:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"lock.denied"#));

        let deserialized: CollabMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }

    // -----------------------------------------------------------------------
    // Constants sanity checks
    // -----------------------------------------------------------------------

    #[test]
    fn test_default_lock_duration_in_valid_range() {
        assert!(validate_lock_duration(DEFAULT_LOCK_DURATION_MINS).is_ok());
    }

    #[test]
    fn test_presence_stale_timeout_is_positive() {
        assert!(PRESENCE_STALE_TIMEOUT_SECS > 0);
    }

    #[test]
    fn test_lock_cleanup_interval_is_positive() {
        assert!(LOCK_CLEANUP_INTERVAL_SECS > 0);
    }
}
