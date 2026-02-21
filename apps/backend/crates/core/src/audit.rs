//! Audit logging constants and utility functions (PRD-45).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future worker or CLI tooling.

use crate::hashing;

// ---------------------------------------------------------------------------
// Action type constants
// ---------------------------------------------------------------------------

/// Known action types for audit log entries.
pub mod action_types {
    pub const LOGIN: &str = "login";
    pub const LOGOUT: &str = "logout";
    pub const JOB_SUBMIT: &str = "job_submit";
    pub const APPROVE: &str = "approve";
    pub const REJECT: &str = "reject";
    pub const CONFIG_CHANGE: &str = "config_change";
    pub const ENTITY_CREATE: &str = "entity_create";
    pub const ENTITY_UPDATE: &str = "entity_update";
    pub const ENTITY_DELETE: &str = "entity_delete";
    pub const SYSTEM: &str = "system";
}

// ---------------------------------------------------------------------------
// Log category constants
// ---------------------------------------------------------------------------

/// Known log categories for retention policy grouping.
pub mod log_categories {
    pub const AUTHENTICATION: &str = "authentication";
    pub const OPERATIONS: &str = "operations";
    pub const CONFIGURATION: &str = "configuration";
    pub const SYSTEM: &str = "system";
}

// ---------------------------------------------------------------------------
// Action-to-category mapping
// ---------------------------------------------------------------------------

/// Map an action type to its log category.
///
/// Returns the appropriate category for retention policy purposes.
/// Unknown action types default to `"operations"`.
pub fn action_to_category(action_type: &str) -> &'static str {
    match action_type {
        action_types::LOGIN | action_types::LOGOUT => log_categories::AUTHENTICATION,
        action_types::CONFIG_CHANGE => log_categories::CONFIGURATION,
        action_types::SYSTEM => log_categories::SYSTEM,
        // All other actions (job_submit, approve, reject, entity CRUD, etc.)
        _ => log_categories::OPERATIONS,
    }
}

// ---------------------------------------------------------------------------
// Integrity hash computation
// ---------------------------------------------------------------------------

/// Known seed value for the first entry in the hash chain.
const CHAIN_SEED: &str = "AUDIT_LOG_CHAIN_SEED_V1";

/// Compute the SHA-256 integrity hash for an audit log entry.
///
/// `prev_hash` is the integrity_hash of the previous entry, or `None` for the
/// first entry in the chain (which uses a known seed value).
///
/// `entry_data` is a canonical string representation of the entry's content
/// (typically the JSON-serialized entry fields).
pub fn compute_integrity_hash(prev_hash: Option<&str>, entry_data: &str) -> String {
    let prev = prev_hash.unwrap_or(CHAIN_SEED);
    let combined = format!("{prev}|{entry_data}");
    hashing::sha256_hex(combined.as_bytes())
}

// ---------------------------------------------------------------------------
// Sensitive field redaction
// ---------------------------------------------------------------------------

/// Fields that should be redacted from audit log details before storage.
pub const SENSITIVE_FIELDS: &[&str] = &[
    "password",
    "token",
    "secret",
    "access_token",
    "refresh_token",
    "api_key",
    "private_key",
    "authorization",
    "credential",
    "session_token",
];

