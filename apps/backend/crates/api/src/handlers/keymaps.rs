//! Handlers for the keyboard shortcut / keymap system (PRD-52).
//!
//! Provides endpoints for user keymap preferences (preset selection,
//! custom binding overrides) and keymap export/import.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_db::models::keymap::{ImportKeymapRequest, UpsertKeymap};
use trulience_db::repositories::KeymapRepo;

use crate::error::AppResult;
use crate::middleware::rbac::RequireAuth;
use crate::response::DataResponse;
use crate::state::AppState;

/// Available preset names.
const PRESET_NAMES: &[&str] = &["default", "premiere", "resolve", "avid"];

// ---------------------------------------------------------------------------
// User keymap endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/keymap
///
/// Retrieve the authenticated user's keymap.
/// Returns 204 if no keymap has been saved yet.
pub async fn get_keymap(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let keymap = KeymapRepo::get_keymap(&state.pool, user.user_id).await?;

    match keymap {
        Some(k) => Ok(Json(DataResponse { data: k }).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// PUT /api/v1/user/keymap
///
/// Create or update the authenticated user's keymap preferences.
pub async fn update_keymap(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<UpsertKeymap>,
) -> AppResult<impl IntoResponse> {
    let keymap = KeymapRepo::upsert_keymap(&state.pool, user.user_id, &input).await?;

    tracing::info!(
        user_id = user.user_id,
        active_preset = %keymap.active_preset,
        "User keymap updated",
    );

    Ok(Json(DataResponse { data: keymap }))
}

// ---------------------------------------------------------------------------
// Preset endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/keymaps/presets
///
/// List available preset names.
pub async fn list_presets(
    RequireAuth(_user): RequireAuth,
    State(_state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(DataResponse { data: PRESET_NAMES }))
}

// ---------------------------------------------------------------------------
// Export / Import endpoints
// ---------------------------------------------------------------------------

/// POST /api/v1/keymaps/export
///
/// Export the user's full resolved keymap (preset + custom overrides) as JSON.
pub async fn export_keymap(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let keymap = KeymapRepo::get_keymap(&state.pool, user.user_id).await?;

    let (preset, bindings) = match keymap {
        Some(k) => (k.active_preset, k.custom_bindings_json),
        None => ("default".to_owned(), serde_json::json!({})),
    };

    let export = serde_json::json!({
        "active_preset": preset,
        "custom_bindings": bindings,
    });

    Ok(Json(DataResponse { data: export }).into_response())
}

/// POST /api/v1/keymaps/import
///
/// Import a keymap from a JSON payload. Applies the imported data as
/// the user's custom bindings.
pub async fn import_keymap(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<ImportKeymapRequest>,
) -> AppResult<impl IntoResponse> {
    let upsert = UpsertKeymap {
        active_preset: None,
        custom_bindings_json: Some(input.keymap_json),
    };

    let keymap = KeymapRepo::upsert_keymap(&state.pool, user.user_id, &upsert).await?;

    tracing::info!(user_id = user.user_id, "User keymap imported",);

    Ok(Json(DataResponse { data: keymap }))
}
