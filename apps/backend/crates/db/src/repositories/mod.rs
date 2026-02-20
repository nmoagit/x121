//! Repository layer for PRD-01 entities.
//!
//! Each repository is a zero-sized struct providing async CRUD methods
//! that accept `&PgPool` as the first argument.

pub mod character_repo;
pub mod derived_image_repo;
pub mod image_variant_repo;
pub mod project_repo;
pub mod scene_repo;
pub mod scene_type_repo;
pub mod segment_repo;
pub mod source_image_repo;

pub use character_repo::CharacterRepo;
pub use derived_image_repo::DerivedImageRepo;
pub use image_variant_repo::ImageVariantRepo;
pub use project_repo::ProjectRepo;
pub use scene_repo::SceneRepo;
pub use scene_type_repo::SceneTypeRepo;
pub use segment_repo::SegmentRepo;
pub use source_image_repo::SourceImageRepo;
