//! Media resolution engine for dynamic generation seeds (PRD-146).
//!
//! Resolves workflow media slots to concrete file paths using a priority chain:
//! 1. Scene-type-specific assignment (most specific)
//! 2. Avatar-level default assignment (fallback)
//! 3. Slot-level fallback (use_default / skip_node)
//!
//! This module lives in `core` and has **zero DB dependencies**. Callers
//! convert DB models into the `*Input` structs before calling [`resolve_media_slots`].

use std::collections::HashMap;

use serde::Serialize;

use crate::types::DbId;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/// A fully resolved media slot ready for injection into a ComfyUI workflow.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedMediaSlot {
    /// Internal ID of the workflow_media_slot row.
    pub slot_id: DbId,
    /// ComfyUI node ID in the workflow JSON (e.g. "10").
    pub node_id: String,
    /// Input field name on the node (e.g. "image").
    pub input_name: String,
    /// Human-readable label (e.g. "Front Clothed Seed").
    pub slot_label: String,
    /// Media type (e.g. "image", "video").
    pub media_type: String,
    /// ComfyUI class type (e.g. "LoadImage").
    pub class_type: String,
    /// Absolute file path to the resolved media file.
    pub file_path: String,
    /// How this slot was resolved.
    pub source: MediaSource,
    /// Whether this slot is a passthrough (output from another track).
    pub is_passthrough: bool,
    /// If passthrough, which track provides the media.
    pub passthrough_track_id: Option<DbId>,
}

/// Describes how a media slot was resolved.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum MediaSource {
    /// Resolved via a scene-type-specific assignment.
    SceneTypeOverride,
    /// Resolved via an avatar-level default assignment (scene_type_id IS NULL).
    AvatarDefault,
    /// Resolved via the slot's fallback_value.
    Fallback,
}

/// A slot that could not be resolved and is required.
#[derive(Debug, Clone, Serialize)]
pub struct UnresolvedSlot {
    /// Internal ID of the workflow_media_slot row.
    pub slot_id: DbId,
    /// Human-readable label.
    pub slot_label: String,
    /// Media type.
    pub media_type: String,
}

// ---------------------------------------------------------------------------
// Input types (mirror DB models without DB dependency)
// ---------------------------------------------------------------------------

/// A workflow media slot definition (mirrors `workflow_media_slots` row).
#[derive(Debug, Clone)]
pub struct MediaSlotInput {
    pub id: DbId,
    pub node_id: String,
    pub input_name: String,
    pub class_type: String,
    pub slot_label: String,
    pub media_type: String,
    pub is_required: bool,
    pub fallback_mode: Option<String>,
    pub fallback_value: Option<String>,
}

