//! Trigger workflow business logic (PRD-97).
//!
//! Provides constants, evaluation functions, and result types for
//! job dependency chains and triggered workflows. This module has
//! zero database dependencies.

use serde::{Deserialize, Serialize};

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default maximum chain depth for triggered workflows.
pub const DEFAULT_MAX_CHAIN_DEPTH: u32 = 10;

/// Sequential execution mode identifier.
pub const EXECUTION_SEQUENTIAL: &str = "sequential";

/// Parallel execution mode identifier.
pub const EXECUTION_PARALLEL: &str = "parallel";

/// Result status: trigger fired successfully.
pub const RESULT_SUCCESS: &str = "success";

/// Result status: trigger execution failed.
pub const RESULT_FAILED: &str = "failed";

/// Result status: trigger was blocked.
pub const RESULT_BLOCKED: &str = "blocked";

/// Result status: dry-run simulation only.
pub const RESULT_DRY_RUN: &str = "dry_run";

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

/// Event type: entity completed successfully.
pub const EVENT_COMPLETED: &str = "completed";

/// Event type: entity was approved.
pub const EVENT_APPROVED: &str = "approved";

/// Event type: entity processing failed.
pub const EVENT_FAILED: &str = "failed";

// ---------------------------------------------------------------------------
// Entity type constants
// ---------------------------------------------------------------------------

/// Entity type: image variant.
pub const ENTITY_VARIANT: &str = "variant";

/// Entity type: scene.
pub const ENTITY_SCENE: &str = "scene";

/// Entity type: video segment.
pub const ENTITY_SEGMENT: &str = "segment";

/// Entity type: production run.
pub const ENTITY_PRODUCTION_RUN: &str = "production_run";

/// Valid event types for triggers.
pub const VALID_EVENT_TYPES: &[&str] = &[EVENT_COMPLETED, EVENT_APPROVED, EVENT_FAILED];

/// Valid entity types for triggers.
pub const VALID_ENTITY_TYPES: &[&str] = &[
    ENTITY_VARIANT,
    ENTITY_SCENE,
    ENTITY_SEGMENT,
    ENTITY_PRODUCTION_RUN,
];

/// Valid execution modes.
pub const VALID_EXECUTION_MODES: &[&str] = &[EXECUTION_SEQUENTIAL, EXECUTION_PARALLEL];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/// A single action to be executed when a trigger fires.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TriggerAction {
    /// The action identifier (e.g. "submit_job", "notify", "start_scene").
    pub action: String,
    /// Action-specific parameters.
    pub params: serde_json::Value,
}

/// Result of a dry-run simulation for a single trigger.
#[derive(Debug, Clone, Serialize)]
pub struct DryRunResult {
    pub trigger_id: DbId,
    pub trigger_name: String,
    pub actions: Vec<TriggerAction>,
    pub would_chain: bool,
    pub chain_depth: u32,
}

/// Result of evaluating whether a trigger should fire.
#[derive(Debug, Clone, PartialEq)]
pub enum TriggerCheckResult {
    /// Trigger should fire with the given actions.
    Fire(Vec<TriggerAction>),
    /// Trigger is blocked for the specified reason.
    Blocked { reason: String },
    /// Chain depth has been exceeded.
    DepthExceeded { depth: u32 },
    /// Trigger is disabled.
    Disabled,
    /// Trigger requires manual approval before firing.
    ApprovalRequired { trigger_id: DbId },
}

// ---------------------------------------------------------------------------
// Evaluation functions
// ---------------------------------------------------------------------------

/// Input parameters for trigger evaluation.
pub struct EvaluateTriggerInput<'a> {
    /// The event type that occurred.
    pub event_type: &'a str,
    /// The entity type the event relates to.
    pub entity_type: &'a str,
    /// The trigger's configured event type.
    pub trigger_event_type: &'a str,
    /// The trigger's configured entity type.
    pub trigger_entity_type: &'a str,
    /// Whether the trigger is currently enabled.
    pub trigger_enabled: bool,
    /// Whether the trigger requires manual approval.
    pub trigger_requires_approval: bool,
    /// The trigger's database ID.
    pub trigger_id: DbId,
    /// The current chain depth.
    pub current_depth: u32,
    /// The maximum allowed chain depth for this trigger.
    pub max_depth: u32,
    /// The actions to execute if the trigger fires.
    pub actions: Vec<TriggerAction>,
}

