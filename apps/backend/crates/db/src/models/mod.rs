//! Domain model structs and DTOs.
//!
//! Each submodule contains:
//! - A `FromRow` + `Serialize` entity struct matching the database row
//! - A `Deserialize` create DTO for inserts
//! - A `Deserialize` update DTO (all `Option` fields) for patches

pub mod character;
pub mod comfyui;
pub mod image;
pub mod project;
pub mod role;
pub mod scene;
pub mod scene_type;
pub mod scene_video_version;
pub mod segment;
pub mod session;
pub mod status;
pub mod user;
