//! Command palette constants and validation (PRD-31).
//!
//! Provides constants, entity type validation, frecency scoring, and limit
//! clamping used by the API and repository layers for the Cmd+K palette.

use chrono::{DateTime, Utc};

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of recent items stored per user.
pub const MAX_RECENT_ITEMS: i32 = 50;

/// Default number of recent items returned when no limit is specified.
pub const DEFAULT_RECENT_LIMIT: i32 = 10;

/// Frecency weight for items accessed within the last hour.
pub const FRECENCY_HOUR_WEIGHT: f64 = 10.0;

/// Frecency weight for items accessed within the last 24 hours.
pub const FRECENCY_DAY_WEIGHT: f64 = 5.0;

/// Frecency weight for items accessed within the last week.
pub const FRECENCY_WEEK_WEIGHT: f64 = 2.0;

/// Frecency weight for items accessed more than a week ago.
pub const FRECENCY_OLD_WEIGHT: f64 = 1.0;

/// Valid entity types that can appear in the command palette.
pub const VALID_PALETTE_ENTITY_TYPES: &[&str] = &[
    "project",
    "character",
    "scene",
    "segment",
    "scene_type",
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate that `entity_type` is one of the allowed palette entity types.
pub fn validate_entity_type(entity_type: &str) -> Result<(), CoreError> {
    if VALID_PALETTE_ENTITY_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid entity type '{entity_type}'. Must be one of: {VALID_PALETTE_ENTITY_TYPES:?}"
        )))
    }
}

/// Clamp a requested limit to the range `1..=MAX_RECENT_ITEMS`.
///
/// Returns `DEFAULT_RECENT_LIMIT` for values less than 1 and caps at
/// `MAX_RECENT_ITEMS`.
pub fn validate_recent_limit(limit: i32) -> i32 {
    if limit < 1 {
        DEFAULT_RECENT_LIMIT
    } else if limit > MAX_RECENT_ITEMS {
        MAX_RECENT_ITEMS
    } else {
        limit
    }
}

// ---------------------------------------------------------------------------
// Frecency scoring
// ---------------------------------------------------------------------------

/// Calculate a frecency score combining recency and frequency.
///
/// The score is `recency_weight * log2(access_count + 1)`:
///
/// - **Recency weight**: 10 if < 1 hour, 5 if < 24 hours, 2 if < 1 week,
///   1 otherwise.
/// - **Frequency factor**: `log2(access_count + 1)` so higher access counts
///   contribute logarithmically.
pub fn calculate_frecency_score(access_count: i32, last_accessed: DateTime<Utc>) -> f64 {
    let recency = get_recency_weight(last_accessed);
    let frequency = ((access_count as f64) + 1.0).log2();
    recency * frequency
}

/// Return the recency weight based on how long ago `last_accessed` was.
fn get_recency_weight(last_accessed: DateTime<Utc>) -> f64 {
    let elapsed = Utc::now() - last_accessed;
    let hours = elapsed.num_hours();

    if hours < 1 {
        FRECENCY_HOUR_WEIGHT
    } else if hours < 24 {
        FRECENCY_DAY_WEIGHT
    } else if hours < 168 {
        // 7 days * 24 hours
        FRECENCY_WEEK_WEIGHT
    } else {
        FRECENCY_OLD_WEIGHT
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    // -- Entity type validation --

    #[test]
    fn valid_entity_types_pass() {
        for entity_type in VALID_PALETTE_ENTITY_TYPES {
            assert!(
                validate_entity_type(entity_type).is_ok(),
                "Entity type '{entity_type}' should be valid"
            );
        }
    }

    #[test]
    fn invalid_entity_type_fails() {
        assert!(validate_entity_type("unknown").is_err());
        assert!(validate_entity_type("").is_err());
        assert!(validate_entity_type("workflow").is_err());
    }

    // -- Recent limit validation --

    #[test]
    fn zero_limit_returns_default() {
        assert_eq!(validate_recent_limit(0), DEFAULT_RECENT_LIMIT);
    }

    #[test]
    fn negative_limit_returns_default() {
        assert_eq!(validate_recent_limit(-5), DEFAULT_RECENT_LIMIT);
    }

    #[test]
    fn limit_within_range_passes_through() {
        assert_eq!(validate_recent_limit(1), 1);
        assert_eq!(validate_recent_limit(25), 25);
        assert_eq!(validate_recent_limit(MAX_RECENT_ITEMS), MAX_RECENT_ITEMS);
    }

    #[test]
    fn limit_exceeding_max_is_capped() {
        assert_eq!(validate_recent_limit(100), MAX_RECENT_ITEMS);
        assert_eq!(validate_recent_limit(999), MAX_RECENT_ITEMS);
    }

    // -- Frecency scoring --

    #[test]
    fn recent_items_score_higher_than_old() {
        let now = Utc::now();
        let recent = calculate_frecency_score(1, now);
        let old = calculate_frecency_score(1, now - Duration::days(30));
        assert!(recent > old, "Recent item ({recent}) should score higher than old item ({old})");
    }

    #[test]
    fn frequent_items_score_higher_than_rare() {
        let now = Utc::now();
        let frequent = calculate_frecency_score(50, now);
        let rare = calculate_frecency_score(1, now);
        assert!(frequent > rare, "Frequent item ({frequent}) should score higher than rare item ({rare})");
    }

    #[test]
    fn zero_access_count_produces_zero_score() {
        // log2(0 + 1) = log2(1) = 0, so frequency factor is 0.
        // In practice the DB default is access_count=1 so this won't occur.
        let now = Utc::now();
        let score = calculate_frecency_score(0, now);
        assert!(
            (score - 0.0).abs() < f64::EPSILON,
            "Score should be zero for zero access count, got {score}"
        );
    }

    #[test]
    fn single_access_count_produces_positive_score() {
        let now = Utc::now();
        let score = calculate_frecency_score(1, now);
        assert!(score > 0.0, "Score should be positive for access_count=1, got {score}");
    }

    #[test]
    fn recency_weight_buckets() {
        let now = Utc::now();

        // Within last hour
        let score_hour = calculate_frecency_score(1, now);
        // Within last day
        let score_day = calculate_frecency_score(1, now - Duration::hours(2));
        // Within last week
        let score_week = calculate_frecency_score(1, now - Duration::days(3));
        // Older than a week
        let score_old = calculate_frecency_score(1, now - Duration::days(14));

        assert!(score_hour > score_day, "Hour bucket should beat day bucket");
        assert!(score_day > score_week, "Day bucket should beat week bucket");
        assert!(score_week > score_old, "Week bucket should beat old bucket");
    }

    #[test]
    fn combined_frecency_ranking() {
        let now = Utc::now();
        // Item A: accessed 2 times, 30 minutes ago (very recent, moderate frequency)
        let score_a = calculate_frecency_score(2, now - Duration::minutes(30));
        // Item B: accessed 10 times, 2 days ago (old-ish, high frequency)
        let score_b = calculate_frecency_score(10, now - Duration::days(2));
        // Both should be positive
        assert!(score_a > 0.0);
        assert!(score_b > 0.0);
        // Recent + moderate freq should beat old + high freq due to recency weight
        assert!(
            score_a > score_b,
            "Recent item (score={score_a}) should beat older frequent item (score={score_b})"
        );
    }
}
