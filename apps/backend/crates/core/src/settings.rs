//! Platform settings registry, validation, and caching (PRD-110).
//!
//! Defines the canonical set of configurable settings, their types, defaults,
//! and environment-variable overrides. The `SettingsService` provides an
//! in-memory cache with TTL and source resolution (DB > Env > Default).
//!
//! This module has **no database dependency**; callers pass `db_value` into
//! `resolve()` after querying the DB themselves.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/// The data type of a setting value, used for validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingValueType {
    String,
    Url,
    WsUrl,
    Path,
    Integer,
    Boolean,
    Duration,
    CommaSeparatedList,
}

impl SettingValueType {
    /// Human-readable label for API responses.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::String => "string",
            Self::Url => "url",
            Self::WsUrl => "ws_url",
            Self::Path => "path",
            Self::Integer => "integer",
            Self::Boolean => "boolean",
            Self::Duration => "duration",
            Self::CommaSeparatedList => "comma_separated_list",
        }
    }
}

// ---------------------------------------------------------------------------
// Setting definition
// ---------------------------------------------------------------------------

/// Static metadata for a single platform setting.
#[derive(Debug, Clone)]
pub struct SettingDefinition {
    /// Unique key (e.g. `"comfyui_ws_url"`).
    pub key: &'static str,
    /// Logical category for grouping in the UI.
    pub category: &'static str,
    /// Human-readable label.
    pub label: &'static str,
    /// Longer description shown in the settings panel.
    pub description: &'static str,
    /// Expected value type, drives validation.
    pub value_type: SettingValueType,
    /// Environment variable that overrides the DB value.
    pub env_var: Option<&'static str>,
    /// Default value when neither DB nor env var is set.
    pub default_value: Option<&'static str>,
    /// Whether changing this setting requires a server restart to take effect.
    pub requires_restart: bool,
    /// Whether the value should be masked in API responses.
    pub sensitive: bool,
    /// Optional regex for additional validation (applied after type check).
    pub validation_regex: Option<&'static str>,
}

// ---------------------------------------------------------------------------
// Category constants
// ---------------------------------------------------------------------------

/// Settings related to file storage and data directories.
pub const CATEGORY_STORAGE: &str = "storage";
/// Settings related to ComfyUI integration.
pub const CATEGORY_COMFYUI: &str = "comfyui";
/// Settings related to authentication and authorization.
pub const CATEGORY_AUTH: &str = "auth";
/// General system/server settings.
pub const CATEGORY_SYSTEM: &str = "system";
/// Settings related to production and the generation pipeline.
pub const CATEGORY_PIPELINE: &str = "production";

// ---------------------------------------------------------------------------
// Settings registry
// ---------------------------------------------------------------------------

