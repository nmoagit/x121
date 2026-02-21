//! Extension manifest types and validation (PRD-85).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API layer and any future worker or CLI tooling.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// The current extension API version.
pub const CURRENT_API_VERSION: &str = "1.0";

/// All supported extension API versions.
pub const SUPPORTED_API_VERSIONS: &[&str] = &["1.0"];

/// Resources that extensions may request access to.
pub const KNOWN_RESOURCES: &[&str] = &[
    "projects",
    "characters",
    "scenes",
    "metadata",
    "assets",
    "jobs",
];

/// Access levels an extension can request for a resource.
pub const KNOWN_ACCESS_LEVELS: &[&str] = &["read", "write"];

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

/// Parsed extension manifest declared in `manifest.json`.
///
/// This is the canonical schema for what an extension declares about itself,
/// including the panels it registers, context-menu items, metadata renderers,
/// and the permissions it requires.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub api_version: String,
    #[serde(default)]
    pub permissions: Vec<Permission>,
    #[serde(default)]
    pub panels: Vec<PanelRegistration>,
    #[serde(default)]
    pub menu_items: Vec<MenuItemRegistration>,
    #[serde(default)]
    pub metadata_renderers: Vec<MetadataRendererRegistration>,
    #[serde(default)]
    pub settings_schema: Option<serde_json::Value>,
}

/// A single permission request: `{ resource, access }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub resource: String,
    pub access: String,
}

/// Registration data for a panel the extension wants to add to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelRegistration {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub default_width: Option<u32>,
    #[serde(default)]
    pub default_height: Option<u32>,
}

/// Registration data for a context-menu item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItemRegistration {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub entity_types: Vec<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

/// Registration data for a custom metadata renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataRendererRegistration {
    pub field_name: String,
    #[serde(default)]
    pub entity_types: Vec<String>,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate an extension manifest against the supported schema.
///
/// Returns `Ok(())` if the manifest is valid, or a `CoreError::Validation`
/// describing the first problem found.
pub fn validate_manifest(manifest: &ExtensionManifest) -> Result<(), CoreError> {
    if manifest.name.trim().is_empty() {
        return Err(CoreError::Validation(
            "Extension name must not be empty".into(),
        ));
    }

    if manifest.version.trim().is_empty() {
        return Err(CoreError::Validation(
            "Extension version must not be empty".into(),
        ));
    }

    if !SUPPORTED_API_VERSIONS.contains(&manifest.api_version.as_str()) {
        return Err(CoreError::Validation(format!(
            "Unsupported api_version '{}'. Supported: {}",
            manifest.api_version,
            SUPPORTED_API_VERSIONS.join(", "),
        )));
    }

    for perm in &manifest.permissions {
        if !KNOWN_RESOURCES.contains(&perm.resource.as_str()) {
            return Err(CoreError::Validation(format!(
                "Unknown permission resource '{}'. Known: {}",
                perm.resource,
                KNOWN_RESOURCES.join(", "),
            )));
        }
        if !KNOWN_ACCESS_LEVELS.contains(&perm.access.as_str()) {
            return Err(CoreError::Validation(format!(
                "Unknown permission access '{}'. Known: {}",
                perm.access,
                KNOWN_ACCESS_LEVELS.join(", "),
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> ExtensionManifest {
        ExtensionManifest {
            name: "test-ext".into(),
            version: "0.1.0".into(),
            author: Some("Test Author".into()),
            description: None,
            api_version: "1.0".into(),
            permissions: vec![Permission {
                resource: "projects".into(),
                access: "read".into(),
            }],
            panels: vec![],
            menu_items: vec![],
            metadata_renderers: vec![],
            settings_schema: None,
        }
    }

    #[test]
    fn valid_manifest_passes() {
        assert!(validate_manifest(&valid_manifest()).is_ok());
    }

    #[test]
    fn empty_name_rejected() {
        let mut m = valid_manifest();
        m.name = "  ".into();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn empty_version_rejected() {
        let mut m = valid_manifest();
        m.version = "".into();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn bad_api_version_rejected() {
        let mut m = valid_manifest();
        m.api_version = "99.0".into();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn unknown_resource_rejected() {
        let mut m = valid_manifest();
        m.permissions = vec![Permission {
            resource: "secrets".into(),
            access: "read".into(),
        }];
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn unknown_access_rejected() {
        let mut m = valid_manifest();
        m.permissions = vec![Permission {
            resource: "projects".into(),
            access: "admin".into(),
        }];
        assert!(validate_manifest(&m).is_err());
    }
}