/// Evaluate whether a trigger should fire given the current event context.
///
/// Checks in order: enabled, event/entity type match, chain depth, approval.
/// Returns the appropriate `TriggerCheckResult`.
pub fn evaluate_trigger(input: EvaluateTriggerInput<'_>) -> TriggerCheckResult {
    if !input.trigger_enabled {
        return TriggerCheckResult::Disabled;
    }

    if input.event_type != input.trigger_event_type
        || input.entity_type != input.trigger_entity_type
    {
        return TriggerCheckResult::Blocked {
            reason: format!(
                "Event mismatch: expected {}/{}, got {}/{}",
                input.trigger_event_type,
                input.trigger_entity_type,
                input.event_type,
                input.entity_type,
            ),
        };
    }

    if input.current_depth >= input.max_depth {
        return TriggerCheckResult::DepthExceeded {
            depth: input.current_depth,
        };
    }

    if input.trigger_requires_approval {
        return TriggerCheckResult::ApprovalRequired {
            trigger_id: input.trigger_id,
        };
    }

    TriggerCheckResult::Fire(input.actions)
}

/// Check if all key-value pairs in `filter` exist with equal values in `data`.
///
/// Returns `true` if `filter` is null, empty, or not an object.
/// Returns `false` if `data` is not an object but `filter` has entries.
///
/// This is the shared implementation for both condition and scope evaluation.
fn json_kv_match(data: &serde_json::Value, filter: &serde_json::Value) -> bool {
    let filter_obj = match filter.as_object() {
        Some(obj) if !obj.is_empty() => obj,
        _ => return true,
    };

    let data_obj = match data.as_object() {
        Some(obj) => obj,
        None => return false,
    };

    for (key, expected_value) in filter_obj {
        match data_obj.get(key) {
            Some(actual_value) if actual_value == expected_value => {}
            _ => return false,
        }
    }

    true
}

/// Evaluate conditions against event data using simple key-value matching.
///
/// Each key in `conditions` must exist in `event_data` with an equal value.
/// Returns `true` if all conditions match (or if conditions is null/empty).
pub fn evaluate_conditions(event_data: &serde_json::Value, conditions: &serde_json::Value) -> bool {
    json_kv_match(event_data, conditions)
}

/// Evaluate scope filtering against event data.
///
/// Scope fields like `character_id` and `scene_type_id` must match if present.
/// Returns `true` if all scope fields match (or if scope is null/empty).
pub fn evaluate_scope(event_data: &serde_json::Value, scope: &serde_json::Value) -> bool {
    json_kv_match(event_data, scope)
}

/// Check if a given event type string is valid.
pub fn is_valid_event_type(event_type: &str) -> bool {
    VALID_EVENT_TYPES.contains(&event_type)
}

/// Check if a given entity type string is valid.
pub fn is_valid_entity_type(entity_type: &str) -> bool {
    VALID_ENTITY_TYPES.contains(&entity_type)
}

