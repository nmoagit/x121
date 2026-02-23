//! System integrity constants, validation, and health assessment (PRD-43).
//!
//! Provides scan-type constants, model-type constants, repair action
//! constants, validation helpers, and a simple health assessment function.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Scan type constants
// ---------------------------------------------------------------------------

/// Scan only model files.
pub const SCAN_TYPE_MODELS: &str = "models";
/// Scan only custom nodes.
pub const SCAN_TYPE_NODES: &str = "nodes";
/// Full system scan (models + nodes).
pub const SCAN_TYPE_FULL: &str = "full";

/// All valid scan types.
pub const VALID_SCAN_TYPES: &[&str] = &[SCAN_TYPE_MODELS, SCAN_TYPE_NODES, SCAN_TYPE_FULL];

// ---------------------------------------------------------------------------
// Health status constants
// ---------------------------------------------------------------------------

/// All components healthy — no missing or corrupted items.
pub const HEALTH_HEALTHY: &str = "healthy";
/// Non-critical issues — some items missing but none corrupted.
pub const HEALTH_WARNING: &str = "warning";
/// Critical issues — corrupted models detected.
pub const HEALTH_CRITICAL: &str = "critical";

// ---------------------------------------------------------------------------
// Model type constants
// ---------------------------------------------------------------------------

pub const MODEL_TYPE_CHECKPOINT: &str = "checkpoint";
pub const MODEL_TYPE_LORA: &str = "lora";
pub const MODEL_TYPE_CONTROLNET: &str = "controlnet";
pub const MODEL_TYPE_VAE: &str = "vae";
pub const MODEL_TYPE_EMBEDDING: &str = "embedding";

/// All valid model types.
pub const VALID_MODEL_TYPES: &[&str] = &[
    MODEL_TYPE_CHECKPOINT,
    MODEL_TYPE_LORA,
    MODEL_TYPE_CONTROLNET,
    MODEL_TYPE_VAE,
    MODEL_TYPE_EMBEDDING,
];

// ---------------------------------------------------------------------------
// Repair action constants
// ---------------------------------------------------------------------------

/// Sync missing models from a source.
pub const REPAIR_SYNC_MODELS: &str = "sync_models";
/// Install missing custom nodes.
pub const REPAIR_INSTALL_NODES: &str = "install_nodes";
/// Full verify and repair pass.
pub const REPAIR_FULL: &str = "full_verify_repair";

/// All valid repair actions.
pub const VALID_REPAIR_ACTIONS: &[&str] =
    &[REPAIR_SYNC_MODELS, REPAIR_INSTALL_NODES, REPAIR_FULL];

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that a scan type string is one of the known types.
pub fn validate_scan_type(st: &str) -> Result<(), CoreError> {
    if VALID_SCAN_TYPES.contains(&st) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown scan type: '{st}'. Valid types: {}",
            VALID_SCAN_TYPES.join(", ")
        )))
    }
}

/// Validate that a model type string is one of the known types.
pub fn validate_model_type(mt: &str) -> Result<(), CoreError> {
    if VALID_MODEL_TYPES.contains(&mt) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown model type: '{mt}'. Valid types: {}",
            VALID_MODEL_TYPES.join(", ")
        )))
    }
}

/// Validate that a repair action string is one of the known actions.
pub fn validate_repair_action(action: &str) -> Result<(), CoreError> {
    if VALID_REPAIR_ACTIONS.contains(&action) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown repair action: '{action}'. Valid actions: {}",
            VALID_REPAIR_ACTIONS.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Health assessment
// ---------------------------------------------------------------------------

/// A single health category with its assessment status and details.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthCategory {
    pub name: String,
    pub status: String,
    pub details: Vec<String>,
}

/// Assess the overall health status based on scan result counts.
///
/// Returns:
/// - `HEALTH_HEALTHY` if all counts are zero
/// - `HEALTH_CRITICAL` if any models are corrupted
/// - `HEALTH_WARNING` if models or nodes are missing but none corrupted
pub fn assess_health(models_missing: i32, models_corrupted: i32, nodes_missing: i32) -> String {
    if models_corrupted > 0 {
        HEALTH_CRITICAL.to_string()
    } else if models_missing > 0 || nodes_missing > 0 {
        HEALTH_WARNING.to_string()
    } else {
        HEALTH_HEALTHY.to_string()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_scan_type ---------------------------------------------------

    #[test]
    fn valid_scan_types_accepted() {
        assert!(validate_scan_type("models").is_ok());
        assert!(validate_scan_type("nodes").is_ok());
        assert!(validate_scan_type("full").is_ok());
    }

    #[test]
    fn invalid_scan_type_rejected() {
        assert!(validate_scan_type("unknown").is_err());
        assert!(validate_scan_type("").is_err());
    }

    // -- validate_model_type --------------------------------------------------

    #[test]
    fn valid_model_types_accepted() {
        assert!(validate_model_type("checkpoint").is_ok());
        assert!(validate_model_type("lora").is_ok());
        assert!(validate_model_type("controlnet").is_ok());
        assert!(validate_model_type("vae").is_ok());
        assert!(validate_model_type("embedding").is_ok());
    }

    #[test]
    fn invalid_model_type_rejected() {
        assert!(validate_model_type("diffuser").is_err());
        assert!(validate_model_type("").is_err());
    }

    // -- validate_repair_action -----------------------------------------------

    #[test]
    fn valid_repair_actions_accepted() {
        assert!(validate_repair_action("sync_models").is_ok());
        assert!(validate_repair_action("install_nodes").is_ok());
        assert!(validate_repair_action("full_verify_repair").is_ok());
    }

    #[test]
    fn invalid_repair_action_rejected() {
        assert!(validate_repair_action("reboot").is_err());
        assert!(validate_repair_action("").is_err());
    }

    // -- assess_health --------------------------------------------------------

    #[test]
    fn healthy_when_all_zero() {
        assert_eq!(assess_health(0, 0, 0), HEALTH_HEALTHY);
    }

    #[test]
    fn warning_when_models_missing() {
        assert_eq!(assess_health(2, 0, 0), HEALTH_WARNING);
    }

    #[test]
    fn warning_when_nodes_missing() {
        assert_eq!(assess_health(0, 0, 3), HEALTH_WARNING);
    }

    #[test]
    fn critical_when_models_corrupted() {
        assert_eq!(assess_health(0, 1, 0), HEALTH_CRITICAL);
    }

    #[test]
    fn critical_overrides_warning() {
        assert_eq!(assess_health(5, 2, 3), HEALTH_CRITICAL);
    }

    // -- HealthCategory struct ------------------------------------------------

    #[test]
    fn health_category_construction() {
        let cat = HealthCategory {
            name: "Models".to_string(),
            status: HEALTH_HEALTHY.to_string(),
            details: vec!["All 42 models verified".to_string()],
        };
        assert_eq!(cat.name, "Models");
        assert_eq!(cat.status, HEALTH_HEALTHY);
        assert_eq!(cat.details.len(), 1);
    }
}
