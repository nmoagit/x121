//! Hierarchical video settings resolution (duration, fps, resolution).
//!
//! Settings cascade through four levels, from least to most specific:
//! 1. **System defaults** -- hardcoded fallbacks
//! 2. **Scene type** -- `scene_types.target_duration_secs`, `target_fps`, `target_resolution`
//! 3. **Project** -- `project_video_settings`
//! 4. **Group** -- `group_video_settings`
//! 5. **Character** -- `character_video_settings`
//!
//! The most specific non-None value wins for each individual setting.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default resolution when no override is set.
pub const DEFAULT_RESOLUTION: &str = "720p";

/// Default frames per second when no override is set.
pub const DEFAULT_FPS: i32 = 30;

/// Default video duration in seconds for non-idle scenes.
pub const DEFAULT_DURATION_SECS: i32 = 16;

/// Default video duration in seconds for idle scenes.
pub const IDLE_DURATION_SECS: i32 = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A layer of video settings from one level in the hierarchy.
///
/// All fields are optional; only non-None values participate in resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSettingsLayer {
    pub target_duration_secs: Option<i32>,
    pub target_fps: Option<i32>,
    pub target_resolution: Option<String>,
}

/// Which level in the hierarchy provided a particular setting value.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VideoSettingSource {
    /// Hardcoded system default.
    SystemDefault,
    /// Set on the scene type itself.
    SceneType,
    /// Overridden at the project level.
    Project,
    /// Overridden at the group level.
    Group,
    /// Overridden at the character level.
    Character,
}

/// Fully resolved video settings with provenance tracking for each field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedVideoSettings {
    pub duration_secs: i32,
    pub duration_source: VideoSettingSource,
    pub fps: i32,
    pub fps_source: VideoSettingSource,
    pub resolution: String,
    pub resolution_source: VideoSettingSource,
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/// Convert a resolution label (e.g. "720p") to pixel dimensions (width, height).
///
/// Returns (1280, 720) for unrecognised labels.
pub fn resolution_dimensions(resolution: &str) -> (u32, u32) {
    match resolution {
        "480p" => (854, 480),
        "720p" => (1280, 720),
        "1080p" => (1920, 1080),
        "4k" | "2160p" => (3840, 2160),
        _ => (1280, 720),
    }
}

