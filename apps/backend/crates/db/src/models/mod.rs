//! Domain model structs and DTOs.
//!
//! Each submodule contains:
//! - A `FromRow` + `Serialize` entity struct matching the database row
//! - A `Deserialize` create DTO for inserts
//! - A `Deserialize` update DTO (all `Option` fields) for patches

pub mod asset;
pub mod character;
pub mod comfyui;
pub mod event;
pub mod hardware;
pub mod image;
pub mod image_qa;
pub mod keymap;
pub mod layout;
pub mod job;
pub mod notification;
pub mod proficiency;
pub mod project;
pub mod reclamation;
pub mod role;
pub mod scene;
pub mod scene_type;
pub mod scene_video_version;
pub mod script;
pub mod segment;
pub mod session;
pub mod tag;
pub mod theme;
pub mod status;
pub mod user;
pub mod validation;
pub mod video;
