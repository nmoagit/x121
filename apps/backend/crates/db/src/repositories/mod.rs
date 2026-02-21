//! Repository layer.
//!
//! Each repository is a zero-sized struct providing async CRUD methods
//! that accept `&PgPool` as the first argument.

pub mod character_repo;
pub mod comfyui_execution_repo;
pub mod comfyui_instance_repo;
pub mod derived_image_repo;
pub mod event_repo;
pub mod gpu_metric_repo;
pub mod image_qa_threshold_repo;
pub mod metric_threshold_repo;

pub mod image_quality_score_repo;
pub mod image_variant_repo;
pub mod import_report_repo;
pub mod notification_preference_repo;
pub mod notification_repo;
pub mod project_repo;
pub mod qa_check_type_repo;
pub mod restart_log_repo;
pub mod role_repo;
pub mod scene_repo;
pub mod scene_type_repo;
pub mod scene_video_version_repo;
pub mod segment_repo;
pub mod session_repo;
pub mod source_image_repo;
pub mod trash_repo;
pub mod user_repo;
pub mod validation_rule_repo;

pub use character_repo::CharacterRepo;
pub use comfyui_execution_repo::ComfyUIExecutionRepo;
pub use comfyui_instance_repo::ComfyUIInstanceRepo;
pub use derived_image_repo::DerivedImageRepo;
pub use event_repo::EventRepo;
pub use gpu_metric_repo::GpuMetricRepo;
pub use image_qa_threshold_repo::ImageQaThresholdRepo;
pub use image_quality_score_repo::ImageQualityScoreRepo;
pub use image_variant_repo::ImageVariantRepo;
pub use import_report_repo::ImportReportRepo;
pub use metric_threshold_repo::MetricThresholdRepo;
pub use notification_preference_repo::NotificationPreferenceRepo;
pub use notification_repo::NotificationRepo;
pub use project_repo::ProjectRepo;
pub use qa_check_type_repo::QaCheckTypeRepo;
pub use restart_log_repo::RestartLogRepo;
pub use role_repo::RoleRepo;
pub use scene_repo::SceneRepo;
pub use scene_type_repo::SceneTypeRepo;
pub use scene_video_version_repo::SceneVideoVersionRepo;
pub use segment_repo::SegmentRepo;
pub use session_repo::SessionRepo;
pub use source_image_repo::SourceImageRepo;
pub use trash_repo::TrashRepo;
pub use user_repo::UserRepo;
pub use validation_rule_repo::ValidationRuleRepo;
