//! Handlers for avatar speeches (PRD-124, PRD-136).
//!
//! Manages versioned speech text entries per avatar, with import/export
//! support for JSON and CSV formats. Supports multilingual entries, approval
//! workflow, and variant reordering.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar_speech::{CreateAvatarSpeech, UpdateAvatarSpeech, UpdateSpeechStatus};
use x121_db::models::speech_status::status_name_to_id;
use x121_db::repositories::{AvatarSpeechRepo, LanguageRepo, SpeechTypeRepo};

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// Re-export deliverable/completeness handlers and helpers from the extracted module.
pub(crate) use crate::handlers::avatar_speech_deliverable::{build_deliverable, slugify};
pub use crate::handlers::avatar_speech_deliverable::{
    generate_deliverable, speech_completeness, SpeechDeliverable,
};

/// Optional query parameters to filter the speech list.
#[derive(Debug, Deserialize)]
pub struct SpeechListQuery {
    pub type_id: Option<i16>,
    pub language_id: Option<i16>,
}

/// Request body for importing speeches.
#[derive(Debug, Deserialize)]
pub struct ImportSpeechesRequest {
    pub format: String,
    pub data: String,
}

/// Response body for speech import results.
#[derive(Debug, Serialize)]
pub struct ImportSpeechesResponse {
    pub imported: usize,
    pub created_types: Vec<String>,
    pub errors: Vec<String>,
}

/// Request body for exporting speeches.
#[derive(Debug, Deserialize)]
pub struct ExportSpeechesRequest {
    pub format: String,
}

/// A single entry in JSON import format.
#[derive(Debug, Deserialize)]
struct ImportJsonEntry {
    #[serde(rename = "type")]
    speech_type: String,
    text: String,
    /// Optional language code; defaults to "en" if absent.
    language: Option<String>,
}

/// A single entry in JSON export format.
#[derive(Debug, Serialize)]
struct ExportJsonEntry {
    #[serde(rename = "type")]
    speech_type: String,
    text: String,
    version: i32,
    language: String,
}

/// Query parameters for bulk approve.
#[derive(Debug, Deserialize)]
pub struct BulkApproveQuery {
    pub language_id: Option<i16>,
    pub type_id: Option<i16>,
}

/// Request body for reordering speeches.
#[derive(Debug, Deserialize)]
pub struct ReorderSpeechesRequest {
    pub speech_ids: Vec<DbId>,
}

/// Response for bulk approve.
#[derive(Debug, Serialize)]
pub struct BulkApproveResponse {
    pub approved_count: u64,
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

/// GET /avatars/{avatar_id}/speeches?type_id=N&language_id=N
///
/// List all non-deleted speeches for a avatar, optionally filtered by type
/// and/or language.
pub async fn list_speeches(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Query(params): Query<SpeechListQuery>,
) -> AppResult<impl IntoResponse> {
    let speeches = match (params.type_id, params.language_id) {
        (Some(tid), Some(lid)) => {
            AvatarSpeechRepo::list_for_avatar_by_type_and_language(&state.pool, avatar_id, tid, lid)
                .await?
        }
        (Some(tid), None) => {
            AvatarSpeechRepo::list_for_avatar_by_type(&state.pool, avatar_id, tid).await?
        }
        (None, Some(lid)) => {
            AvatarSpeechRepo::list_for_avatar_by_language(&state.pool, avatar_id, lid).await?
        }
        (None, None) => AvatarSpeechRepo::list_for_avatar(&state.pool, avatar_id).await?,
    };
    Ok(Json(DataResponse { data: speeches }))
}

/// POST /avatars/{avatar_id}/speeches
///
/// Create a new speech entry with auto-assigned version. Defaults language_id
/// to 1 (English) if not provided.
pub async fn create_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<CreateAvatarSpeech>,
) -> AppResult<impl IntoResponse> {
    if body.text.trim().is_empty() {
        return Err(AppError::BadRequest("text must not be empty".to_string()));
    }

    let speech = AvatarSpeechRepo::create(&state.pool, avatar_id, &body).await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        speech_id = speech.id,
        language_id = speech.language_id,
        "Avatar speech created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: speech })))
}

/// PUT /avatars/{avatar_id}/speeches/{speech_id}
///
/// Update the text of an existing speech entry.
pub async fn update_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((avatar_id, speech_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateAvatarSpeech>,
) -> AppResult<impl IntoResponse> {
    if body.text.trim().is_empty() {
        return Err(AppError::BadRequest("text must not be empty".to_string()));
    }

    let speech = AvatarSpeechRepo::update(&state.pool, speech_id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarSpeech",
            id: speech_id,
        }))?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        speech_id = speech_id,
        "Avatar speech updated"
    );

    Ok(Json(DataResponse { data: speech }))
}

