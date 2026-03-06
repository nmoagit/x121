//! LLM-driven metadata refinement logic (PRD-125).
//!
//! Provides prompt construction, diff computation, and data structures for
//! the refinement pipeline. The actual LLM API call is performed at the API
//! layer (or a background worker) using an HTTP client — this module is
//! intentionally transport-agnostic.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

/// Refinement job status: waiting to be picked up.
pub const STATUS_QUEUED: &str = "queued";
/// Refinement job status: currently executing.
pub const STATUS_RUNNING: &str = "running";
/// Refinement job status: finished successfully.
pub const STATUS_COMPLETED: &str = "completed";
/// Refinement job status: finished with an error or rejection.
pub const STATUS_FAILED: &str = "failed";

// ---------------------------------------------------------------------------
// Change type constants
// ---------------------------------------------------------------------------

/// Change type: field was newly added.
pub const CHANGE_ADDED: &str = "added";
/// Change type: field was modified from a previous value.
pub const CHANGE_MODIFIED: &str = "modified";
/// Change type: field was removed.
pub const CHANGE_REMOVED: &str = "removed";
/// Change type: field was enriched by the LLM beyond source data.
pub const CHANGE_ENRICHED: &str = "enriched";

// ---------------------------------------------------------------------------
// Source constants
// ---------------------------------------------------------------------------

/// Source: field value was reformatted from the original data.
pub const SOURCE_FORMATTED: &str = "formatted";
/// Source: field value was normalized (e.g., capitalization, spelling).
pub const SOURCE_NORMALIZED: &str = "normalized";
/// Source: field value was enriched by the LLM.
pub const SOURCE_ENRICHED: &str = "enriched";
/// Source: field value was corrected by a script.
pub const SOURCE_SCRIPT_CORRECTED: &str = "script_corrected";

/// Configuration for the LLM refinement service.
#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub base_url: String,
    pub max_tokens: u32,
    pub temperature: f64,
}

/// Request to the LLM for metadata refinement.
#[derive(Debug, Serialize)]
pub struct RefinementRequest {
    pub character_name: String,
    pub bio_json: Option<serde_json::Value>,
    pub tov_json: Option<serde_json::Value>,
    pub metadata_template: serde_json::Value,
    pub enrich: bool,
}

/// A single field change in the refinement report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldChange {
    pub field: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    /// One of: "added", "modified", "removed", "enriched".
    pub change_type: String,
    /// One of: "formatted", "normalized", "enriched", "script_corrected".
    pub source: String,
}

/// Report from the LLM refinement process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefinementReport {
    pub changes: Vec<FieldChange>,
    pub iterations_count: u32,
    pub warnings: Vec<String>,
    pub enriched_field_count: u32,
}

/// Build the system prompt for the LLM refinement.
///
/// Instructs the LLM to format, normalize, and structure character metadata
/// according to the provided template schema. When `enrich` is true, the LLM
/// is allowed to fill gaps with plausible values.
pub fn build_system_prompt(template: &serde_json::Value, enrich: bool) -> String {
    let mut prompt = String::from(
        "You are a metadata refinement assistant. Your task is to format, normalize, and structure \
         character Bio and ToV (Tone of Voice) data into the canonical metadata schema.\n\n\
         Rules:\n\
         1. Map raw fields to the canonical schema keys provided.\n\
         2. Normalize values: proper capitalization, remove emojis, fix formatting.\n\
         3. Extract structured data from freeform text (e.g., age from birthday, nationality from bio).\n\
         4. Return ONLY valid JSON matching the schema. No explanations outside the JSON.\n",
    );
    if enrich {
        prompt.push_str(
            "\n5. If the provided data is sparse (many empty fields), use your knowledge to fill gaps \
             with plausible values. Mark any field you enriched beyond the source data by adding a \
             companion field `_enriched_{field_name}: true`.\n",
        );
    }
    prompt.push_str("\n\nTarget metadata schema:\n");
    prompt.push_str(&serde_json::to_string_pretty(template).unwrap_or_default());
    prompt
}

/// Build the user message for the LLM with bio/tov data.
pub fn build_user_message(request: &RefinementRequest) -> String {
    let mut msg = format!("Character: {}\n\n", request.character_name);
    if let Some(bio) = &request.bio_json {
        msg.push_str("## Bio Data\n```json\n");
        msg.push_str(&serde_json::to_string_pretty(bio).unwrap_or_default());
        msg.push_str("\n```\n\n");
    }
    if let Some(tov) = &request.tov_json {
        msg.push_str("## Tone of Voice Data\n```json\n");
        msg.push_str(&serde_json::to_string_pretty(tov).unwrap_or_default());
        msg.push_str("\n```\n\n");
    }
    msg.push_str("Please produce the refined metadata JSON conforming to the schema.");
    msg
}

