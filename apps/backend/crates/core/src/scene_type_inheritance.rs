//! Scene type inheritance resolution engine (PRD-100).
//!
//! Provides hierarchical inheritance for scene types with:
//! - Parent-child chains (max depth 3)
//! - Field-level override tracking with source annotation
//! - Mixin (reusable parameter bundle) application
//!
//! Resolution order: root ancestor -> ... -> parent -> mixins (in order) -> child overrides.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Maximum allowed inheritance depth.
pub const MAX_INHERITANCE_DEPTH: i32 = 3;

/// Source annotation for a resolved field value.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FieldSource {
    /// The value comes from the scene type itself.
    Own,
    /// The value is inherited from an ancestor.
    Inherited { from_id: i64, from_name: String },
    /// The value comes from an applied mixin.
    Mixin { mixin_id: i64, mixin_name: String },
}

/// A single field in the effective config with its resolved value and source.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedField {
    pub value: serde_json::Value,
    pub source: FieldSource,
}

/// The fully resolved effective configuration for a scene type.
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveConfig {
    pub scene_type_id: i64,
    pub fields: HashMap<String, ResolvedField>,
}

/// Input for the resolver: a scene type in the inheritance chain.
#[derive(Debug, Clone)]
pub struct InheritanceChainEntry {
    pub id: i64,
    pub name: String,
    /// All field values for this scene type (from the DB row).
    pub fields: HashMap<String, serde_json::Value>,
    /// Explicit overrides recorded in `scene_type_overrides` for this entry.
    pub overrides: HashMap<String, serde_json::Value>,
}