/// The canonical list of all platform settings.
///
/// Add new settings here. The handler layer iterates this array to build the
/// full settings list for the admin UI.
pub static SETTINGS_REGISTRY: &[SettingDefinition] = &[
    // -- Storage --
    SettingDefinition {
        key: "data_dir",
        category: CATEGORY_STORAGE,
        label: "Data Directory",
        description: "Root directory for application data files.",
        value_type: SettingValueType::Path,
        env_var: Some("DATA_DIR"),
        default_value: Some("./data"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "storage_root",
        category: CATEGORY_STORAGE,
        label: "Storage Root",
        description: "Root directory for asset storage (images, videos, models).",
        value_type: SettingValueType::Path,
        env_var: Some("STORAGE_ROOT"),
        default_value: Some("./storage"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "storage_backend_type",
        category: CATEGORY_STORAGE,
        label: "Active Storage Backend",
        description: "Choose 'local' for filesystem or 's3' for S3-compatible cloud storage.",
        value_type: SettingValueType::String,
        env_var: Some("STORAGE_BACKEND_TYPE"),
        default_value: Some("local"),
        requires_restart: false,
        sensitive: false,
        validation_regex: Some("^(local|s3)$"),
    },
    SettingDefinition {
        key: "s3_bucket",
        category: CATEGORY_STORAGE,
        label: "S3 Bucket Name",
        description: "The name of the S3 bucket to store files in.",
        value_type: SettingValueType::String,
        env_var: Some("S3_BUCKET"),
        default_value: None,
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "s3_region",
        category: CATEGORY_STORAGE,
        label: "S3 Region",
        description: "AWS region for the S3 bucket (e.g. us-east-1, eu-west-1).",
        value_type: SettingValueType::String,
        env_var: Some("S3_REGION"),
        default_value: Some("us-east-1"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "s3_endpoint",
        category: CATEGORY_STORAGE,
        label: "S3 Endpoint URL",
        description: "Custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces, Backblaze B2). Leave empty for AWS S3.",
        value_type: SettingValueType::String,
        env_var: Some("S3_ENDPOINT"),
        default_value: None,
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "s3_access_key_id",
        category: CATEGORY_STORAGE,
        label: "S3 Access Key ID",
        description: "Access key ID for S3 authentication.",
        value_type: SettingValueType::String,
        env_var: Some("S3_ACCESS_KEY_ID"),
        default_value: None,
        requires_restart: false,
        sensitive: true,
        validation_regex: None,
    },
    SettingDefinition {
        key: "s3_secret_access_key",
        category: CATEGORY_STORAGE,
        label: "S3 Secret Access Key",
        description: "Secret access key for S3 authentication.",
        value_type: SettingValueType::String,
        env_var: Some("S3_SECRET_ACCESS_KEY"),
        default_value: None,
        requires_restart: false,
        sensitive: true,
        validation_regex: None,
    },
    SettingDefinition {
        key: "s3_path_prefix",
        category: CATEGORY_STORAGE,
        label: "S3 Path Prefix",
        description: "Optional key prefix for all objects stored in S3 (e.g. 'x121/production/').",
        value_type: SettingValueType::String,
        env_var: Some("S3_PATH_PREFIX"),
        default_value: None,
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    // -- ComfyUI --
    SettingDefinition {
        key: "comfyui_ws_url",
        category: CATEGORY_COMFYUI,
        label: "ComfyUI WebSocket URL",
        description: "WebSocket endpoint for the ComfyUI generation backend.",
        value_type: SettingValueType::WsUrl,
        env_var: Some("COMFYUI_WS_URL"),
        default_value: Some("ws://localhost:8188/ws"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    // -- System --
    SettingDefinition {
        key: "host",
        category: CATEGORY_SYSTEM,
        label: "Server Host",
        description: "Bind address for the HTTP server.",
        value_type: SettingValueType::String,
        env_var: Some("HOST"),
        default_value: Some("0.0.0.0"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "port",
        category: CATEGORY_SYSTEM,
        label: "Server Port",
        description: "TCP port the HTTP server listens on.",
        value_type: SettingValueType::Integer,
        env_var: Some("PORT"),
        default_value: Some("3000"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "cors_origins",
        category: CATEGORY_SYSTEM,
        label: "CORS Origins",
        description: "Comma-separated list of allowed CORS origins.",
        value_type: SettingValueType::CommaSeparatedList,
        env_var: Some("CORS_ORIGINS"),
        default_value: Some("http://localhost:5173"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    // -- Auth --
    SettingDefinition {
        key: "jwt_access_expiry",
        category: CATEGORY_AUTH,
        label: "JWT Access Token Expiry (minutes)",
        description: "Lifetime of JWT access tokens in minutes.",
        value_type: SettingValueType::Integer,
        env_var: Some("JWT_ACCESS_EXPIRY_MINS"),
        default_value: Some("15"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "jwt_refresh_expiry",
        category: CATEGORY_AUTH,
        label: "JWT Refresh Token Expiry (days)",
        description: "Lifetime of JWT refresh tokens in days.",
        value_type: SettingValueType::Integer,
        env_var: Some("JWT_REFRESH_EXPIRY_DAYS"),
        default_value: Some("7"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    // -- Pipeline (deliverables) --
    SettingDefinition {
        key: "blocking_deliverables",
        category: CATEGORY_PIPELINE,
        label: "Blocking Deliverables",
        description: "Comma-separated list of deliverable sections that must be complete for a avatar to be considered done. Valid values: metadata, images, scenes, speech. Projects inherit this default unless overridden.",
        value_type: SettingValueType::CommaSeparatedList,
        env_var: None,
        default_value: Some("metadata,images,scenes"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    // -- System (logging) --
    SettingDefinition {
        key: "rust_log",
        category: CATEGORY_SYSTEM,
        label: "Log Level",
        description: "Rust log filter directive (e.g. 'x121_api=debug,tower_http=debug').",
        value_type: SettingValueType::String,
        env_var: Some("RUST_LOG"),
        default_value: Some("x121_api=debug,tower_http=debug"),
        requires_restart: true,
        sensitive: false,
        validation_regex: None,
    },
    // -- Pipeline --
    SettingDefinition {
        key: "max_orphan_retries",
        category: CATEGORY_PIPELINE,
        label: "Max Orphan Retries",
        description: "Number of times a job is retried after its GPU instance dies. After this many retries the job and scene are marked as Failed.",
        value_type: SettingValueType::Integer,
        env_var: Some("MAX_ORPHAN_RETRIES"),
        default_value: Some("3"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "job_timeout_minutes",
        category: CATEGORY_PIPELINE,
        label: "Job Timeout (minutes)",
        description: "Maximum time a generation job can run before being considered timed out and reset for retry.",
        value_type: SettingValueType::Integer,
        env_var: Some("JOB_TIMEOUT_MINUTES"),
        default_value: Some("30"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
    SettingDefinition {
        key: "idle_instance_minutes",
        category: CATEGORY_PIPELINE,
        label: "Idle Instance Timeout (minutes)",
        description: "Minutes a GPU instance can run with no jobs before being automatically terminated to save costs.",
        value_type: SettingValueType::Integer,
        env_var: Some("IDLE_INSTANCE_MINUTES"),
        default_value: Some("5"),
        requires_restart: false,
        sensitive: false,
        validation_regex: None,
    },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/// Find a setting definition by key.
pub fn find_definition(key: &str) -> Option<&'static SettingDefinition> {
    SETTINGS_REGISTRY.iter().find(|d| d.key == key)
}

/// List all definitions belonging to `category`.
pub fn list_definitions_by_category(category: &str) -> Vec<&'static SettingDefinition> {
    SETTINGS_REGISTRY
        .iter()
        .filter(|d| d.category == category)
        .collect()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate a setting value against its definition's type constraints.
pub fn validate_setting_value(
    definition: &SettingDefinition,
    value: &str,
) -> Result<(), CoreError> {
    if value.is_empty() {
        return Err(CoreError::Validation(format!(
            "Setting '{}' must not be empty",
            definition.key
        )));
    }

    match definition.value_type {
        SettingValueType::String | SettingValueType::Path => {
            // Any non-empty string is valid.
        }
        SettingValueType::Url => {
            if !(value.starts_with("http://") || value.starts_with("https://")) {
                return Err(CoreError::Validation(format!(
                    "Setting '{}' must be an HTTP(S) URL (got '{}')",
                    definition.key, value
                )));
            }
        }
        SettingValueType::WsUrl => {
            if !(value.starts_with("ws://") || value.starts_with("wss://")) {
                return Err(CoreError::Validation(format!(
                    "Setting '{}' must be a WebSocket URL starting with ws:// or wss:// (got '{}')",
                    definition.key, value
                )));
            }
        }
        SettingValueType::Integer => {
            value.parse::<i64>().map_err(|_| {
                CoreError::Validation(format!(
                    "Setting '{}' must be a valid integer (got '{}')",
                    definition.key, value
                ))
            })?;
        }
        SettingValueType::Boolean => match value {
            "true" | "false" | "1" | "0" => {}
            _ => {
                return Err(CoreError::Validation(format!(
                    "Setting '{}' must be 'true' or 'false' (got '{}')",
                    definition.key, value
                )));
            }
        },
        SettingValueType::Duration => {
            // Accept "<number>s", "<number>m", "<number>h", or plain seconds.
            let valid = value
                .strip_suffix('s')
                .or_else(|| value.strip_suffix('m'))
                .or_else(|| value.strip_suffix('h'))
                .unwrap_or(value)
                .parse::<u64>()
                .is_ok();
            if !valid {
                return Err(CoreError::Validation(format!(
                    "Setting '{}' must be a duration like '30s', '5m', '1h', or a number of seconds (got '{}')",
                    definition.key, value
                )));
            }
        }
        SettingValueType::CommaSeparatedList => {
            // Any non-empty string is valid; individual items are trimmed.
        }
    }

    // Apply optional regex validation.
    if let Some(pattern) = definition.validation_regex {
        let re = regex::Regex::new(pattern).map_err(|e| {
            CoreError::Internal(format!(
                "Invalid validation regex for '{}': {e}",
                definition.key
            ))
        })?;
        if !re.is_match(value) {
            return Err(CoreError::Validation(format!(
                "Setting '{}' does not match required pattern '{}'",
                definition.key, pattern
            )));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/// Where the resolved value came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingSource {
    /// Value stored in the `platform_settings` table.
    Database,
    /// Value from an environment variable.
    Env,
    /// Hardcoded default from the registry.
    Default,
}

impl SettingSource {
    /// Human-readable label for API responses.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Database => "database",
            Self::Env => "env",
            Self::Default => "default",
        }
    }
}

// ---------------------------------------------------------------------------
// Settings service (in-memory cache + resolution)
// ---------------------------------------------------------------------------

/// A cached setting entry.
#[derive(Debug, Clone)]
struct CachedEntry {
    value: String,
    source: SettingSource,
    resolved_at: Instant,
}

/// In-memory settings cache with TTL-based expiration and source resolution.
///
/// The service does **not** access the database directly. Callers must pass
/// `db_value: Option<String>` from their own DB query into `resolve()`.
pub struct SettingsService {
    cache: RwLock<HashMap<String, CachedEntry>>,
    ttl: Duration,
    boot_time: Instant,
}

impl std::fmt::Debug for SettingsService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SettingsService")
            .field("ttl", &self.ttl)
            .finish()
    }
}

impl SettingsService {
    /// Create a new service with the given cache TTL.
    pub fn new(ttl: Duration) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            ttl,
            boot_time: Instant::now(),
        }
    }

    /// Resolve the effective value for `key` using the priority chain:
    /// DB value > environment variable > default.
    ///
    /// Results are cached until TTL expires or `invalidate()` is called.
    pub fn resolve(&self, key: &str, db_value: Option<String>) -> (String, SettingSource) {
        // Check cache first.
        {
            let cache = self.cache.read().expect("cache lock poisoned");
            if let Some(entry) = cache.get(key) {
                if entry.resolved_at.elapsed() < self.ttl {
                    return (entry.value.clone(), entry.source);
                }
            }
        }

        // Resolve: DB > Env > Default.
        let definition = find_definition(key);

        let (value, source) = if let Some(db_val) = db_value {
            (db_val, SettingSource::Database)
        } else if let Some(def) = definition {
            if let Some(env_var) = def.env_var {
                if let Ok(env_val) = std::env::var(env_var) {
                    (env_val, SettingSource::Env)
                } else if let Some(default) = def.default_value {
                    (default.to_string(), SettingSource::Default)
                } else {
                    (String::new(), SettingSource::Default)
                }
            } else if let Some(default) = def.default_value {
                (default.to_string(), SettingSource::Default)
            } else {
                (String::new(), SettingSource::Default)
            }
        } else {
            (String::new(), SettingSource::Default)
        };

        // Update cache.
        {
            let mut cache = self.cache.write().expect("cache lock poisoned");
            cache.insert(
                key.to_string(),
                CachedEntry {
                    value: value.clone(),
                    source,
                    resolved_at: Instant::now(),
                },
            );
        }

        (value, source)
    }

    /// Invalidate the cache entry for a single key.
    pub fn invalidate(&self, key: &str) {
        let mut cache = self.cache.write().expect("cache lock poisoned");
        cache.remove(key);
    }

    /// Invalidate all cached entries.
    pub fn invalidate_all(&self) {
        let mut cache = self.cache.write().expect("cache lock poisoned");
        cache.clear();
    }

    /// The instant the service was created (proxy for boot time).
    pub fn boot_time(&self) -> Instant {
        self.boot_time
    }

    /// Check whether any restart-requiring setting has been changed since boot.
    ///
    /// `last_change` is the most recent `updated_at` for restart-requiring
    /// settings in the database (caller queries this).
    pub fn needs_restart(&self, last_change: Option<chrono::DateTime<chrono::Utc>>) -> bool {
        let Some(changed_at) = last_change else {
            return false;
        };
        // Convert boot_time (Instant) to an approximate UTC timestamp.
        let uptime = self.boot_time.elapsed();
        let boot_utc = chrono::Utc::now() - chrono::Duration::from_std(uptime).unwrap_or_default();
        changed_at > boot_utc
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_definition_returns_known_key() {
        let def = find_definition("comfyui_ws_url");
        assert!(def.is_some());
        let def = def.unwrap();
        assert_eq!(def.category, CATEGORY_COMFYUI);
        assert_eq!(def.value_type, SettingValueType::WsUrl);
    }

    #[test]
    fn find_definition_returns_none_for_unknown() {
        assert!(find_definition("nonexistent_key").is_none());
    }

    #[test]
    fn list_by_category_filters_correctly() {
        let storage = list_definitions_by_category(CATEGORY_STORAGE);
        assert!(storage.len() >= 9);
        for d in &storage {
            assert_eq!(d.category, CATEGORY_STORAGE);
        }
    }

    #[test]
    fn validate_url_rejects_non_http() {
        let def = find_definition("comfyui_ws_url").unwrap();
        // WsUrl should reject http
        assert!(validate_setting_value(def, "http://localhost").is_err());
    }

    #[test]
    fn validate_ws_url_accepts_valid() {
        let def = find_definition("comfyui_ws_url").unwrap();
        assert!(validate_setting_value(def, "ws://localhost:8188/ws").is_ok());
        assert!(validate_setting_value(def, "wss://example.com/ws").is_ok());
    }

    #[test]
    fn validate_integer_rejects_non_numeric() {
        let def = find_definition("port").unwrap();
        assert!(validate_setting_value(def, "abc").is_err());
        assert!(validate_setting_value(def, "3000").is_ok());
    }

    #[test]
    fn validate_rejects_empty_value() {
        let def = find_definition("host").unwrap();
        assert!(validate_setting_value(def, "").is_err());
    }

    #[test]
    fn resolve_uses_db_over_env_over_default() {
        let svc = SettingsService::new(Duration::from_secs(60));

        // With DB value.
        let (val, src) = svc.resolve("port", Some("4000".to_string()));
        assert_eq!(val, "4000");
        assert_eq!(src, SettingSource::Database);

        // Invalidate and resolve without DB value — should fall to env or default.
        svc.invalidate("port");
        let (val, src) = svc.resolve("port", None);
        // In test env PORT is unlikely set, so should be default.
        if std::env::var("PORT").is_ok() {
            assert_eq!(src, SettingSource::Env);
        } else {
            assert_eq!(val, "3000");
            assert_eq!(src, SettingSource::Default);
        }
    }

    #[test]
    fn invalidate_all_clears_cache() {
        let svc = SettingsService::new(Duration::from_secs(60));
        svc.resolve("host", Some("1.2.3.4".to_string()));
        svc.invalidate_all();

        // After invalidation, should re-resolve from env/default.
        let (val, src) = svc.resolve("host", None);
        assert_ne!(src, SettingSource::Database);
        // Default is "0.0.0.0" unless HOST env is set.
        if std::env::var("HOST").is_err() {
            assert_eq!(val, "0.0.0.0");
        }
    }

    #[test]
    fn needs_restart_false_when_no_change() {
        let svc = SettingsService::new(Duration::from_secs(60));
        assert!(!svc.needs_restart(None));
    }

    #[test]
    fn needs_restart_true_when_changed_after_boot() {
        let svc = SettingsService::new(Duration::from_secs(60));
        // Simulate a change that happened "now" (after boot).
        let future = chrono::Utc::now() + chrono::Duration::seconds(10);
        assert!(svc.needs_restart(Some(future)));
    }

    #[test]
    fn needs_restart_false_when_changed_before_boot() {
        let svc = SettingsService::new(Duration::from_secs(60));
        // Simulate a change well in the past.
        let past = chrono::Utc::now() - chrono::Duration::hours(1);
        assert!(!svc.needs_restart(Some(past)));
    }
}
