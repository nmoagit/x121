//! Centralized prompt resolution engine (PRD-115).
//!
//! Resolves prompt slots through a seven-layer hierarchy:
//! 1. **Workflow default** -- `workflow_prompt_slots.default_text`
//! 2. **Scene-type override** -- `scene_type_prompt_defaults.prompt_text` (wins if set)
//! 2b. **Full text override** -- `override_text` from project/group/avatar (most specific wins, replaces base entirely)
//! 3. **Placeholder substitution** -- `{avatar_name}`, `{hair_color}`, etc.
//! 4. **Project-level fragments** -- `project_prompt_overrides.fragments` (append)
//! 5. **Group-level fragments** -- `group_prompt_overrides.fragments` (append, after project)
//! 6. **Avatar-level fragments** -- `avatar_scene_prompt_overrides.fragments` (append, after group)
//!
//! Reuses [`crate::scene_type_config::resolve_prompt_template`] for placeholder
//! substitution to avoid duplicating regex logic.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::scene_type_config::resolve_prompt_template;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default separator used when joining fragment texts onto the base prompt.
pub const DEFAULT_FRAGMENT_SEPARATOR: &str = ", ";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Source tracking for the resolved prompt text.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PromptSource {
    /// Text came from the workflow slot's `default_text`.
    WorkflowDefault,
    /// Text was overridden by a scene-type prompt default.
    SceneTypeDefault,
    /// Text was fully replaced by an `override_text` from project/group/avatar.
    FullOverride,
    /// Fragments were appended to the base text.
    WithFragments,
}

/// Information about an applied fragment.
#[derive(Debug, Clone, Serialize)]
pub struct FragmentInfo {
    /// The database ID of the fragment, if it came from `prompt_fragments`.
    pub fragment_id: Option<i64>,
    /// The resolved text of the fragment.
    pub text: String,
    /// `true` when the fragment was specified inline rather than by reference.
    pub is_inline: bool,
}

/// A single fragment entry from the JSONB array stored in
/// `avatar_scene_prompt_overrides.fragments`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FragmentEntry {
    /// `"fragment_ref"` (references `prompt_fragments` table) or `"inline"`.
    #[serde(rename = "type")]
    pub entry_type: String,
    /// Present when `entry_type == "fragment_ref"`.
    pub fragment_id: Option<i64>,
    /// The literal text of the fragment (or the resolved text of the ref).
    pub text: String,
}

/// Input: a prompt slot from the workflow.
#[derive(Debug, Clone)]
pub struct PromptSlotInput {
    pub slot_id: i64,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    /// `"positive"` or `"negative"`.
    pub slot_type: String,
    pub default_text: Option<String>,
    pub is_user_editable: bool,
}

/// Output: a fully resolved prompt slot.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedPromptSlot {
    pub slot_id: i64,
    pub node_id: String,
    pub input_name: String,
    pub slot_label: String,
    pub slot_type: String,
    pub resolved_text: String,
    pub source: PromptSource,
    pub unresolved_placeholders: Vec<String>,
    pub applied_fragments: Vec<FragmentInfo>,
}

// ---------------------------------------------------------------------------
// Core resolution
// ---------------------------------------------------------------------------

/// Resolve all prompt slots for a given context.
///
/// # Arguments
///
/// * `prompt_slots` -- all slots from the workflow.
/// * `scene_type_defaults` -- map of `slot_id -> prompt_text` from
///   `scene_type_prompt_defaults`.
/// * `avatar_metadata` -- map of placeholder key -> value from avatar
///   metadata (e.g. `avatar_name -> "Chloe"`).
/// * `project_fragment_overrides` -- map of `slot_id -> ordered fragments` from
///   `project_prompt_overrides` (broadest scope).
/// * `group_fragment_overrides` -- map of `slot_id -> ordered fragments` from
///   `group_prompt_overrides` (mid scope).
/// * `avatar_fragment_overrides` -- map of `slot_id -> ordered fragments` from
///   `avatar_scene_prompt_overrides` (narrowest scope).
/// * `fragment_separator` -- separator for joining fragments (defaults to
///   [`DEFAULT_FRAGMENT_SEPARATOR`]).
pub fn resolve_prompts(
    prompt_slots: &[PromptSlotInput],
    scene_type_defaults: &HashMap<i64, String>,
    avatar_metadata: &HashMap<String, String>,
    project_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    group_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    avatar_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    fragment_separator: Option<&str>,
) -> Vec<ResolvedPromptSlot> {
    resolve_prompts_with_overrides(
        prompt_slots,
        scene_type_defaults,
        avatar_metadata,
        project_fragment_overrides,
        group_fragment_overrides,
        avatar_fragment_overrides,
        &HashMap::new(),
        &HashMap::new(),
        &HashMap::new(),
        fragment_separator,
    )
}

