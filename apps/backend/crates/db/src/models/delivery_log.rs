//! Delivery log models and DTOs (PRD-39 Amendment A.3).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `delivery_logs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DeliveryLog {
    pub id: DbId,
    pub delivery_export_id: Option<DbId>,
    pub project_id: DbId,
    pub log_level: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
    pub created_at: Timestamp,
}

/// DTO for creating a new delivery log entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDeliveryLog {
    pub delivery_export_id: Option<DbId>,
    pub project_id: DbId,
    pub log_level: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}
