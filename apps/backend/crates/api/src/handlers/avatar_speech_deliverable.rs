//! Deliverable generation and completeness handlers for avatar speeches (PRD-136).
//!
//! Extracted from `avatar_speech` to keep file sizes manageable.
//! Provides deliverable JSON export and completeness tracking.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use indexmap::IndexMap;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::repositories::avatar_speech_repo::{CompletenessEntry, CompletenessSummary};
use x121_db::repositories::{
    AvatarRepo, AvatarSpeechRepo, LanguageRepo, ProjectSpeechConfigRepo, SpeechTypeRepo,
};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

/// Derive a URL-safe slug from a avatar name.
///
/// Lowercase, spaces and special avatars replaced with underscores,
/// non-alphanumeric/non-underscore avatars stripped, consecutive
/// underscores collapsed.
pub(crate) fn slugify(name: &str) -> String {
    let mut slug = String::with_capacity(name.len());
    for ch in name.to_lowercase().chars() {
        if ch.is_alphanumeric() {
            slug.push(ch);
        } else {
            // Replace spaces and special chars with underscore.
            if !slug.ends_with('_') {
                slug.push('_');
            }
        }
    }
    slug.trim_matches('_').to_string()
}

// ---------------------------------------------------------------------------
// Deliverable generation
// ---------------------------------------------------------------------------

/// Deliverable JSON structure for a single avatar.
#[derive(Debug, Serialize)]
pub struct SpeechDeliverable {
    pub avatar_id: DbId,
    pub avatar_slug: String,
    pub avatar_name: String,
    pub voice_id: Option<String>,
    pub generated_at: String,
    pub languages: Vec<String>,
    pub speech: IndexMap<String, IndexMap<String, Vec<String>>>,
}

/// POST /avatars/{avatar_id}/speeches/deliverable
///
/// Generate a deliverable JSON bundle from all approved speeches for a
/// avatar. Returns 422 if no approved speeches exist.
pub async fn generate_deliverable(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deliverable = build_deliverable(&state, avatar_id).await?;
    Ok(Json(DataResponse { data: deliverable }))
}

/// Build a [`SpeechDeliverable`] for a single avatar.
///
/// Shared between the per-avatar and bulk project endpoints.
pub(crate) async fn build_deliverable(
    state: &AppState,
    avatar_id: DbId,
) -> AppResult<SpeechDeliverable> {
    let avatar = AvatarRepo::find_by_id(&state.pool, avatar_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: avatar_id,
        }))?;

    let approved =
        AvatarSpeechRepo::list_approved_for_avatar(&state.pool, avatar_id).await?;

    if approved.is_empty() {
        return Err(AppError::Unprocessable(
            "No approved speeches for this avatar".to_string(),
        ));
    }

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

    // Build nested structure: type_name (snake_case) -> language_code -> [texts]
    // Already ordered by type sort_order, language, variant sort_order from the query.
    let mut speech: IndexMap<String, IndexMap<String, Vec<String>>> = IndexMap::new();
    let mut lang_set = IndexMap::new();

    for entry in &approved {
        let tname = slugify(&type_name(entry.speech_type_id));
        let lcode = language_code(entry.language_id);

        lang_set.entry(lcode.clone()).or_insert(());

        speech
            .entry(tname)
            .or_default()
            .entry(lcode)
            .or_default()
            .push(entry.text.clone());
    }

    let voice_id = avatar
        .settings
        .get("elevenlabs_voice")
        .and_then(|v| v.as_str())
        .map(String::from);

    let avatar_slug = slugify(&avatar.name);
    let generated_at = Utc::now().to_rfc3339();

    Ok(SpeechDeliverable {
        avatar_id,
        avatar_slug,
        avatar_name: avatar.name,
        voice_id,
        generated_at,
        languages: lang_set.into_keys().collect(),
        speech,
    })
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/// GET /avatars/{avatar_id}/speeches/completeness
///
/// Compute speech completeness for a avatar against its project's speech
/// configuration.
pub async fn speech_completeness(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let avatar = AvatarRepo::find_by_id(&state.pool, avatar_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: avatar_id,
        }))?;

    let config = ProjectSpeechConfigRepo::get_or_default(&state.pool, avatar.project_id).await?;

    let types = SpeechTypeRepo::list_all(&state.pool).await?;
    let languages = LanguageRepo::list_all(&state.pool).await?;

    let type_name = |id: i16| -> String {
        types
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.name.clone())
            .unwrap_or_else(|| format!("unknown_{id}"))
    };

    let lang_code = |id: i16| -> String {
        languages
            .iter()
            .find(|l| l.id == id)
            .map(|l| l.code.clone())
            .unwrap_or_else(|| "en".to_string())
    };

    // Count approved speeches per (type, language) for this avatar.
    let approved =
        AvatarSpeechRepo::list_approved_for_avatar(&state.pool, avatar_id).await?;
    let mut counts: std::collections::HashMap<(i16, i16), i32> = std::collections::HashMap::new();
    for s in &approved {
        *counts.entry((s.speech_type_id, s.language_id)).or_insert(0) += 1;
    }

    let mut breakdown = Vec::with_capacity(config.len());
    let mut total_slots = 0i32;
    let mut filled_slots = 0i32;

    for entry in &config {
        let approved_count = counts
            .get(&(entry.speech_type_id, entry.language_id))
            .copied()
            .unwrap_or(0);
        let filled = approved_count.min(entry.min_variants);
        total_slots += entry.min_variants;
        filled_slots += filled;

        let status = if approved_count >= entry.min_variants {
            "complete"
        } else if approved_count > 0 {
            "partial"
        } else {
            "missing"
        };

        breakdown.push(CompletenessEntry {
            speech_type_id: entry.speech_type_id,
            speech_type_name: type_name(entry.speech_type_id),
            language_id: entry.language_id,
            language_code: lang_code(entry.language_id),
            required: entry.min_variants,
            approved: approved_count,
            status: status.to_string(),
        });
    }

    let completeness_pct = if total_slots > 0 {
        (filled_slots * 100) / total_slots
    } else {
        100
    };

    let summary = CompletenessSummary {
        total_slots,
        filled_slots,
        completeness_pct,
        breakdown,
    };

    Ok(Json(DataResponse { data: summary }))
}
