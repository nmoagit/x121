//! Disk reclamation domain logic (PRD-15).
//!
//! This module contains pure business logic for the reclamation system.
//! No database dependencies — all data access is done through the repository
//! layer in `x121_db`. The core module provides:
//!
//! - Domain error types
//! - Protection rule evaluation
//! - Reclamation preview and report types
//! - File size formatting utilities

pub mod protection;
pub mod types;

/// Domain errors for the reclamation subsystem.
#[derive(Debug, thiserror::Error)]
pub enum ReclamationError {
    #[error("Asset is protected: {entity_type} #{entity_id}")]
    AssetProtected { entity_type: String, entity_id: i64 },

    #[error("Trash entry not found")]
    NotFound,

    #[error("Cannot restore: {reason}")]
    CannotRestore { reason: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
