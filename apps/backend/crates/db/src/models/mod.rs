//! Domain model structs and DTOs.
//!
//! Each submodule contains:
//! - A `FromRow` + `Serialize` entity struct matching the database row
//! - A `Deserialize` create DTO for inserts
//! - A `Deserialize` update DTO (all `Option` fields) for patches

pub mod api_key;
pub mod asset;
pub mod audit;
pub mod character;
pub mod checkpoint;
pub mod collaboration;
pub mod comfyui;
pub mod dashboard;
pub mod event;
pub mod extension;
pub mod hardware;
pub mod image;
pub mod image_qa;
pub mod job;
pub mod keymap;
pub mod layout;
pub mod notification;
pub mod performance_metric;
pub mod proficiency;
pub mod project;
pub mod reclamation;
pub mod role;
pub mod scene;
pub mod scene_type;
pub mod scene_video_version;
pub mod scheduling;
pub mod script;
pub mod search;
pub mod segment;
pub mod session;
pub mod status;
pub mod tag;
pub mod theme;
pub mod user;
pub mod validation;
pub mod video;
pub mod workspace;
