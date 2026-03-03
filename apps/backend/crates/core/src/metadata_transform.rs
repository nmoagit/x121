//! Metadata transformation engine.
//!
//! Ports the Python `fix_metadata.py` / `batch_fix_metadata.py` logic to Rust.
//! Transforms raw `bio.json` + `tov.json` into the production metadata schema,
//! with emoji removal, key normalization, flat-to-nested mapping, and a
//! generation report listing missing fields, warnings, and errors.

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::LazyLock;

// ---------------------------------------------------------------------------
// Source constants
// ---------------------------------------------------------------------------

/// Metadata version source: created via manual form edit.
pub const SOURCE_MANUAL: &str = "manual";
/// Metadata version source: created via automated generation from bio/tov files.
pub const SOURCE_GENERATED: &str = "generated";
/// Metadata version source: created via CSV import.
pub const SOURCE_CSV_IMPORT: &str = "csv_import";
/// Metadata version source: created via JSON file import.
pub const SOURCE_JSON_IMPORT: &str = "json_import";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Input for metadata generation.
#[derive(Debug, Clone, Deserialize)]
pub struct MetadataInput {
    pub bio: Option<Value>,
    pub tov: Option<Value>,
    pub name: String,
}

/// Result of metadata generation.
#[derive(Debug, Clone, Serialize)]
pub struct MetadataResult {
    pub metadata: Value,
    pub report: GenerationReport,
}

/// Report summarizing the generation outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationReport {
    pub field_count: usize,
    pub missing: Vec<MissingField>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// A field that was expected but not found.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingField {
    pub field: String,
    pub category: String,
}

// ---------------------------------------------------------------------------
// Emoji removal
// ---------------------------------------------------------------------------

/// Regex matching common emoji Unicode ranges + variation selectors.
static EMOJI_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        "[\u{1F600}-\u{1F64F}",
        "\u{1F300}-\u{1F5FF}",
        "\u{1F680}-\u{1F6FF}",
        "\u{1F1E0}-\u{1F1FF}",
        "\u{2600}-\u{26FF}",
        "\u{2700}-\u{27BF}",
        "\u{FE00}-\u{FE0F}",
        "\u{1F900}-\u{1F9FF}",
        "\u{1FA00}-\u{1FA6F}",
        "\u{1FA70}-\u{1FAFF}",
        "\u{200D}",
        "\u{20E3}",
        "\u{E0020}-\u{E007F}",
        "]",
    ))
    .expect("invalid emoji regex")
});

/// Regex matching phrases that reference emojis (e.g., "[blushing emoji]").
static EMOJI_PHRASE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[?[\w\s]*emoji[\w\s]*\]?").expect("invalid emoji phrase regex")
});

/// Remove emojis and emoji-reference phrases from text.
pub fn remove_emojis(text: &str) -> String {
    let no_emoji = EMOJI_RE.replace_all(text, "");
    let no_phrases = EMOJI_PHRASE_RE.replace_all(&no_emoji, "");
    no_phrases.trim().to_string()
}

// ---------------------------------------------------------------------------
// Bio extraction from ToV
// ---------------------------------------------------------------------------

/// Regex for `{bot_name}` placeholder (case-insensitive).
static BOT_NAME_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\{bot_name\}").expect("invalid bot_name regex")
});

/// Regex for `{user_name}` placeholder (case-insensitive).
static USER_NAME_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\{user_name\}").expect("invalid user_name regex")
});

/// Extract a biography string from a tone-of-voice JSON, replacing
/// `{bot_name}` placeholders with the character name.
pub fn extract_bio_from_tov(tov: &Map<String, Value>, name: &str) -> Option<String> {
    let desc = tov
        .get("description")
        .or_else(|| tov.get("bio"))
        .or_else(|| tov.get("backstory"))
        .and_then(Value::as_str)?;

    let replaced = BOT_NAME_RE.replace_all(desc, name);
    let replaced = USER_NAME_RE.replace_all(&replaced, "you");
    let cleaned = remove_emojis(&replaced);

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

// ---------------------------------------------------------------------------
// Schema field maps
// ---------------------------------------------------------------------------

/// Build a HashMap from an array of (source_key, target_key) pairs.
fn build_map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Top-level field mapping (source → target).
static TOP_LEVEL_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    build_map(&[
        ("voice_provider", "VoiceProvider"),
        ("voiceprovider", "VoiceProvider"),
        ("voice_id", "VoiceID"),
        ("voiceid", "VoiceID"),
        ("bio", "bio"),
        ("biography", "bio"),
        ("description", "bio"),
        ("gender", "gender"),
        ("sexual_orientation", "sexual_orientation"),
        ("orientation", "sexual_orientation"),
        ("age", "age"),
        ("relationship_status", "relationship_status"),
        ("relationship", "relationship_status"),
        ("birthplace", "birthplace"),
        ("birth_place", "birthplace"),
        ("current_job", "current_job"),
        ("job", "current_job"),
        ("occupation", "current_job"),
        ("ethnicity", "ethnicity"),
        ("race", "ethnicity"),
    ])
});

