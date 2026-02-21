//! Asset update impact analysis (PRD-17).
//!
//! Structures for reporting which entities are affected when an asset changes.

use serde::Serialize;

use crate::types::DbId;

/// Summary of the impact of updating or removing an asset.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateImpact {
    /// The asset being analyzed.
    pub asset_id: DbId,
    /// Number of entities that depend on this asset.
    pub total_dependents: i64,
    /// Breakdown of affected entities by type.
    pub affected_entities: Vec<AffectedGroup>,
}

/// A group of affected entities of the same type.
#[derive(Debug, Clone, Serialize)]
pub struct AffectedGroup {
    /// The entity type (e.g., "scene_type", "scene", "workflow").
    pub entity_type: String,
    /// Number of entities of this type affected.
    pub count: i64,
    /// Individual entity IDs.
    pub entity_ids: Vec<DbId>,
}
