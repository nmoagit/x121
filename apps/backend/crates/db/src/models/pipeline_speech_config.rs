//! Pipeline speech configuration model (PRD-143).
//!
//! Per-pipeline default configuration specifying the required number of speech
//! variants per speech type and language combination. Project-level config
//! overrides these defaults.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `pipeline_speech_config` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PipelineSpeechConfig {
    pub id: DbId,
    pub pipeline_id: DbId,
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
    pub created_at: Timestamp,
}

/// DTO for upserting pipeline speech config entries.
#[derive(Debug, Deserialize)]
pub struct PipelineSpeechConfigEntry {
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
}
