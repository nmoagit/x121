//! Output format profile models and DTOs (PRD-39).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `output_format_profiles` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct OutputFormatProfile {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub resolution: String,
    pub codec: String,
    pub container: String,
    pub bitrate_kbps: Option<i32>,
    pub framerate: Option<f32>,
    pub pixel_format: Option<String>,
    pub extra_ffmpeg_args: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new output format profile.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateOutputFormatProfile {
    pub name: String,
    pub description: Option<String>,
    pub resolution: String,
    pub codec: String,
    pub container: String,
    pub bitrate_kbps: Option<i32>,
    pub framerate: Option<f32>,
    pub pixel_format: Option<String>,
    pub extra_ffmpeg_args: Option<String>,
}

/// DTO for updating an existing output format profile. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateOutputFormatProfile {
    pub name: Option<String>,
    pub description: Option<String>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub bitrate_kbps: Option<i32>,
    pub framerate: Option<f32>,
    pub pixel_format: Option<String>,
    pub extra_ffmpeg_args: Option<String>,
}
