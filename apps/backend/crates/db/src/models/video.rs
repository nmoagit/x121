//! Video thumbnail entity model, metadata response types, and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// Re-export `AudioTrackInfo` from core to keep it as the single source of truth.
pub use trulience_core::ffmpeg::AudioTrackInfo;

/// A row from the `video_thumbnails` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct VideoThumbnail {
    pub id: DbId,
    pub source_type: String,
    pub source_id: DbId,
    pub frame_number: i32,
    pub thumbnail_path: String,
    pub interval_seconds: Option<f32>,
    pub width: i32,
    pub height: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a video thumbnail record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateVideoThumbnail {
    pub source_type: String,
    pub source_id: DbId,
    pub frame_number: i32,
    pub thumbnail_path: String,
    pub interval_seconds: Option<f32>,
    pub width: i32,
    pub height: i32,
}

/// Video metadata extracted via ffprobe. Not a database row — computed on demand.
#[derive(Debug, Clone, Serialize)]
pub struct VideoMetadata {
    pub duration_seconds: f64,
    pub codec: String,
    pub width: i32,
    pub height: i32,
    pub framerate: f64,
    pub total_frames: i64,
    pub file_size_bytes: Option<i64>,
    pub audio_tracks: Vec<AudioTrackInfo>,
}
