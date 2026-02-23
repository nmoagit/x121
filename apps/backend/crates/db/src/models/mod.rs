//! Domain model structs and DTOs.
//!
//! Each submodule contains:
//! - A `FromRow` + `Serialize` entity struct matching the database row
//! - A `Deserialize` create DTO for inserts
//! - A `Deserialize` update DTO (all `Option` fields) for patches

pub mod api_key;
pub mod approval;
pub mod asset;
pub mod audit;
pub mod bug_report;
pub mod character;
pub mod checkpoint;
pub mod collaboration;
pub mod comfyui;
pub mod dashboard;
pub mod delivery_export;
pub mod duplicate_check;
pub mod duplicate_setting;
pub mod embedding;
pub mod event;
pub mod extension;
pub mod generation;
pub mod hardware;
pub mod image;
pub mod image_qa;
pub mod importer;
pub mod integrity_scan;
pub mod job;
pub mod job_debug;
pub mod keymap;
pub mod layout;
pub mod library_character;
pub mod metadata;
pub mod model_checksum;
pub mod model_download;
pub mod notification;
pub mod onboarding;
pub mod output_format_profile;
pub mod placement_rule;
pub mod performance_metric;
pub mod production_run;
pub mod preset;
pub mod proficiency;
pub mod qa_threshold;
pub mod quality_score;
pub mod project;
pub mod recent_item;
pub mod reclamation;
pub mod review_note;
pub mod role;
pub mod scene;
pub mod scene_type;
pub mod scene_video_version;
pub mod scheduling;
pub mod script;
pub mod search;
pub mod segment;
pub mod segment_version;
pub mod session;
pub mod status;
pub mod storage;
pub mod tag;
pub mod temporal_metric;
pub mod template;
pub mod theme;
pub mod undo_tree;
pub mod user;
pub mod user_api_token;
pub mod validation;
pub mod video;
pub mod watermark_setting;
pub mod wiki_article;
pub mod wiki_version;
pub mod workflow_layout;
pub mod worker;
pub mod workspace;
