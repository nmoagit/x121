//! Delivery destination models and DTOs (PRD-039 Amendment A.1).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `delivery_destinations` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DeliveryDestination {
    pub id: DbId,
    pub project_id: DbId,
    pub destination_type_id: StatusId,
    pub label: String,
    pub config: serde_json::Value,
    pub is_enabled: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new delivery destination.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDeliveryDestination {
    pub project_id: DbId,
    pub destination_type_id: StatusId,
    pub label: String,
    pub config: Option<serde_json::Value>,
    pub is_enabled: Option<bool>,
}

/// DTO for updating an existing delivery destination. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDeliveryDestination {
    pub label: Option<String>,
    pub destination_type_id: Option<StatusId>,
    pub config: Option<serde_json::Value>,
    pub is_enabled: Option<bool>,
}
