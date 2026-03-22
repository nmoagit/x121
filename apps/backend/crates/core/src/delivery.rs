//! Delivery ZIP structure definition and validation.
//!
//! Represents the expected file structure in a project delivery ZIP:
//! ```text
//! project_name/
//!   avatar_name/
//!     metadata.json
//!     clothed.png
//!     topless.png
//!     scene_video_1.mp4   (resolved via SceneVideoEntry)
//!     scene_video_2.mp4
//!     ...
//! ```

use serde::Serialize;

use crate::types::DbId;

/// The top-level delivery manifest for a project.
#[derive(Debug, Clone, Serialize)]
pub struct DeliveryManifest {
    pub project_name: String,
    pub avatars: Vec<AvatarDelivery>,
}

/// A resolved scene video entry for delivery, referencing the final version.
#[derive(Debug, Clone, Serialize)]
pub struct SceneVideoEntry {
    pub scene_id: DbId,
    pub file_path: String,
    pub version_number: i32,
    pub source: String,
}

/// A avatar's delivery contents within the ZIP.
#[derive(Debug, Clone, Serialize)]
pub struct AvatarDelivery {
    pub avatar_name: String,
    /// Path to avatar metadata JSON file (relative to avatar dir).
    pub metadata_json: String,
    /// Path to clothed reference image.
    pub clothed_image: String,
    /// Path to topless reference image.
    pub topless_image: String,
    /// Resolved scene video entries with version information.
    pub scene_videos: Vec<SceneVideoEntry>,
}

impl DeliveryManifest {
    /// Validate that all expected files are present and the manifest is well-formed.
    ///
    /// Returns an empty `Vec` if valid; otherwise returns a list of human-readable errors.
    pub fn validate(&self) -> Vec<String> {
        let mut errors = Vec::new();

        if self.project_name.is_empty() {
            errors.push("Project name must not be empty".to_string());
        }

        if self.avatars.is_empty() {
            errors.push("Manifest must include at least one avatar".to_string());
        }

        for avatar in &self.avatars {
            let prefix = &avatar.avatar_name;

            if avatar.avatar_name.is_empty() {
                errors.push("Avatar name must not be empty".to_string());
                continue;
            }

            if avatar.metadata_json.is_empty() {
                errors.push(format!("{prefix}: metadata.json path is missing"));
            }

            if avatar.clothed_image.is_empty() {
                errors.push(format!("{prefix}: clothed image path is missing"));
            }

            if avatar.topless_image.is_empty() {
                errors.push(format!("{prefix}: topless image path is missing"));
            }

            if avatar.scene_videos.is_empty() {
                errors.push(format!("{prefix}: no scene videos"));
            }

            for entry in &avatar.scene_videos {
                if entry.file_path.is_empty() {
                    errors.push(format!(
                        "{prefix}: scene video (scene_id={}) has an empty file path",
                        entry.scene_id
                    ));
                }
            }
        }

        errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> DeliveryManifest {
        DeliveryManifest {
            project_name: "Project Alpha".to_string(),
            avatars: vec![AvatarDelivery {
                avatar_name: "Luna".to_string(),
                metadata_json: "metadata.json".to_string(),
                clothed_image: "clothed.png".to_string(),
                topless_image: "topless.png".to_string(),
                scene_videos: vec![
                    SceneVideoEntry {
                        scene_id: 1,
                        file_path: "dance.mp4".to_string(),
                        version_number: 1,
                        source: "comfyui".to_string(),
                    },
                    SceneVideoEntry {
                        scene_id: 2,
                        file_path: "topless_dance.mp4".to_string(),
                        version_number: 1,
                        source: "comfyui".to_string(),
                    },
                ],
            }],
        }
    }

    #[test]
    fn valid_manifest_passes() {
        assert!(valid_manifest().validate().is_empty());
    }

    #[test]
    fn empty_project_name() {
        let mut m = valid_manifest();
        m.project_name = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("Project name")));
    }

    #[test]
    fn missing_metadata_json() {
        let mut m = valid_manifest();
        m.avatars[0].metadata_json = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("metadata.json")));
    }

    #[test]
    fn missing_clothed_image() {
        let mut m = valid_manifest();
        m.avatars[0].clothed_image = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("clothed image")));
    }

    #[test]
    fn missing_topless_image() {
        let mut m = valid_manifest();
        m.avatars[0].topless_image = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("topless image")));
    }

    #[test]
    fn no_scene_videos() {
        let mut m = valid_manifest();
        m.avatars[0].scene_videos.clear();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("no scene videos")));
    }

    #[test]
    fn empty_video_file_path() {
        let mut m = valid_manifest();
        m.avatars[0].scene_videos.push(SceneVideoEntry {
            scene_id: 99,
            file_path: String::new(),
            version_number: 1,
            source: "comfyui".to_string(),
        });
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("empty file path")));
    }

    #[test]
    fn no_avatars() {
        let m = DeliveryManifest {
            project_name: "Empty".to_string(),
            avatars: vec![],
        };
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("at least one avatar")));
    }
}
