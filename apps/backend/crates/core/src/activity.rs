//! Activity log domain types (PRD-118).
//!
//! Shared types for the activity logging system used across crates:
//! - `events` crate (broadcaster)
//! - `api` crate (tracing layer, handlers)
//! - `db` crate (model mapping)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Log level for an activity log entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl ActivityLogLevel {
    /// Map to the lowercase name used in the `activity_log_levels` lookup table.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }

    /// Parse from the lowercase name stored in the lookup table.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "debug" => Some(Self::Debug),
            "info" => Some(Self::Info),
            "warn" => Some(Self::Warn),
            "error" => Some(Self::Error),
            _ => None,
        }
    }
}

/// Source service that produced an activity log entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogSource {
    Api,
    Comfyui,
    Worker,
    Agent,
    Pipeline,
}

impl ActivityLogSource {
    /// Map to the lowercase name used in the `activity_log_sources` lookup table.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Api => "api",
            Self::Comfyui => "comfyui",
            Self::Worker => "worker",
            Self::Agent => "agent",
            Self::Pipeline => "pipeline",
        }
    }

    /// Parse from the lowercase name stored in the lookup table.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "api" => Some(Self::Api),
            "comfyui" => Some(Self::Comfyui),
            "worker" => Some(Self::Worker),
            "agent" => Some(Self::Agent),
            "pipeline" => Some(Self::Pipeline),
            _ => None,
        }
    }

    /// Infer the source from a Rust module target path (used by tracing layer).
    pub fn from_target(target: &str) -> Self {
        if target.starts_with("x121_comfyui") {
            Self::Comfyui
        } else if target.starts_with("x121_worker") || target.contains("worker") {
            Self::Worker
        } else if target.starts_with("x121_pipeline") || target.contains("pipeline") {
            Self::Pipeline
        } else {
            Self::Api
        }
    }
}

/// Category distinguishing curated (explicit) from verbose (tracing) entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityLogCategory {
    Curated,
    Verbose,
}

impl ActivityLogCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Curated => "curated",
            Self::Verbose => "verbose",
        }
    }

    /// Parse from the lowercase name.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "curated" => Some(Self::Curated),
            "verbose" => Some(Self::Verbose),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ActivityLogEntry
// ---------------------------------------------------------------------------

/// A structured activity log entry flowing through the broadcast channel.
///
/// This is the in-memory representation used by [`ActivityLogBroadcaster`].
/// It is converted to/from the database model by the persistence layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: ActivityLogLevel,
    pub source: ActivityLogSource,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: ActivityLogCategory,
    pub entity_type: Option<String>,
    pub entity_id: Option<i64>,
    pub user_id: Option<i64>,
    pub job_id: Option<i64>,
    pub project_id: Option<i64>,
    pub trace_id: Option<String>,
}

impl ActivityLogEntry {
    /// Create a new curated activity log entry.
    pub fn curated(
        level: ActivityLogLevel,
        source: ActivityLogSource,
        message: impl Into<String>,
    ) -> Self {
        Self {
            timestamp: Utc::now(),
            level,
            source,
            message: message.into(),
            fields: serde_json::Value::Object(Default::default()),
            category: ActivityLogCategory::Curated,
            entity_type: None,
            entity_id: None,
            user_id: None,
            job_id: None,
            project_id: None,
            trace_id: None,
        }
    }

    /// Builder: attach an entity reference.
    pub fn with_entity(mut self, entity_type: impl Into<String>, entity_id: i64) -> Self {
        self.entity_type = Some(entity_type.into());
        self.entity_id = Some(entity_id);
        self
    }

    /// Builder: attach a user ID.
    pub fn with_user(mut self, user_id: i64) -> Self {
        self.user_id = Some(user_id);
        self
    }

    /// Builder: attach a job ID.
    pub fn with_job(mut self, job_id: i64) -> Self {
        self.job_id = Some(job_id);
        self
    }

    /// Builder: attach a project ID.
    pub fn with_project(mut self, project_id: i64) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Builder: attach a trace ID.
    pub fn with_trace(mut self, trace_id: impl Into<String>) -> Self {
        self.trace_id = Some(trace_id.into());
        self
    }

