//! Pipeline Stage Hooks constants, enums, validation, and inheritance (PRD-77).
//!
//! Provides the domain types for shell, Python, and webhook hooks that can
//! be attached to pipeline stages at studio, project, or scene-type scope.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum length of a hook name.
pub const MAX_HOOK_NAME_LENGTH: usize = 200;

/// Maximum length of a hook description.
pub const MAX_HOOK_DESCRIPTION_LENGTH: usize = 2000;

/// Maximum number of hooks allowed at a single hook point.
pub const MAX_HOOKS_PER_POINT: usize = 20;

/// Default timeout for shell/Python hook execution in seconds.
pub const DEFAULT_HOOK_TIMEOUT_SECS: u64 = 30;

/// Default timeout for webhook invocations in seconds.
pub const WEBHOOK_DEFAULT_TIMEOUT_SECS: u64 = 10;

/// Maximum captured output length in bytes.
pub const MAX_OUTPUT_CAPTURE_LENGTH: usize = 100_000;

// ---------------------------------------------------------------------------
// HookType
// ---------------------------------------------------------------------------

/// The execution mechanism for a hook.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookType {
    Shell,
    Python,
    Webhook,
}

impl HookType {
    /// Return the wire-format string for this variant.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Shell => "shell",
            Self::Python => "python",
            Self::Webhook => "webhook",
        }
    }

    /// Parse from a wire-format string.
    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            "shell" => Ok(Self::Shell),
            "python" => Ok(Self::Python),
            "webhook" => Ok(Self::Webhook),
            _ => Err(CoreError::Validation(format!(
                "Invalid hook_type: '{s}'. Must be one of: shell, python, webhook"
            ))),
        }
    }
}

impl std::fmt::Display for HookType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// HookPoint
// ---------------------------------------------------------------------------

/// The pipeline stage at which a hook fires.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookPoint {
    PostVariant,
    PreSegment,
    PostSegment,
    PreConcatenation,
    PostDelivery,
}

impl HookPoint {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PostVariant => "post_variant",
            Self::PreSegment => "pre_segment",
            Self::PostSegment => "post_segment",
            Self::PreConcatenation => "pre_concatenation",
            Self::PostDelivery => "post_delivery",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            "post_variant" => Ok(Self::PostVariant),
            "pre_segment" => Ok(Self::PreSegment),
            "post_segment" => Ok(Self::PostSegment),
            "pre_concatenation" => Ok(Self::PreConcatenation),
            "post_delivery" => Ok(Self::PostDelivery),
            _ => Err(CoreError::Validation(format!(
                "Invalid hook_point: '{s}'. Must be one of: post_variant, pre_segment, \
                 post_segment, pre_concatenation, post_delivery"
            ))),
        }
    }
}

impl std::fmt::Display for HookPoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// ScopeType
// ---------------------------------------------------------------------------

/// The organisational level at which a hook is defined.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScopeType {
    Studio,
    Project,
    SceneType,
}

impl ScopeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Studio => "studio",
            Self::Project => "project",
            Self::SceneType => "scene_type",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            "studio" => Ok(Self::Studio),
            "project" => Ok(Self::Project),
            "scene_type" => Ok(Self::SceneType),
            _ => Err(CoreError::Validation(format!(
                "Invalid scope_type: '{s}'. Must be one of: studio, project, scene_type"
            ))),
        }
    }
}

impl std::fmt::Display for ScopeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// FailureMode
// ---------------------------------------------------------------------------

/// What happens when a hook execution fails.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureMode {
    Block,
    Warn,
    Ignore,
}

impl FailureMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Block => "block",
            Self::Warn => "warn",
            Self::Ignore => "ignore",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            "block" => Ok(Self::Block),
            "warn" => Ok(Self::Warn),
            "ignore" => Ok(Self::Ignore),
            _ => Err(CoreError::Validation(format!(
                "Invalid failure_mode: '{s}'. Must be one of: block, warn, ignore"
            ))),
        }
    }
}

impl std::fmt::Display for FailureMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a hook name: must be non-empty and within length limit.
pub fn validate_hook_name(name: &str) -> Result<(), CoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Hook name must not be empty".to_string(),
        ));
    }
    if trimmed.len() > MAX_HOOK_NAME_LENGTH {
        return Err(CoreError::Validation(format!(
            "Hook name exceeds maximum length of {MAX_HOOK_NAME_LENGTH} characters"
        )));
    }
    Ok(())
}

