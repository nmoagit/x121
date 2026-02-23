//! Download manager constants, validation, and helper functions (PRD-104).
//!
//! Provides source-type detection, URL validation, placement resolution,
//! progress calculation, token hint generation, and filename extraction.

use crate::error::CoreError;

// Model type constants imported from integrity module (DRY — single source of truth)
pub use crate::integrity::{
    validate_model_type, MODEL_TYPE_CHECKPOINT, MODEL_TYPE_CONTROLNET, MODEL_TYPE_EMBEDDING,
    MODEL_TYPE_LORA, MODEL_TYPE_VAE, VALID_MODEL_TYPES,
};

// ---------------------------------------------------------------------------
// Source type constants
// ---------------------------------------------------------------------------

/// CivitAI model source.
pub const SOURCE_CIVITAI: &str = "civitai";
/// HuggingFace model source.
pub const SOURCE_HUGGINGFACE: &str = "huggingface";
/// Direct URL download source.
pub const SOURCE_DIRECT: &str = "direct";

/// All valid download source types.
pub const VALID_SOURCE_TYPES: &[&str] = &[SOURCE_CIVITAI, SOURCE_HUGGINGFACE, SOURCE_DIRECT];

// ---------------------------------------------------------------------------
// Service name constants (for API tokens)
// ---------------------------------------------------------------------------

/// CivitAI token service name.
pub const SERVICE_CIVITAI: &str = "civitai";
/// HuggingFace token service name.
pub const SERVICE_HUGGINGFACE: &str = "huggingface";

/// All valid service names for API tokens.
pub const VALID_SERVICES: &[&str] = &[SERVICE_CIVITAI, SERVICE_HUGGINGFACE];

// ---------------------------------------------------------------------------
// Download status constants
// ---------------------------------------------------------------------------

/// Download is queued and waiting.
pub const DL_STATUS_QUEUED: &str = "queued";
/// Download is in progress.
pub const DL_STATUS_DOWNLOADING: &str = "downloading";
/// Download is paused by user.
pub const DL_STATUS_PAUSED: &str = "paused";
/// File hash is being verified.
pub const DL_STATUS_VERIFYING: &str = "verifying";
/// Model is being registered as an asset.
pub const DL_STATUS_REGISTERING: &str = "registering";
/// Download completed successfully.
pub const DL_STATUS_COMPLETED: &str = "completed";
/// Download failed with an error.
pub const DL_STATUS_FAILED: &str = "failed";
/// Download was cancelled by user.
pub const DL_STATUS_CANCELLED: &str = "cancelled";

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------

/// Detect the source type from a URL by checking known domains.
///
/// Returns one of [`SOURCE_CIVITAI`], [`SOURCE_HUGGINGFACE`], or [`SOURCE_DIRECT`].
pub fn detect_source_type(url: &str) -> &'static str {
    if url.contains("civitai.com") {
        SOURCE_CIVITAI
    } else if url.contains("huggingface.co") || url.contains("hf.co") {
        SOURCE_HUGGINGFACE
    } else {
        SOURCE_DIRECT
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that a source type string is one of the known types.
pub fn validate_source_type(st: &str) -> Result<(), CoreError> {
    if VALID_SOURCE_TYPES.contains(&st) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown source type: '{st}'. Valid types: {}",
            VALID_SOURCE_TYPES.join(", ")
        )))
    }
}

/// Validate that a service name is one of the known services.
pub fn validate_service_name(sn: &str) -> Result<(), CoreError> {
    if VALID_SERVICES.contains(&sn) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Unknown service name: '{sn}'. Valid services: {}",
            VALID_SERVICES.join(", ")
        )))
    }
}

