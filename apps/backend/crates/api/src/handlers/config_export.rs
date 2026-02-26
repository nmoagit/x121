//! Handlers for configuration export/import (PRD-44).
//!
//! Provides endpoints for exporting, validating, and importing platform
//! configuration snapshots. All endpoints are admin-only.

use std::collections::HashMap;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::config_export::{
    self, ConfigExport, ConfigValidationResult, ALL_SECTIONS, REDACTED_VALUE, SECTION_ROLES,
    SECTION_SCENE_TYPES, SECTION_SCHEDULING_POLICIES, SECTION_THEMES, SECTION_VALIDATION_RULES,
};
use x121_db::repositories::{
    RoleRepo, SceneTypeRepo, SchedulingPolicyRepo, ThemeRepo, ValidationRuleRepo,
};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for importing configuration.
#[derive(Debug, Deserialize)]
pub struct ImportConfigRequest {
    /// The configuration snapshot to import.
    pub config: ConfigExport,
    /// Which sections to import. If empty or absent, all sections are imported.
    pub sections: Option<Vec<String>>,
}

// ---------------------------------------------------------------------------
// POST /admin/config/export
// ---------------------------------------------------------------------------

/// Export the current platform configuration as a JSON snapshot.
///
/// Sensitive values (passwords, API keys) are redacted in the export.
pub async fn export_config(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let mut sections: HashMap<String, serde_json::Value> = HashMap::new();

    // Themes (custom themes)
    let themes = ThemeRepo::list_custom_themes(&state.pool).await?;
    sections.insert(
        SECTION_THEMES.to_string(),
        serde_json::to_value(&themes).unwrap_or_default(),
    );

    // Roles
    let roles = RoleRepo::list(&state.pool).await?;
    sections.insert(
        SECTION_ROLES.to_string(),
        serde_json::to_value(&roles).unwrap_or_default(),
    );

    // Scene types (studio-level, not project-scoped)
    let scene_types = SceneTypeRepo::list_studio_level(&state.pool).await?;
    sections.insert(
        SECTION_SCENE_TYPES.to_string(),
        serde_json::to_value(&scene_types).unwrap_or_default(),
    );

    // Scheduling policies
    let policies = SchedulingPolicyRepo::list(&state.pool).await?;
    sections.insert(
        SECTION_SCHEDULING_POLICIES.to_string(),
        serde_json::to_value(&policies).unwrap_or_default(),
    );

    // Validation rule types (global listing)
    let rule_types = ValidationRuleRepo::list_rule_types(&state.pool).await?;
    sections.insert(
        SECTION_VALIDATION_RULES.to_string(),
        serde_json::to_value(&rule_types).unwrap_or_default(),
    );

    // Redact sensitive data in all sections.
    for val in sections.values_mut() {
        config_export::redact_sensitive(val);
    }

    let export = ConfigExport {
        version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now(),
        exported_by: admin.user_id.to_string(),
        sections,
    };

    tracing::info!(
        user_id = admin.user_id,
        sections = export.sections.len(),
        "Configuration exported",
    );

    Ok(Json(DataResponse { data: export }))
}

// ---------------------------------------------------------------------------
// POST /admin/config/validate
// ---------------------------------------------------------------------------

/// Validate a configuration snapshot before importing.
///
/// Returns which sections are present, any warnings, and whether the
/// archive is valid for import.
pub async fn validate_config(
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<ConfigExport>,
) -> AppResult<impl IntoResponse> {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    // Check that the version field is non-empty.
    if input.version.is_empty() {
        errors.push("Missing platform version in export".to_string());
    }

    // Warn about sections that are not recognised.
    let known_sections: Vec<&str> = ALL_SECTIONS.to_vec();
    for key in input.sections.keys() {
        if !known_sections.contains(&key.as_str()) {
            warnings.push(format!("Unknown section '{key}' will be ignored"));
        }
    }

    // Warn about sections containing redacted values (they cannot be imported).
    for (key, val) in &input.sections {
        let json_str = serde_json::to_string(val).unwrap_or_default();
        if json_str.contains(REDACTED_VALUE) {
            warnings.push(format!(
                "Section '{key}' contains redacted values that will need to be replaced before import"
            ));
        }
    }

    let present_sections: Vec<String> = input
        .sections
        .keys()
        .filter(|k| known_sections.contains(&k.as_str()))
        .cloned()
        .collect();

    let result = ConfigValidationResult {
        is_valid: errors.is_empty(),
        export_version: input.version.clone(),
        sections: present_sections,
        warnings,
        errors,
    };

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// POST /admin/config/import
// ---------------------------------------------------------------------------

/// Import a configuration snapshot, optionally selecting specific sections.
///
/// This is a simplified MVP implementation that validates the snapshot
/// structure and reports what would be imported. Full section-by-section
/// application will be expanded post-MVP.
pub async fn import_config(
    RequireAdmin(admin): RequireAdmin,
    State(_state): State<AppState>,
    Json(input): Json<ImportConfigRequest>,
) -> AppResult<impl IntoResponse> {
    // Determine which sections to import.
    let requested_sections: Vec<String> = match &input.sections {
        Some(s) if !s.is_empty() => s.clone(),
        _ => input.config.sections.keys().cloned().collect(),
    };

    // Validate that all requested sections exist in the config.
    let known_sections: Vec<&str> = ALL_SECTIONS.to_vec();
    for s in &requested_sections {
        if !known_sections.contains(&s.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Unknown section '{s}'. Valid sections: {:?}",
                ALL_SECTIONS
            )));
        }
        if !input.config.sections.contains_key(s) {
            return Err(AppError::BadRequest(format!(
                "Section '{s}' not present in the configuration snapshot"
            )));
        }
    }

    // Check for redacted values in the sections to import.
    for s in &requested_sections {
        if let Some(val) = input.config.sections.get(s) {
            let json_str = serde_json::to_string(val).unwrap_or_default();
            if json_str.contains(REDACTED_VALUE) {
                return Err(AppError::BadRequest(format!(
                    "Section '{s}' contains redacted values. Replace them with actual values before importing."
                )));
            }
        }
    }

    tracing::info!(
        user_id = admin.user_id,
        sections = ?requested_sections,
        version = %input.config.version,
        "Configuration import accepted (MVP: validation-only)",
    );

    // MVP: return a summary of what would be imported.
    let summary = serde_json::json!({
        "imported_sections": requested_sections,
        "source_version": input.config.version,
        "message": "Configuration validated successfully. Section-by-section application available in future release."
    });

    Ok(Json(DataResponse { data: summary }))
}