/// DELETE /avatars/{avatar_id}/speeches/{speech_id}
///
/// Soft-delete a speech entry.
pub async fn delete_speech(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((avatar_id, speech_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = AvatarSpeechRepo::soft_delete(&state.pool, speech_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarSpeech",
            id: speech_id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        speech_id = speech_id,
        "Avatar speech deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Approval workflow handlers
// ---------------------------------------------------------------------------

/// PUT /avatars/{avatar_id}/speeches/{speech_id}/status
///
/// Update the approval status of a speech entry. Accepts a status name
/// ("draft", "approved", "rejected") and maps it to the status ID.
pub async fn update_speech_status(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((avatar_id, speech_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateSpeechStatus>,
) -> AppResult<impl IntoResponse> {
    let status_id = status_name_to_id(&body.status).ok_or_else(|| {
        AppError::BadRequest(format!(
            "Invalid status '{}'. Must be one of: draft, approved, rejected",
            body.status
        ))
    })?;

    let speech = AvatarSpeechRepo::update_status(&state.pool, speech_id, status_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarSpeech",
            id: speech_id,
        }))?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        speech_id = speech_id,
        status = %body.status,
        "Avatar speech status updated"
    );

    Ok(Json(DataResponse { data: speech }))
}

/// POST /avatars/{avatar_id}/speeches/bulk-approve?language_id=N&type_id=N
///
/// Bulk approve all draft/rejected speeches for a avatar, optionally
/// filtered by language and/or type.
pub async fn bulk_approve_speeches(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Query(params): Query<BulkApproveQuery>,
) -> AppResult<impl IntoResponse> {
    let approved_count =
        AvatarSpeechRepo::bulk_approve(&state.pool, avatar_id, params.language_id, params.type_id)
            .await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        approved_count = approved_count,
        "Speeches bulk approved"
    );

    Ok(Json(DataResponse {
        data: BulkApproveResponse { approved_count },
    }))
}

// ---------------------------------------------------------------------------
// Reorder handler
// ---------------------------------------------------------------------------

/// PUT /avatars/{avatar_id}/speeches/reorder
///
/// Reorder speech entries. Accepts a list of speech IDs; each gets sort_order
/// set to its 1-based position in the list.
pub async fn reorder_speeches(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<ReorderSpeechesRequest>,
) -> AppResult<StatusCode> {
    if body.speech_ids.is_empty() {
        return Err(AppError::BadRequest(
            "speech_ids must not be empty".to_string(),
        ));
    }

    // Validate that all speech IDs belong to this avatar.
    let existing = AvatarSpeechRepo::list_for_avatar(&state.pool, avatar_id).await?;
    let existing_ids: std::collections::HashSet<DbId> = existing.iter().map(|s| s.id).collect();

    for &sid in &body.speech_ids {
        if !existing_ids.contains(&sid) {
            return Err(AppError::BadRequest(format!(
                "Speech ID {sid} does not belong to avatar {avatar_id}"
            )));
        }
    }

    AvatarSpeechRepo::reorder(&state.pool, &body.speech_ids).await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        count = body.speech_ids.len(),
        "Speeches reordered"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

/// POST /avatars/{avatar_id}/speeches/import
///
/// Import speeches from JSON or CSV data. Unknown type names are auto-created.
/// Supports optional language field (defaults to English).
pub async fn import_speeches(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<ImportSpeechesRequest>,
) -> AppResult<impl IntoResponse> {
    let parsed = match body.format.as_str() {
        "json" => parse_json_import(&body.data)?,
        "csv" => parse_csv_import(&body.data)?,
        _ => {
            return Err(AppError::BadRequest(
                "format must be 'json' or 'csv'".to_string(),
            ))
        }
    };

    // Validate all entries before creating anything.
    let mut errors = Vec::new();
    for (i, (type_name, text, _lang)) in parsed.iter().enumerate() {
        if type_name.trim().is_empty() {
            errors.push(format!("row {}: type name is empty", i + 1));
        }
        if text.trim().is_empty() {
            errors.push(format!("row {}: text is empty", i + 1));
        }
    }
    if !errors.is_empty() {
        return Ok(Json(DataResponse {
            data: ImportSpeechesResponse {
                imported: 0,
                created_types: vec![],
                errors,
            },
        }));
    }

    // Resolve type names to IDs and language codes to IDs.
    let mut created_types = Vec::new();
    let mut entries: Vec<(i16, i16, String)> = Vec::with_capacity(parsed.len());

    for (type_name, text, lang_code) in &parsed {
        let trimmed_name = type_name.trim();
        let existed_before = SpeechTypeRepo::find_by_name(&state.pool, trimmed_name)
            .await?
            .is_some();
        let speech_type = SpeechTypeRepo::find_or_create(&state.pool, trimmed_name).await?;
        if !existed_before {
            created_types.push(trimmed_name.to_string());
        }

        // Resolve language code; default to English (id=1).
        let language_id = if let Some(code) = lang_code {
            LanguageRepo::find_by_code(&state.pool, code)
                .await?
                .map(|l| l.id)
                .unwrap_or(1)
        } else {
            1
        };

        entries.push((speech_type.id, language_id, text.clone()));
    }

    // Bulk create with language support.
    let created =
        AvatarSpeechRepo::bulk_create_with_language(&state.pool, avatar_id, &entries).await?;
    let imported = created.len();

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        imported = imported,
        created_types = ?created_types,
        "Speeches imported"
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Imported {imported} speech{} for avatar {avatar_id}",
                if imported != 1 { "es" } else { "" }
            ),
        )
        .with_user(auth.user_id)
        .with_fields(serde_json::json!({
            "avatar_id": avatar_id,
            "imported": imported,
            "format": body.format,
        })),
    );

    Ok(Json(DataResponse {
        data: ImportSpeechesResponse {
            imported,
            created_types,
            errors: vec![],
        },
    }))
}