/// Validate that a download URL is non-empty and starts with `http`.
pub fn validate_download_url(url: &str) -> Result<(), CoreError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Download URL must not be empty".to_string(),
        ));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(CoreError::Validation(format!(
            "Download URL must start with http:// or https://, got: '{trimmed}'"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Placement resolution
// ---------------------------------------------------------------------------

/// Resolve the target directory for a model based on placement rules.
///
/// Takes a slice of `(model_type, base_model, target_dir, priority)` tuples
/// from the database. Returns the best matching directory (highest priority),
/// falling back to `/models/{model_type}/` if no rules match.
pub fn resolve_target_directory(
    model_type: &str,
    base_model: Option<&str>,
    rules: &[(String, Option<String>, String, i32)],
) -> String {
    let mut best_dir: Option<&str> = None;
    let mut best_priority = i32::MIN;

    for (rule_type, rule_base, rule_dir, rule_priority) in rules {
        if rule_type != model_type {
            continue;
        }

        // Match: rule has no base_model constraint, or base_model matches.
        let base_match = match (rule_base.as_deref(), base_model) {
            (None, _) => true,               // rule applies to all base models
            (Some(rb), Some(bm)) => rb == bm, // specific match
            (Some(_), None) => false,         // rule requires base_model but none given
        };

        if base_match && *rule_priority > best_priority {
            best_priority = *rule_priority;
            best_dir = Some(rule_dir.as_str());
        }
    }

    best_dir
        .map(|d| d.to_string())
        .unwrap_or_else(|| format!("/models/{model_type}/"))
}

// ---------------------------------------------------------------------------
// Filename extraction
// ---------------------------------------------------------------------------

/// Extract a filename from a URL by taking the last path segment.
///
/// Strips query parameters and fragments. Falls back to `"download"` if
/// no meaningful segment is found.
pub fn extract_filename_from_url(url: &str) -> String {
    // Strip query string and fragment
    let clean = url.split('?').next().unwrap_or(url);
    let clean = clean.split('#').next().unwrap_or(clean);

    // Strip scheme (http:// or https://) and domain to get the path only
    let path = if let Some(rest) = clean.strip_prefix("https://").or_else(|| clean.strip_prefix("http://")) {
        // Find the first '/' after the domain
        rest.find('/').map(|i| &rest[i..]).unwrap_or("")
    } else {
        clean
    };

    // Take last non-empty segment from the path
    path.rsplit('/')
        .find(|s| !s.is_empty())
        .unwrap_or("download")
        .to_string()
}

// ---------------------------------------------------------------------------
// Token hint generation
// ---------------------------------------------------------------------------

/// Generate a token hint showing only the last 4 characters.
///
/// Returns `"...XXXX"` if the token is long enough, or `"****"` if too short.
pub fn generate_token_hint(token: &str) -> String {
    if token.len() >= 4 {
        format!("...{}", &token[token.len() - 4..])
    } else {
        "****".to_string()
    }
}

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

/// Calculate download progress as a percentage (0.0–100.0).
///
/// Returns `None` if the total file size is unknown or zero.
pub fn download_progress_percent(downloaded: i64, total: Option<i64>) -> Option<f64> {
    match total {
        Some(t) if t > 0 => {
            let pct = (downloaded as f64 / t as f64) * 100.0;
            Some(pct.min(100.0))
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- detect_source_type --------------------------------------------------

    #[test]
    fn detect_civitai_url() {
        assert_eq!(
            detect_source_type("https://civitai.com/models/12345"),
            SOURCE_CIVITAI
        );
    }

    #[test]
    fn detect_huggingface_url() {
        assert_eq!(
            detect_source_type("https://huggingface.co/user/model"),
            SOURCE_HUGGINGFACE
        );
    }

    #[test]
    fn detect_hf_short_url() {
        assert_eq!(
            detect_source_type("https://hf.co/user/model"),
            SOURCE_HUGGINGFACE
        );
    }

    #[test]
    fn detect_direct_url() {
        assert_eq!(
            detect_source_type("https://example.com/file.safetensors"),
            SOURCE_DIRECT
        );
    }

    // -- validate_source_type ------------------------------------------------

    #[test]
    fn valid_source_types_accepted() {
        assert!(validate_source_type("civitai").is_ok());
        assert!(validate_source_type("huggingface").is_ok());
        assert!(validate_source_type("direct").is_ok());
    }

    #[test]
    fn invalid_source_type_rejected() {
        assert!(validate_source_type("github").is_err());
        assert!(validate_source_type("").is_err());
    }

    // -- validate_service_name -----------------------------------------------

    #[test]
    fn valid_service_names_accepted() {
        assert!(validate_service_name("civitai").is_ok());
        assert!(validate_service_name("huggingface").is_ok());
    }

    #[test]
    fn invalid_service_name_rejected() {
        assert!(validate_service_name("github").is_err());
        assert!(validate_service_name("").is_err());
    }

    // -- validate_download_url -----------------------------------------------

    #[test]
    fn valid_urls_accepted() {
        assert!(validate_download_url("https://example.com/model.safetensors").is_ok());
        assert!(validate_download_url("http://example.com/file").is_ok());
    }

    #[test]
    fn empty_url_rejected() {
        assert!(validate_download_url("").is_err());
        assert!(validate_download_url("   ").is_err());
    }

    #[test]
    fn non_http_url_rejected() {
        assert!(validate_download_url("ftp://example.com/file").is_err());
        assert!(validate_download_url("just-a-path").is_err());
    }

    // -- resolve_target_directory --------------------------------------------

    #[test]
    fn resolve_with_specific_base_model() {
        let rules = vec![
            ("checkpoint".into(), None, "/models/checkpoints/".into(), 0),
            (
                "checkpoint".into(),
                Some("SDXL".into()),
                "/models/checkpoints/sdxl/".into(),
                10,
            ),
        ];
        let dir = resolve_target_directory("checkpoint", Some("SDXL"), &rules);
        assert_eq!(dir, "/models/checkpoints/sdxl/");
    }

    #[test]
    fn resolve_falls_back_to_generic_rule() {
        let rules = vec![
            ("checkpoint".into(), None, "/models/checkpoints/".into(), 0),
            (
                "checkpoint".into(),
                Some("SDXL".into()),
                "/models/checkpoints/sdxl/".into(),
                10,
            ),
        ];
        let dir = resolve_target_directory("checkpoint", Some("SD 1.5"), &rules);
        assert_eq!(dir, "/models/checkpoints/");
    }

    #[test]
    fn resolve_falls_back_to_default_when_no_rules_match() {
        let rules: Vec<(String, Option<String>, String, i32)> = vec![];
        let dir = resolve_target_directory("lora", None, &rules);
        assert_eq!(dir, "/models/lora/");
    }

    // -- extract_filename_from_url -------------------------------------------

    #[test]
    fn extract_simple_filename() {
        assert_eq!(
            extract_filename_from_url("https://example.com/models/my_model.safetensors"),
            "my_model.safetensors"
        );
    }

    #[test]
    fn extract_strips_query_params() {
        assert_eq!(
            extract_filename_from_url("https://example.com/file.ckpt?token=abc"),
            "file.ckpt"
        );
    }

    #[test]
    fn extract_empty_path_returns_default() {
        assert_eq!(extract_filename_from_url("https://example.com/"), "download");
    }

    // -- generate_token_hint -------------------------------------------------

    #[test]
    fn hint_shows_last_four() {
        assert_eq!(generate_token_hint("abcdefgh1234"), "...1234");
    }

    #[test]
    fn hint_short_token_masked() {
        assert_eq!(generate_token_hint("ab"), "****");
        assert_eq!(generate_token_hint(""), "****");
    }

    #[test]
    fn hint_exactly_four_chars() {
        assert_eq!(generate_token_hint("ABCD"), "...ABCD");
    }

    // -- download_progress_percent -------------------------------------------

    #[test]
    fn progress_known_total() {
        let pct = download_progress_percent(50, Some(100));
        assert!((pct.unwrap() - 50.0).abs() < f64::EPSILON);
    }

    #[test]
    fn progress_unknown_total() {
        assert!(download_progress_percent(50, None).is_none());
    }

    #[test]
    fn progress_zero_total() {
        assert!(download_progress_percent(50, Some(0)).is_none());
    }

    #[test]
    fn progress_capped_at_100() {
        let pct = download_progress_percent(200, Some(100));
        assert!((pct.unwrap() - 100.0).abs() < f64::EPSILON);
    }
}