    /// Builder: set structured fields.
    pub fn with_fields(mut self, fields: serde_json::Value) -> Self {
        self.fields = fields;
        self
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_curated_entry_defaults() {
        let entry = ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            "Test message",
        );
        assert_eq!(entry.level, ActivityLogLevel::Info);
        assert_eq!(entry.source, ActivityLogSource::Api);
        assert_eq!(entry.message, "Test message");
        assert_eq!(entry.category, ActivityLogCategory::Curated);
        assert!(entry.fields.is_object());
        assert!(entry.entity_type.is_none());
        assert!(entry.entity_id.is_none());
        assert!(entry.user_id.is_none());
        assert!(entry.job_id.is_none());
        assert!(entry.project_id.is_none());
        assert!(entry.trace_id.is_none());
    }

    #[test]
    fn test_builder_chain() {
        let entry = ActivityLogEntry::curated(
            ActivityLogLevel::Warn,
            ActivityLogSource::Comfyui,
            "Generation failed",
        )
        .with_entity("job", 42)
        .with_user(7)
        .with_job(100)
        .with_project(5)
        .with_trace("trace-abc-123")
        .with_fields(serde_json::json!({"node_id": "sampler_1"}));

        assert_eq!(entry.level, ActivityLogLevel::Warn);
        assert_eq!(entry.source, ActivityLogSource::Comfyui);
        assert_eq!(entry.entity_type.as_deref(), Some("job"));
        assert_eq!(entry.entity_id, Some(42));
        assert_eq!(entry.user_id, Some(7));
        assert_eq!(entry.job_id, Some(100));
        assert_eq!(entry.project_id, Some(5));
        assert_eq!(entry.trace_id.as_deref(), Some("trace-abc-123"));
        assert_eq!(entry.fields["node_id"], "sampler_1");
    }

    #[test]
    fn test_level_as_str() {
        assert_eq!(ActivityLogLevel::Debug.as_str(), "debug");
        assert_eq!(ActivityLogLevel::Info.as_str(), "info");
        assert_eq!(ActivityLogLevel::Warn.as_str(), "warn");
        assert_eq!(ActivityLogLevel::Error.as_str(), "error");
    }

    #[test]
    fn test_source_as_str() {
        assert_eq!(ActivityLogSource::Api.as_str(), "api");
        assert_eq!(ActivityLogSource::Comfyui.as_str(), "comfyui");
        assert_eq!(ActivityLogSource::Worker.as_str(), "worker");
        assert_eq!(ActivityLogSource::Agent.as_str(), "agent");
        assert_eq!(ActivityLogSource::Pipeline.as_str(), "pipeline");
    }

    #[test]
    fn test_level_from_str() {
        assert_eq!(
            ActivityLogLevel::from_str("info"),
            Some(ActivityLogLevel::Info)
        );
        assert_eq!(ActivityLogLevel::from_str("unknown"), None);
    }

    #[test]
    fn test_source_from_str() {
        assert_eq!(
            ActivityLogSource::from_str("comfyui"),
            Some(ActivityLogSource::Comfyui)
        );
        assert_eq!(ActivityLogSource::from_str("unknown"), None);
    }

    #[test]
    fn test_source_from_target() {
        assert_eq!(
            ActivityLogSource::from_target("x121_comfyui::manager"),
            ActivityLogSource::Comfyui
        );
        assert_eq!(
            ActivityLogSource::from_target("x121_worker::runner"),
            ActivityLogSource::Worker
        );
        assert_eq!(
            ActivityLogSource::from_target("x121_pipeline::stage"),
            ActivityLogSource::Pipeline
        );
        assert_eq!(
            ActivityLogSource::from_target("x121_api::handlers"),
            ActivityLogSource::Api
        );
    }

    #[test]
    fn test_serde_roundtrip() {
        let entry = ActivityLogEntry::curated(
            ActivityLogLevel::Error,
            ActivityLogSource::Pipeline,
            "Pipeline error",
        )
        .with_job(99);

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: ActivityLogEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.level, ActivityLogLevel::Error);
        assert_eq!(deserialized.source, ActivityLogSource::Pipeline);
        assert_eq!(deserialized.message, "Pipeline error");
        assert_eq!(deserialized.job_id, Some(99));
    }

    #[test]
    fn test_category_as_str() {
        assert_eq!(ActivityLogCategory::Curated.as_str(), "curated");
        assert_eq!(ActivityLogCategory::Verbose.as_str(), "verbose");
    }

    #[test]
    fn test_category_from_str() {
        assert_eq!(
            ActivityLogCategory::from_str("curated"),
            Some(ActivityLogCategory::Curated)
        );
        assert_eq!(
            ActivityLogCategory::from_str("verbose"),
            Some(ActivityLogCategory::Verbose)
        );
        assert_eq!(ActivityLogCategory::from_str("unknown"), None);
    }
}
