//! Domain model structs and DTOs for PRD-01 entities.
//!
//! Each submodule contains:
//! - A `FromRow` + `Serialize` entity struct matching the database row
//! - A `Deserialize` create DTO for inserts
//! - A `Deserialize` update DTO (all `Option` fields) for patches

pub mod character;
pub mod image;
pub mod project;
pub mod scene;
pub mod scene_type;
pub mod segment;
pub mod status;
