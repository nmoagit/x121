//! Onboarding session entity model and DTOs (PRD-67).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `onboarding_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct OnboardingSession {
    pub id: DbId,
    pub project_id: DbId,
    pub created_by_id: DbId,
    pub current_step: i32,
    pub step_data: serde_json::Value,
    pub character_ids: Vec<DbId>,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new onboarding session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateOnboardingSession {
    pub project_id: DbId,
}

/// DTO for updating the step data of an onboarding session.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateOnboardingStepData {
    pub step_data: serde_json::Value,
}