/// Appearance field mapping (source → nested `appearance.*` target).
static APPEARANCE_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    build_map(&[
        ("hair", "hair"),
        ("hair_color", "hair"),
        ("hair_description", "hair"),
        ("eye_color", "eye_color"),
        ("eyes", "eye_color"),
        ("body_type", "body_type"),
        ("build", "body_type"),
        ("body", "body_type"),
    ])
});

/// Favorites field mapping (source → nested `favorites.*` target).
static FAVORITES_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    build_map(&[
        ("favorite_color", "color"),
        ("fav_color", "color"),
        ("color", "color"),
        ("favorite_food", "food"),
        ("fav_food", "food"),
        ("food", "food"),
        ("favorite_beverage", "beverage"),
        ("fav_beverage", "beverage"),
        ("beverage", "beverage"),
        ("drink", "beverage"),
        ("favorite_movie", "movie"),
        ("fav_movie", "movie"),
        ("movie", "movie"),
        ("favorite_tv_show", "tv_show"),
        ("fav_tv_show", "tv_show"),
        ("tv_show", "tv_show"),
    ])
});

/// Sexual preferences mapping (source → nested `sexual_preferences.*` target).
static SEXUAL_PREFS_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    build_map(&[
        ("positions", "positions"),
        ("preferred_positions", "positions"),
        ("kinks", "kinks"),
        ("fetishes", "kinks"),
    ])
});

/// Optional top-level fields mapping.
static OPTIONAL_MAP: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    build_map(&[
        ("hobbies", "hobbies"),
        ("hobby", "hobbies"),
        ("dislikes", "dislikes"),
        ("biggest_dream", "biggest_dream"),
        ("dream", "biggest_dream"),
        ("guilty_pleasure", "guilty_pleasure"),
        ("love_language", "love_language"),
        ("phobia", "phobia"),
        ("fear", "phobia"),
        ("habits", "habits"),
        ("personality", "personality"),
        ("backstory", "backstory"),
        ("interesting_facts", "interesting_facts"),
        ("facts", "interesting_facts"),
        ("personal_experience", "personal_experience"),
    ])
});

/// The "description" key in ToV is always handled by `extract_bio_from_tov`
/// and should not be merged into the source directly (it's a generic bio
/// field that needs `{bot_name}` placeholder processing).
const TOV_DESCRIPTION_KEY: &str = "description";

// ---------------------------------------------------------------------------
// Schema transformation
// ---------------------------------------------------------------------------

/// Transform a flat bio JSON object into the nested production schema.
fn transform_to_schema(bio: &Map<String, Value>, tov_bio: Option<&str>) -> Map<String, Value> {
    let mut result = Map::new();
    let mut appearance = Map::new();
    let mut favorites = Map::new();
    let mut sexual_prefs = Map::new();

    for (raw_key, raw_value) in bio {
        if raw_value.is_null() || raw_value.as_str().map_or(false, |s| s.is_empty()) {
            continue;
        }

        let value = match raw_value.as_str() {
            Some(s) => Value::String(remove_emojis(s)),
            None => raw_value.clone(),
        };

        let key = raw_key.to_lowercase().trim().to_string();

        // Check maps in priority order
        if let Some(target) = TOP_LEVEL_MAP.get(&key) {
            result.insert(target.clone(), value);
        } else if let Some(target) = APPEARANCE_MAP.get(&key) {
            appearance.insert(target.clone(), value);
        } else if let Some(target) = FAVORITES_MAP.get(&key) {
            favorites.insert(target.clone(), value);
        } else if let Some(target) = SEXUAL_PREFS_MAP.get(&key) {
            sexual_prefs.insert(target.clone(), value);
        } else if let Some(target) = OPTIONAL_MAP.get(&key) {
            result.insert(target.clone(), value);
        } else {
            // Pass through unknown fields with original key
            result.insert(raw_key.clone(), value);
        }
    }

    // Use ToV bio if no bio was found in the source
    if !result.contains_key("bio") {
        if let Some(bio_text) = tov_bio {
            result.insert("bio".to_string(), Value::String(bio_text.to_string()));
        }
    }

    // Only set nested objects if they have content
    if !appearance.is_empty() {
        result.insert("appearance".to_string(), Value::Object(appearance));
    }
    if !favorites.is_empty() {
        result.insert("favorites".to_string(), Value::Object(favorites));
    }
    if !sexual_prefs.is_empty() {
        result.insert(
            "sexual_preferences".to_string(),
            Value::Object(sexual_prefs),
        );
    }

    result
}

