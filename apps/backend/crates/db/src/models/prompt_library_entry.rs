//! Prompt library entry models and DTOs (PRD-63).
//!
//! Defines the database row struct for `prompt_library` and associated
//! create/update/rate types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A prompt library entry row from the `prompt_library` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PromptLibraryEntry {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub tags: Option<Vec<String>>,
    pub model_compatibility: Option<Vec<String>>,
    pub usage_count: i32,
    pub avg_rating: Option<f64>,
    pub owner_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new prompt library entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateLibraryEntry {
    pub name: String,
    pub description: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub tags: Option<Vec<String>>,
    pub model_compatibility: Option<Vec<String>>,
    pub owner_id: DbId,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing prompt library entry.
/// All fields are optional; only provided fields are updated.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLibraryEntry {
    pub name: Option<String>,
    pub description: Option<String>,
    pub positive_prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub tags: Option<Vec<String>>,
    pub model_compatibility: Option<Vec<String>>,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for rating a library entry.
#[derive(Debug, Clone, Deserialize)]
pub struct RateLibraryEntryRequest {
    pub rating: f64,
}