/// An avatar media assignment (mirrors `avatar_media_assignments` row).
#[derive(Debug, Clone)]
pub struct MediaAssignmentInput {
    pub media_slot_id: DbId,
    pub scene_type_id: Option<DbId>,
    pub media_variant_id: Option<DbId>,
    pub file_path: Option<String>,
    pub is_passthrough: bool,
    pub passthrough_track_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Fallback mode constants
// ---------------------------------------------------------------------------

/// Fallback mode: use the slot's `fallback_value` as the file path.
const FALLBACK_USE_DEFAULT: &str = "use_default";

/// Fallback mode: skip the node entirely (omit from resolved output).
const FALLBACK_SKIP_NODE: &str = "skip_node";

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

/// Resolve all media slots to concrete file paths.
///
/// For each slot, the resolution priority is:
/// 1. Scene-type-specific assignment (`scene_type_id` matches)
/// 2. Avatar-level default assignment (`scene_type_id` is `None`)
/// 3. Slot-level fallback (`fallback_mode` = "use_default" with `fallback_value`)
/// 4. Slot-level skip (`fallback_mode` = "skip_node" — omitted from output)
///
/// If a required slot cannot be resolved, it is added to the unresolved list.
///
/// `media_variant_paths` maps `image_variant.id` -> `file_path` for resolving
/// assignments that reference an image variant rather than a direct file path.
///
/// Returns `Ok(resolved)` when all required slots are satisfied, or
/// `Err(unresolved)` listing the slots that could not be filled.
pub fn resolve_media_slots(
    media_slots: &[MediaSlotInput],
    avatar_assignments: &[MediaAssignmentInput],
    scene_type_id: DbId,
    media_variant_paths: &HashMap<DbId, String>,
) -> Result<Vec<ResolvedMediaSlot>, Vec<UnresolvedSlot>> {
    let mut resolved = Vec::with_capacity(media_slots.len());
    let mut unresolved = Vec::new();

    for slot in media_slots {
        if let Some(r) =
            try_resolve_slot(slot, avatar_assignments, scene_type_id, media_variant_paths)
        {
            resolved.push(r);
        } else if slot.is_required {
            unresolved.push(UnresolvedSlot {
                slot_id: slot.id,
                slot_label: slot.slot_label.clone(),
                media_type: slot.media_type.clone(),
            });
        }
        // If not required and not resolved, it is simply omitted.
    }

    if unresolved.is_empty() {
        Ok(resolved)
    } else {
        Err(unresolved)
    }
}

/// Try to resolve a single slot. Returns `None` if no resolution was found
/// (and the slot should either be flagged as unresolved or silently skipped).
fn try_resolve_slot(
    slot: &MediaSlotInput,
    assignments: &[MediaAssignmentInput],
    scene_type_id: DbId,
    variant_paths: &HashMap<DbId, String>,
) -> Option<ResolvedMediaSlot> {
    // Priority 1: scene-type-specific assignment.
    if let Some(a) = find_assignment(assignments, slot.id, Some(scene_type_id)) {
        if let Some(resolved) =
            assignment_to_resolved(slot, a, MediaSource::SceneTypeOverride, variant_paths)
        {
            return Some(resolved);
        }
    }

    // Priority 2: avatar-level default (scene_type_id IS NULL).
    if let Some(a) = find_assignment(assignments, slot.id, None) {
        if let Some(resolved) =
            assignment_to_resolved(slot, a, MediaSource::AvatarDefault, variant_paths)
        {
            return Some(resolved);
        }
    }

    // Priority 3: slot-level fallback.
    match slot.fallback_mode.as_deref() {
        Some(FALLBACK_USE_DEFAULT) => {
            let fallback_path = slot.fallback_value.as_ref()?;
            if fallback_path.is_empty() {
                return None;
            }
            Some(ResolvedMediaSlot {
                slot_id: slot.id,
                node_id: slot.node_id.clone(),
                input_name: slot.input_name.clone(),
                slot_label: slot.slot_label.clone(),
                media_type: slot.media_type.clone(),
                class_type: slot.class_type.clone(),
                file_path: fallback_path.clone(),
                source: MediaSource::Fallback,
                is_passthrough: false,
                passthrough_track_id: None,
            })
        }
        Some(FALLBACK_SKIP_NODE) => {
            // Explicitly skip — return None so the slot is omitted.
            None
        }
        _ => None,
    }
}

/// Find the first assignment matching a slot and optional scene type.
fn find_assignment(
    assignments: &[MediaAssignmentInput],
    slot_id: DbId,
    scene_type_id: Option<DbId>,
) -> Option<&MediaAssignmentInput> {
    assignments
        .iter()
        .find(|a| a.media_slot_id == slot_id && a.scene_type_id == scene_type_id)
}

/// Convert an assignment into a resolved slot, resolving media_variant_id if needed.
fn assignment_to_resolved(
    slot: &MediaSlotInput,
    assignment: &MediaAssignmentInput,
    source: MediaSource,
    variant_paths: &HashMap<DbId, String>,
) -> Option<ResolvedMediaSlot> {
    // Resolve file path: prefer media_variant_id lookup, fall back to direct file_path.
    let file_path = if let Some(variant_id) = assignment.media_variant_id {
        variant_paths.get(&variant_id)?.clone()
    } else {
        assignment.file_path.clone()?
    };

    if file_path.is_empty() {
        return None;
    }

    Some(ResolvedMediaSlot {
        slot_id: slot.id,
        node_id: slot.node_id.clone(),
        input_name: slot.input_name.clone(),
        slot_label: slot.slot_label.clone(),
        media_type: slot.media_type.clone(),
        class_type: slot.class_type.clone(),
        file_path,
        source,
        is_passthrough: assignment.is_passthrough,
        passthrough_track_id: assignment.passthrough_track_id,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_slot(id: DbId, label: &str, required: bool) -> MediaSlotInput {
        MediaSlotInput {
            id,
            node_id: id.to_string(),
            input_name: "image".to_string(),
            class_type: "LoadImage".to_string(),
            slot_label: label.to_string(),
            media_type: "image".to_string(),
            is_required: required,
            fallback_mode: None,
            fallback_value: None,
        }
    }

    fn make_assignment(
        slot_id: DbId,
        scene_type_id: Option<DbId>,
        variant_id: Option<DbId>,
        file_path: Option<&str>,
    ) -> MediaAssignmentInput {
        MediaAssignmentInput {
            media_slot_id: slot_id,
            scene_type_id,
            media_variant_id: variant_id,
            file_path: file_path.map(|s| s.to_string()),
            is_passthrough: false,
            passthrough_track_id: None,
        }
    }

    #[test]
    fn resolves_scene_type_override_first() {
        let slots = vec![make_slot(1, "Front Clothed", true)];
        let assignments = vec![
            make_assignment(1, None, None, Some("/avatar/default.png")),
            make_assignment(1, Some(10), None, Some("/avatar/scene10.png")),
        ];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].file_path, "/avatar/scene10.png");
        assert_eq!(resolved[0].source, MediaSource::SceneTypeOverride);
    }

    #[test]
    fn falls_back_to_avatar_default() {
        let slots = vec![make_slot(1, "Front Clothed", true)];
        let assignments = vec![make_assignment(1, None, None, Some("/avatar/default.png"))];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].file_path, "/avatar/default.png");
        assert_eq!(resolved[0].source, MediaSource::AvatarDefault);
    }

    #[test]
    fn resolves_via_media_variant_id() {
        let slots = vec![make_slot(1, "Front Clothed", true)];
        let assignments = vec![make_assignment(1, None, Some(42), None)];
        let mut paths = HashMap::new();
        paths.insert(42, "/variants/42.png".to_string());

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert_eq!(resolved[0].file_path, "/variants/42.png");
    }

    #[test]
    fn required_slot_unresolved_returns_error() {
        let slots = vec![make_slot(1, "Front Clothed", true)];
        let assignments = vec![];
        let paths = HashMap::new();

        let err = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap_err();
        assert_eq!(err.len(), 1);
        assert_eq!(err[0].slot_label, "Front Clothed");
    }

    #[test]
    fn optional_slot_unresolved_is_omitted() {
        let slots = vec![make_slot(1, "Optional Extra", false)];
        let assignments = vec![];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert!(resolved.is_empty());
    }

    #[test]
    fn fallback_use_default_works() {
        let mut slot = make_slot(1, "Background", false);
        slot.fallback_mode = Some("use_default".to_string());
        slot.fallback_value = Some("/defaults/bg.png".to_string());
        let slots = vec![slot];
        let assignments = vec![];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].file_path, "/defaults/bg.png");
        assert_eq!(resolved[0].source, MediaSource::Fallback);
    }

    #[test]
    fn fallback_skip_node_omits_slot() {
        let mut slot = make_slot(1, "Optional Overlay", false);
        slot.fallback_mode = Some("skip_node".to_string());
        let slots = vec![slot];
        let assignments = vec![];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert!(resolved.is_empty());
    }

    #[test]
    fn multiple_slots_resolved_independently() {
        let slots = vec![
            make_slot(1, "Front Clothed", true),
            make_slot(2, "Front Topless", true),
        ];
        let assignments = vec![
            make_assignment(1, None, None, Some("/a.png")),
            make_assignment(2, Some(10), None, Some("/b.png")),
        ];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert_eq!(resolved.len(), 2);
        assert_eq!(resolved[0].file_path, "/a.png");
        assert_eq!(resolved[1].file_path, "/b.png");
    }

    #[test]
    fn passthrough_flag_propagated() {
        let slots = vec![make_slot(1, "Track A Output", true)];
        let mut assignment = make_assignment(1, None, None, Some("/track_a/frame.png"));
        assignment.is_passthrough = true;
        assignment.passthrough_track_id = Some(5);
        let assignments = vec![assignment];
        let paths = HashMap::new();

        let resolved = resolve_media_slots(&slots, &assignments, 10, &paths).unwrap();
        assert!(resolved[0].is_passthrough);
        assert_eq!(resolved[0].passthrough_track_id, Some(5));
    }

    #[test]
    fn empty_slots_returns_ok_empty() {
        let resolved = resolve_media_slots(&[], &[], 10, &HashMap::new()).unwrap();
        assert!(resolved.is_empty());
    }
}
