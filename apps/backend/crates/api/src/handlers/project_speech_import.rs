//! Handlers for bulk project speech import and deliverable generation (PRD-136).
//!
//! Routes nested under `/projects/{project_id}/...`.
//! Provides multi-character speech import and bulk deliverable zip export.

use std::io::Write;

use axum::extract::{Path, State};
use axum::http::header;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::types::DbId;
use x121_db::repositories::{CharacterRepo, CharacterSpeechRepo, LanguageRepo, SpeechTypeRepo};

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};

use crate::error::{AppError, AppResult};
use crate::handlers::character_speech::{build_deliverable, slugify};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for bulk speech import.
#[derive(Debug, Deserialize)]
pub struct ImportProjectSpeechesRequest {
    pub format: String,
    pub data: String,
    /// When true, skip entries that already exist (same type + language + text).
    #[serde(default)]
    pub skip_existing: bool,
}

/// Report returned after bulk speech import.
#[derive(Debug, Serialize)]
pub struct BulkImportReport {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    pub characters_matched: Vec<String>,
    pub characters_unmatched: Vec<String>,
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

/// POST /projects/{project_id}/speeches/import
///
/// Import speeches for multiple characters at once. Supports JSON
/// (greetings.json style) and CSV formats.
pub async fn bulk_import_speeches(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(body): Json<ImportProjectSpeechesRequest>,
) -> AppResult<impl IntoResponse> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    let languages = LanguageRepo::list_all(&state.pool).await?;

    // Build slug -> character_id map.
    let slug_map: std::collections::HashMap<String, DbId> = characters
        .iter()
        .map(|c| (slugify(&c.name), c.id))
        .collect();

    // Build language name -> id map (case-insensitive).
    let lang_map: std::collections::HashMap<String, i16> = languages
        .iter()
        .map(|l| (l.name.to_lowercase(), l.id))
        .collect();

    // Also build language code -> id map for CSV format.
    let lang_code_map: std::collections::HashMap<String, i16> = languages
        .iter()
        .map(|l| (l.code.to_lowercase(), l.id))
        .collect();

    match body.format.as_str() {
        "json" => {
            import_json(
                &state,
                auth.user_id,
                project_id,
                &body.data,
                &slug_map,
                &lang_map,
                body.skip_existing,
            )
            .await
        }
        "csv" => {
            import_csv(
                &state,
                auth.user_id,
                project_id,
                &body.data,
                &slug_map,
                &lang_map,
                &lang_code_map,
                body.skip_existing,
            )
            .await
        }
        _ => Err(AppError::BadRequest(
            "format must be 'json' or 'csv'".to_string(),
        )),
    }
}