// ---------------------------------------------------------------------------
// Missing field detection
// ---------------------------------------------------------------------------

/// Expected fields by category for the generation report.
const EXPECTED_FIELDS: &[(&str, &[&str])] = &[
    (
        "biographical",
        &[
            "bio",
            "gender",
            "age",
            "ethnicity",
            "birthplace",
            "current_job",
            "relationship_status",
            "sexual_orientation",
        ],
    ),
    (
        "appearance",
        &["appearance.hair", "appearance.eye_color", "appearance.body_type"],
    ),
    (
        "favorites",
        &[
            "favorites.color",
            "favorites.food",
            "favorites.beverage",
            "favorites.movie",
            "favorites.tv_show",
        ],
    ),
    (
        "sexual_preferences",
        &[
            "sexual_preferences.positions",
            "sexual_preferences.kinks",
        ],
    ),
    (
        "optional",
        &[
            "hobbies",
            "personality",
            "backstory",
            "dislikes",
            "biggest_dream",
        ],
    ),
];

/// Check which expected fields are missing from the generated metadata.
pub fn find_missing_fields(metadata: &Map<String, Value>) -> Vec<MissingField> {
    let mut missing = Vec::new();

    for &(category, fields) in EXPECTED_FIELDS {
        for &field_path in fields {
            let present = if let Some((parent, child)) = field_path.split_once('.') {
                metadata
                    .get(parent)
                    .and_then(Value::as_object)
                    .and_then(|obj| obj.get(child))
                    .map_or(false, |v| !v.is_null() && v.as_str().map_or(true, |s| !s.is_empty()))
            } else {
                metadata
                    .get(field_path)
                    .map_or(false, |v| !v.is_null() && v.as_str().map_or(true, |s| !s.is_empty()))
            };

            if !present {
                missing.push(MissingField {
                    field: field_path.to_string(),
                    category: category.to_string(),
                });
            }
        }
    }

    missing
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Generate metadata from bio.json and/or tov.json source files.
///
/// Returns the nested metadata object and a generation report.
pub fn generate_metadata(input: &MetadataInput) -> MetadataResult {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    // Extract bio from ToV
    let tov_map = input.tov.as_ref().and_then(Value::as_object);
    let tov_bio = tov_map.and_then(|m| extract_bio_from_tov(m, &input.name));

    // Build source from bio, defaulting to empty
    let empty_map = Map::new();
    let bio_map = input
        .bio
        .as_ref()
        .and_then(Value::as_object)
        .unwrap_or(&empty_map);

    let mut source = bio_map.clone();

    // If we have ToV data, merge ALL fields into source (not just optional).
    // Skip "description" — it's handled by `extract_bio_from_tov`.
    // Apply {bot_name}/{user_name} placeholder replacement to merged values.
    if let Some(tov) = tov_map {
        for (key, val) in tov {
            if !val.is_null()
                && !source.contains_key(key.as_str())
                && key != TOV_DESCRIPTION_KEY
            {
                let processed = match val.as_str() {
                    Some(s) => {
                        let r = BOT_NAME_RE.replace_all(s, input.name.as_str());
                        let r = USER_NAME_RE.replace_all(&r, "you");
                        Value::String(r.to_string())
                    }
                    None => val.clone(),
                };
                source.insert(key.clone(), processed);
            }
        }
    }

    // Track source presence for warnings
    if input.bio.is_none() && input.tov.is_none() {
        warnings.push("No bio.json or tov.json provided — metadata will be empty".to_string());
    } else if input.bio.is_none() {
        warnings.push("No bio.json provided — using tov.json only".to_string());
    }

    if input.name.is_empty() {
        warnings.push("No character name provided — {bot_name} placeholders will be empty".to_string());
    }

    let metadata_map = transform_to_schema(&source, tov_bio.as_deref());

    // Validate result
    if metadata_map.is_empty() {
        errors.push("Generated metadata is empty — check source files".to_string());
    }

    let missing = find_missing_fields(&metadata_map);
    let field_count = count_fields(&metadata_map);

    MetadataResult {
        metadata: Value::Object(metadata_map),
        report: GenerationReport {
            field_count,
            missing,
            warnings,
            errors,
        },
    }
}

/// Build a generation report for existing metadata (manual edits, imports).
///
/// Unlike `generate_metadata` which also produces warnings/errors from the
/// generation process, this only checks field completeness.
pub fn build_report(metadata: &Map<String, Value>) -> GenerationReport {
    let missing = find_missing_fields(metadata);
    let field_count = count_fields(metadata);
    GenerationReport {
        field_count,
        missing,
        warnings: Vec::new(),
        errors: Vec::new(),
    }
}

/// Build a generation report and serialize it to JSON.
///
/// Convenience wrapper around `build_report` + `serde_json::to_value`.
/// Returns `None` if `metadata` is not a JSON object.
pub fn build_report_json(metadata: &Value) -> Option<Value> {
    metadata
        .as_object()
        .map(build_report)
        .and_then(|r| serde_json::to_value(&r).ok())
}

/// Generate metadata by shelling out to the Python `fix_metadata.py` script.
///
/// The Python script handles hundreds of edge cases (mega-key splitting,
/// compound name joining, embedded value extraction, etc.) that the Rust
/// `generate_metadata` function does not yet cover. This function sends the
/// input as JSON to the script's `--stdin` mode and parses the result.
pub fn generate_metadata_via_python(input: &MetadataInput) -> Result<MetadataResult, crate::error::CoreError> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    // Build the JSON payload for the Python script
    let payload = serde_json::json!({
        "bio": input.bio,
        "tov": input.tov,
        "name": input.name,
    });

    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| crate::error::CoreError::Internal(format!("Failed to serialize metadata input: {e}")))?;

    let mut child = Command::new("python3")
        .args(["scripts/fix_metadata.py", "--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| crate::error::CoreError::Internal(format!("Failed to spawn python3: {e}")))?;

    // Write payload to stdin
    if let Some(ref mut stdin) = child.stdin {
        stdin.write_all(payload_str.as_bytes())
            .map_err(|e| crate::error::CoreError::Internal(format!("Failed to write to python stdin: {e}")))?;
    }
    // Drop stdin to signal EOF
    drop(child.stdin.take());

    let output = child.wait_with_output()
        .map_err(|e| crate::error::CoreError::Internal(format!("Failed to wait for python process: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::CoreError::Internal(
            format!("Python metadata transform failed (exit {}): {}", output.status, stderr),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let metadata: Value = serde_json::from_str(&stdout)
        .map_err(|e| crate::error::CoreError::Internal(
            format!("Failed to parse Python output as JSON: {e}\nOutput: {}", &stdout[..stdout.len().min(500)]),
        ))?;

    let metadata_map = metadata.as_object().ok_or_else(|| {
        crate::error::CoreError::Internal("Python metadata output is not a JSON object".to_string())
    })?;

    let report = build_report(metadata_map);

    Ok(MetadataResult { metadata, report })
}

/// Count the total number of leaf fields in a metadata object.
pub fn count_fields(map: &Map<String, Value>) -> usize {
    let mut count = 0;
    for value in map.values() {
        match value {
            Value::Object(inner) => count += count_fields(inner),
            Value::Null => {}
            _ => count += 1,
        }
    }
    count
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_remove_emojis() {
        assert_eq!(remove_emojis("Hello 😀 World"), "Hello  World");
        assert_eq!(remove_emojis("text [blushing emoji] more"), "text  more");
        assert_eq!(remove_emojis("clean text"), "clean text");
    }

    #[test]
    fn test_extract_bio_from_tov() {
        let tov: Map<String, Value> = serde_json::from_value(json!({
            "description": "Hi, I'm {bot_name}. Talk to {user_name}!"
        }))
        .unwrap();

        let bio = extract_bio_from_tov(&tov, "Luna").unwrap();
        assert_eq!(bio, "Hi, I'm Luna. Talk to you!");
    }

    #[test]
    fn test_extract_bio_from_tov_fallback_keys() {
        let tov: Map<String, Value> = serde_json::from_value(json!({
            "bio": "A short bio for {bot_name}."
        }))
        .unwrap();

        let bio = extract_bio_from_tov(&tov, "Aria").unwrap();
        assert_eq!(bio, "A short bio for Aria.");
    }

    #[test]
    fn test_extract_bio_from_tov_none() {
        let tov: Map<String, Value> = serde_json::from_value(json!({
            "voice_id": "abc123"
        }))
        .unwrap();

        assert!(extract_bio_from_tov(&tov, "Test").is_none());
    }

    #[test]
    fn test_generate_metadata_basic() {
        let input = MetadataInput {
            bio: Some(json!({
                "gender": "Female",
                "age": "25",
                "hair_color": "Blonde",
                "favorite_food": "Pizza",
                "hobbies": "Reading, hiking"
            })),
            tov: None,
            name: "Luna".to_string(),
        };

        let result = generate_metadata(&input);
        let meta = result.metadata.as_object().unwrap();

        assert_eq!(meta.get("gender").unwrap(), "Female");
        assert_eq!(meta.get("age").unwrap(), "25");
        assert_eq!(
            meta.get("appearance")
                .unwrap()
                .get("hair")
                .unwrap(),
            "Blonde"
        );
        assert_eq!(
            meta.get("favorites")
                .unwrap()
                .get("food")
                .unwrap(),
            "Pizza"
        );
        assert_eq!(meta.get("hobbies").unwrap(), "Reading, hiking");
    }

    #[test]
    fn test_generate_metadata_with_tov() {
        let input = MetadataInput {
            bio: Some(json!({
                "gender": "Male",
                "age": "30"
            })),
            tov: Some(json!({
                "description": "{bot_name} is a kind soul.",
                "personality": "Warm and friendly",
                "backstory": "Grew up in a small town"
            })),
            name: "Kai".to_string(),
        };

        let result = generate_metadata(&input);
        let meta = result.metadata.as_object().unwrap();

        assert_eq!(meta.get("bio").unwrap(), "Kai is a kind soul.");
        assert_eq!(meta.get("personality").unwrap(), "Warm and friendly");
        assert_eq!(meta.get("backstory").unwrap(), "Grew up in a small town");
    }

    #[test]
    fn test_generate_metadata_emoji_removal() {
        let input = MetadataInput {
            bio: Some(json!({
                "hobbies": "Dancing 💃 and singing 🎤 [fire emoji]"
            })),
            tov: None,
            name: "Test".to_string(),
        };

        let result = generate_metadata(&input);
        let meta = result.metadata.as_object().unwrap();
        let hobbies = meta.get("hobbies").unwrap().as_str().unwrap();
        assert!(!hobbies.contains('💃'));
        assert!(!hobbies.contains('🎤'));
        assert!(!hobbies.contains("emoji"));
    }

    #[test]
    fn test_generate_metadata_report() {
        let input = MetadataInput {
            bio: Some(json!({
                "gender": "Female"
            })),
            tov: None,
            name: "Test".to_string(),
        };

        let result = generate_metadata(&input);
        assert_eq!(result.report.field_count, 1);
        assert!(!result.report.missing.is_empty());

        // "bio" should be reported as missing
        assert!(result.report.missing.iter().any(|m| m.field == "bio"));
    }

    #[test]
    fn test_generate_metadata_no_sources() {
        let input = MetadataInput {
            bio: None,
            tov: None,
            name: "Empty".to_string(),
        };

        let result = generate_metadata(&input);
        assert!(result.report.warnings.iter().any(|w| w.contains("No bio.json or tov.json")));
        assert!(result.report.errors.iter().any(|e| e.contains("empty")));
    }

    #[test]
    fn test_key_normalization() {
        let input = MetadataInput {
            bio: Some(json!({
                "Hair_Color": "Red",
                "EYE_COLOR": "Blue",
                "BODY_TYPE": "Athletic"
            })),
            tov: None,
            name: "Test".to_string(),
        };

        let result = generate_metadata(&input);
        let meta = result.metadata.as_object().unwrap();
        let appearance = meta.get("appearance").unwrap().as_object().unwrap();

        assert_eq!(appearance.get("hair").unwrap(), "Red");
        assert_eq!(appearance.get("eye_color").unwrap(), "Blue");
        assert_eq!(appearance.get("body_type").unwrap(), "Athletic");
    }

    #[test]
    fn test_passthrough_unknown_fields() {
        let input = MetadataInput {
            bio: Some(json!({
                "custom_field": "custom_value",
                "another_custom": 42
            })),
            tov: None,
            name: "Test".to_string(),
        };

        let result = generate_metadata(&input);
        let meta = result.metadata.as_object().unwrap();

        assert_eq!(meta.get("custom_field").unwrap(), "custom_value");
        assert_eq!(meta.get("another_custom").unwrap(), 42);
    }
}