/// POST /avatars/{avatar_id}/speeches/export
///
/// Export speeches as JSON array or CSV string. Includes language code.
pub async fn export_speeches(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<ExportSpeechesRequest>,
) -> AppResult<impl IntoResponse> {
    let speeches = AvatarSpeechRepo::list_for_avatar(&state.pool, avatar_id).await?;

    // Load speech types and languages for name/code lookup.
    let types = SpeechTypeRepo::list_all(&state.pool).await?;
    let languages = LanguageRepo::list_all(&state.pool).await?;

    let type_name = |id: i16| -> String {
        types
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.name.clone())
            .unwrap_or_else(|| format!("unknown_{id}"))
    };

    let language_code = |id: i16| -> String {
        languages
            .iter()
            .find(|l| l.id == id)
            .map(|l| l.code.clone())
            .unwrap_or_else(|| "en".to_string())
    };

    let data: serde_json::Value = match body.format.as_str() {
        "json" => {
            let items: Vec<ExportJsonEntry> = speeches
                .iter()
                .map(|s| ExportJsonEntry {
                    speech_type: type_name(s.speech_type_id),
                    text: s.text.clone(),
                    version: s.version,
                    language: language_code(s.language_id),
                })
                .collect();
            serde_json::to_value(items).unwrap_or_default()
        }
        "csv" => {
            let mut csv = String::new();
            for s in &speeches {
                let escaped_text = s.text.replace('"', "\"\"");
                csv.push_str(&format!(
                    "{},{},\"{}\"\n",
                    type_name(s.speech_type_id),
                    language_code(s.language_id),
                    escaped_text
                ));
            }
            serde_json::Value::String(csv)
        }
        _ => {
            return Err(AppError::BadRequest(
                "format must be 'json' or 'csv'".to_string(),
            ));
        }
    };
    Ok(Json(DataResponse { data }))
}

// ---------------------------------------------------------------------------
// Import parsers
// ---------------------------------------------------------------------------

/// Parse JSON import format: `[{ "type": "Greeting", "text": "Hey...", "language": "en" }, ...]`
///
/// The `language` field is optional; entries without it default to English.
fn parse_json_import(data: &str) -> AppResult<Vec<(String, String, Option<String>)>> {
    let entries: Vec<ImportJsonEntry> = serde_json::from_str(data)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;

    Ok(entries
        .into_iter()
        .map(|e| (e.speech_type, e.text, e.language))
        .collect())
}

/// Parse CSV import format: `type,text` or `type,language,text` per line.
///
/// Handles an optional header row (skips if first row starts with "type,").
/// If only two columns are present, language defaults to None (English).
fn parse_csv_import(data: &str) -> AppResult<Vec<(String, String, Option<String>)>> {
    let mut results = Vec::new();
    let mut has_language_col = false;

    for (i, line) in data.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Detect header row.
        if i == 0 {
            let lower = trimmed.to_lowercase();
            if lower.starts_with("type,") {
                has_language_col = lower.contains("language");
                continue;
            }
        }

        // Split on first comma.
        let Some(first_comma) = trimmed.find(',') else {
            return Err(AppError::BadRequest(format!(
                "row {}: expected comma-separated format, no comma found",
                i + 1
            )));
        };

        let type_name = trimmed[..first_comma].trim().to_string();
        let rest = trimmed[first_comma + 1..].trim();

        // Check for language column (second field before text).
        let (language, text) = if has_language_col {
            if let Some(second_comma) = rest.find(',') {
                let lang = rest[..second_comma].trim().to_string();
                let txt = rest[second_comma + 1..].trim().to_string();
                (Some(lang), txt)
            } else {
                (None, rest.to_string())
            }
        } else {
            (None, rest.to_string())
        };

        // Strip surrounding quotes if present.
        let mut clean_text = text;
        if clean_text.starts_with('"') && clean_text.ends_with('"') && clean_text.len() >= 2 {
            clean_text = clean_text[1..clean_text.len() - 1].replace("\"\"", "\"");
        }

        let lang = if language.as_deref() == Some("") {
            None
        } else {
            language
        };

        results.push((type_name, clean_text, lang));
    }

    Ok(results)
}