/// Like [`resolve_prompts`] but also accepts full-text override maps.
///
/// When `override_text` is set at any level, the most specific one
/// (avatar > group > project) replaces the base prompt entirely.
/// Fragments still append on top.
pub fn resolve_prompts_with_overrides(
    prompt_slots: &[PromptSlotInput],
    scene_type_defaults: &HashMap<i64, String>,
    avatar_metadata: &HashMap<String, String>,
    project_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    group_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    avatar_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    project_override_texts: &HashMap<i64, String>,
    group_override_texts: &HashMap<i64, String>,
    avatar_override_texts: &HashMap<i64, String>,
    fragment_separator: Option<&str>,
) -> Vec<ResolvedPromptSlot> {
    let separator = fragment_separator.unwrap_or(DEFAULT_FRAGMENT_SEPARATOR);

    prompt_slots
        .iter()
        .map(|slot| {
            resolve_single_slot(
                slot,
                scene_type_defaults,
                avatar_metadata,
                project_fragment_overrides,
                group_fragment_overrides,
                avatar_fragment_overrides,
                project_override_texts,
                group_override_texts,
                avatar_override_texts,
                separator,
            )
        })
        .collect()
}

/// Resolve a single prompt slot through the hierarchy.
fn resolve_single_slot(
    slot: &PromptSlotInput,
    scene_type_defaults: &HashMap<i64, String>,
    avatar_metadata: &HashMap<String, String>,
    project_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    group_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    avatar_fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    project_override_texts: &HashMap<i64, String>,
    group_override_texts: &HashMap<i64, String>,
    avatar_override_texts: &HashMap<i64, String>,
    separator: &str,
) -> ResolvedPromptSlot {
    // Layer 1 & 2: Pick base text (workflow default or scene-type default).
    let (mut base_text, mut base_source) = pick_base_text(slot, scene_type_defaults);

    // Layer 2b: Full-text override — most specific level wins.
    // Avatar > Group > Project precedence.
    if let Some(text) = avatar_override_texts.get(&slot.slot_id) {
        base_text = text.clone();
        base_source = PromptSource::FullOverride;
    } else if let Some(text) = group_override_texts.get(&slot.slot_id) {
        base_text = text.clone();
        base_source = PromptSource::FullOverride;
    } else if let Some(text) = project_override_texts.get(&slot.slot_id) {
        base_text = text.clone();
        base_source = PromptSource::FullOverride;
    }

    // Layer 3: Resolve placeholders in base text.
    let resolved_base = resolve_prompt_template(&base_text, avatar_metadata);

    // Layers 4-6: Append fragments in order: project -> group -> avatar.
    let override_layers = [
        project_fragment_overrides,
        group_fragment_overrides,
        avatar_fragment_overrides,
    ];

    let mut current_text = resolved_base.text;
    let mut current_source = base_source;
    let mut all_applied_fragments = Vec::new();

    for layer in &override_layers {
        let (text, source, fragments) = apply_fragments(
            &current_text,
            current_source.clone(),
            slot.slot_id,
            layer,
            avatar_metadata,
            separator,
        );
        current_text = text;
        current_source = source;
        all_applied_fragments.extend(fragments);
    }

    // Collect all unresolved placeholders from the final text.
    let unresolved =
        resolve_prompt_template(&current_text, avatar_metadata).unresolved_placeholders;

    ResolvedPromptSlot {
        slot_id: slot.slot_id,
        node_id: slot.node_id.clone(),
        input_name: slot.input_name.clone(),
        slot_label: slot.slot_label.clone(),
        slot_type: slot.slot_type.clone(),
        resolved_text: current_text,
        source: current_source,
        unresolved_placeholders: unresolved,
        applied_fragments: all_applied_fragments,
    }
}

/// Pick the base text for a slot: scene-type default wins over workflow default.
fn pick_base_text(
    slot: &PromptSlotInput,
    scene_type_defaults: &HashMap<i64, String>,
) -> (String, PromptSource) {
    if let Some(scene_text) = scene_type_defaults.get(&slot.slot_id) {
        (scene_text.clone(), PromptSource::SceneTypeDefault)
    } else {
        let text = slot.default_text.clone().unwrap_or_default();
        (text, PromptSource::WorkflowDefault)
    }
}