/// Redact sensitive fields from a JSON value (shallow -- top-level keys only).
///
/// Replaces the value of any key matching [`SENSITIVE_FIELDS`] with `"[REDACTED]"`.
/// Returns a new `serde_json::Value` with redactions applied.
pub fn redact_sensitive_fields(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut redacted = serde_json::Map::new();
            for (key, val) in map {
                let lower_key = key.to_lowercase();
                if SENSITIVE_FIELDS.iter().any(|f| lower_key.contains(f)) {
                    redacted.insert(
                        key.clone(),
                        serde_json::Value::String("[REDACTED]".to_string()),
                    );
                } else {
                    redacted.insert(key.clone(), redact_sensitive_fields(val));
                }
            }
            serde_json::Value::Object(redacted)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(redact_sensitive_fields).collect())
        }
        other => other.clone(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // action_to_category mapping
    // -----------------------------------------------------------------------

    #[test]
    fn login_maps_to_authentication() {
        assert_eq!(action_to_category(action_types::LOGIN), log_categories::AUTHENTICATION);
    }

    #[test]
    fn logout_maps_to_authentication() {
        assert_eq!(action_to_category(action_types::LOGOUT), log_categories::AUTHENTICATION);
    }

    #[test]
    fn config_change_maps_to_configuration() {
        assert_eq!(
            action_to_category(action_types::CONFIG_CHANGE),
            log_categories::CONFIGURATION,
        );
    }

    #[test]
    fn system_maps_to_system() {
        assert_eq!(action_to_category(action_types::SYSTEM), log_categories::SYSTEM);
    }

    #[test]
    fn job_submit_maps_to_operations() {
        assert_eq!(action_to_category(action_types::JOB_SUBMIT), log_categories::OPERATIONS);
    }

    #[test]
    fn entity_create_maps_to_operations() {
        assert_eq!(action_to_category(action_types::ENTITY_CREATE), log_categories::OPERATIONS);
    }

    #[test]
    fn unknown_action_maps_to_operations() {
        assert_eq!(action_to_category("some_unknown_action"), log_categories::OPERATIONS);
    }

    // -----------------------------------------------------------------------
    // Integrity hash computation
    // -----------------------------------------------------------------------

    #[test]
    fn first_entry_uses_seed() {
        let hash = compute_integrity_hash(None, "test_data");
        assert!(!hash.is_empty());
        // SHA-256 hex digest is always 64 characters.
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn chained_entry_uses_previous_hash() {
        let first = compute_integrity_hash(None, "entry_1");
        let second = compute_integrity_hash(Some(&first), "entry_2");
        assert_ne!(first, second);
        assert_eq!(second.len(), 64);
    }

    #[test]
    fn same_input_produces_same_hash() {
        let a = compute_integrity_hash(None, "same_data");
        let b = compute_integrity_hash(None, "same_data");
        assert_eq!(a, b);
    }

    #[test]
    fn different_data_produces_different_hash() {
        let a = compute_integrity_hash(None, "data_a");
        let b = compute_integrity_hash(None, "data_b");
        assert_ne!(a, b);
    }

    #[test]
    fn different_prev_hash_produces_different_result() {
        let a = compute_integrity_hash(Some("hash_a"), "same_data");
        let b = compute_integrity_hash(Some("hash_b"), "same_data");
        assert_ne!(a, b);
    }

    // -----------------------------------------------------------------------
    // Sensitive field redaction
    // -----------------------------------------------------------------------

    #[test]
    fn redacts_password_field() {
        let input = serde_json::json!({"username": "alice", "password": "s3cret"});
        let result = redact_sensitive_fields(&input);
        assert_eq!(result["username"], "alice");
        assert_eq!(result["password"], "[REDACTED]");
    }

    #[test]
    fn redacts_token_field() {
        let input = serde_json::json!({"access_token": "abc123", "data": "visible"});
        let result = redact_sensitive_fields(&input);
        assert_eq!(result["access_token"], "[REDACTED]");
        assert_eq!(result["data"], "visible");
    }

    #[test]
    fn handles_nested_objects() {
        let input = serde_json::json!({"outer": {"secret_key": "hidden", "name": "test"}});
        let result = redact_sensitive_fields(&input);
        assert_eq!(result["outer"]["secret_key"], "[REDACTED]");
        assert_eq!(result["outer"]["name"], "test");
    }

    #[test]
    fn handles_arrays() {
        let input = serde_json::json!([{"token": "hidden"}, {"data": "visible"}]);
        let result = redact_sensitive_fields(&input);
        assert_eq!(result[0]["token"], "[REDACTED]");
        assert_eq!(result[1]["data"], "visible");
    }

    #[test]
    fn non_object_values_unchanged() {
        let input = serde_json::json!("plain_string");
        let result = redact_sensitive_fields(&input);
        assert_eq!(result, "plain_string");
    }
}