/// Validate that the JSON config contains the required keys for the hook type.
///
/// - **Shell**: requires `script_path`
/// - **Python**: requires `script_path`
/// - **Webhook**: requires `url`
pub fn validate_hook_config(
    hook_type: &HookType,
    config: &serde_json::Value,
) -> Result<(), CoreError> {
    let obj = config
        .as_object()
        .ok_or_else(|| CoreError::Validation("config_json must be a JSON object".to_string()))?;

    match hook_type {
        HookType::Shell | HookType::Python => {
            if !obj.contains_key("script_path") {
                return Err(CoreError::Validation(format!(
                    "{hook_type} hook config must contain 'script_path'"
                )));
            }
        }
        HookType::Webhook => {
            if !obj.contains_key("url") {
                return Err(CoreError::Validation(
                    "webhook hook config must contain 'url'".to_string(),
                ));
            }
        }
    }
    Ok(())
}

/// Validate that sort_order is non-negative.
pub fn validate_sort_order(order: i32) -> Result<(), CoreError> {
    if order < 0 {
        return Err(CoreError::Validation(format!(
            "sort_order must be non-negative, got {order}"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// EffectiveHook (inheritance resolution output)
// ---------------------------------------------------------------------------

/// A resolved hook after applying scope-based inheritance rules.
///
/// When hooks are defined at multiple scope levels (studio, project,
/// scene_type), later scopes override earlier ones by name.
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveHook {
    pub hook_id: DbId,
    pub name: String,
    pub hook_type: HookType,
    pub hook_point: HookPoint,
    pub scope_type: ScopeType,
    pub failure_mode: FailureMode,
    pub config_json: serde_json::Value,
    pub sort_order: i32,
    pub source_level: String,
}

// ---------------------------------------------------------------------------
// Lightweight hook representation for the resolver
// ---------------------------------------------------------------------------

/// Minimal hook data needed by the inheritance resolver.
///
/// This mirrors the DB model but is defined here so the core crate stays
/// independent of the DB crate.
#[derive(Debug, Clone)]
pub struct HookInput {
    pub id: DbId,
    pub name: String,
    pub hook_type: HookType,
    pub hook_point: HookPoint,
    pub scope_type: ScopeType,
    pub failure_mode: FailureMode,
    pub config_json: serde_json::Value,
    pub sort_order: i32,
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// Inheritance resolution
// ---------------------------------------------------------------------------

/// Merge hooks from three scope levels using name-based overriding.
///
/// Resolution rules:
/// 1. Start with studio-level hooks.
/// 2. For each project-level hook, if a studio hook with the same name
///    exists it is replaced; otherwise the project hook is added.
/// 3. Repeat for scene-type-level hooks overriding the merged result.
/// 4. Disabled hooks are filtered out.
/// 5. The final list is sorted by `sort_order` ascending.
pub fn resolve_effective_hooks(
    studio_hooks: &[HookInput],
    project_hooks: &[HookInput],
    scene_type_hooks: &[HookInput],
) -> Vec<EffectiveHook> {
    use std::collections::HashMap;

    // Map from name -> (effective hook, source label)
    let mut merged: HashMap<String, EffectiveHook> = HashMap::new();

    let apply_layer =
        |merged: &mut HashMap<String, EffectiveHook>, hooks: &[HookInput], label: &str| {
            for h in hooks {
                let eff = EffectiveHook {
                    hook_id: h.id,
                    name: h.name.clone(),
                    hook_type: h.hook_type.clone(),
                    hook_point: h.hook_point.clone(),
                    scope_type: h.scope_type.clone(),
                    failure_mode: h.failure_mode.clone(),
                    config_json: h.config_json.clone(),
                    sort_order: h.sort_order,
                    source_level: label.to_string(),
                };
                // Insert or replace by name
                merged.insert(h.name.clone(), eff);
            }
        };

    apply_layer(&mut merged, studio_hooks, "studio");
    apply_layer(&mut merged, project_hooks, "project");
    apply_layer(&mut merged, scene_type_hooks, "scene_type");

    // Collect, filter disabled (we check original enabled flag via a lookup)
    // Build a quick lookup of id -> enabled from all input slices
    let enabled_lookup: HashMap<DbId, bool> = studio_hooks
        .iter()
        .chain(project_hooks.iter())
        .chain(scene_type_hooks.iter())
        .map(|h| (h.id, h.enabled))
        .collect();

    let mut result: Vec<EffectiveHook> = merged
        .into_values()
        .filter(|eff| enabled_lookup.get(&eff.hook_id).copied().unwrap_or(true))
        .collect();

    result.sort_by_key(|h| h.sort_order);
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- HookType parsing ---------------------------------------------------

    #[test]
    fn hook_type_shell_roundtrip() {
        assert_eq!(HookType::from_str("shell").unwrap(), HookType::Shell);
        assert_eq!(HookType::Shell.as_str(), "shell");
    }

    #[test]
    fn hook_type_python_roundtrip() {
        assert_eq!(HookType::from_str("python").unwrap(), HookType::Python);
        assert_eq!(HookType::Python.as_str(), "python");
    }

    #[test]
    fn hook_type_webhook_roundtrip() {
        assert_eq!(HookType::from_str("webhook").unwrap(), HookType::Webhook);
        assert_eq!(HookType::Webhook.as_str(), "webhook");
    }

    #[test]
    fn hook_type_invalid_rejects() {
        assert!(HookType::from_str("lua").is_err());
    }

    // -- HookPoint parsing --------------------------------------------------

    #[test]
    fn hook_point_all_variants_roundtrip() {
        let pairs = [
            ("post_variant", HookPoint::PostVariant),
            ("pre_segment", HookPoint::PreSegment),
            ("post_segment", HookPoint::PostSegment),
            ("pre_concatenation", HookPoint::PreConcatenation),
            ("post_delivery", HookPoint::PostDelivery),
        ];
        for (s, variant) in &pairs {
            assert_eq!(&HookPoint::from_str(s).unwrap(), variant);
            assert_eq!(variant.as_str(), *s);
        }
    }

    #[test]
    fn hook_point_invalid_rejects() {
        assert!(HookPoint::from_str("before_render").is_err());
    }

    // -- ScopeType parsing --------------------------------------------------

    #[test]
    fn scope_type_all_variants_roundtrip() {
        let pairs = [
            ("studio", ScopeType::Studio),
            ("project", ScopeType::Project),
            ("scene_type", ScopeType::SceneType),
        ];
        for (s, variant) in &pairs {
            assert_eq!(&ScopeType::from_str(s).unwrap(), variant);
            assert_eq!(variant.as_str(), *s);
        }
    }

    #[test]
    fn scope_type_invalid_rejects() {
        assert!(ScopeType::from_str("global").is_err());
    }

    // -- FailureMode parsing ------------------------------------------------

    #[test]
    fn failure_mode_all_variants_roundtrip() {
        let pairs = [
            ("block", FailureMode::Block),
            ("warn", FailureMode::Warn),
            ("ignore", FailureMode::Ignore),
        ];
        for (s, variant) in &pairs {
            assert_eq!(&FailureMode::from_str(s).unwrap(), variant);
            assert_eq!(variant.as_str(), *s);
        }
    }

    #[test]
    fn failure_mode_invalid_rejects() {
        assert!(FailureMode::from_str("skip").is_err());
    }

    // -- validate_hook_name -------------------------------------------------

    #[test]
    fn valid_hook_name() {
        assert!(validate_hook_name("my-hook").is_ok());
    }

    #[test]
    fn empty_hook_name_rejects() {
        assert!(validate_hook_name("").is_err());
        assert!(validate_hook_name("   ").is_err());
    }

    #[test]
    fn too_long_hook_name_rejects() {
        let long = "a".repeat(MAX_HOOK_NAME_LENGTH + 1);
        assert!(validate_hook_name(&long).is_err());
    }

    #[test]
    fn max_length_hook_name_ok() {
        let exact = "a".repeat(MAX_HOOK_NAME_LENGTH);
        assert!(validate_hook_name(&exact).is_ok());
    }

    // -- validate_hook_config -----------------------------------------------

    #[test]
    fn shell_config_valid() {
        let cfg = json!({ "script_path": "/usr/bin/check.sh" });
        assert!(validate_hook_config(&HookType::Shell, &cfg).is_ok());
    }

    #[test]
    fn shell_config_missing_script_path_rejects() {
        let cfg = json!({ "timeout": 10 });
        assert!(validate_hook_config(&HookType::Shell, &cfg).is_err());
    }

    #[test]
    fn python_config_valid() {
        let cfg = json!({ "script_path": "/scripts/validate.py" });
        assert!(validate_hook_config(&HookType::Python, &cfg).is_ok());
    }

    #[test]
    fn python_config_missing_script_path_rejects() {
        let cfg = json!({ "module": "validator" });
        assert!(validate_hook_config(&HookType::Python, &cfg).is_err());
    }

    #[test]
    fn webhook_config_valid() {
        let cfg = json!({ "url": "https://hooks.example.com/check" });
        assert!(validate_hook_config(&HookType::Webhook, &cfg).is_ok());
    }

    #[test]
    fn webhook_config_missing_url_rejects() {
        let cfg = json!({ "method": "POST" });
        assert!(validate_hook_config(&HookType::Webhook, &cfg).is_err());
    }

    #[test]
    fn config_non_object_rejects() {
        let cfg = json!("just a string");
        assert!(validate_hook_config(&HookType::Shell, &cfg).is_err());
    }

    // -- validate_sort_order ------------------------------------------------

    #[test]
    fn valid_sort_orders() {
        assert!(validate_sort_order(0).is_ok());
        assert!(validate_sort_order(100).is_ok());
    }

    #[test]
    fn negative_sort_order_rejects() {
        assert!(validate_sort_order(-1).is_err());
    }

    // -- resolve_effective_hooks --------------------------------------------

    fn make_hook_input(
        id: DbId,
        name: &str,
        scope: ScopeType,
        sort: i32,
        enabled: bool,
    ) -> HookInput {
        HookInput {
            id,
            name: name.to_string(),
            hook_type: HookType::Shell,
            hook_point: HookPoint::PostVariant,
            scope_type: scope,
            failure_mode: FailureMode::Warn,
            config_json: json!({ "script_path": "/bin/true" }),
            sort_order: sort,
            enabled,
        }
    }

    #[test]
    fn resolve_studio_only() {
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, true)];
        let result = resolve_effective_hooks(&studio, &[], &[]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source_level, "studio");
        assert_eq!(result[0].name, "lint");
    }

    #[test]
    fn resolve_project_overrides_studio() {
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, true)];
        let project = vec![make_hook_input(2, "lint", ScopeType::Project, 0, true)];
        let result = resolve_effective_hooks(&studio, &project, &[]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].hook_id, 2);
        assert_eq!(result[0].source_level, "project");
    }

    #[test]
    fn resolve_scene_type_overrides_project() {
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, true)];
        let project = vec![make_hook_input(2, "lint", ScopeType::Project, 0, true)];
        let scene = vec![make_hook_input(3, "lint", ScopeType::SceneType, 0, true)];
        let result = resolve_effective_hooks(&studio, &project, &scene);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].hook_id, 3);
        assert_eq!(result[0].source_level, "scene_type");
    }

    #[test]
    fn resolve_disabled_hooks_filtered_out() {
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, false)];
        let result = resolve_effective_hooks(&studio, &[], &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn resolve_sorts_by_sort_order() {
        let studio = vec![
            make_hook_input(1, "z-hook", ScopeType::Studio, 10, true),
            make_hook_input(2, "a-hook", ScopeType::Studio, 5, true),
            make_hook_input(3, "m-hook", ScopeType::Studio, 1, true),
        ];
        let result = resolve_effective_hooks(&studio, &[], &[]);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].name, "m-hook");
        assert_eq!(result[1].name, "a-hook");
        assert_eq!(result[2].name, "z-hook");
    }

    #[test]
    fn resolve_merges_different_names() {
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, true)];
        let project = vec![make_hook_input(2, "notify", ScopeType::Project, 1, true)];
        let result = resolve_effective_hooks(&studio, &project, &[]);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn resolve_empty_inputs() {
        let result = resolve_effective_hooks(&[], &[], &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn resolve_disabled_override_removes_hook() {
        // Studio defines "lint" as enabled, project overrides as disabled
        let studio = vec![make_hook_input(1, "lint", ScopeType::Studio, 0, true)];
        let project = vec![make_hook_input(2, "lint", ScopeType::Project, 0, false)];
        let result = resolve_effective_hooks(&studio, &project, &[]);
        assert!(result.is_empty());
    }
}
