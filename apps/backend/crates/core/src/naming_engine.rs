//! Dynamic naming engine for deterministic filename generation (PRD-116).
//!
//! Provides a template-based naming system that replaces hardcoded filename
//! construction with configurable patterns. Templates use `{token}` and
//! `{token:N}` syntax where N is a zero-padding width specifier.
//!
//! The engine is a pure function: given a template and a [`NamingContext`], it
//! produces a deterministic filename with no database or I/O side effects.

use std::collections::HashMap;
use std::fmt;
use std::sync::LazyLock;

// ---------------------------------------------------------------------------
// Token regex
// ---------------------------------------------------------------------------

/// Matches `{token}` and `{token:N}` placeholders in naming templates.
///
/// - Group 1: token name (e.g. `scene_type_slug`)
/// - Group 2 (optional): format width (e.g. `06`)
static TOKEN_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\{(\w+)(?::(\d+))?\}").expect("valid regex"));

// ---------------------------------------------------------------------------
// Known tokens
// ---------------------------------------------------------------------------

/// All known token names that can appear in naming templates.
pub const ALL_TOKENS: &[&str] = &[
    "variant_prefix",
    "variant_label",
    "scene_type_slug",
    "clothes_off_suffix",
    "index_suffix",
    "avatar_slug",
    "project_slug",
    "date_compact",
    "version",
    "ext",
    "frame_number",
    "metadata_type",
    "sequence",
];

// ---------------------------------------------------------------------------
// Naming context
// ---------------------------------------------------------------------------

/// All contextual values needed to resolve a naming template.
///
/// Fields are `Option` because not every category needs every token.
/// The engine resolves missing fields to empty strings.
#[derive(Debug, Clone, Default)]
pub struct NamingContext {
    /// Variant / track label, e.g. `"default"`, `"alt"`. Any slug is valid.
    pub variant_label: Option<String>,
    /// Scene type display name, e.g. `"Dance"`, `"Slow Walk"`.
    pub scene_type_name: Option<String>,
    /// Whether this is a clothes-off transition scene.
    pub is_clothes_off: bool,
    /// Index when multiple videos share the same content key.
    pub index: Option<u32>,
    /// Avatar display name, e.g. `"Chloe"`.
    pub avatar_name: Option<String>,
    /// Project display name, e.g. `"Project Alpha"`.
    pub project_name: Option<String>,
    /// Compact date string, e.g. `"20260224"`.
    pub date_compact: Option<String>,
    /// Version number (integer).
    pub version: Option<u32>,
    /// File extension without dot, e.g. `"png"`, `"mp4"`.
    pub ext: Option<String>,
    /// Zero-based frame number.
    pub frame_number: Option<u64>,
    /// Metadata type label, e.g. `"avatar_metadata"`.
    pub metadata_type: Option<String>,
    /// Sequence number for ordered artifacts.
    pub sequence: Option<u32>,
    /// Pipeline prefix rules: maps track slug to its filename prefix.
    /// E.g. `{"topless": "topless_"}`. When set, the `variant_prefix` token
    /// looks up the variant_label in this map instead of using a hardcoded check.
    #[allow(clippy::type_complexity)]
    pub prefix_rules: Option<HashMap<String, String>>,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors that can occur during naming template operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NamingError {
    /// Template contains tokens not recognized by the engine.
    UnknownTokens(Vec<String>),
    /// Resolved template produced an empty filename.
    EmptyResult,
    /// No active rule found for the requested category.
    RuleNotFound(String),
}

impl fmt::Display for NamingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownTokens(tokens) => {
                write!(f, "Unknown tokens in template: {}", tokens.join(", "))
            }
            Self::EmptyResult => write!(f, "Template resolved to an empty filename"),
            Self::RuleNotFound(cat) => write!(f, "No active naming rule for category '{cat}'"),
        }
    }
}

impl std::error::Error for NamingError {}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

/// Result of validating a naming template against a category.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ValidationResult {
    /// Whether the template is valid.
    pub valid: bool,
    /// Token names found in the template.
    pub tokens_found: Vec<String>,
    /// Token names not recognized by the engine.
    pub unknown_tokens: Vec<String>,
    /// Token names valid for this category but not present in the template.
    pub missing_tokens: Vec<String>,
    /// Human-readable warnings (non-fatal).
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Resolved name
// ---------------------------------------------------------------------------

/// A successfully resolved filename.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ResolvedName {
    /// The final filename.
    pub filename: String,
    /// Tokens that were present in the template but had no context value.
    pub unresolved_tokens: Vec<String>,
}

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