/// Import from JSON format:
/// ```json
/// {
///   "character_slug": {
///     "speech_type_name": {
///       "language_name": ["variant1", "variant2"]
///     }
///   }
/// }
/// ```
async fn import_json(
    state: &AppState,
    user_id: DbId,
    project_id: DbId,
    data: &str,
    slug_map: &std::collections::HashMap<String, DbId>,
    lang_map: &std::collections::HashMap<String, i16>,
    skip_existing: bool,
) -> AppResult<Json<DataResponse<BulkImportReport>>> {
    let parsed: serde_json::Value = serde_json::from_str(data)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;

    let root = parsed
        .as_object()
        .ok_or_else(|| AppError::BadRequest("Expected top-level JSON object".to_string()))?;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();
    let mut matched_set = std::collections::HashSet::new();
    let mut unmatched_set = std::collections::HashSet::new();

    for (char_slug, types_val) in root {
        let normalized_slug = slugify(char_slug);
        let Some(&character_id) = slug_map.get(&normalized_slug) else {
            unmatched_set.insert(char_slug.clone());
            continue;
        };
        matched_set.insert(char_slug.clone());

        let Some(types_obj) = types_val.as_object() else {
            errors.push(format!("{char_slug}: expected object for speech types"));
            continue;
        };

        // Collect entries for this character.
        let mut entries: Vec<(i16, i16, String)> = Vec::new();

        for (type_name, langs_val) in types_obj {
            let speech_type = SpeechTypeRepo::find_or_create(&state.pool, type_name).await?;

            let Some(langs_obj) = langs_val.as_object() else {
                errors.push(format!(
                    "{char_slug}.{type_name}: expected object for languages"
                ));
                continue;
            };

            for (lang_name, texts_val) in langs_obj {
                let language_id = lang_map
                    .get(&lang_name.to_lowercase())
                    .copied()
                    .unwrap_or_else(|| {
                        skipped += 1;
                        errors.push(format!(
                            "{char_slug}.{type_name}.{lang_name}: unknown language, skipping"
                        ));
                        0
                    });

                if language_id == 0 {
                    continue;
                }

                let Some(texts_arr) = texts_val.as_array() else {
                    errors.push(format!(
                        "{char_slug}.{type_name}.{lang_name}: expected array of strings"
                    ));
                    continue;
                };

                for text_val in texts_arr {
                    if let Some(text) = text_val.as_str() {
                        if !text.trim().is_empty() {
                            entries.push((speech_type.id, language_id, text.to_string()));
                        }
                    }
                }
            }
        }

        if !entries.is_empty() {
            let to_create = if skip_existing {
                // Fetch existing speeches and filter out duplicates.
                let existing = CharacterSpeechRepo::list_for_character(&state.pool, character_id).await?;
                let existing_keys: std::collections::HashSet<(i16, i16, String)> = existing
                    .iter()
                    .map(|s| (s.speech_type_id, s.language_id, s.text.to_lowercase()))
                    .collect();
                let (new_entries, dup_count): (Vec<_>, usize) = {
                    let mut new_e = Vec::new();
                    let mut dups = 0usize;
                    for e in &entries {
                        if existing_keys.contains(&(e.0, e.1, e.2.to_lowercase())) {
                            dups += 1;
                        } else {
                            new_e.push(e.clone());
                        }
                    }
                    (new_e, dups)
                };
                skipped += dup_count;
                new_entries
            } else {
                entries
            };

            if !to_create.is_empty() {
                let created =
                    CharacterSpeechRepo::bulk_create_with_language(&state.pool, character_id, &to_create)
                        .await?;
                imported += created.len();
            }
        }
    }

    let matched: Vec<String> = matched_set.into_iter().collect();
    let unmatched: Vec<String> = unmatched_set.into_iter().collect();

    tracing::info!(
        user_id = user_id,
        project_id = project_id,
        imported = imported,
        skipped = skipped,
        "Bulk project speeches imported (JSON)"
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Bulk speech import (JSON): {imported} imported, {skipped} skipped, {} matched, {} unmatched",
                matched.len(), unmatched.len(),
            ),
        )
        .with_project(project_id)
        .with_user(user_id)
        .with_fields(serde_json::json!({
            "imported": imported,
            "skipped": skipped,
            "characters_matched": matched,
            "characters_unmatched": unmatched,
        })),
    );

    Ok(Json(DataResponse {
        data: BulkImportReport {
            imported,
            skipped,
            errors,
            characters_matched: matched,
            characters_unmatched: unmatched,
        },
    }))
}

