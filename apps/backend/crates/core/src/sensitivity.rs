//! Content sensitivity types and validation logic (PRD-82).
//!
//! Provides blur-level ordering and enforcement of studio-wide minimum
//! sensitivity floors against user preferences.

/// Valid blur levels ordered from least to most restrictive.
pub const BLUR_LEVELS: &[&str] = &["full", "soft_blur", "heavy_blur", "placeholder"];

/// Returns the index of a blur level (0 = least restrictive).
///
/// Returns `None` if the level string is not recognised.
pub fn blur_level_index(level: &str) -> Option<usize> {
    BLUR_LEVELS.iter().position(|&l| l == level)
}

/// Enforce the studio-wide minimum sensitivity floor.
///
/// Returns the *more restrictive* of `user_level` and `admin_min`.
/// If either level is unrecognised it is treated as index 0 (`"full"`).
pub fn enforce_minimum_level(user_level: &str, admin_min: &str) -> String {
    let user_idx = blur_level_index(user_level).unwrap_or(0);
    let admin_idx = blur_level_index(admin_min).unwrap_or(0);
    if user_idx < admin_idx {
        admin_min.to_string()
    } else {
        user_level.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blur_level_index_returns_correct_positions() {
        assert_eq!(blur_level_index("full"), Some(0));
        assert_eq!(blur_level_index("soft_blur"), Some(1));
        assert_eq!(blur_level_index("heavy_blur"), Some(2));
        assert_eq!(blur_level_index("placeholder"), Some(3));
        assert_eq!(blur_level_index("unknown"), None);
    }

    #[test]
    fn enforce_minimum_level_user_above_admin() {
        // User wants heavy_blur (idx 2), admin min is soft_blur (idx 1) -> keep heavy_blur
        assert_eq!(
            enforce_minimum_level("heavy_blur", "soft_blur"),
            "heavy_blur"
        );
    }

    #[test]
    fn enforce_minimum_level_user_below_admin() {
        // User wants full (idx 0), admin min is soft_blur (idx 1) -> enforce soft_blur
        assert_eq!(enforce_minimum_level("full", "soft_blur"), "soft_blur");
    }

    #[test]
    fn enforce_minimum_level_equal() {
        assert_eq!(enforce_minimum_level("soft_blur", "soft_blur"), "soft_blur");
    }

    #[test]
    fn enforce_minimum_level_unknown_user_defaults_to_zero() {
        // Unknown user level treated as idx 0, admin min is soft_blur (idx 1) -> enforce soft_blur
        assert_eq!(enforce_minimum_level("invalid", "soft_blur"), "soft_blur");
    }

    #[test]
    fn enforce_minimum_level_unknown_admin_defaults_to_zero() {
        // Admin unknown treated as idx 0, user is heavy_blur (idx 2) -> keep heavy_blur
        assert_eq!(enforce_minimum_level("heavy_blur", "invalid"), "heavy_blur");
    }

    #[test]
    fn enforce_minimum_level_both_unknown() {
        // Both unknown -> both idx 0, user_idx (0) is not < admin_idx (0) -> return user_level
        assert_eq!(enforce_minimum_level("foo", "bar"), "foo");
    }
}