/// Convert a display name to a filesystem-safe slug.
///
/// - Lowercases
/// - Replaces spaces and hyphens with underscores
/// - Strips avatars that are not alphanumeric or underscore
/// - Collapses consecutive underscores
/// - Trims leading/trailing underscores
pub fn slugify(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_lowercase());
        } else if ch == ' ' || ch == '-' {
            result.push('_');
        }
        // Other avatars are stripped
    }
    // Collapse consecutive underscores
    collapse_underscores(&result)
}

/// Collapse consecutive underscores into a single underscore and trim edges.
fn collapse_underscores(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut prev_underscore = false;
    for ch in input.chars() {
        if ch == '_' {
            if !prev_underscore {
                result.push('_');
            }
            prev_underscore = true;
        } else {
            result.push(ch);
            prev_underscore = false;
        }
    }
    result.trim_matches('_').to_string()
}

// ---------------------------------------------------------------------------
// Per-category token lists
// ---------------------------------------------------------------------------

/// Return the list of valid token names for a given naming category.
pub fn tokens_for_category(category: &str) -> Vec<&'static str> {
    match category {
        "scene_video" => vec![
            "variant_prefix",
            "scene_type_slug",
            "clothes_off_suffix",
            "index_suffix",
        ],
        "image_variant" => vec!["avatar_slug", "variant_label", "version", "ext"],
        "scene_video_import" => vec!["avatar_slug", "scene_type_slug", "date_compact", "ext"],
        "thumbnail" => vec!["frame_number"],
        "metadata_export" => vec!["avatar_slug", "metadata_type"],
        "delivery_video" => vec![
            "variant_prefix",
            "scene_type_slug",
            "clothes_off_suffix",
            "index_suffix",
        ],
        "delivery_image" => vec!["variant_label", "ext"],
        "delivery_metadata" => vec![],
        "delivery_speech" => vec![],
        "delivery_folder" => vec!["project_slug", "avatar_slug"],
        "test_shot" => vec!["avatar_slug", "scene_type_slug", "sequence"],
        "chunk_artifact" => vec!["sequence", "avatar_slug", "scene_type_slug"],
        "delivery_archive" => vec!["avatar_slug", "project_slug", "date_compact"],
        "avatar_json" => vec!["project_slug", "avatar_slug"],
        _ => vec![],
    }
}

// ---------------------------------------------------------------------------
// Template validation
// ---------------------------------------------------------------------------

