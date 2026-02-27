//! Naming rule entity models and DTOs (PRD-116).
//!
//! Configurable naming templates for all file-producing operations.
//! Each rule belongs to a naming category and optionally scopes to a project.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Naming category (lookup table)
// ---------------------------------------------------------------------------

/// A naming category from the `naming_categories` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct NamingCategory {
    pub id: i16,
    pub name: String,
    pub description: String,
    pub example_output: Option<String>,
}

// ---------------------------------------------------------------------------
// Naming rule entity
// ---------------------------------------------------------------------------

/// A naming rule row from the `naming_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct NamingRule {
    pub id: DbId,
    pub category_id: i16,
    pub project_id: Option<DbId>,
    pub template: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub changelog: serde_json::Value,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for creating a new naming rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateNamingRule {
    pub category_id: i16,
    pub project_id: Option<DbId>,
    pub template: String,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// DTO for updating an existing naming rule. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNamingRule {
    pub template: Option<String>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}