/// A mixin to apply during resolution.
#[derive(Debug, Clone)]
pub struct MixinEntry {
    pub id: i64,
    pub name: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Resolve the effective config by walking the inheritance chain.
///
/// Resolution order: root ancestor -> ... -> parent -> mixins (in order) -> child overrides.
/// Only fields present in overrides replace inherited values.
///
/// `chain` must be ordered root-first, child-last.
/// `mixins` must be ordered by `apply_order`.
pub fn resolve_effective_config(
    chain: &[InheritanceChainEntry],
    mixins: &[MixinEntry],
) -> EffectiveConfig {
    let mut fields: HashMap<String, ResolvedField> = HashMap::new();

    // 1. Walk ancestors root -> child, applying each level's own fields.
    for entry in chain {
        for (field_name, value) in &entry.fields {
            if value.is_null() {
                continue;
            }
            fields.insert(
                field_name.clone(),
                ResolvedField {
                    value: value.clone(),
                    source: FieldSource::Own,
                },
            );
        }
    }

    // Re-annotate sources: fields from ancestors are "inherited".
    if chain.len() > 1 {
        let child = &chain[chain.len() - 1];
        let child_overrides = &child.overrides;

        for (field_name, resolved) in &mut fields {
            if child_overrides.contains_key(field_name) {
                resolved.source = FieldSource::Own;
            } else {
                // Find which ancestor contributed this value.
                for ancestor in chain.iter().rev().skip(1) {
                    if ancestor.fields.contains_key(field_name) {
                        resolved.source = FieldSource::Inherited {
                            from_id: ancestor.id,
                            from_name: ancestor.name.clone(),
                        };
                        break;
                    }
                }
            }
        }
    }

    // 2. Apply mixins (in order) -- mixin values override inherited but not child overrides.
    let child_overrides: HashMap<String, serde_json::Value> = chain
        .last()
        .map(|c| c.overrides.clone())
        .unwrap_or_default();

    for mixin in mixins {
        for (field_name, value) in &mixin.parameters {
            if !child_overrides.contains_key(field_name) {
                fields.insert(
                    field_name.clone(),
                    ResolvedField {
                        value: value.clone(),
                        source: FieldSource::Mixin {
                            mixin_id: mixin.id,
                            mixin_name: mixin.name.clone(),
                        },
                    },
                );
            }
        }
    }

    // 3. Apply child overrides last (highest precedence).
    for (field_name, value) in &child_overrides {
        fields.insert(
            field_name.clone(),
            ResolvedField {
                value: value.clone(),
                source: FieldSource::Own,
            },
        );
    }

    let scene_type_id = chain.last().map(|c| c.id).unwrap_or(0);
    EffectiveConfig {
        scene_type_id,
        fields,
    }
}

/// Validate that a parent assignment wouldn't exceed max depth.
///
/// Returns the child depth on success, or an error message on failure.
pub fn validate_depth(parent_depth: i32) -> Result<i32, String> {
    let child_depth = parent_depth + 1;
    if child_depth >= MAX_INHERITANCE_DEPTH {
        Err(format!(
            "Maximum inheritance depth of {MAX_INHERITANCE_DEPTH} exceeded. \
             Parent is at depth {parent_depth}."
        ))
    } else {
        Ok(child_depth)
    }
}

/// Find all children that would be affected by a parent change on a specific field.
///
/// Returns IDs of children that do NOT have an override for the changed field
/// (i.e., they inherit the value and would be affected by the change).
pub fn find_cascade_affected(
    children_overrides: &[(i64, Vec<String>)],
    changed_field: &str,
) -> Vec<i64> {
    children_overrides
        .iter()
        .filter(|(_, overrides)| !overrides.contains(&changed_field.to_string()))
        .map(|(id, _)| *id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_inheritance() {
        let chain = vec![
            InheritanceChainEntry {
                id: 1,
                name: "Parent".into(),
                fields: HashMap::from([
                    ("lora".into(), serde_json::json!("parent_lora")),
                    ("cfg".into(), serde_json::json!(7.5)),
                ]),
                overrides: HashMap::new(),
            },
            InheritanceChainEntry {
                id: 2,
                name: "Child".into(),
                fields: HashMap::from([
                    ("lora".into(), serde_json::json!("parent_lora")),
                    ("cfg".into(), serde_json::json!(7.5)),
                ]),
                overrides: HashMap::from([("cfg".into(), serde_json::json!(8.0))]),
            },
        ];

        let config = resolve_effective_config(&chain, &[]);

        // cfg should be Own (overridden by child)
        assert_eq!(config.fields["cfg"].value, serde_json::json!(8.0));
        assert_eq!(config.fields["cfg"].source, FieldSource::Own);

        // lora should be Inherited from parent
        assert_eq!(
            config.fields["lora"].value,
            serde_json::json!("parent_lora")
        );
        assert!(matches!(
            config.fields["lora"].source,
            FieldSource::Inherited { from_id: 1, .. }
        ));
    }

    #[test]
    fn test_mixin_application() {
        let chain = vec![InheritanceChainEntry {
            id: 1,
            name: "Scene".into(),
            fields: HashMap::from([("cfg".into(), serde_json::json!(7.5))]),
            overrides: HashMap::new(),
        }];
        let mixins = vec![MixinEntry {
            id: 10,
            name: "High Quality".into(),
            parameters: HashMap::from([
                ("cfg".into(), serde_json::json!(9.0)),
                ("steps".into(), serde_json::json!(30)),
            ]),
        }];

        let config = resolve_effective_config(&chain, &mixins);

        // Mixin overrides the inherited cfg (no child override exists)
        assert_eq!(config.fields["cfg"].value, serde_json::json!(9.0));
        assert!(matches!(
            config.fields["cfg"].source,
            FieldSource::Mixin { .. }
        ));
        assert_eq!(config.fields["steps"].value, serde_json::json!(30));
    }

    #[test]
    fn test_child_overrides_mixin() {
        let chain = vec![
            InheritanceChainEntry {
                id: 1,
                name: "Parent".into(),
                fields: HashMap::from([("cfg".into(), serde_json::json!(7.5))]),
                overrides: HashMap::new(),
            },
            InheritanceChainEntry {
                id: 2,
                name: "Child".into(),
                fields: HashMap::from([("cfg".into(), serde_json::json!(8.0))]),
                overrides: HashMap::from([("cfg".into(), serde_json::json!(8.0))]),
            },
        ];
        let mixins = vec![MixinEntry {
            id: 10,
            name: "HQ".into(),
            parameters: HashMap::from([("cfg".into(), serde_json::json!(9.0))]),
        }];

        let config = resolve_effective_config(&chain, &mixins);

        // Child override takes precedence over mixin
        assert_eq!(config.fields["cfg"].value, serde_json::json!(8.0));
        assert_eq!(config.fields["cfg"].source, FieldSource::Own);
    }

    #[test]
    fn test_three_level_chain() {
        let chain = vec![
            InheritanceChainEntry {
                id: 1,
                name: "Root".into(),
                fields: HashMap::from([
                    ("lora".into(), serde_json::json!("root_lora")),
                    ("cfg".into(), serde_json::json!(5.0)),
                    ("steps".into(), serde_json::json!(20)),
                ]),
                overrides: HashMap::new(),
            },
            InheritanceChainEntry {
                id: 2,
                name: "Middle".into(),
                fields: HashMap::from([
                    ("lora".into(), serde_json::json!("root_lora")),
                    ("cfg".into(), serde_json::json!(7.0)),
                    ("steps".into(), serde_json::json!(20)),
                ]),
                overrides: HashMap::from([("cfg".into(), serde_json::json!(7.0))]),
            },
            InheritanceChainEntry {
                id: 3,
                name: "Leaf".into(),
                fields: HashMap::from([
                    ("lora".into(), serde_json::json!("root_lora")),
                    ("cfg".into(), serde_json::json!(7.0)),
                    ("steps".into(), serde_json::json!(20)),
                ]),
                overrides: HashMap::new(),
            },
        ];

        let config = resolve_effective_config(&chain, &[]);

        // lora inherited from root (via middle)
        assert!(matches!(
            &config.fields["lora"].source,
            FieldSource::Inherited { from_id: 2, .. }
        ));
        // cfg inherited from middle
        assert!(matches!(
            &config.fields["cfg"].source,
            FieldSource::Inherited { from_id: 2, .. }
        ));
        // steps inherited from root (via middle)
        assert!(matches!(
            &config.fields["steps"].source,
            FieldSource::Inherited { from_id: 2, .. }
        ));
    }

    #[test]
    fn test_validate_depth_ok() {
        assert_eq!(validate_depth(0), Ok(1));
        assert_eq!(validate_depth(1), Ok(2));
    }

    #[test]
    fn test_validate_depth_exceeded() {
        assert!(validate_depth(3).is_err());
        assert!(validate_depth(4).is_err());
    }

    #[test]
    fn test_validate_depth_boundary() {
        // depth 2 -> child would be 3, which equals MAX (3), so it should fail
        assert!(validate_depth(2).is_err());
    }

    #[test]
    fn test_cascade_affected() {
        let children = vec![
            (10, vec!["lora".into(), "cfg".into()]),
            (11, vec!["lora".into()]),
            (12, vec![]),
        ];

        let affected = find_cascade_affected(&children, "cfg");
        // child 11 and 12 don't override cfg
        assert_eq!(affected, vec![11, 12]);
    }

    #[test]
    fn test_cascade_affected_none_affected() {
        let children = vec![(10, vec!["cfg".into()]), (11, vec!["cfg".into()])];

        let affected = find_cascade_affected(&children, "cfg");
        assert!(affected.is_empty());
    }

    #[test]
    fn test_empty_chain() {
        let config = resolve_effective_config(&[], &[]);
        assert_eq!(config.scene_type_id, 0);
        assert!(config.fields.is_empty());
    }

    #[test]
    fn test_single_entry_no_overrides() {
        let chain = vec![InheritanceChainEntry {
            id: 42,
            name: "Solo".into(),
            fields: HashMap::from([("cfg".into(), serde_json::json!(7.5))]),
            overrides: HashMap::new(),
        }];

        let config = resolve_effective_config(&chain, &[]);
        assert_eq!(config.scene_type_id, 42);
        assert_eq!(config.fields["cfg"].value, serde_json::json!(7.5));
        assert_eq!(config.fields["cfg"].source, FieldSource::Own);
    }
}
