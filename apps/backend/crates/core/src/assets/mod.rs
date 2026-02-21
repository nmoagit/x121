//! Asset registry business logic (PRD-17).
//!
//! This module provides domain services for asset registration, dependency
//! checking, and impact analysis. It does NOT depend on the database crate;
//! callers pass in data from the repository layer.

pub mod dependencies;
pub mod impact;
pub mod registry;

/// Asset-domain error type.
#[derive(Debug, thiserror::Error)]
pub enum AssetError {
    #[error("Asset not found: #{0}")]
    NotFound(i64),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Duplicate asset: {name} v{version}")]
    Duplicate { name: String, version: String },

    #[error("Cannot delete: asset has {count} active dependents")]
    HasDependents { count: usize },

    #[error("Invalid rating: {0} (must be 1-5)")]
    InvalidRating(i16),
}