/// Import from CSV format: `character_slug,speech_type,language,text`
async fn import_csv(
    state: &AppState,
    user_id: DbId,
    project_id: DbId,
    data: &str,
    slug_map: &std::collections::HashMap<String, DbId>,
    lang_map: &std::collections::HashMap<String, i16>,
    lang_code_map: &std::collections::HashMap<String, i16>,
    skip_existing: bool,
) -> AppResult<Json<DataResponse<BulkImportReport>>> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();
    let mut matched_set = std::collections::HashSet::new();
    let mut unmatched_set = std::collections::HashSet::new();

    // Collect entries per character for bulk create.
    let mut char_entries: std::collections::HashMap<DbId, Vec<(i16, i16, String)>> =
        std::collections::HashMap::new();

    for (i, line) in data.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Skip header row.
        if i == 0 {
            let lower = trimmed.to_lowercase();
            if lower.starts_with("character") || lower.starts_with("slug") {
                continue;
            }
        }

        let parts: Vec<&str> = trimmed.splitn(4, ',').collect();
        if parts.len() < 4 {
            errors.push(format!(
                "row {}: expected 4 columns (character_slug,speech_type,language,text)",
                i + 1
            ));
            continue;
        }

        let char_slug = parts[0].trim();
        let type_name = parts[1].trim();
        let lang_name = parts[2].trim();
        let mut text = parts[3].trim().to_string();

        // Strip surrounding quotes.
        if text.starts_with('"') && text.ends_with('"') && text.len() >= 2 {
            text = text[1..text.len() - 1].replace("\"\"", "\"");
        }

        if text.is_empty() {
            skipped += 1;
            continue;
        }

        let normalized_slug = slugify(char_slug);
        let Some(&character_id) = slug_map.get(&normalized_slug) else {
            unmatched_set.insert(char_slug.to_string());
            skipped += 1;
            continue;
        };
        matched_set.insert(char_slug.to_string());

        // Resolve language by name first, then by code.
        let language_id = lang_map
            .get(&lang_name.to_lowercase())
            .or_else(|| lang_code_map.get(&lang_name.to_lowercase()))
            .copied();

        let Some(language_id) = language_id else {
            errors.push(format!("row {}: unknown language '{lang_name}'", i + 1));
            skipped += 1;
            continue;
        };

        let speech_type = SpeechTypeRepo::find_or_create(&state.pool, type_name).await?;

        char_entries
            .entry(character_id)
            .or_default()
            .push((speech_type.id, language_id, text));
    }

    // Bulk create per character (with optional dedup).
    for (character_id, entries) in &char_entries {
        let to_create = if skip_existing {
            let existing = CharacterSpeechRepo::list_for_character(&state.pool, *character_id).await?;
            let existing_keys: std::collections::HashSet<(i16, i16, String)> = existing
                .iter()
                .map(|s| (s.speech_type_id, s.language_id, s.text.to_lowercase()))
                .collect();
            let mut new_entries = Vec::new();
            for e in entries {
                if existing_keys.contains(&(e.0, e.1, e.2.to_lowercase())) {
                    skipped += 1;
                } else {
                    new_entries.push(e.clone());
                }
            }
            new_entries
        } else {
            entries.clone()
        };

        if !to_create.is_empty() {
            let created =
                CharacterSpeechRepo::bulk_create_with_language(&state.pool, *character_id, &to_create)
                    .await?;
            imported += created.len();
        }
    }

    let matched: Vec<String> = matched_set.into_iter().collect();
    let unmatched: Vec<String> = unmatched_set.into_iter().collect();

    tracing::info!(
        user_id = user_id,
        project_id = project_id,
        imported = imported,
        skipped = skipped,
        "Bulk project speeches imported (CSV)"
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Bulk speech import (CSV): {imported} imported, {skipped} skipped, {} matched, {} unmatched",
                matched.len(), unmatched.len(),
            ),
        )
        .with_project(project_id)
        .with_user(user_id)
        .with_fields(serde_json::json!({
            "imported": imported,
            "skipped": skipped,
            "characters_matched": matched,
            "characters_unmatched": unmatched,
        })),
    );

    Ok(Json(DataResponse {
        data: BulkImportReport {
            imported,
            skipped,
            errors,
            characters_matched: matched,
            characters_unmatched: unmatched,
        },
    }))
}

// ---------------------------------------------------------------------------
// Bulk deliverable generation
// ---------------------------------------------------------------------------

/// POST /projects/{project_id}/speech-deliverables
///
/// Generate deliverable JSON for all characters in a project that have
/// approved speeches, bundled as a zip file.
pub async fn bulk_generate_deliverables(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;

    // Build deliverables for each character that has approved speeches.
    let mut deliverables = Vec::new();
    for character in &characters {
        match build_deliverable(&state, character.id).await {
            Ok(d) => deliverables.push(d),
            Err(AppError::Unprocessable(_)) => continue, // No approved speeches, skip.
            Err(e) => return Err(e),
        }
    }

    if deliverables.is_empty() {
        return Err(AppError::Unprocessable(
            "No characters have approved speeches in this project".to_string(),
        ));
    }

    // Bundle into a zip file.
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for d in &deliverables {
            let filename = format!("{}_speech.json", d.character_slug);
            zip.start_file(&filename, options)
                .map_err(|e| AppError::InternalError(format!("Zip error: {e}")))?;

            let json = serde_json::to_vec_pretty(d)
                .map_err(|e| AppError::InternalError(format!("JSON serialize error: {e}")))?;
            zip.write_all(&json)
                .map_err(|e| AppError::InternalError(format!("Zip write error: {e}")))?;
        }

        zip.finish()
            .map_err(|e| AppError::InternalError(format!("Zip finish error: {e}")))?;
    }

    Ok((
        [
            (header::CONTENT_TYPE, "application/zip"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"speech_deliverables.zip\"",
            ),
        ],
        buf,
    ))
}
