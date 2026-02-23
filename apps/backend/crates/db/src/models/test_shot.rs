//! Test shot models and DTOs (PRD-58).
//!
//! Defines the database row struct for `test_shots` and associated
//! create/request/response types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A test shot row from the `test_shots` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TestShot {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub character_id: DbId,
    pub workflow_id: Option<DbId>,
    pub parameters: serde_json::Value,
    pub seed_image_path: String,
    pub output_video_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub duration_secs: Option<f64>,
    pub quality_score: Option<f64>,
    pub is_promoted: bool,
    pub promoted_to_scene_id: Option<DbId>,
    pub created_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO (internal, used by repository)
// ---------------------------------------------------------------------------

/// Input for creating a new test shot record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTestShot {
    pub scene_type_id: DbId,
    pub character_id: DbId,
    pub workflow_id: Option<DbId>,
    pub parameters: serde_json::Value,
    pub seed_image_path: String,
    pub duration_secs: Option<f64>,
    pub created_by_id: DbId,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for generating a single test shot.
#[derive(Debug, Clone, Deserialize)]
pub struct GenerateTestShotRequest {
    pub scene_type_id: DbId,
    pub character_id: DbId,
    pub workflow_id: Option<DbId>,
    pub parameters: Option<serde_json::Value>,
    pub seed_image_path: String,
    pub duration_secs: Option<f64>,
}

/// Request body for generating a batch of test shots.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchTestShotRequest {
    pub scene_type_id: DbId,
    pub character_ids: Vec<DbId>,
    pub workflow_id: Option<DbId>,
    pub parameters: Option<serde_json::Value>,
    pub seed_image_path: String,
    pub duration_secs: Option<f64>,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/// Response returned when a test shot is promoted to a full scene.
#[derive(Debug, Clone, Serialize)]
pub struct PromoteResponse {
    pub test_shot_id: DbId,
    pub promoted_to_scene_id: DbId,
}

/// Response returned after creating a batch of test shots.
#[derive(Debug, Clone, Serialize)]
pub struct BatchTestShotResponse {
    pub test_shot_ids: Vec<DbId>,
    pub count: usize,
}