/// Validate a naming template against a specific category.
///
/// Checks that all tokens in the template are recognized and belong to the
/// given category. Returns warnings for missing category tokens.
pub fn validate_template(template: &str, category: &str) -> ValidationResult {
    let found: Vec<String> = TOKEN_RE
        .captures_iter(template)
        .map(|cap| cap[1].to_string())
        .collect();

    let known_set: std::collections::HashSet<&str> = ALL_TOKENS.iter().copied().collect();
    let unknown: Vec<String> = found
        .iter()
        .filter(|t| !known_set.contains(t.as_str()))
        .cloned()
        .collect();

    let category_tokens = tokens_for_category(category);
    let found_set: std::collections::HashSet<&str> = found.iter().map(|s| s.as_str()).collect();
    let missing: Vec<String> = category_tokens
        .iter()
        .filter(|t| !found_set.contains(**t))
        .map(|t| t.to_string())
        .collect();

    let mut warnings = Vec::new();
    if !missing.is_empty() {
        warnings.push(format!(
            "Category '{category}' tokens not used: {}",
            missing.join(", ")
        ));
    }
    // Warn about tokens from other categories
    let cat_set: std::collections::HashSet<&str> = category_tokens.into_iter().collect();
    for token in &found {
        if known_set.contains(token.as_str()) && !cat_set.contains(token.as_str()) {
            warnings.push(format!(
                "Token '{token}' is valid but not typical for category '{category}'"
            ));
        }
    }

    ValidationResult {
        valid: unknown.is_empty(),
        tokens_found: found,
        unknown_tokens: unknown,
        missing_tokens: missing,
        warnings,
    }
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/// Resolve a naming template against a context, producing a filename.
///
/// This is a **pure function** with no I/O. It builds a token-to-value map
/// from the [`NamingContext`] and substitutes each `{token}` or `{token:N}`
/// placeholder. Format specifiers (`:N`) apply zero-padding to numeric values.
///
/// Conditional tokens:
/// - `variant_prefix`: looked up from `ctx.prefix_rules` by variant label, empty if not found
/// - `clothes_off_suffix`: `"_clothes_off"` when `is_clothes_off` is true and variant has no prefix
/// - `index_suffix`: `"_N"` when index is `Some(N)`, empty otherwise
///
/// After substitution the result is sanitized: unresolved `{token}` placeholders
/// are removed, consecutive separators are collapsed, and leading/trailing
/// separators are trimmed.
pub fn resolve_template(template: &str, ctx: &NamingContext) -> Result<ResolvedName, NamingError> {
    let values = build_token_map(ctx);
    let mut unresolved = Vec::new();

    let result = TOKEN_RE
        .replace_all(template, |caps: &regex::Captures| {
            let token = &caps[1];
            let width: Option<usize> = caps.get(2).and_then(|m| m.as_str().parse().ok());

            match values.get(token) {
                Some(value) => apply_format(value, width),
                None => {
                    unresolved.push(token.to_string());
                    String::new()
                }
            }
        })
        .to_string();

    let filename = sanitize_filename(&result);

    if filename.is_empty() || filename == "." {
        return Err(NamingError::EmptyResult);
    }

    Ok(ResolvedName {
        filename,
        unresolved_tokens: unresolved,
    })
}

/// Build a token-name to resolved-value map from the naming context.
fn build_token_map(ctx: &NamingContext) -> HashMap<String, String> {
    let mut map = HashMap::new();

    // variant_prefix: look up the variant label in prefix_rules if available,
    // otherwise fall back to empty string (no hardcoded slug assumptions).
    let prefix = if let Some(ref label) = ctx.variant_label {
        if let Some(ref rules) = ctx.prefix_rules {
            rules.get(label).cloned().unwrap_or_default()
        } else {
            // Legacy fallback: no prefix_rules provided — empty prefix for all tracks.
            String::new()
        }
    } else {
        String::new()
    };
    map.insert("variant_prefix".to_string(), prefix);

    // variant_label: raw label
    if let Some(ref label) = ctx.variant_label {
        map.insert("variant_label".to_string(), label.clone());
    }

    // scene_type_slug: lowercase, spaces → underscores
    if let Some(ref name) = ctx.scene_type_name {
        map.insert(
            "scene_type_slug".to_string(),
            name.to_lowercase().replace(' ', "_"),
        );
    }

    // clothes_off_suffix: "_clothes_off" only when is_clothes_off=true AND
    // the variant has a prefix (indicating it is the "non-default" track that
    // wouldn't need a transition). If a variant has a prefix defined in
    // prefix_rules, it is a non-default track and clothes_off is suppressed.
    // When no prefix_rules are provided, the suffix is always applied if
    // is_clothes_off is true (the caller controls this flag per-track).
    let has_prefix = if let Some(ref label) = ctx.variant_label {
        if let Some(ref rules) = ctx.prefix_rules {
            rules.get(label).map(|p| !p.is_empty()).unwrap_or(false)
        } else {
            false
        }
    } else {
        false
    };
    let suffix = if ctx.is_clothes_off && !has_prefix {
        "_clothes_off".to_string()
    } else {
        String::new()
    };
    map.insert("clothes_off_suffix".to_string(), suffix);

    // index_suffix: "_N" when Some, empty otherwise
    let idx_suffix = match ctx.index {
        Some(n) => format!("_{n}"),
        None => String::new(),
    };
    map.insert("index_suffix".to_string(), idx_suffix);

    // avatar_slug
    if let Some(ref name) = ctx.avatar_name {
        map.insert("avatar_slug".to_string(), slugify(name));
    }

    // project_slug
    if let Some(ref name) = ctx.project_name {
        map.insert("project_slug".to_string(), slugify(name));
    }

    // date_compact
    if let Some(ref d) = ctx.date_compact {
        map.insert("date_compact".to_string(), d.clone());
    }

    // version
    if let Some(v) = ctx.version {
        map.insert("version".to_string(), v.to_string());
    }

    // ext
    if let Some(ref e) = ctx.ext {
        map.insert("ext".to_string(), e.clone());
    }

    // frame_number
    if let Some(n) = ctx.frame_number {
        map.insert("frame_number".to_string(), n.to_string());
    }

    // metadata_type
    if let Some(ref mt) = ctx.metadata_type {
        map.insert("metadata_type".to_string(), mt.clone());
    }

    // sequence
    if let Some(s) = ctx.sequence {
        map.insert("sequence".to_string(), s.to_string());
    }

    map
}

/// Apply an optional zero-padding format specifier to a value.
///
/// If `width` is `Some(6)` and value is `"42"`, produces `"000042"`.
/// Non-numeric values are returned unchanged regardless of width.
fn apply_format(value: &str, width: Option<usize>) -> String {
    match width {
        Some(w) => {
            // Try to parse as number for zero-padding
            if let Ok(n) = value.parse::<u64>() {
                format!("{n:0>width$}", width = w)
            } else {
                value.to_string()
            }
        }
        None => value.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/// Sanitize a resolved filename by removing unsafe avatars.
///
/// - Strips avatars not in `[a-zA-Z0-9._\-/]`
/// - Collapses consecutive underscores and hyphens
/// - Preserves path separators (`/`) for folder templates
/// - Trims leading/trailing underscores and hyphens from each path segment
pub fn sanitize_filename(input: &str) -> String {
    // Process each path segment independently (for delivery_folder templates)
    let segments: Vec<String> = input
        .split('/')
        .map(|segment| {
            let cleaned: String = segment
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '.' || *ch == '_' || *ch == '-')
                .collect();
            // Collapse consecutive underscores
            let collapsed = collapse_separators(&cleaned);
            collapsed
                .trim_matches(|c: char| c == '_' || c == '-')
                .to_string()
        })
        .filter(|s| !s.is_empty())
        .collect();

    segments.join("/")
}

/// Collapse consecutive underscores or hyphens into single avatars.
fn collapse_separators(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut prev = None;
    for ch in input.chars() {
        let is_sep = ch == '_' || ch == '-';
        if is_sep && prev == Some(ch) {
            continue;
        }
        result.push(ch);
        prev = if is_sep { Some(ch) } else { None };
    }
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Backward compatibility with naming.rs --

    const SCENE_VIDEO_TEMPLATE: &str =
        "{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4";

    /// Default prefix rules matching the legacy clothed/topless convention.
    fn default_prefix_rules() -> HashMap<String, String> {
        let mut rules = HashMap::new();
        rules.insert("topless".to_string(), "topless_".to_string());
        rules
    }

    fn scene_ctx(
        variant: &str,
        scene_type: &str,
        clothes_off: bool,
        index: Option<u32>,
    ) -> NamingContext {
        NamingContext {
            variant_label: Some(variant.to_string()),
            scene_type_name: Some(scene_type.to_string()),
            is_clothes_off: clothes_off,
            index,
            prefix_rules: Some(default_prefix_rules()),
            ..Default::default()
        }
    }

    #[test]
    fn compat_clothed_simple() {
        let ctx = scene_ctx("clothed", "Dance", false, None);
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "dance.mp4");
    }

    #[test]
    fn compat_topless_simple() {
        let ctx = scene_ctx("topless", "Dance", false, None);
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "topless_dance.mp4");
    }

    #[test]
    fn compat_clothes_off_transition() {
        let ctx = scene_ctx("clothed", "Dance", true, None);
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "dance_clothes_off.mp4");
    }

    #[test]
    fn compat_indexed() {
        let ctx = scene_ctx("clothed", "Idle", false, Some(2));
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "idle_2.mp4");
    }

    #[test]
    fn compat_topless_ignores_clothes_off() {
        // Topless variant cannot have clothes_off — avatar is already unclothed.
        // The clothes_off suffix is silently dropped for non-clothed variants.
        let ctx = scene_ctx("topless", "Slow Walk", true, Some(1));
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "topless_slow_walk_1.mp4");
    }

    #[test]
    fn compat_clothed_clothes_off_indexed() {
        // Clothed variant CAN have clothes_off — "started clothed, ended clothes off".
        let ctx = scene_ctx("clothed", "Slow Walk", true, Some(1));
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "slow_walk_clothes_off_1.mp4");
    }

    #[test]
    fn compat_multi_word_scene_type() {
        let ctx = scene_ctx("clothed", "Hair Flip Idle", false, None);
        let result = resolve_template(SCENE_VIDEO_TEMPLATE, &ctx).unwrap();
        assert_eq!(result.filename, "hair_flip_idle.mp4");
    }

    // -- Slugify --

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Project Alpha"), "project_alpha");
    }

    #[test]
    fn slugify_special_chars() {
        assert_eq!(slugify("Chloe's Project!"), "chloes_project");
    }

    #[test]
    fn slugify_hyphens_and_spaces() {
        assert_eq!(slugify("slow-walk scene"), "slow_walk_scene");
    }

    #[test]
    fn slugify_collapses_underscores() {
        assert_eq!(slugify("too   many   spaces"), "too_many_spaces");
    }

    // -- Format specifiers --

    #[test]
    fn format_specifier_zero_pad() {
        let ctx = NamingContext {
            frame_number: Some(42),
            ..Default::default()
        };
        let result = resolve_template("frame_{frame_number:06}.jpg", &ctx).unwrap();
        assert_eq!(result.filename, "frame_000042.jpg");
    }

    #[test]
    fn format_specifier_sequence() {
        let ctx = NamingContext {
            sequence: Some(7),
            avatar_name: Some("Chloe".to_string()),
            scene_type_name: Some("Dance".to_string()),
            ..Default::default()
        };
        let result = resolve_template(
            "chunk_{sequence:03}_{avatar_slug}_{scene_type_slug}.mp4",
            &ctx,
        )
        .unwrap();
        assert_eq!(result.filename, "chunk_007_chloe_dance.mp4");
    }

    // -- Conditional tokens --

    #[test]
    fn conditional_variant_prefix_clothed_is_empty() {
        let ctx = scene_ctx("clothed", "Dance", false, None);
        let map = build_token_map(&ctx);
        assert_eq!(map.get("variant_prefix").unwrap(), "");
    }

    #[test]
    fn conditional_variant_prefix_topless() {
        let ctx = scene_ctx("topless", "Dance", false, None);
        let map = build_token_map(&ctx);
        assert_eq!(map.get("variant_prefix").unwrap(), "topless_");
    }

    // -- Validation --

    #[test]
    fn validate_valid_template() {
        let result = validate_template(SCENE_VIDEO_TEMPLATE, "scene_video");
        assert!(result.valid);
        assert!(result.unknown_tokens.is_empty());
    }

    #[test]
    fn validate_unknown_token() {
        let result = validate_template("{bogus_token}.mp4", "scene_video");
        assert!(!result.valid);
        assert_eq!(result.unknown_tokens, vec!["bogus_token"]);
    }

    #[test]
    fn validate_cross_category_warning() {
        // avatar_slug is valid but not typical for scene_video
        let result = validate_template("{avatar_slug}_{scene_type_slug}.mp4", "scene_video");
        assert!(result.valid);
        assert!(result.warnings.iter().any(|w| w.contains("avatar_slug")));
    }

    // -- Sanitization --

    #[test]
    fn sanitize_removes_unsafe_chars() {
        assert_eq!(
            sanitize_filename("hello@world#test.mp4"),
            "helloworldtest.mp4"
        );
    }

    #[test]
    fn sanitize_collapses_separators() {
        assert_eq!(sanitize_filename("a___b.mp4"), "a_b.mp4");
    }

    #[test]
    fn sanitize_trims_edges() {
        assert_eq!(sanitize_filename("_leading_.mp4"), "leading_.mp4");
        assert_eq!(sanitize_filename("__hello__"), "hello");
    }

    #[test]
    fn sanitize_preserves_path_separators() {
        assert_eq!(sanitize_filename("project/avatar"), "project/avatar");
    }

    // -- Empty context --

    #[test]
    fn empty_context_produces_error() {
        let ctx = NamingContext::default();
        let result = resolve_template("{scene_type_slug}.mp4", &ctx);
        // With only an unresolved token, we get just ".mp4" after sanitization
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.filename, ".mp4");
        assert_eq!(resolved.unresolved_tokens, vec!["scene_type_slug"]);
    }

    #[test]
    fn fully_empty_template_resolution_errors() {
        let ctx = NamingContext::default();
        let result = resolve_template("{scene_type_slug}", &ctx);
        assert_eq!(result, Err(NamingError::EmptyResult));
    }

    // -- Tokens for category --

    #[test]
    fn tokens_for_known_categories() {
        assert!(!tokens_for_category("scene_video").is_empty());
        assert!(!tokens_for_category("delivery_archive").is_empty());
        assert!(tokens_for_category("delivery_metadata").is_empty());
    }

    #[test]
    fn tokens_for_unknown_category() {
        assert!(tokens_for_category("nonexistent").is_empty());
    }

    // -- Delivery folder with path --

    #[test]
    fn delivery_folder_template() {
        let ctx = NamingContext {
            project_name: Some("Project Alpha".to_string()),
            avatar_name: Some("Chloe".to_string()),
            ..Default::default()
        };
        let result = resolve_template("{project_slug}/{avatar_slug}", &ctx).unwrap();
        assert_eq!(result.filename, "project_alpha/chloe");
    }
}
