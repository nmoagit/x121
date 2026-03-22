//! Handlers for the `/admin/settings` resource (PRD-110).
//!
//! All handlers require the `admin` role via [`RequireAdmin`].

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::settings::{find_definition, SettingValueType, SETTINGS_REGISTRY};
use x121_core::types::Timestamp;
use x121_db::models::audit::CreateAuditLog;
use x121_db::repositories::{AuditLogRepo, PlatformSettingRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// A single setting with resolved value and metadata.
#[derive(Debug, Serialize)]
pub struct SettingResponse {
    pub key: String,
    pub category: String,
    pub label: String,
    pub description: String,
    pub value: String,
    pub source: String,
    pub value_type: String,
    pub requires_restart: bool,
    pub sensitive: bool,
    pub updated_at: Option<Timestamp>,
    pub updated_by: Option<i64>,
}

/// Full list of settings with restart status.
#[derive(Debug, Serialize)]
pub struct SettingsListResponse {
    pub settings: Vec<SettingResponse>,
    pub pending_restart: bool,
    pub pending_restart_keys: Vec<String>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Request body for `PATCH /admin/settings/{key}`.
#[derive(Debug, Deserialize)]
pub struct UpdateSettingRequest {
    pub value: String,
}

/// Request body for `POST /admin/settings/{key}/actions/test`.
#[derive(Debug, Deserialize)]
pub struct TestConnectionRequest {
    pub url: String,
}

/// Response for connection test.
#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/settings
///
/// List all registered settings with their resolved values.
pub async fn list_settings(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<SettingsListResponse>>> {
    // Fetch all DB overrides in one query.
    let db_settings = PlatformSettingRepo::list(&state.pool, None).await?;
    let db_map: std::collections::HashMap<String, _> = db_settings
        .into_iter()
        .map(|s| (s.key.clone(), s))
        .collect();

    // Collect keys that require restart.
    let restart_keys: Vec<&str> = SETTINGS_REGISTRY
        .iter()
        .filter(|d| d.requires_restart)
        .map(|d| d.key)
        .collect();

    // Check if any restart-requiring setting was changed since boot.
    let restart_key_refs: Vec<&str> = restart_keys.clone();
    let last_change =
        PlatformSettingRepo::last_restart_change(&state.pool, &restart_key_refs).await?;
    let pending_restart = state.settings_service.needs_restart(last_change);

    // Build pending restart keys list.
    let pending_restart_keys: Vec<String> = if pending_restart {
        restart_keys
            .iter()
            .filter(|k| db_map.contains_key(**k))
            .map(|k| k.to_string())
            .collect()
    } else {
        Vec::new()
    };

    // Build response for each registered setting.
    let mut settings = Vec::with_capacity(SETTINGS_REGISTRY.len());
    for def in SETTINGS_REGISTRY {
        let db_entry = db_map.get(def.key);
        let db_value = db_entry.map(|e| e.value.clone());

        let (resolved_value, source) = state.settings_service.resolve(def.key, db_value);

        settings.push(build_setting_response(
            def,
            resolved_value,
            source,
            db_entry.map(|e| e.updated_at),
            db_entry.and_then(|e| e.updated_by),
        ));
    }

    Ok(Json(DataResponse {
        data: SettingsListResponse {
            settings,
            pending_restart,
            pending_restart_keys,
        },
    }))
}

/// GET /api/v1/admin/settings/{key}
///
/// Get a single setting by key.
pub async fn get_setting(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(key): Path<String>,
) -> AppResult<Json<DataResponse<SettingResponse>>> {
    let def = ensure_setting_definition(&key)?;

    let db_entry = PlatformSettingRepo::find_by_key(&state.pool, &key).await?;
    let db_value = db_entry.as_ref().map(|e| e.value.clone());

    let (resolved_value, source) = state.settings_service.resolve(&key, db_value);

    Ok(Json(DataResponse {
        data: build_setting_response(
            def,
            resolved_value,
            source,
            db_entry.as_ref().map(|e| e.updated_at),
            db_entry.and_then(|e| e.updated_by),
        ),
    }))
}

/// PATCH /api/v1/admin/settings/{key}
///
/// Update a setting value. Validates against the definition's type constraints,
/// upserts into the database, invalidates the cache, and logs an audit entry.
pub async fn update_setting(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(key): Path<String>,
    Json(input): Json<UpdateSettingRequest>,
) -> AppResult<Json<DataResponse<SettingResponse>>> {
    let def = ensure_setting_definition(&key)?;

    // Validate the new value.
    x121_core::settings::validate_setting_value(def, &input.value)?;

    // Capture old value for audit diff.
    let old_entry = PlatformSettingRepo::find_by_key(&state.pool, &key).await?;
    let old_value = old_entry.map(|e| e.value);

    // Upsert.
    let saved =
        PlatformSettingRepo::upsert(&state.pool, &key, &input.value, def.category, admin.user_id)
            .await?;

    // Invalidate cache so next read picks up the DB value.
    state.settings_service.invalidate(&key);

    // Audit log.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "setting_updated".to_string(),
            entity_type: Some("platform_setting".to_string()),
            entity_id: None,
            details_json: Some(serde_json::json!({
                "key": key,
                "old_value": old_value,
                "new_value": input.value,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    // Re-resolve to return the updated state.
    let (resolved_value, source) = state
        .settings_service
        .resolve(&key, Some(saved.value.clone()));

    Ok(Json(DataResponse {
        data: build_setting_response(
            def,
            resolved_value,
            source,
            Some(saved.updated_at),
            saved.updated_by,
        ),
    }))
}

/// DELETE /api/v1/admin/settings/{key}
///
/// Reset a setting to its environment / default value by deleting the DB row.
pub async fn reset_setting(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(key): Path<String>,
) -> AppResult<Json<DataResponse<SettingResponse>>> {
    let def = ensure_setting_definition(&key)?;

    // Capture old value for audit.
    let old_entry = PlatformSettingRepo::find_by_key(&state.pool, &key).await?;
    let old_value = old_entry.map(|e| e.value);

    // Delete the DB override.
    PlatformSettingRepo::delete_by_key(&state.pool, &key).await?;

    // Invalidate cache.
    state.settings_service.invalidate(&key);

    // Audit log.
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "setting_reset".to_string(),
            entity_type: Some("platform_setting".to_string()),
            entity_id: None,
            details_json: Some(serde_json::json!({
                "key": key,
                "old_value": old_value,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    // Resolve the fallback value (env or default).
    let (resolved_value, source) = state.settings_service.resolve(&key, None);

    Ok(Json(DataResponse {
        data: build_setting_response(def, resolved_value, source, None, None),
    }))
}

/// POST /api/v1/admin/settings/{key}/actions/test
///
/// Test connectivity for URL or WebSocket settings. Performs a HEAD request
/// (for HTTP URLs) or a WebSocket handshake (for WS URLs) with a 5-second
/// timeout.
pub async fn test_connection(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(key): Path<String>,
    Json(input): Json<TestConnectionRequest>,
) -> AppResult<Json<DataResponse<TestConnectionResponse>>> {
    let def = ensure_setting_definition(&key)?;

    let timeout = std::time::Duration::from_secs(5);
    let start = std::time::Instant::now();

    let result = match def.value_type {
        SettingValueType::Url => test_http_connection(&input.url, timeout).await,
        SettingValueType::WsUrl => test_ws_connection(&input.url, timeout).await,
        _ => {
            return Err(AppError::Core(x121_core::error::CoreError::Validation(
                format!(
                    "Connection testing is only supported for URL and WebSocket settings (key '{}' is type '{}')",
                    key,
                    def.value_type.as_str()
                ),
            )));
        }
    };

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // Suppress unused variable warning — state is required for extractor.
    let _ = &state;

    let response = match result {
        Ok(msg) => TestConnectionResponse {
            success: true,
            message: msg,
            latency_ms: Some(elapsed_ms),
        },
        Err(msg) => TestConnectionResponse {
            success: false,
            message: msg,
            latency_ms: Some(elapsed_ms),
        },
    };

    Ok(Json(DataResponse { data: response }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find the setting definition for `key` or return a Validation error.
fn ensure_setting_definition(
    key: &str,
) -> AppResult<&'static x121_core::settings::SettingDefinition> {
    find_definition(key).ok_or_else(|| {
        AppError::Core(x121_core::error::CoreError::Validation(format!(
            "Unknown setting key: '{key}'"
        )))
    })
}

/// Build a [`SettingResponse`] from a definition, resolved value/source, and
/// optional DB metadata.
fn build_setting_response(
    def: &x121_core::settings::SettingDefinition,
    resolved_value: String,
    source: x121_core::settings::SettingSource,
    updated_at: Option<Timestamp>,
    updated_by: Option<i64>,
) -> SettingResponse {
    let display_value = if def.sensitive {
        mask_value(&resolved_value)
    } else {
        resolved_value
    };
    SettingResponse {
        key: def.key.to_string(),
        category: def.category.to_string(),
        label: def.label.to_string(),
        description: def.description.to_string(),
        value: display_value,
        source: source.as_str().to_string(),
        value_type: def.value_type.as_str().to_string(),
        requires_restart: def.requires_restart,
        sensitive: def.sensitive,
        updated_at,
        updated_by,
    }
}

/// Mask a sensitive value, showing only the last 4 avatars.
fn mask_value(value: &str) -> String {
    if value.len() <= 4 {
        "****".to_string()
    } else {
        let visible = &value[value.len() - 4..];
        format!("****{visible}")
    }
}

/// Test an HTTP(S) URL by sending a HEAD request.
async fn test_http_connection(url: &str, timeout: std::time::Duration) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .head(url)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    Ok(format!(
        "HTTP {} {}",
        resp.status().as_u16(),
        resp.status().canonical_reason().unwrap_or("OK")
    ))
}

/// Test a WebSocket URL by attempting a handshake.
async fn test_ws_connection(url: &str, timeout: std::time::Duration) -> Result<String, String> {
    let result = tokio::time::timeout(timeout, async {
        tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| format!("WebSocket handshake failed: {e}"))
    })
    .await;

    match result {
        Ok(Ok((_stream, response))) => {
            Ok(format!("WebSocket connected (HTTP {})", response.status()))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err(format!("Connection timed out after {}s", timeout.as_secs())),
    }
}
