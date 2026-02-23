//! Character Settings Dashboard logic (PRD-108).
//!
//! Provides types, validation functions, JSON-merge helpers, and label
//! formatters for the unified character dashboard.  The `core` crate
//! contains no database dependencies; all data is passed in by the caller.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Known pipeline settings keys and their human-readable labels.
const KNOWN_SETTING_LABELS: &[(&str, &str)] = &[
    ("a2c4_model", "A2C4 Model"),
    ("elevenlabs_voice", "ElevenLabs Voice"),
    ("avatar_json", "Avatar JSON"),
    ("lora_model", "LoRA Model"),
    ("comfyui_workflow", "ComfyUI Workflow"),
];

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Logical sections of the character dashboard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DashboardSection {
    Identity,
    Images,
    Metadata,
    Settings,
    SceneAssignments,
    GenerationHistory,
}

/// Categories of missing configuration items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissingItemCategory {
    SourceImage,
    ApprovedVariant,
    MetadataComplete,
    PipelineSetting,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that a settings update payload is a non-null JSON object.
pub fn validate_settings_update(updates: &serde_json::Value) -> Result<(), String> {
    if updates.is_null() {
        return Err("Settings update must not be null".to_string());
    }
    if !updates.is_object() {
        return Err("Settings update must be a JSON object".to_string());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/// Shallow-merge `updates` into `existing`. Keys in `updates` overwrite
/// keys in `existing`; keys only in `existing` are preserved.
///
/// Both arguments must be JSON objects. Non-object inputs are returned as
/// `existing` unchanged.
pub fn merge_settings_json(
    existing: &serde_json::Value,
    updates: &serde_json::Value,
) -> serde_json::Value {
    let (Some(base), Some(patch)) = (existing.as_object(), updates.as_object()) else {
        return existing.clone();
    };

    let mut merged = base.clone();
    for (k, v) in patch {
        merged.insert(k.clone(), v.clone());
    }
    serde_json::Value::Object(merged)
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

/// Build a human-readable generation summary string.
///
/// Example: `"42 total (30 approved, 5 rejected, 7 pending)"`.
pub fn compute_generation_summary(
    total: i32,
    approved: i32,
    rejected: i32,
    pending: i32,
) -> String {
    format!(
        "{total} total ({approved} approved, {rejected} rejected, {pending} pending)"
    )
}

/// Convert a settings key to a human-readable label.
///
/// Looks up known keys first; falls back to replacing underscores with
/// spaces and title-casing the first letter.
pub fn build_missing_item_label(key: &str) -> String {
    for &(k, label) in KNOWN_SETTING_LABELS {
        if k == key {
            return label.to_string();
        }
    }
    // Fallback: replace underscores and title-case.
    let mut chars = key.replace('_', " ").chars().collect::<Vec<_>>();
    if let Some(first) = chars.first_mut() {
        *first = first.to_uppercase().next().unwrap_or(*first);
    }
    chars.into_iter().collect()
}

/// Build an action URL for a missing item.
pub fn build_action_url(character_id: i64, category: &MissingItemCategory) -> String {
    match category {
        MissingItemCategory::SourceImage => {
            format!("/characters/{character_id}/source-images")
        }
        MissingItemCategory::ApprovedVariant => {
            format!("/characters/{character_id}/image-variants")
        }
        MissingItemCategory::MetadataComplete => {
            format!("/characters/{character_id}/metadata")
        }
        MissingItemCategory::PipelineSetting => {
            format!("/characters/{character_id}/settings")
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- DashboardSection serialization -----------------------------------

    #[test]
    fn dashboard_section_serializes_snake_case() {
        let json = serde_json::to_string(&DashboardSection::Identity).unwrap();
        assert_eq!(json, "\"identity\"");
    }

    #[test]
    fn dashboard_section_images_serializes() {
        let json = serde_json::to_string(&DashboardSection::Images).unwrap();
        assert_eq!(json, "\"images\"");
    }

    #[test]
    fn dashboard_section_metadata_serializes() {
        let json = serde_json::to_string(&DashboardSection::Metadata).unwrap();
        assert_eq!(json, "\"metadata\"");
    }

    #[test]
    fn dashboard_section_settings_serializes() {
        let json = serde_json::to_string(&DashboardSection::Settings).unwrap();
        assert_eq!(json, "\"settings\"");
    }

    #[test]
    fn dashboard_section_scene_assignments_serializes() {
        let json = serde_json::to_string(&DashboardSection::SceneAssignments).unwrap();
        assert_eq!(json, "\"scene_assignments\"");
    }

    #[test]
    fn dashboard_section_generation_history_serializes() {
        let json = serde_json::to_string(&DashboardSection::GenerationHistory).unwrap();
        assert_eq!(json, "\"generation_history\"");
    }

    #[test]
    fn dashboard_section_round_trip() {
        let original = DashboardSection::SceneAssignments;
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: DashboardSection = serde_json::from_str(&json).unwrap();
        assert_eq!(original, deserialized);
    }

    // -- MissingItemCategory serialization --------------------------------

    #[test]
    fn missing_item_category_serializes_snake_case() {
        let json = serde_json::to_string(&MissingItemCategory::SourceImage).unwrap();
        assert_eq!(json, "\"source_image\"");
    }

    #[test]
    fn missing_item_category_pipeline_setting() {
        let json = serde_json::to_string(&MissingItemCategory::PipelineSetting).unwrap();
        assert_eq!(json, "\"pipeline_setting\"");
    }

    #[test]
    fn missing_item_category_round_trip() {
        let original = MissingItemCategory::MetadataComplete;
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: MissingItemCategory = serde_json::from_str(&json).unwrap();
        assert_eq!(original, deserialized);
    }

    // -- validate_settings_update ----------------------------------------

    #[test]
    fn validate_rejects_null() {
        let result = validate_settings_update(&serde_json::Value::Null);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("null"));
    }

    #[test]
    fn validate_rejects_string() {
        let val = serde_json::json!("not an object");
        assert!(validate_settings_update(&val).is_err());
    }

    #[test]
    fn validate_rejects_array() {
        let val = serde_json::json!([1, 2, 3]);
        assert!(validate_settings_update(&val).is_err());
    }

    #[test]
    fn validate_rejects_number() {
        let val = serde_json::json!(42);
        assert!(validate_settings_update(&val).is_err());
    }

    #[test]
    fn validate_accepts_empty_object() {
        let val = serde_json::json!({});
        assert!(validate_settings_update(&val).is_ok());
    }

    #[test]
    fn validate_accepts_object_with_keys() {
        let val = serde_json::json!({"a2c4_model": "model_v2"});
        assert!(validate_settings_update(&val).is_ok());
    }

    // -- merge_settings_json ---------------------------------------------

    #[test]
    fn merge_adds_new_keys() {
        let existing = serde_json::json!({"a": 1});
        let updates = serde_json::json!({"b": 2});
        let result = merge_settings_json(&existing, &updates);
        assert_eq!(result, serde_json::json!({"a": 1, "b": 2}));
    }

    #[test]
    fn merge_overwrites_existing_keys() {
        let existing = serde_json::json!({"a": 1, "b": 2});
        let updates = serde_json::json!({"b": 99});
        let result = merge_settings_json(&existing, &updates);
        assert_eq!(result, serde_json::json!({"a": 1, "b": 99}));
    }

    #[test]
    fn merge_empty_updates_preserves_existing() {
        let existing = serde_json::json!({"a": 1});
        let updates = serde_json::json!({});
        let result = merge_settings_json(&existing, &updates);
        assert_eq!(result, serde_json::json!({"a": 1}));
    }

    #[test]
    fn merge_non_object_existing_returns_existing() {
        let existing = serde_json::json!(42);
        let updates = serde_json::json!({"a": 1});
        let result = merge_settings_json(&existing, &updates);
        assert_eq!(result, serde_json::json!(42));
    }

    #[test]
    fn merge_non_object_updates_returns_existing() {
        let existing = serde_json::json!({"a": 1});
        let updates = serde_json::json!("not an object");
        let result = merge_settings_json(&existing, &updates);
        assert_eq!(result, serde_json::json!({"a": 1}));
    }

    // -- compute_generation_summary --------------------------------------

    #[test]
    fn generation_summary_format() {
        let s = compute_generation_summary(42, 30, 5, 7);
        assert_eq!(s, "42 total (30 approved, 5 rejected, 7 pending)");
    }

    #[test]
    fn generation_summary_all_zero() {
        let s = compute_generation_summary(0, 0, 0, 0);
        assert_eq!(s, "0 total (0 approved, 0 rejected, 0 pending)");
    }

    // -- build_missing_item_label ----------------------------------------

    #[test]
    fn label_known_key_a2c4_model() {
        assert_eq!(build_missing_item_label("a2c4_model"), "A2C4 Model");
    }

    #[test]
    fn label_known_key_elevenlabs_voice() {
        assert_eq!(
            build_missing_item_label("elevenlabs_voice"),
            "ElevenLabs Voice"
        );
    }

    #[test]
    fn label_known_key_avatar_json() {
        assert_eq!(build_missing_item_label("avatar_json"), "Avatar JSON");
    }

    #[test]
    fn label_unknown_key_title_cases() {
        assert_eq!(build_missing_item_label("custom_field"), "Custom field");
    }

    #[test]
    fn label_empty_key() {
        assert_eq!(build_missing_item_label(""), "");
    }

    // -- build_action_url ------------------------------------------------

    #[test]
    fn action_url_source_image() {
        let url = build_action_url(42, &MissingItemCategory::SourceImage);
        assert_eq!(url, "/characters/42/source-images");
    }

    #[test]
    fn action_url_approved_variant() {
        let url = build_action_url(42, &MissingItemCategory::ApprovedVariant);
        assert_eq!(url, "/characters/42/image-variants");
    }

    #[test]
    fn action_url_metadata_complete() {
        let url = build_action_url(42, &MissingItemCategory::MetadataComplete);
        assert_eq!(url, "/characters/42/metadata");
    }

    #[test]
    fn action_url_pipeline_setting() {
        let url = build_action_url(42, &MissingItemCategory::PipelineSetting);
        assert_eq!(url, "/characters/42/settings");
    }
}
