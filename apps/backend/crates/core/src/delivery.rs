//! Delivery ZIP structure definition and validation.
//!
//! Represents the expected file structure in a project delivery ZIP:
//! ```text
//! project_name/
//!   character_name/
//!     metadata.json
//!     clothed.png
//!     topless.png
//!     dance.mp4
//!     topless_dance.mp4
//!     ...
//! ```

use serde::Serialize;

/// The top-level delivery manifest for a project.
#[derive(Debug, Clone, Serialize)]
pub struct DeliveryManifest {
    pub project_name: String,
    pub characters: Vec<CharacterDelivery>,
}

/// A character's delivery contents within the ZIP.
#[derive(Debug, Clone, Serialize)]
pub struct CharacterDelivery {
    pub character_name: String,
    /// Path to character metadata JSON file (relative to character dir).
    pub metadata_json: String,
    /// Path to clothed reference image.
    pub clothed_image: String,
    /// Path to topless reference image.
    pub topless_image: String,
    /// List of scene video filenames generated via `naming::scene_video_filename`.
    pub scene_videos: Vec<String>,
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

        if self.characters.is_empty() {
            errors.push("Manifest must include at least one character".to_string());
        }

        for character in &self.characters {
            let prefix = &character.character_name;

            if character.character_name.is_empty() {
                errors.push("Character name must not be empty".to_string());
                continue;
            }

            if character.metadata_json.is_empty() {
                errors.push(format!("{prefix}: metadata.json path is missing"));
            }

            if character.clothed_image.is_empty() {
                errors.push(format!("{prefix}: clothed image path is missing"));
            }

            if character.topless_image.is_empty() {
                errors.push(format!("{prefix}: topless image path is missing"));
            }

            if character.scene_videos.is_empty() {
                errors.push(format!("{prefix}: no scene videos"));
            }

            // Validate all video filenames end with .mp4
            for video in &character.scene_videos {
                if !video.ends_with(".mp4") {
                    errors.push(format!("{prefix}: video '{video}' does not end with .mp4"));
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
            characters: vec![CharacterDelivery {
                character_name: "Luna".to_string(),
                metadata_json: "metadata.json".to_string(),
                clothed_image: "clothed.png".to_string(),
                topless_image: "topless.png".to_string(),
                scene_videos: vec!["dance.mp4".to_string(), "topless_dance.mp4".to_string()],
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
        m.characters[0].metadata_json = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("metadata.json")));
    }

    #[test]
    fn missing_clothed_image() {
        let mut m = valid_manifest();
        m.characters[0].clothed_image = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("clothed image")));
    }

    #[test]
    fn missing_topless_image() {
        let mut m = valid_manifest();
        m.characters[0].topless_image = String::new();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("topless image")));
    }

    #[test]
    fn no_scene_videos() {
        let mut m = valid_manifest();
        m.characters[0].scene_videos.clear();
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("no scene videos")));
    }

    #[test]
    fn invalid_video_extension() {
        let mut m = valid_manifest();
        m.characters[0].scene_videos.push("dance.avi".to_string());
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains(".mp4")));
    }

    #[test]
    fn no_characters() {
        let m = DeliveryManifest {
            project_name: "Empty".to_string(),
            characters: vec![],
        };
        let errors = m.validate();
        assert!(errors.iter().any(|e| e.contains("at least one character")));
    }
}