/// Resolve video settings through the 4-level hierarchy.
///
/// For each setting (duration, fps, resolution), the most specific non-None
/// value wins. If nothing in the hierarchy provides a value, the system
/// default is used.
///
/// # Arguments
///
/// * `scene_type` -- settings from the scene type row (always present).
/// * `project` -- optional project-level overrides.
/// * `group` -- optional group-level overrides.
/// * `character` -- optional character-level overrides.
/// * `is_idle` -- if true, the system default duration is [`IDLE_DURATION_SECS`].
pub fn resolve_video_settings(
    scene_type: &VideoSettingsLayer,
    project: Option<&VideoSettingsLayer>,
    group: Option<&VideoSettingsLayer>,
    character: Option<&VideoSettingsLayer>,
    is_idle: bool,
) -> ResolvedVideoSettings {
    let default_duration = if is_idle {
        IDLE_DURATION_SECS
    } else {
        DEFAULT_DURATION_SECS
    };

    let mut duration_secs = default_duration;
    let mut duration_source = VideoSettingSource::SystemDefault;
    let mut fps = DEFAULT_FPS;
    let mut fps_source = VideoSettingSource::SystemDefault;
    let mut resolution = DEFAULT_RESOLUTION.to_string();
    let mut resolution_source = VideoSettingSource::SystemDefault;

    // Layers from least specific to most specific.
    let layers: &[(Option<&VideoSettingsLayer>, VideoSettingSource)] = &[
        (Some(scene_type), VideoSettingSource::SceneType),
        (project, VideoSettingSource::Project),
        (group, VideoSettingSource::Group),
        (character, VideoSettingSource::Character),
    ];

    for &(layer_opt, source) in layers {
        if let Some(layer) = layer_opt {
            if let Some(d) = layer.target_duration_secs {
                duration_secs = d;
                duration_source = source;
            }
            if let Some(f) = layer.target_fps {
                fps = f;
                fps_source = source;
            }
            if let Some(ref r) = layer.target_resolution {
                resolution = r.clone();
                resolution_source = source;
            }
        }
    }

    ResolvedVideoSettings {
        duration_secs,
        duration_source,
        fps,
        fps_source,
        resolution,
        resolution_source,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_layer() -> VideoSettingsLayer {
        VideoSettingsLayer {
            target_duration_secs: None,
            target_fps: None,
            target_resolution: None,
        }
    }

    #[test]
    fn test_system_defaults_when_all_none() {
        let scene_type = empty_layer();
        let result = resolve_video_settings(&scene_type, None, None, None, false);

        assert_eq!(result.duration_secs, DEFAULT_DURATION_SECS);
        assert_eq!(result.duration_source, VideoSettingSource::SystemDefault);
        assert_eq!(result.fps, DEFAULT_FPS);
        assert_eq!(result.fps_source, VideoSettingSource::SystemDefault);
        assert_eq!(result.resolution, DEFAULT_RESOLUTION);
        assert_eq!(result.resolution_source, VideoSettingSource::SystemDefault);
    }

    #[test]
    fn test_idle_default_duration() {
        let scene_type = empty_layer();
        let result = resolve_video_settings(&scene_type, None, None, None, true);

        assert_eq!(result.duration_secs, IDLE_DURATION_SECS);
        assert_eq!(result.duration_source, VideoSettingSource::SystemDefault);
    }

    #[test]
    fn test_scene_type_overrides_defaults() {
        let scene_type = VideoSettingsLayer {
            target_duration_secs: Some(20),
            target_fps: Some(24),
            target_resolution: Some("1080p".to_string()),
        };
        let result = resolve_video_settings(&scene_type, None, None, None, false);

        assert_eq!(result.duration_secs, 20);
        assert_eq!(result.duration_source, VideoSettingSource::SceneType);
        assert_eq!(result.fps, 24);
        assert_eq!(result.fps_source, VideoSettingSource::SceneType);
        assert_eq!(result.resolution, "1080p");
        assert_eq!(result.resolution_source, VideoSettingSource::SceneType);
    }

    #[test]
    fn test_project_overrides_scene_type() {
        let scene_type = VideoSettingsLayer {
            target_duration_secs: Some(16),
            target_fps: Some(30),
            target_resolution: Some("720p".to_string()),
        };
        let project = VideoSettingsLayer {
            target_duration_secs: Some(24),
            target_fps: None, // Does not override
            target_resolution: Some("1080p".to_string()),
        };
        let result = resolve_video_settings(&scene_type, Some(&project), None, None, false);

        assert_eq!(result.duration_secs, 24);
        assert_eq!(result.duration_source, VideoSettingSource::Project);
        assert_eq!(result.fps, 30);
        assert_eq!(result.fps_source, VideoSettingSource::SceneType);
        assert_eq!(result.resolution, "1080p");
        assert_eq!(result.resolution_source, VideoSettingSource::Project);
    }

    #[test]
    fn test_character_overrides_everything() {
        let scene_type = VideoSettingsLayer {
            target_duration_secs: Some(16),
            target_fps: Some(30),
            target_resolution: Some("720p".to_string()),
        };
        let project = VideoSettingsLayer {
            target_duration_secs: Some(24),
            target_fps: Some(24),
            target_resolution: Some("1080p".to_string()),
        };
        let group = VideoSettingsLayer {
            target_duration_secs: Some(20),
            target_fps: None,
            target_resolution: None,
        };
        let character = VideoSettingsLayer {
            target_duration_secs: None, // Inherits from group
            target_fps: Some(60),
            target_resolution: Some("4k".to_string()),
        };
        let result = resolve_video_settings(
            &scene_type,
            Some(&project),
            Some(&group),
            Some(&character),
            false,
        );

        assert_eq!(result.duration_secs, 20);
        assert_eq!(result.duration_source, VideoSettingSource::Group);
        assert_eq!(result.fps, 60);
        assert_eq!(result.fps_source, VideoSettingSource::Character);
        assert_eq!(result.resolution, "4k");
        assert_eq!(result.resolution_source, VideoSettingSource::Character);
    }

    #[test]
    fn test_partial_overrides_at_each_level() {
        let scene_type = VideoSettingsLayer {
            target_duration_secs: Some(16),
            target_fps: None,
            target_resolution: None,
        };
        let group = VideoSettingsLayer {
            target_duration_secs: None,
            target_fps: Some(24),
            target_resolution: None,
        };
        let character = VideoSettingsLayer {
            target_duration_secs: None,
            target_fps: None,
            target_resolution: Some("1080p".to_string()),
        };
        let result =
            resolve_video_settings(&scene_type, None, Some(&group), Some(&character), false);

        assert_eq!(result.duration_secs, 16);
        assert_eq!(result.duration_source, VideoSettingSource::SceneType);
        assert_eq!(result.fps, 24);
        assert_eq!(result.fps_source, VideoSettingSource::Group);
        assert_eq!(result.resolution, "1080p");
        assert_eq!(result.resolution_source, VideoSettingSource::Character);
    }

    #[test]
    fn test_resolution_dimensions() {
        assert_eq!(resolution_dimensions("480p"), (854, 480));
        assert_eq!(resolution_dimensions("720p"), (1280, 720));
        assert_eq!(resolution_dimensions("1080p"), (1920, 1080));
        assert_eq!(resolution_dimensions("4k"), (3840, 2160));
        assert_eq!(resolution_dimensions("2160p"), (3840, 2160));
        assert_eq!(resolution_dimensions("unknown"), (1280, 720));
    }
}
