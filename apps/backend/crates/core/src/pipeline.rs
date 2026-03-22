//! Pipeline configuration types (PRD-138).
//!
//! Typed structs for the JSONB columns on the `pipelines` table:
//! `seed_slots`, `naming_rules`, and `delivery_config`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::CoreError;

/// A single seed-image slot that a pipeline requires per character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedSlot {
    /// Human-readable slot name (e.g. "front_clothed").
    pub name: String,
    /// Whether the slot must be filled before generation can start.
    pub required: bool,
    /// Optional description of what the slot is used for.
    #[serde(default)]
    pub description: String,
}

/// File-naming rules for a pipeline's generated outputs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineNamingRules {
    /// Template string for video filenames (e.g. "{character}_{scene}_{track}").
    pub video_template: String,
    /// Per-field prefix rules (e.g. "scene" -> "SC").
    #[serde(default)]
    pub prefix_rules: HashMap<String, String>,
    /// Suffix appended for transition segments.
    #[serde(default)]
    pub transition_suffix: String,
}

/// Delivery/export configuration for a pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDeliveryConfig {
    /// Template string for delivery archive names.
    pub archive_template: String,
    /// Folder structure pattern inside archives (e.g. "{character}/{scene}").
    #[serde(default)]
    pub folder_structure: String,
}

/// Validate that the provided image labels satisfy the pipeline's seed slot requirements.
///
/// Returns `Ok(())` if all required slots are covered.
/// Returns `Err` with a list of missing required slot names otherwise.
pub fn validate_seed_images(
    seed_slots: &[SeedSlot],
    provided_labels: &[String],
) -> Result<(), Vec<String>> {
    let missing: Vec<String> = seed_slots
        .iter()
        .filter(|slot| slot.required)
        .filter(|slot| !provided_labels.contains(&slot.name))
        .map(|slot| slot.name.clone())
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
}

/// Parse a `serde_json::Value` into a typed `Vec<SeedSlot>`.
pub fn parse_seed_slots(json: &serde_json::Value) -> Result<Vec<SeedSlot>, CoreError> {
    serde_json::from_value(json.clone())
        .map_err(|e| CoreError::Validation(format!("Invalid seed_slots JSON: {e}")))
}

/// Parse a `serde_json::Value` into a typed `PipelineNamingRules`.
pub fn parse_naming_rules(json: &serde_json::Value) -> Result<PipelineNamingRules, CoreError> {
    serde_json::from_value(json.clone())
        .map_err(|e| CoreError::Validation(format!("Invalid naming_rules JSON: {e}")))
}

/// Parse a `serde_json::Value` into a typed `PipelineDeliveryConfig`.
pub fn parse_delivery_config(
    json: &serde_json::Value,
) -> Result<PipelineDeliveryConfig, CoreError> {
    serde_json::from_value(json.clone())
        .map_err(|e| CoreError::Validation(format!("Invalid delivery_config JSON: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slot(name: &str, required: bool) -> SeedSlot {
        SeedSlot {
            name: name.to_string(),
            required,
            description: String::new(),
        }
    }

    #[test]
    fn all_required_slots_satisfied() {
        let slots = vec![slot("front_clothed", true), slot("front_topless", true)];
        let labels = vec!["front_clothed".to_string(), "front_topless".to_string()];
        assert!(validate_seed_images(&slots, &labels).is_ok());
    }

    #[test]
    fn missing_required_slot_returns_err() {
        let slots = vec![slot("front_clothed", true), slot("front_topless", true)];
        let labels = vec!["front_clothed".to_string()];
        let err = validate_seed_images(&slots, &labels).unwrap_err();
        assert_eq!(err, vec!["front_topless".to_string()]);
    }

    #[test]
    fn optional_slots_not_enforced() {
        let slots = vec![slot("front_clothed", true), slot("back_view", false)];
        let labels = vec!["front_clothed".to_string()];
        assert!(validate_seed_images(&slots, &labels).is_ok());
    }

    #[test]
    fn empty_slots_always_valid() {
        assert!(validate_seed_images(&[], &[]).is_ok());
    }

    #[test]
    fn extra_labels_ignored() {
        let slots = vec![slot("front_clothed", true)];
        let labels = vec![
            "front_clothed".to_string(),
            "extra_label".to_string(),
        ];
        assert!(validate_seed_images(&slots, &labels).is_ok());
    }
}
