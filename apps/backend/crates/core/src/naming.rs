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
/// use trulience_core::naming::scene_video_filename;
///
/// assert_eq!(scene_video_filename("clothed", "Dance", false, None), "dance.mp4");
/// assert_eq!(scene_video_filename("topless", "Dance", false, None), "topless_dance.mp4");
/// assert_eq!(scene_video_filename("clothed", "Dance", true, None), "dance_clothes_off.mp4");
/// assert_eq!(scene_video_filename("clothed", "Idle", false, Some(2)), "idle_2.mp4");
/// ```
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

#[cfg(test)]
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
}
