//! Production run models and DTOs (PRD-57).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `production_runs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProductionRun {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub matrix_config: serde_json::Value,
    pub status_id: DbId,
    pub total_cells: i32,
    pub completed_cells: i32,
    pub failed_cells: i32,
    pub estimated_gpu_hours: Option<f64>,
    pub estimated_disk_gb: Option<f64>,
    pub created_by_id: DbId,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `production_run_cells` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProductionRunCell {
    pub id: DbId,
    pub run_id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub variant_label: String,
    pub status_id: DbId,
    pub scene_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub blocking_reason: Option<String>,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new production run.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProductionRun {
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub matrix_config: serde_json::Value,
    pub total_cells: i32,
    pub estimated_gpu_hours: Option<f64>,
    pub estimated_disk_gb: Option<f64>,
    pub created_by_id: DbId,
}

/// DTO for creating a new production run cell.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProductionRunCell {
    pub run_id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub variant_label: String,
}

/// Request body from the API for creating a new production run.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProductionRunRequest {
    pub project_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub character_ids: Vec<DbId>,
    pub scene_type_ids: Vec<DbId>,
    pub estimated_gpu_hours: Option<f64>,
    pub estimated_disk_gb: Option<f64>,
}

/// Request body for submitting cells (all or a subset).
#[derive(Debug, Clone, Deserialize)]
pub struct SubmitCellsRequest {
    /// If empty or None, submit all cells in the run.
    pub cell_ids: Option<Vec<DbId>>,
}

/// Response for cell submission.
#[derive(Debug, Clone, Serialize)]
pub struct SubmitCellsResponse {
    pub run_id: DbId,
    pub submitted_cells: usize,
    pub status: String,
}

/// Response for resubmitting failed cells.
#[derive(Debug, Clone, Serialize)]
pub struct ResubmitResponse {
    pub run_id: DbId,
    pub resubmitted_cells: usize,
}

/// Response for delivery trigger.
#[derive(Debug, Clone, Serialize)]
pub struct DeliverResponse {
    pub run_id: DbId,
    pub status: String,
}

/// Aggregate progress statistics for a production run.
#[derive(Debug, Clone, Serialize)]
pub struct ProductionRunProgress {
    pub run_id: DbId,
    pub total_cells: i32,
    pub completed_cells: i32,
    pub failed_cells: i32,
    pub in_progress_cells: i32,
    pub not_started_cells: i32,
    pub completion_pct: f64,
}
