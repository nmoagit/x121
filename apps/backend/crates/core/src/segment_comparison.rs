//! Segment version comparison logic (PRD-101).
//!
//! Pure functions for comparing QA scores between two segment versions
//! and determining whether overall quality improved.

use serde_json::Value;

/// Maximum version count before the oldest should be considered for cleanup.
pub const MAX_VERSIONS_PER_SEGMENT: i32 = 20;

/// Compare two QA score JSON objects and return per-metric differences.
///
/// Both inputs are expected to be JSON objects with numeric values.
/// For each key present in either object, the difference is computed as
/// `new - old`. Positive values indicate improvement; negative indicate
/// degradation. Keys present in only one object are included with the
/// full value (positive for new-only, negative for old-only).
pub fn compute_score_diffs(old_scores: &Value, new_scores: &Value) -> Value {
    let empty = serde_json::Map::new();
    let old_map = old_scores.as_object().unwrap_or(&empty);
    let new_map = new_scores.as_object().unwrap_or(&empty);

    let mut diffs = serde_json::Map::new();

    // Process all keys from old scores.
    for (key, old_val) in old_map {
        let old_num = old_val.as_f64().unwrap_or(0.0);
        let new_num = new_map.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0);
        diffs.insert(key.clone(), Value::from(new_num - old_num));
    }

    // Process keys that exist only in new scores.
    for (key, new_val) in new_map {
        if !old_map.contains_key(key) {
            let new_num = new_val.as_f64().unwrap_or(0.0);
            diffs.insert(key.clone(), Value::from(new_num));
        }
    }

    Value::Object(diffs)
}

/// Compute the average of all numeric values in a JSON score-diffs object.
///
/// Returns `None` if the input is not an object, is empty, or contains no
/// numeric values.  Used by [`overall_quality_improved`] and
/// [`regression::classify_from_diffs`](crate::regression::classify_from_diffs).
pub fn average_score_diffs(score_diffs: &Value) -> Option<f64> {
    let map = match score_diffs.as_object() {
        Some(m) if !m.is_empty() => m,
        _ => return None,
    };

    let (sum, count) = map.values().fold((0.0_f64, 0_usize), |(s, c), v| {
        if let Some(n) = v.as_f64() {
            (s + n, c + 1)
        } else {
            (s, c)
        }
    });

    if count == 0 {
        return None;
    }

    Some(sum / count as f64)
}

/// Determine if overall quality improved based on score diffs.
///
/// Computes the average of all numeric diff values and returns `true`
/// if the average is strictly positive. Returns `false` for empty diffs
/// or when the average is zero or negative.
pub fn overall_quality_improved(score_diffs: &Value) -> bool {
    average_score_diffs(score_diffs).map_or(false, |avg| avg > 0.0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- compute_score_diffs -------------------------------------------------

    #[test]
    fn diffs_with_matching_keys() {
        let old = json!({"sharpness": 0.8, "color_accuracy": 0.7});
        let new = json!({"sharpness": 0.9, "color_accuracy": 0.65});
        let diffs = compute_score_diffs(&old, &new);

        let map = diffs.as_object().unwrap();
        let sharpness = map["sharpness"].as_f64().unwrap();
        let color = map["color_accuracy"].as_f64().unwrap();

        assert!((sharpness - 0.1).abs() < 1e-10);
        assert!((color - (-0.05)).abs() < 1e-10);
    }

    #[test]
    fn diffs_with_extra_key_in_new() {
        let old = json!({"sharpness": 0.8});
        let new = json!({"sharpness": 0.9, "motion": 0.5});
        let diffs = compute_score_diffs(&old, &new);

        let map = diffs.as_object().unwrap();
        assert_eq!(map.len(), 2);
        assert!((map["motion"].as_f64().unwrap() - 0.5).abs() < 1e-10);
    }

    #[test]
    fn diffs_with_extra_key_in_old() {
        let old = json!({"sharpness": 0.8, "contrast": 0.6});
        let new = json!({"sharpness": 0.9});
        let diffs = compute_score_diffs(&old, &new);

        let map = diffs.as_object().unwrap();
        assert_eq!(map.len(), 2);
        // old had contrast=0.6, new has 0.0 => diff = -0.6
        assert!((map["contrast"].as_f64().unwrap() - (-0.6)).abs() < 1e-10);
    }

    #[test]
    fn diffs_with_empty_objects() {
        let diffs = compute_score_diffs(&json!({}), &json!({}));
        assert_eq!(diffs.as_object().unwrap().len(), 0);
    }

    #[test]
    fn diffs_with_non_object_inputs() {
        // Non-object values should be treated as empty.
        let diffs = compute_score_diffs(&json!(42), &json!("hello"));
        assert_eq!(diffs.as_object().unwrap().len(), 0);
    }

    #[test]
    fn diffs_with_null_inputs() {
        let diffs = compute_score_diffs(&Value::Null, &Value::Null);
        assert_eq!(diffs.as_object().unwrap().len(), 0);
    }

    // -- overall_quality_improved --------------------------------------------

    #[test]
    fn improved_when_average_positive() {
        let diffs = json!({"sharpness": 0.1, "color": -0.02});
        assert!(overall_quality_improved(&diffs));
    }

    #[test]
    fn not_improved_when_average_negative() {
        let diffs = json!({"sharpness": -0.1, "color": -0.05});
        assert!(!overall_quality_improved(&diffs));
    }

    #[test]
    fn not_improved_when_average_zero() {
        let diffs = json!({"sharpness": 0.1, "color": -0.1});
        assert!(!overall_quality_improved(&diffs));
    }

    #[test]
    fn not_improved_with_empty_diffs() {
        assert!(!overall_quality_improved(&json!({})));
    }

    #[test]
    fn not_improved_with_non_object() {
        assert!(!overall_quality_improved(&json!(42)));
    }

    #[test]
    fn not_improved_with_null() {
        assert!(!overall_quality_improved(&Value::Null));
    }
}
