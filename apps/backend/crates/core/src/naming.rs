//! Scene video naming convention engine.
//!
//! Generates deterministic filenames for scene video assets based on
//! variant, scene type, transition state, and optional index.

/// Generate a scene video filename from entity properties.
///
/// Convention: `{prefix_}{content}{_clothes_off}{_index}.mp4`
///
/// - `prefix_` = `"topless_"` for topless variant scenes, omitted for clothed
/// - `content` = lowercase snake_case scene type name
/// - `_clothes_off` = appended for transition scenes
/// - `_index` = `"_1"`, `"_2"`, etc. when multiple videos exist for same content
///
/// # Examples
///
/// ```
/// #[allow(deprecated)]
/// use x121_core::naming::scene_video_filename;
///
/// assert_eq!(scene_video_filename("clothed", "Dance", false, None), "dance.mp4");
/// assert_eq!(scene_video_filename("topless", "Dance", false, None), "topless_dance.mp4");
/// assert_eq!(scene_video_filename("clothed", "Dance", true, None), "dance_clothes_off.mp4");
/// assert_eq!(scene_video_filename("clothed", "Idle", false, Some(2)), "idle_2.mp4");
/// ```
#[deprecated(
    since = "0.2.0",
    note = "Use naming_engine::resolve_template (PRD-116). Will be removed in a future release."
)]
pub fn scene_video_filename(
    variant_label: &str,
    scene_type_name: &str,
    is_clothes_off: bool,
    index: Option<u32>,
) -> String {
    let mut name = String::new();

    // Prefix: "topless_" for topless variant
    if variant_label == "topless" {
        name.push_str("topless_");
    }

    // Content: lowercase snake_case scene type name
    name.push_str(&scene_type_name.to_lowercase().replace(' ', "_"));

    // Transition suffix
    if is_clothes_off {
        name.push_str("_clothes_off");
    }

    // Index suffix
    if let Some(idx) = index {
        name.push('_');
        name.push_str(&idx.to_string());
    }

    name.push_str(".mp4");
    name
}

/// Generate a video filename using pipeline-specific naming rules.
///
/// Replaces template placeholders in `rules.video_template`:
/// - `{prefix}` — track-specific prefix from `rules.prefix_rules`
/// - `{scene_type}` — lowercase snake_case scene type name
/// - `{transition}` — `rules.transition_suffix` for transition segments, empty otherwise
/// - `{index}` — `_N` suffix when an index is provided, empty otherwise
pub fn pipeline_video_filename(
    rules: &crate::pipeline::PipelineNamingRules,
    track_slug: &str,
    scene_type_name: &str,
    is_transition: bool,
    index: Option<u32>,
) -> String {
    let mut name = rules.video_template.clone();

    // Replace {prefix} with track-specific prefix from rules.
    let prefix = rules
        .prefix_rules
        .get(track_slug)
        .cloned()
        .unwrap_or_default();
    name = name.replace("{prefix}", &prefix);

    // Replace {scene_type}.
    name = name.replace(
        "{scene_type}",
        &scene_type_name.to_lowercase().replace(' ', "_"),
    );

    // Replace {transition}.
    let transition = if is_transition {
        &rules.transition_suffix
    } else {
        ""
    };
    name = name.replace("{transition}", transition);

    // Replace {index}.
    let index_str = match index {
        Some(i) => format!("_{i}"),
        None => String::new(),
    };
    name = name.replace("{index}", &index_str);

    name
}

#[cfg(test)]
#[allow(deprecated)]
mod tests {
    use super::*;

    #[test]
    fn clothed_simple() {
        assert_eq!(
            scene_video_filename("clothed", "Dance", false, None),
            "dance.mp4"
        );
    }

    #[test]
    fn topless_simple() {
        assert_eq!(
            scene_video_filename("topless", "Dance", false, None),
            "topless_dance.mp4"
        );
    }

    #[test]
    fn clothes_off_transition() {
        assert_eq!(
            scene_video_filename("clothed", "Dance", true, None),
            "dance_clothes_off.mp4"
        );
    }

    #[test]
    fn indexed() {
        assert_eq!(
            scene_video_filename("clothed", "Idle", false, Some(2)),
            "idle_2.mp4"
        );
    }

    #[test]
    fn topless_clothes_off_indexed() {
        assert_eq!(
            scene_video_filename("topless", "Slow Walk", true, Some(1)),
            "topless_slow_walk_clothes_off_1.mp4"
        );
    }

    #[test]
    fn multi_word_scene_type() {
        assert_eq!(
            scene_video_filename("clothed", "Hair Flip Idle", false, None),
            "hair_flip_idle.mp4"
        );
    }

    #[test]
    fn empty_scene_type() {
        assert_eq!(scene_video_filename("clothed", "", false, None), ".mp4");
    }

    #[test]
    fn special_characters_double_space() {
        // Multiple spaces produce multiple underscores (no collapsing)
        assert_eq!(
            scene_video_filename("clothed", "Slow  Walk", false, None),
            "slow__walk.mp4"
        );
    }

    #[test]
    fn index_zero() {
        assert_eq!(
            scene_video_filename("clothed", "Dance", false, Some(0)),
            "dance_0.mp4"
        );
    }

    mod pipeline_naming {
        use super::*;
        use crate::pipeline::PipelineNamingRules;
        use std::collections::HashMap;

        fn make_rules(template: &str, prefix_rules: &[(&str, &str)], transition: &str) -> PipelineNamingRules {
            PipelineNamingRules {
                video_template: template.to_string(),
                prefix_rules: prefix_rules
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect(),
                transition_suffix: transition.to_string(),
            }
        }

        #[test]
        fn basic_template_substitution() {
            let rules = make_rules(
                "{prefix}{scene_type}{transition}{index}.mp4",
                &[("topless", "topless_")],
                "_clothes_off",
            );
            assert_eq!(
                pipeline_video_filename(&rules, "topless", "Dance", false, None),
                "topless_dance.mp4"
            );
        }

        #[test]
        fn transition_suffix_applied() {
            let rules = make_rules(
                "{prefix}{scene_type}{transition}{index}.mp4",
                &[],
                "_clothes_off",
            );
            assert_eq!(
                pipeline_video_filename(&rules, "clothed", "Dance", true, None),
                "dance_clothes_off.mp4"
            );
        }

        #[test]
        fn index_suffix_applied() {
            let rules = make_rules(
                "{prefix}{scene_type}{transition}{index}.mp4",
                &[],
                "_clothes_off",
            );
            assert_eq!(
                pipeline_video_filename(&rules, "clothed", "Idle", false, Some(2)),
                "idle_2.mp4"
            );
        }

        #[test]
        fn unknown_track_produces_empty_prefix() {
            let rules = make_rules(
                "{prefix}{scene_type}.mp4",
                &[("topless", "topless_")],
                "",
            );
            assert_eq!(
                pipeline_video_filename(&rules, "unknown_track", "Dance", false, None),
                "dance.mp4"
            );
        }

        #[test]
        fn multi_word_scene_type_lowercased() {
            let rules = make_rules("{scene_type}.mp4", &[], "");
            assert_eq!(
                pipeline_video_filename(&rules, "clothed", "Hair Flip Idle", false, None),
                "hair_flip_idle.mp4"
            );
        }
    }
}
