//! Request handlers for PRD-01 entities.
//!
//! Each submodule provides async handler functions (create, list, get_by_id,
//! update, delete) for a single entity type. Handlers delegate to the
//! corresponding repository in `trulience_db` and map errors via [`AppError`].

pub mod character;
pub mod derived_image;
pub mod image_variant;
pub mod project;
pub mod scene;
pub mod scene_type;
pub mod segment;
pub mod source_image;