/// Resolve placeholders in each fragment text, append to the base, and track
/// fragment info.
fn apply_fragments(
    resolved_base: &str,
    base_source: PromptSource,
    slot_id: i64,
    fragment_overrides: &HashMap<i64, Vec<FragmentEntry>>,
    avatar_metadata: &HashMap<String, String>,
    separator: &str,
) -> (String, PromptSource, Vec<FragmentInfo>) {
    let fragments = match fragment_overrides.get(&slot_id) {
        Some(entries) if !entries.is_empty() => entries,
        _ => return (resolved_base.to_string(), base_source, Vec::new()),
    };

    let mut applied = Vec::with_capacity(fragments.len());
    let mut fragment_texts = Vec::with_capacity(fragments.len());

    for entry in fragments {
        let resolved = resolve_prompt_template(&entry.text, avatar_metadata);
        let is_inline = entry.entry_type == "inline";

        applied.push(FragmentInfo {
            fragment_id: entry.fragment_id,
            text: resolved.text.clone(),
            is_inline,
        });
        fragment_texts.push(resolved.text);
    }

    let suffix = fragment_texts.join(separator);
    let final_text = if resolved_base.is_empty() {
        suffix
    } else {
        format!("{resolved_base}{separator}{suffix}")
    };

    (final_text, PromptSource::WithFragments, applied)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to build a basic slot.
    fn make_slot(slot_id: i64, default_text: Option<&str>) -> PromptSlotInput {
        PromptSlotInput {
            slot_id,
            node_id: format!("node_{slot_id}"),
            input_name: format!("input_{slot_id}"),
            slot_label: format!("Slot {slot_id}"),
            slot_type: "positive".to_string(),
            default_text: default_text.map(|s| s.to_string()),
            is_user_editable: true,
        }
    }

    // -- 1. Workflow default only --

    #[test]
    fn test_workflow_default_only() {
        let slots = vec![make_slot(1, Some("a beautiful landscape"))];
        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].resolved_text, "a beautiful landscape");
        assert_eq!(result[0].source, PromptSource::WorkflowDefault);
        assert!(result[0].unresolved_placeholders.is_empty());
        assert!(result[0].applied_fragments.is_empty());
    }

    // -- 2. Scene-type override --

    #[test]
    fn test_scene_type_override() {
        let slots = vec![make_slot(1, Some("workflow default"))];
        let scene_defaults = HashMap::from([(1, "scene type override".to_string())]);

        let result = resolve_prompts(
            &slots,
            &scene_defaults,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result[0].resolved_text, "scene type override");
        assert_eq!(result[0].source, PromptSource::SceneTypeDefault);
    }

    // -- 3. Placeholder substitution --

    #[test]
    fn test_placeholder_substitution() {
        let slots = vec![make_slot(
            1,
            Some("photo of {avatar_name} with {hair_color} hair"),
        )];
        let metadata = HashMap::from([
            ("avatar_name".to_string(), "Chloe".to_string()),
            ("hair_color".to_string(), "blonde".to_string()),
        ]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result[0].resolved_text, "photo of Chloe with blonde hair");
        assert!(result[0].unresolved_placeholders.is_empty());
    }

    // -- 4. Fragment append --

    #[test]
    fn test_fragment_append() {
        let slots = vec![make_slot(1, Some("base prompt"))];
        let fragments = HashMap::from([(
            1_i64,
            vec![
                FragmentEntry {
                    entry_type: "fragment_ref".to_string(),
                    fragment_id: Some(100),
                    text: "cinematic lighting".to_string(),
                },
                FragmentEntry {
                    entry_type: "inline".to_string(),
                    fragment_id: None,
                    text: "bokeh background".to_string(),
                },
            ],
        )]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            None,
        );

        assert_eq!(
            result[0].resolved_text,
            "base prompt, cinematic lighting, bokeh background"
        );
        assert_eq!(result[0].source, PromptSource::WithFragments);
        assert_eq!(result[0].applied_fragments.len(), 2);
        assert_eq!(result[0].applied_fragments[0].fragment_id, Some(100));
        assert!(!result[0].applied_fragments[0].is_inline);
        assert!(result[0].applied_fragments[1].is_inline);
        assert_eq!(result[0].applied_fragments[1].text, "bokeh background");
    }

    // -- 5. Fragment with placeholders --

    #[test]
    fn test_fragment_with_placeholders() {
        let slots = vec![make_slot(1, Some("portrait of {avatar_name}"))];
        let metadata = HashMap::from([
            ("avatar_name".to_string(), "Chloe".to_string()),
            ("hair_color".to_string(), "red".to_string()),
        ]);
        let fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "{hair_color} hair flowing".to_string(),
            }],
        )]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            None,
        );

        assert_eq!(
            result[0].resolved_text,
            "portrait of Chloe, red hair flowing"
        );
        assert!(result[0].unresolved_placeholders.is_empty());
    }

    // -- 6. Unresolved placeholders --

    #[test]
    fn test_unresolved_placeholders() {
        let slots = vec![make_slot(
            1,
            Some("photo of {avatar_name} in {unknown_key}"),
        )];
        let metadata = HashMap::from([("avatar_name".to_string(), "Chloe".to_string())]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result[0].resolved_text, "photo of Chloe in {unknown_key}");
        assert_eq!(result[0].unresolved_placeholders, vec!["unknown_key"]);
    }

    // -- 7. Multiple slots with different sources --

    #[test]
    fn test_multiple_slots() {
        let slots = vec![
            make_slot(1, Some("workflow text")),
            make_slot(2, Some("another default")),
            make_slot(3, None),
        ];
        let scene_defaults = HashMap::from([(2, "scene override for slot 2".to_string())]);
        let fragments = HashMap::from([(
            3_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "fragment on empty slot".to_string(),
            }],
        )]);

        let result = resolve_prompts(
            &slots,
            &scene_defaults,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            None,
        );

        assert_eq!(result.len(), 3);

        // Slot 1: workflow default
        assert_eq!(result[0].resolved_text, "workflow text");
        assert_eq!(result[0].source, PromptSource::WorkflowDefault);

        // Slot 2: scene-type override
        assert_eq!(result[1].resolved_text, "scene override for slot 2");
        assert_eq!(result[1].source, PromptSource::SceneTypeDefault);

        // Slot 3: empty base + fragment
        assert_eq!(result[2].resolved_text, "fragment on empty slot");
        assert_eq!(result[2].source, PromptSource::WithFragments);
    }

    // -- 8. Empty inputs --

    #[test]
    fn test_empty_inputs() {
        let result = resolve_prompts(
            &[],
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );
        assert!(result.is_empty());
    }

    // -- 9. Non-editable slot still resolves --

    #[test]
    fn test_non_editable_slot() {
        let mut slot = make_slot(1, Some("system prompt with {avatar_name}"));
        slot.is_user_editable = false;

        let metadata = HashMap::from([("avatar_name".to_string(), "Chloe".to_string())]);
        let result = resolve_prompts(
            &[slot],
            &HashMap::new(),
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result[0].resolved_text, "system prompt with Chloe");
        assert!(result[0].unresolved_placeholders.is_empty());
    }

    // -- 10. Custom fragment separator --

    #[test]
    fn test_fragment_separator_custom() {
        let slots = vec![make_slot(1, Some("base"))];
        let fragments = HashMap::from([(
            1_i64,
            vec![
                FragmentEntry {
                    entry_type: "inline".to_string(),
                    fragment_id: None,
                    text: "frag_a".to_string(),
                },
                FragmentEntry {
                    entry_type: "inline".to_string(),
                    fragment_id: None,
                    text: "frag_b".to_string(),
                },
            ],
        )]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            Some(" | "),
        );

        assert_eq!(result[0].resolved_text, "base | frag_a | frag_b");
    }

    // -- Edge cases --

    #[test]
    fn test_no_default_text_and_no_override() {
        let slots = vec![make_slot(1, None)];
        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            None,
        );

        assert_eq!(result[0].resolved_text, "");
        assert_eq!(result[0].source, PromptSource::WorkflowDefault);
    }

    #[test]
    fn test_scene_default_with_placeholders_and_fragments() {
        let slots = vec![make_slot(1, Some("ignored workflow default"))];
        let scene_defaults = HashMap::from([(1, "scene {avatar_name}".to_string())]);
        let metadata = HashMap::from([("avatar_name".to_string(), "Alice".to_string())]);
        let fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "fragment_ref".to_string(),
                fragment_id: Some(42),
                text: "extra detail".to_string(),
            }],
        )]);

        let result = resolve_prompts(
            &slots,
            &scene_defaults,
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            None,
        );

        assert_eq!(result[0].resolved_text, "scene Alice, extra detail");
        assert_eq!(result[0].source, PromptSource::WithFragments);
        assert!(result[0].unresolved_placeholders.is_empty());
        assert_eq!(result[0].applied_fragments.len(), 1);
    }

    #[test]
    fn test_empty_fragment_list_preserves_source() {
        let slots = vec![make_slot(1, Some("base text"))];
        let fragments = HashMap::from([(1_i64, Vec::new())]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &fragments,
            None,
        );

        // Empty fragment list should not change source to WithFragments
        assert_eq!(result[0].source, PromptSource::WorkflowDefault);
        assert_eq!(result[0].resolved_text, "base text");
    }

    // -- Multi-level resolution --

    #[test]
    fn test_multi_level_resolution() {
        let slots = vec![make_slot(1, Some("base prompt"))];

        let project_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "project style".to_string(),
            }],
        )]);

        let group_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "group tone".to_string(),
            }],
        )]);

        let avatar_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "fragment_ref".to_string(),
                fragment_id: Some(99),
                text: "avatar detail".to_string(),
            }],
        )]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &project_fragments,
            &group_fragments,
            &avatar_fragments,
            None,
        );

        assert_eq!(
            result[0].resolved_text,
            "base prompt, project style, group tone, avatar detail"
        );
        assert_eq!(result[0].source, PromptSource::WithFragments);
        assert_eq!(result[0].applied_fragments.len(), 3);
        assert_eq!(result[0].applied_fragments[0].text, "project style");
        assert_eq!(result[0].applied_fragments[1].text, "group tone");
        assert_eq!(result[0].applied_fragments[2].text, "avatar detail");
        assert_eq!(result[0].applied_fragments[2].fragment_id, Some(99));
    }

    #[test]
    fn test_partial_level_resolution() {
        let slots = vec![make_slot(1, Some("base"))];

        // Only project and avatar levels, no group.
        let project_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "proj".to_string(),
            }],
        )]);

        let avatar_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "char".to_string(),
            }],
        )]);

        let result = resolve_prompts(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &project_fragments,
            &HashMap::new(),
            &avatar_fragments,
            None,
        );

        assert_eq!(result[0].resolved_text, "base, proj, char");
        assert_eq!(result[0].applied_fragments.len(), 2);
    }

    // -- Full override tests --

    #[test]
    fn test_full_override_replaces_base() {
        let slots = vec![make_slot(1, Some("original base prompt"))];
        let avatar_overrides = HashMap::from([(1_i64, "completely new prompt".to_string())]);

        let result = resolve_prompts_with_overrides(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &avatar_overrides,
            None,
        );

        assert_eq!(result[0].resolved_text, "completely new prompt");
        assert_eq!(result[0].source, PromptSource::FullOverride);
    }

    #[test]
    fn test_full_override_with_fragments() {
        let slots = vec![make_slot(1, Some("original base"))];
        let avatar_overrides = HashMap::from([(1_i64, "overridden base".to_string())]);
        let avatar_fragments = HashMap::from([(
            1_i64,
            vec![FragmentEntry {
                entry_type: "inline".to_string(),
                fragment_id: None,
                text: "extra detail".to_string(),
            }],
        )]);

        let result = resolve_prompts_with_overrides(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &avatar_fragments,
            &HashMap::new(),
            &HashMap::new(),
            &avatar_overrides,
            None,
        );

        assert_eq!(result[0].resolved_text, "overridden base, extra detail");
        assert_eq!(result[0].source, PromptSource::WithFragments);
    }

    #[test]
    fn test_avatar_override_wins_over_project() {
        let slots = vec![make_slot(1, Some("workflow default"))];
        let project_overrides = HashMap::from([(1_i64, "project override".to_string())]);
        let avatar_overrides = HashMap::from([(1_i64, "avatar override".to_string())]);

        let result = resolve_prompts_with_overrides(
            &slots,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &project_overrides,
            &HashMap::new(),
            &avatar_overrides,
            None,
        );

        assert_eq!(result[0].resolved_text, "avatar override");
        assert_eq!(result[0].source, PromptSource::FullOverride);
    }

    #[test]
    fn test_full_override_with_placeholders() {
        let slots = vec![make_slot(1, Some("ignored"))];
        let metadata = HashMap::from([("avatar_name".to_string(), "Alice".to_string())]);
        let avatar_overrides =
            HashMap::from([(1_i64, "{avatar_name} wearing jeans".to_string())]);

        let result = resolve_prompts_with_overrides(
            &slots,
            &HashMap::new(),
            &metadata,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &avatar_overrides,
            None,
        );

        assert_eq!(result[0].resolved_text, "Alice wearing jeans");
    }
}
