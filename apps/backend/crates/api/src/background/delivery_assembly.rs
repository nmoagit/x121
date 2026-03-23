//! Delivery assembly pipeline background service (PRD-39).
//!
//! Polls for pending delivery exports and processes them through:
//! assembling → transcoding → packaging → validating → completed/failed.
//!
//! Files inside each per-avatar RAR are named according to the dynamic
//! naming rules (delivery_video, delivery_image, delivery_metadata, delivery_folder).
//! Structure is flat unless delivery_folder defines subdirectories.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::assembly;
use x121_core::ffmpeg::{self, TranscodeProfileParams};
use x121_core::naming_engine::{self, NamingContext};
use x121_core::types::DbId;
use x121_db::models::delivery_export::DeliveryExport;
use x121_db::models::delivery_log::CreateDeliveryLog;
use x121_db::repositories::{
    AvatarMetadataVersionRepo, AvatarRepo, DeliveryExportRepo, ImageVariantRepo, NamingRuleRepo,
    OutputFormatProfileRepo, PipelineRepo, ProjectDeliveryLogRepo, ProjectRepo, SceneRepo,
    SceneTypeRepo, SceneTypeTrackConfigRepo, SceneVideoVersionRepo, TrackRepo,
};

use crate::state::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(10);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Run the delivery assembly poll loop.
pub async fn run(state: AppState, cancel: CancellationToken) {
    tracing::info!(
        interval_secs = POLL_INTERVAL.as_secs(),
        "Delivery assembly pipeline started"
    );

    let mut interval = tokio::time::interval(POLL_INTERVAL);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Delivery assembly pipeline stopping");
                break;
            }
            _ = interval.tick() => {
                if let Err(e) = process_next(&state, &cancel).await {
                    tracing::error!(error = %e, "Delivery assembly: tick failed");
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

/// Claim one pending export and process it through the full pipeline.
async fn process_next(
    state: &AppState,
    cancel: &CancellationToken,
) -> Result<(), Box<dyn std::error::Error>> {
    let export = match DeliveryExportRepo::claim_next_pending(&state.pool).await? {
        Some(e) => e,
        None => return Ok(()),
    };

    tracing::info!(
        export_id = export.id,
        project_id = export.project_id,
        "Claimed delivery export"
    );

    if let Err(e) = run_pipeline(state, &export, cancel).await {
        let msg = format!("{e}");
        tracing::error!(export_id = export.id, error = %msg, "Delivery pipeline failed");
        let _ = DeliveryExportRepo::mark_failed(&state.pool, export.id, &msg).await;
        log_step(
            state,
            export.id,
            export.project_id,
            "error",
            &format!("Export failed: {msg}"),
        )
        .await;
    }

    Ok(())
}

/// A collected file asset ready for packaging.
struct FileAsset {
    /// Resolved filename from naming rules (e.g. "alt_dance.mp4", "default.png").
    resolved_name: String,
    /// Absolute path to the source (or transcoded) file.
    path: PathBuf,
}

/// All collected assets for a single avatar.
struct AvatarBundle {
    avatar_name: String,
    avatar_slug: String,
    videos: Vec<FileAsset>,
    images: Vec<FileAsset>,
    metadata_json: Option<serde_json::Value>,
    /// Resolved folder prefix from delivery_folder naming rule (may be empty for flat).
    folder_prefix: String,
}

/// Execute the full assembly pipeline for a single export.
async fn run_pipeline(
    state: &AppState,
    export: &DeliveryExport,
    cancel: &CancellationToken,
) -> Result<(), PipelineError> {
    let storage_root = storage_root();
    let export_id = export.id;
    let project_id = export.project_id;

    // Load project.
    let project = ProjectRepo::find_by_id(&state.pool, project_id)
        .await?
        .ok_or(PipelineError::msg("Project not found"))?;

    // Load pipeline naming rules for dynamic prefix resolution.
    let prefix_rules: Option<std::collections::HashMap<String, String>> = if let Ok(Some(
        pipeline,
    )) =
        PipelineRepo::find_by_id(&state.pool, project.pipeline_id).await
    {
        x121_core::pipeline::parse_naming_rules(&pipeline.naming_rules)
            .ok()
            .map(|rules| rules.prefix_rules)
    } else {
        None
    };

    // Load format profile.
    let profile = OutputFormatProfileRepo::find_by_id(&state.pool, export.format_profile_id)
        .await?
        .ok_or(PipelineError::msg("Output format profile not found"))?;

    let is_passthrough = profile.is_passthrough;

    // Determine which avatars to include.
    let all_avatars = AvatarRepo::list_by_project(&state.pool, project_id).await?;
    let avatar_ids: Vec<DbId> = match &export.avatars_json {
        Some(json) => serde_json::from_value::<Vec<DbId>>(json.clone())
            .unwrap_or_else(|_| all_avatars.iter().map(|c| c.id).collect()),
        None => all_avatars.iter().map(|c| c.id).collect(),
    };
    let avatars: Vec<_> = all_avatars
        .into_iter()
        .filter(|c| avatar_ids.contains(&c.id))
        .collect();

    if avatars.is_empty() {
        return Err(PipelineError::msg("No avatars to export"));
    }

    let model_names: Vec<&str> = avatars.iter().map(|c| c.name.as_str()).collect();
    log_step(
        state,
        export_id,
        project_id,
        "info",
        &format!(
            "Assembling {} models: {} (profile: {}{})",
            avatars.len(),
            model_names.join(", "),
            profile.name,
            if is_passthrough { ", passthrough" } else { "" },
        ),
    )
    .await;

    // -----------------------------------------------------------------------
    // Phase 1: Assembling — collect all final videos with naming context
    // -----------------------------------------------------------------------
    let project_slug = naming_engine::slugify(&project.name);

    // Load naming rule templates (fall back to sensible defaults).
    let video_template = load_rule_template(&state.pool, "delivery_video", project_id)
        .await
        .unwrap_or_else(|| {
            "{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4".into()
        });
    let image_template = load_rule_template(&state.pool, "delivery_image", project_id)
        .await
        .unwrap_or_else(|| "{variant_label}.{ext}".into());
    let folder_template = load_rule_template(&state.pool, "delivery_folder", project_id).await;
    let metadata_template = load_rule_template(&state.pool, "delivery_metadata", project_id)
        .await
        .unwrap_or_else(|| "metadata.json".into());

    let mut bundles: Vec<AvatarBundle> = Vec::new();

    for avatar in &avatars {
        check_cancelled(cancel)?;

        let char_slug = naming_engine::slugify(&avatar.name);
        let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;

        // Resolve folder prefix from naming rules.
        let folder_prefix = if let Some(ref tmpl) = folder_template {
            let ctx = NamingContext {
                project_name: Some(project.name.clone()),
                avatar_name: Some(avatar.name.clone()),
                ..Default::default()
            };
            naming_engine::resolve_template(tmpl, &ctx)
                .map(|r| r.filename)
                .unwrap_or_default()
        } else {
            String::new()
        };

        let mut videos = Vec::new();
        // Track how many videos share the same content key for index_suffix.
        let mut content_key_counts: std::collections::HashMap<String, u32> =
            std::collections::HashMap::new();

        for scene in &scenes {
            let version =
                match SceneVideoVersionRepo::find_final_for_scene(&state.pool, scene.id).await? {
                    Some(v) => v,
                    None => continue,
                };

            let abs_path = storage_root.join(&version.file_path);
            if !abs_path.exists() {
                log_step(
                    state,
                    export_id,
                    project_id,
                    "warning",
                    &format!("Video not found: {} — skipping", abs_path.display()),
                )
                .await;
                continue;
            }

            // Build naming context for this video.
            let scene_type = SceneTypeRepo::find_by_id(&state.pool, scene.scene_type_id).await?;
            let scene_type_name = scene_type.as_ref().map(|st| st.name.clone());

            // Determine variant from the track slug (dynamic — works with any track names).
            let variant_label = if let Some(track_id) = scene.track_id {
                TrackRepo::find_by_id(&state.pool, track_id)
                    .await?
                    .map(|t| t.slug.clone())
            } else {
                None
            };

            // Determine is_clothes_off from the scene_type_track_configs table.
            let is_clothes_off = if let Some(track_id) = scene.track_id {
                let configs =
                    SceneTypeTrackConfigRepo::list_by_scene_type(&state.pool, scene.scene_type_id)
                        .await?;
                configs
                    .iter()
                    .find(|c| c.track_id == track_id)
                    .map(|c| c.is_clothes_off)
                    .unwrap_or(false)
            } else {
                false
            };

            let ext = abs_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("mp4");

            // Compute index for duplicate content keys.
            let content_key = format!(
                "{}_{}_{}",
                variant_label.as_deref().unwrap_or("default"),
                scene_type_name.as_deref().unwrap_or("unknown"),
                if is_clothes_off { "co" } else { "std" },
            );
            let count = content_key_counts.entry(content_key).or_insert(0);
            *count += 1;
            let index = if *count > 1 { Some(*count) } else { None };

            let ctx = NamingContext {
                variant_label,
                scene_type_name,
                is_clothes_off,
                index,
                avatar_name: Some(avatar.name.clone()),
                project_name: Some(project.name.clone()),
                ext: Some(ext.to_string()),
                prefix_rules: prefix_rules.clone(),
                ..Default::default()
            };

            let resolved_name = naming_engine::resolve_template(&video_template, &ctx)
                .map(|r| r.filename)
                .unwrap_or_else(|_| format!("scene_{}.{ext}", scene.id));

            videos.push(FileAsset {
                resolved_name,
                path: abs_path,
            });
        }

        // Collect image variants (one per track/seed slot).
        let image_variants = ImageVariantRepo::list_by_avatar(&state.pool, avatar.id).await?;
        let mut images = Vec::new();
        for iv in &image_variants {
            let abs_path = storage_root.join(&iv.file_path);
            if !abs_path.exists() {
                continue;
            }
            let ext = abs_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            // Use variant_type (track slug) for naming, not variant_label (display name).
            let label = iv.variant_type.as_deref().unwrap_or(&iv.variant_label);
            let ctx = NamingContext {
                variant_label: Some(label.to_string()),
                ext: Some(ext.to_string()),
                avatar_name: Some(avatar.name.clone()),
                project_name: Some(project.name.clone()),
                ..Default::default()
            };
            let resolved_name = naming_engine::resolve_template(&image_template, &ctx)
                .map(|r| r.filename)
                .unwrap_or_else(|_| format!("{label}.{ext}"));
            images.push(FileAsset {
                resolved_name,
                path: abs_path,
            });
        }

        let metadata = AvatarMetadataVersionRepo::find_approved(&state.pool, avatar.id)
            .await?
            .map(|m| m.metadata);

        bundles.push(AvatarBundle {
            avatar_name: avatar.name.clone(),
            avatar_slug: char_slug,
            videos,
            images,
            metadata_json: metadata,
            folder_prefix,
        });
    }

    let total_videos: usize = bundles.iter().map(|b| b.videos.len()).sum();
    let total_images: usize = bundles.iter().map(|b| b.images.len()).sum();
    log_step(
        state,
        export_id,
        project_id,
        "info",
        &format!(
            "Collected {total_videos} videos, {total_images} images across {} models",
            bundles.len()
        ),
    )
    .await;

    // -----------------------------------------------------------------------
    // Phase 2: Transcoding (skipped for passthrough profiles)
    // -----------------------------------------------------------------------
    DeliveryExportRepo::update_status(
        &state.pool,
        export_id,
        assembly::EXPORT_STATUS_ID_TRANSCODING,
        None,
    )
    .await?;

    let temp_dir = storage_root.join(format!("deliveries/temp/{export_id}"));

    if is_passthrough {
        log_step(
            state,
            export_id,
            project_id,
            "info",
            "Passthrough profile — skipping transcoding",
        )
        .await;
    } else {
        log_step(
            state,
            export_id,
            project_id,
            "info",
            "Transcoding videos to target format",
        )
        .await;

        let transcode_params = TranscodeProfileParams {
            resolution: profile.resolution.clone(),
            codec: profile.codec.clone(),
            container: profile.container.clone(),
            bitrate_kbps: profile.bitrate_kbps,
            framerate: profile.framerate.map(|f| f as f32),
            pixel_format: profile.pixel_format.clone(),
            extra_ffmpeg_args: profile.extra_ffmpeg_args.clone(),
        };

        for bundle in &mut bundles {
            check_cancelled(cancel)?;

            for video in &mut bundle.videos {
                let probe = ffmpeg::probe_video(&video.path).await?;
                if ffmpeg::needs_transcode(&probe, &transcode_params) {
                    let output_path = temp_dir
                        .join(&bundle.avatar_slug)
                        .join(&video.resolved_name);
                    log_step(
                        state,
                        export_id,
                        project_id,
                        "info",
                        &format!("Transcoding {}/{}", bundle.avatar_name, video.resolved_name),
                    )
                    .await;
                    ffmpeg::transcode_to_profile(&video.path, &output_path, &transcode_params)
                        .await?;
                    video.path = output_path;
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Phase 3: Packaging — build per-avatar RAR archives
    //
    // Structure inside each RAR is FLAT unless delivery_folder naming rule
    // defines subdirectories (e.g. "videos/"). Files are named per naming rules.
    // -----------------------------------------------------------------------
    DeliveryExportRepo::update_status(
        &state.pool,
        export_id,
        assembly::EXPORT_STATUS_ID_PACKAGING,
        None,
    )
    .await?;
    log_step(
        state,
        export_id,
        project_id,
        "info",
        "Packaging delivery archives",
    )
    .await;

    let delivery_dir = storage_root.join(format!("deliveries/{export_id}"));
    tokio::fs::create_dir_all(&delivery_dir).await?;

    // Resolve metadata filename from naming rules.
    let metadata_name = {
        let ctx = NamingContext::default();
        naming_engine::resolve_template(&metadata_template, &ctx)
            .map(|r| r.filename)
            .unwrap_or_else(|_| "metadata.json".into())
    };

    let mut rar_paths: Vec<PathBuf> = Vec::new();

    for bundle in &bundles {
        check_cancelled(cancel)?;

        // Build a staging directory with the content to archive.
        let staging_dir = delivery_dir.join(format!("{}_staging", &bundle.avatar_slug));
        tokio::fs::create_dir_all(&staging_dir).await?;

        // Copy videos and images — flat unless folder_prefix adds structure.
        for asset in bundle.videos.iter().chain(bundle.images.iter()) {
            let dest = if bundle.folder_prefix.is_empty() {
                staging_dir.join(&asset.resolved_name)
            } else {
                let nested = staging_dir.join(&bundle.folder_prefix);
                tokio::fs::create_dir_all(&nested).await?;
                nested.join(&asset.resolved_name)
            };

            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::copy(&asset.path, &dest).await?;
        }

        // Write metadata.
        if let Some(ref meta) = bundle.metadata_json {
            let meta_dest = if bundle.folder_prefix.is_empty() {
                staging_dir.join(&metadata_name)
            } else {
                let nested = staging_dir.join(&bundle.folder_prefix);
                tokio::fs::create_dir_all(&nested).await?;
                nested.join(&metadata_name)
            };
            let json = serde_json::to_string_pretty(meta)?;
            tokio::fs::write(&meta_dest, json).await?;
        }

        // Resolve archive name from naming rules (delivery_archive category).
        let archive_name = format!("{}.rar", &bundle.avatar_slug);
        let rar_path = delivery_dir.join(&archive_name);

        create_rar(&staging_dir, &rar_path).await?;
        rar_paths.push(rar_path);

        log_step(
            state,
            export_id,
            project_id,
            "info",
            &format!("Created archive: {archive_name}"),
        )
        .await;

        // Clean up staging directory.
        let _ = tokio::fs::remove_dir_all(&staging_dir).await;
    }

    // -----------------------------------------------------------------------
    // Phase 4: Validating
    // -----------------------------------------------------------------------
    DeliveryExportRepo::update_status(
        &state.pool,
        export_id,
        assembly::EXPORT_STATUS_ID_VALIDATING,
        None,
    )
    .await?;
    log_step(
        state,
        export_id,
        project_id,
        "info",
        "Validating delivery archives",
    )
    .await;

    let mut total_size: u64 = 0;
    for rar_path in &rar_paths {
        let meta = tokio::fs::metadata(rar_path).await?;
        if meta.len() == 0 {
            let name = rar_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            return Err(PipelineError::msg(format!("Archive {name} is empty")));
        }
        total_size += meta.len();
    }

    // -----------------------------------------------------------------------
    // Phase 5: Completed
    // -----------------------------------------------------------------------
    let relative_path = format!("deliveries/{export_id}");
    let file_size = total_size as i64;

    DeliveryExportRepo::mark_completed(&state.pool, export_id, &relative_path, file_size).await?;

    let size_mb = file_size as f64 / (1024.0 * 1024.0);
    let done_msg = format!(
        "Delivery export #{export_id} completed — {} archive{}, {:.1} MB total, {} models: {}",
        rar_paths.len(),
        if rar_paths.len() != 1 { "s" } else { "" },
        size_mb,
        model_names.len(),
        model_names.join(", "),
    );
    log_step(state, export_id, project_id, "info", &done_msg).await;

    // Clean up temp transcode directory.
    if temp_dir.exists() {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// RAR creation
// ---------------------------------------------------------------------------

/// Create a RAR archive from a directory using the `rar` command.
async fn create_rar(source_dir: &Path, rar_path: &Path) -> Result<(), PipelineError> {
    let output = tokio::process::Command::new("rar")
        .args(["a", "-r", "-ep1"])
        .arg(rar_path)
        .arg(source_dir.join("*"))
        .current_dir(source_dir)
        .output()
        .await
        .map_err(|e| {
            PipelineError::msg(format!(
                "Failed to run `rar` command (is it installed?): {e}"
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PipelineError::msg(format!("rar command failed: {stderr}")));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn storage_root() -> PathBuf {
    PathBuf::from(std::env::var("STORAGE_ROOT").unwrap_or_else(|_| "./storage".into()))
}

fn check_cancelled(cancel: &CancellationToken) -> Result<(), PipelineError> {
    if cancel.is_cancelled() {
        Err(PipelineError::msg(
            "Server shutting down — export cancelled",
        ))
    } else {
        Ok(())
    }
}

/// Load the active naming rule template for a category, with optional project override.
async fn load_rule_template(
    pool: &sqlx::PgPool,
    category_name: &str,
    project_id: DbId,
) -> Option<String> {
    // Try project-specific rule first, then global.
    if let Ok(Some(rule)) =
        NamingRuleRepo::find_active_rule(pool, category_name, Some(project_id)).await
    {
        return Some(rule.template);
    }
    if let Ok(Some(rule)) = NamingRuleRepo::find_active_rule(pool, category_name, None).await {
        return Some(rule.template);
    }
    None
}

/// Dual-log: write to delivery_logs table + broadcast to activity console.
async fn log_step(state: &AppState, export_id: DbId, project_id: DbId, level: &str, message: &str) {
    let _ = ProjectDeliveryLogRepo::create(
        &state.pool,
        &CreateDeliveryLog {
            delivery_export_id: Some(export_id),
            project_id,
            log_level: level.to_string(),
            message: message.to_string(),
            details: None,
        },
    )
    .await;

    let log_level = match level {
        "error" => ActivityLogLevel::Error,
        "warning" => ActivityLogLevel::Warn,
        _ => ActivityLogLevel::Info,
    };
    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(log_level, ActivityLogSource::Pipeline, message)
            .with_project(project_id)
            .with_entity("delivery_export", export_id),
    );
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug)]
enum PipelineError {
    Db(sqlx::Error),
    Ffmpeg(ffmpeg::FfmpegError),
    Io(std::io::Error),
    Json(serde_json::Error),
    Message(String),
}

impl PipelineError {
    fn msg(s: impl Into<String>) -> Self {
        Self::Message(s.into())
    }
}

impl std::fmt::Display for PipelineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Db(e) => write!(f, "Database error: {e}"),
            Self::Ffmpeg(e) => write!(f, "FFmpeg error: {e}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Json(e) => write!(f, "JSON error: {e}"),
            Self::Message(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for PipelineError {}

impl From<sqlx::Error> for PipelineError {
    fn from(e: sqlx::Error) -> Self {
        Self::Db(e)
    }
}
impl From<ffmpeg::FfmpegError> for PipelineError {
    fn from(e: ffmpeg::FfmpegError) -> Self {
        Self::Ffmpeg(e)
    }
}
impl From<std::io::Error> for PipelineError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
impl From<serde_json::Error> for PipelineError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}
