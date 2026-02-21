//! Request handlers.
//!
//! Each submodule provides async handler functions for a single resource.
//! Handlers delegate to the corresponding repository in `trulience_db`
//! and map errors via [`AppError`].

pub mod admin;
pub mod assets;
pub mod auth;
pub mod character;
pub mod dashboard;
pub mod derived_image;
pub mod hardware;
pub mod image_qa;
pub mod image_variant;
pub mod keymaps;
pub mod layouts;
pub mod jobs;
pub mod notification;
pub mod performance;
pub mod proficiency;
pub mod project;
pub mod reclamation;
pub mod scene;
pub mod scene_type;
pub mod scene_video_version;
pub mod scripts;
pub mod segment;
pub mod source_image;
pub mod tags;
pub mod themes;
pub mod trash;
pub mod validation;
pub mod video;