/// Check if a given execution mode string is valid.
pub fn is_valid_execution_mode(mode: &str) -> bool {
    VALID_EXECUTION_MODES.contains(&mode)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- Constants -----------------------------------------------------------

    #[test]
    fn default_max_chain_depth_is_10() {
        assert_eq!(DEFAULT_MAX_CHAIN_DEPTH, 10);
    }

    #[test]
    fn execution_mode_constants() {
        assert_eq!(EXECUTION_SEQUENTIAL, "sequential");
        assert_eq!(EXECUTION_PARALLEL, "parallel");
    }

    #[test]
    fn result_status_constants() {
        assert_eq!(RESULT_SUCCESS, "success");
        assert_eq!(RESULT_FAILED, "failed");
        assert_eq!(RESULT_BLOCKED, "blocked");
        assert_eq!(RESULT_DRY_RUN, "dry_run");
    }

    #[test]
    fn event_type_constants() {
        assert_eq!(EVENT_COMPLETED, "completed");
        assert_eq!(EVENT_APPROVED, "approved");
        assert_eq!(EVENT_FAILED, "failed");
    }

    #[test]
    fn entity_type_constants() {
        assert_eq!(ENTITY_VARIANT, "variant");
        assert_eq!(ENTITY_SCENE, "scene");
        assert_eq!(ENTITY_SEGMENT, "segment");
        assert_eq!(ENTITY_PRODUCTION_RUN, "production_run");
    }

    // -- is_valid_event_type -------------------------------------------------

    #[test]
    fn valid_event_types_accepted() {
        assert!(is_valid_event_type("completed"));
        assert!(is_valid_event_type("approved"));
        assert!(is_valid_event_type("failed"));
    }

    #[test]
    fn invalid_event_type_rejected() {
        assert!(!is_valid_event_type("started"));
        assert!(!is_valid_event_type(""));
        assert!(!is_valid_event_type("COMPLETED"));
    }

    // -- is_valid_entity_type ------------------------------------------------

    #[test]
    fn valid_entity_types_accepted() {
        assert!(is_valid_entity_type("variant"));
        assert!(is_valid_entity_type("scene"));
        assert!(is_valid_entity_type("segment"));
        assert!(is_valid_entity_type("production_run"));
    }

    #[test]
    fn invalid_entity_type_rejected() {
        assert!(!is_valid_entity_type("project"));
        assert!(!is_valid_entity_type(""));
    }

    // -- is_valid_execution_mode ---------------------------------------------

    #[test]
    fn valid_execution_modes_accepted() {
        assert!(is_valid_execution_mode("sequential"));
        assert!(is_valid_execution_mode("parallel"));
    }

    #[test]
    fn invalid_execution_mode_rejected() {
        assert!(!is_valid_execution_mode("batch"));
        assert!(!is_valid_execution_mode(""));
    }

    // -- evaluate_trigger: disabled ------------------------------------------

    fn make_input<'a>(
        event_type: &'a str,
        entity_type: &'a str,
        trigger_event_type: &'a str,
        trigger_entity_type: &'a str,
        enabled: bool,
        requires_approval: bool,
        trigger_id: DbId,
        current_depth: u32,
        max_depth: u32,
        actions: Vec<TriggerAction>,
    ) -> EvaluateTriggerInput<'a> {
        EvaluateTriggerInput {
            event_type,
            entity_type,
            trigger_event_type,
            trigger_entity_type,
            trigger_enabled: enabled,
            trigger_requires_approval: requires_approval,
            trigger_id,
            current_depth,
            max_depth,
            actions,
        }
    }

    #[test]
    fn disabled_trigger_returns_disabled() {
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "completed",
            "variant",
            false,
            false,
            1,
            0,
            10,
            vec![],
        ));
        assert_eq!(result, TriggerCheckResult::Disabled);
    }

    // -- evaluate_trigger: event mismatch ------------------------------------

    #[test]
    fn event_type_mismatch_returns_blocked() {
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "approved",
            "variant",
            true,
            false,
            1,
            0,
            10,
            vec![],
        ));
        match result {
            TriggerCheckResult::Blocked { reason } => {
                assert!(reason.contains("Event mismatch"));
            }
            other => panic!("Expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn entity_type_mismatch_returns_blocked() {
        let result = evaluate_trigger(make_input(
            "completed",
            "scene",
            "completed",
            "variant",
            true,
            false,
            1,
            0,
            10,
            vec![],
        ));
        match result {
            TriggerCheckResult::Blocked { reason } => {
                assert!(reason.contains("Event mismatch"));
            }
            other => panic!("Expected Blocked, got {other:?}"),
        }
    }

    // -- evaluate_trigger: depth exceeded ------------------------------------

    #[test]
    fn depth_at_max_returns_depth_exceeded() {
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "completed",
            "variant",
            true,
            false,
            1,
            10,
            10,
            vec![],
        ));
        assert_eq!(result, TriggerCheckResult::DepthExceeded { depth: 10 });
    }

    #[test]
    fn depth_above_max_returns_depth_exceeded() {
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "completed",
            "variant",
            true,
            false,
            1,
            15,
            10,
            vec![],
        ));
        assert_eq!(result, TriggerCheckResult::DepthExceeded { depth: 15 });
    }

    // -- evaluate_trigger: approval required ---------------------------------

    #[test]
    fn approval_required_returns_approval_required() {
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "completed",
            "variant",
            true,
            true,
            42,
            0,
            10,
            vec![],
        ));
        assert_eq!(
            result,
            TriggerCheckResult::ApprovalRequired { trigger_id: 42 }
        );
    }

    // -- evaluate_trigger: fire ----------------------------------------------

    #[test]
    fn matching_trigger_fires() {
        let actions = vec![TriggerAction {
            action: "submit_job".to_string(),
            params: json!({"workflow_id": 5}),
        }];
        let result = evaluate_trigger(make_input(
            "completed",
            "variant",
            "completed",
            "variant",
            true,
            false,
            1,
            0,
            10,
            actions.clone(),
        ));
        assert_eq!(result, TriggerCheckResult::Fire(actions));
    }

    #[test]
    fn fire_at_depth_below_max() {
        let actions = vec![TriggerAction {
            action: "notify".to_string(),
            params: json!({}),
        }];
        let result = evaluate_trigger(make_input(
            "approved",
            "scene",
            "approved",
            "scene",
            true,
            false,
            1,
            9,
            10,
            actions.clone(),
        ));
        assert_eq!(result, TriggerCheckResult::Fire(actions));
    }

    // -- evaluate_conditions -------------------------------------------------

    #[test]
    fn empty_conditions_always_match() {
        let data = json!({"status": "done"});
        assert!(evaluate_conditions(&data, &json!({})));
    }

    #[test]
    fn null_conditions_always_match() {
        let data = json!({"status": "done"});
        assert!(evaluate_conditions(&data, &serde_json::Value::Null));
    }

    #[test]
    fn matching_conditions_return_true() {
        let data = json!({"status": "done", "quality": "high"});
        let conditions = json!({"status": "done"});
        assert!(evaluate_conditions(&data, &conditions));
    }

    #[test]
    fn multi_key_conditions_all_must_match() {
        let data = json!({"status": "done", "quality": "high"});
        let conditions = json!({"status": "done", "quality": "high"});
        assert!(evaluate_conditions(&data, &conditions));
    }

    #[test]
    fn mismatched_value_returns_false() {
        let data = json!({"status": "pending"});
        let conditions = json!({"status": "done"});
        assert!(!evaluate_conditions(&data, &conditions));
    }

    #[test]
    fn missing_key_in_data_returns_false() {
        let data = json!({"other": "value"});
        let conditions = json!({"status": "done"});
        assert!(!evaluate_conditions(&data, &conditions));
    }

    #[test]
    fn non_object_data_with_conditions_returns_false() {
        let data = json!("just a string");
        let conditions = json!({"status": "done"});
        assert!(!evaluate_conditions(&data, &conditions));
    }

    #[test]
    fn non_object_conditions_treated_as_empty() {
        let data = json!({"status": "done"});
        assert!(evaluate_conditions(&data, &json!("not an object")));
    }

    // -- evaluate_scope ------------------------------------------------------

    #[test]
    fn empty_scope_always_matches() {
        let data = json!({"character_id": 42});
        assert!(evaluate_scope(&data, &json!({})));
    }

    #[test]
    fn null_scope_always_matches() {
        let data = json!({"character_id": 42});
        assert!(evaluate_scope(&data, &serde_json::Value::Null));
    }

    #[test]
    fn matching_scope_character_id() {
        let data = json!({"character_id": 42, "scene_type_id": 7});
        let scope = json!({"character_id": 42});
        assert!(evaluate_scope(&data, &scope));
    }

    #[test]
    fn matching_scope_multiple_fields() {
        let data = json!({"character_id": 42, "scene_type_id": 7});
        let scope = json!({"character_id": 42, "scene_type_id": 7});
        assert!(evaluate_scope(&data, &scope));
    }

    #[test]
    fn mismatched_scope_returns_false() {
        let data = json!({"character_id": 42});
        let scope = json!({"character_id": 99});
        assert!(!evaluate_scope(&data, &scope));
    }

    #[test]
    fn missing_scope_key_in_data_returns_false() {
        let data = json!({"other_id": 42});
        let scope = json!({"character_id": 42});
        assert!(!evaluate_scope(&data, &scope));
    }

    #[test]
    fn non_object_data_with_scope_returns_false() {
        let data = json!(123);
        let scope = json!({"character_id": 42});
        assert!(!evaluate_scope(&data, &scope));
    }
}