/// Compare two metadata objects and produce a list of field changes.
///
/// Performs a shallow (top-level key) comparison. Internal keys starting
/// with `_` are skipped in the output but used to detect enrichment markers.
pub fn compute_diff(old: &serde_json::Value, new: &serde_json::Value) -> Vec<FieldChange> {
    let mut changes = Vec::new();
    let old_obj = old.as_object().cloned().unwrap_or_default();
    let new_obj = new.as_object().cloned().unwrap_or_default();

    // Check for added/modified fields
    for (key, new_val) in &new_obj {
        if key.starts_with('_') {
            continue;
        }
        let enriched_key = format!("_enriched_{key}");
        let is_enriched = new_obj
            .get(&enriched_key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        match old_obj.get(key) {
            None => {
                changes.push(FieldChange {
                    field: key.clone(),
                    old_value: None,
                    new_value: Some(new_val.clone()),
                    change_type: if is_enriched {
                        CHANGE_ENRICHED.into()
                    } else {
                        CHANGE_ADDED.into()
                    },
                    source: if is_enriched {
                        SOURCE_ENRICHED.into()
                    } else {
                        SOURCE_FORMATTED.into()
                    },
                });
            }
            Some(old_val) if old_val != new_val => {
                changes.push(FieldChange {
                    field: key.clone(),
                    old_value: Some(old_val.clone()),
                    new_value: Some(new_val.clone()),
                    change_type: CHANGE_MODIFIED.into(),
                    source: if is_enriched {
                        SOURCE_ENRICHED.into()
                    } else {
                        SOURCE_NORMALIZED.into()
                    },
                });
            }
            _ => {} // unchanged
        }
    }

    // Check for removed fields
    for (key, old_val) in &old_obj {
        if key.starts_with('_') {
            continue;
        }
        if !new_obj.contains_key(key) {
            changes.push(FieldChange {
                field: key.clone(),
                old_value: Some(old_val.clone()),
                new_value: None,
                change_type: CHANGE_REMOVED.into(),
                source: SOURCE_FORMATTED.into(),
            });
        }
    }

    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compute_diff_detects_added_fields() {
        let old = json!({});
        let new = json!({"name": "Alice"});
        let changes = compute_diff(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].field, "name");
        assert_eq!(changes[0].change_type, "added");
    }

    #[test]
    fn compute_diff_detects_modified_fields() {
        let old = json!({"name": "alice"});
        let new = json!({"name": "Alice"});
        let changes = compute_diff(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, "modified");
    }

    #[test]
    fn compute_diff_detects_removed_fields() {
        let old = json!({"name": "Alice", "age": 30});
        let new = json!({"name": "Alice"});
        let changes = compute_diff(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].field, "age");
        assert_eq!(changes[0].change_type, "removed");
    }

    #[test]
    fn compute_diff_detects_enriched_fields() {
        let old = json!({});
        let new = json!({"nationality": "American", "_enriched_nationality": true});
        let changes = compute_diff(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, "enriched");
        assert_eq!(changes[0].source, "enriched");
    }

    #[test]
    fn compute_diff_skips_internal_keys() {
        let old = json!({});
        let new = json!({"_internal": "test"});
        let changes = compute_diff(&old, &new);
        assert!(changes.is_empty());
    }

    #[test]
    fn build_system_prompt_includes_enrich_instruction() {
        let template = json!({"name": "", "age": 0});
        let prompt = build_system_prompt(&template, true);
        assert!(prompt.contains("enriched"));
        assert!(prompt.contains("_enriched_"));
    }

    #[test]
    fn build_system_prompt_excludes_enrich_when_disabled() {
        let template = json!({"name": ""});
        let prompt = build_system_prompt(&template, false);
        assert!(!prompt.contains("_enriched_"));
    }

    #[test]
    fn build_user_message_includes_bio_and_tov() {
        let req = RefinementRequest {
            character_name: "TestChar".into(),
            bio_json: Some(json!({"name": "Test"})),
            tov_json: Some(json!({"tone": "friendly"})),
            metadata_template: json!({}),
            enrich: false,
        };
        let msg = build_user_message(&req);
        assert!(msg.contains("TestChar"));
        assert!(msg.contains("Bio Data"));
        assert!(msg.contains("Tone of Voice Data"));
    }
}
