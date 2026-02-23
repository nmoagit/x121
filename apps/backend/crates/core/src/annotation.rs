//! On-Frame Annotation & Markup constants and validation (PRD-70).
//!
//! Provides drawing tool types, validation helpers for frame annotations,
//! and summary utilities used by the API and pipeline layers.

use crate::error::CoreError;
use serde::Serialize;

// Re-export `validate_frame_number` from storyboard so callers that imported
// it from `annotation` keep working without a source-breaking change.
pub use crate::storyboard::validate_frame_number;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of annotation objects per frame.
pub const MAX_ANNOTATIONS_PER_FRAME: usize = 50;

/// Maximum stroke width in pixels.
pub const MAX_STROKE_WIDTH: f64 = 20.0;

/// Minimum stroke width in pixels.
pub const MIN_STROKE_WIDTH: f64 = 0.5;

/// Maximum text length for a text annotation.
pub const MAX_TEXT_LENGTH: usize = 500;

/// Maximum number of path points in a freehand pen stroke.
pub const MAX_PATH_POINTS: usize = 5000;

// ---------------------------------------------------------------------------
// Drawing tool types
// ---------------------------------------------------------------------------

/// Available drawing tools for on-frame annotation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DrawingToolType {
    Pen,
    Circle,
    Rectangle,
    Arrow,
    Highlight,
    Text,
}

/// All valid drawing tool type strings.
const VALID_TOOL_STRINGS: &[&str] = &[
    "pen", "circle", "rectangle", "arrow", "highlight", "text",
];

impl DrawingToolType {
    /// Return the tool type as a lowercase string slice.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pen => "pen",
            Self::Circle => "circle",
            Self::Rectangle => "rectangle",
            Self::Arrow => "arrow",
            Self::Highlight => "highlight",
            Self::Text => "text",
        }
    }

    /// Parse a tool type from a string slice.
    pub fn from_str(s: &str) -> Result<Self, CoreError> {
        match s {
            "pen" => Ok(Self::Pen),
            "circle" => Ok(Self::Circle),
            "rectangle" => Ok(Self::Rectangle),
            "arrow" => Ok(Self::Arrow),
            "highlight" => Ok(Self::Highlight),
            "text" => Ok(Self::Text),
            _ => Err(CoreError::Validation(format!(
                "Invalid drawing tool type '{s}'. Must be one of: {}",
                VALID_TOOL_STRINGS.join(", ")
            ))),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/// Validate that a stroke width is within the allowed range.
///
/// Must be between [`MIN_STROKE_WIDTH`] and [`MAX_STROKE_WIDTH`] inclusive.
pub fn validate_stroke_width(width: f64) -> Result<(), CoreError> {
    if width.is_nan() || width.is_infinite() {
        return Err(CoreError::Validation(
            "stroke width must be a finite number".to_string(),
        ));
    }
    if width < MIN_STROKE_WIDTH || width > MAX_STROKE_WIDTH {
        return Err(CoreError::Validation(format!(
            "stroke width must be between {MIN_STROKE_WIDTH} and {MAX_STROKE_WIDTH}, got {width}"
        )));
    }
    Ok(())
}

/// Validate the annotations JSON payload.
///
/// The JSON must be an array where each element has at least `"tool"` and
/// `"data"` keys, and the array length must not exceed
/// [`MAX_ANNOTATIONS_PER_FRAME`].
pub fn validate_annotations_json(json: &serde_json::Value) -> Result<(), CoreError> {
    let arr = json.as_array().ok_or_else(|| {
        CoreError::Validation("annotations_json must be a JSON array".to_string())
    })?;

    if arr.len() > MAX_ANNOTATIONS_PER_FRAME {
        return Err(CoreError::Validation(format!(
            "annotations_json has {} elements, maximum is {MAX_ANNOTATIONS_PER_FRAME}",
            arr.len()
        )));
    }

    for (i, item) in arr.iter().enumerate() {
        let obj = item.as_object().ok_or_else(|| {
            CoreError::Validation(format!(
                "annotations_json[{i}] must be a JSON object"
            ))
        })?;

        if !obj.contains_key("tool") {
            return Err(CoreError::Validation(format!(
                "annotations_json[{i}] is missing required key 'tool'"
            )));
        }

        if !obj.contains_key("data") {
            return Err(CoreError::Validation(format!(
                "annotations_json[{i}] is missing required key 'data'"
            )));
        }
    }

    Ok(())
}

/// Validate that a color string matches `#RRGGBB` or `#RRGGBBAA` hex format.
///
/// See also: `review::validate_tag_color` which only accepts `#RRGGBB`.
/// If a 3rd consumer appears, extract a shared `validate_hex_color` to
/// `core/src/color.rs` (DRY-310 watch item).
pub fn validate_color_hex(color: &str) -> Result<(), CoreError> {
    let valid_length = color.len() == 7 || color.len() == 9;

    if !valid_length {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must be in #RRGGBB or #RRGGBBAA hex format"
        )));
    }

    if !color.starts_with('#') {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must start with '#'"
        )));
    }

    let hex_part = &color[1..];
    if !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(CoreError::Validation(format!(
            "Invalid color '{color}'. Must contain only hex digits after '#'"
        )));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Summary types
// ---------------------------------------------------------------------------

/// Summary entry for a single frame annotation record.
#[derive(Debug, Clone, Serialize)]
pub struct AnnotationSummaryEntry {
    pub id: i64,
    pub frame_number: i32,
    pub tool_count: usize,
    pub user_id: i64,
    pub has_text: bool,
}

/// Summarize an annotations JSON array into an [`AnnotationSummaryEntry`].
///
/// Counts the total number of tool entries and checks whether any of them
/// use the `"text"` tool.
pub fn summarize_annotations(
    id: i64,
    frame_number: i32,
    user_id: i64,
    annotations_json: &serde_json::Value,
) -> AnnotationSummaryEntry {
    let (tool_count, has_text) = match annotations_json.as_array() {
        Some(arr) => {
            let count = arr.len();
            let text = arr.iter().any(|item| {
                item.get("tool")
                    .and_then(|v| v.as_str())
                    .is_some_and(|t| t == "text")
            });
            (count, text)
        }
        None => (0, false),
    };

    AnnotationSummaryEntry {
        id,
        frame_number,
        tool_count,
        user_id,
        has_text,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- DrawingToolType::as_str / from_str --------------------------------

    #[test]
    fn tool_type_pen_round_trip() {
        assert_eq!(DrawingToolType::Pen.as_str(), "pen");
        assert_eq!(DrawingToolType::from_str("pen").unwrap(), DrawingToolType::Pen);
    }

    #[test]
    fn tool_type_circle_round_trip() {
        assert_eq!(DrawingToolType::Circle.as_str(), "circle");
        assert_eq!(DrawingToolType::from_str("circle").unwrap(), DrawingToolType::Circle);
    }

    #[test]
    fn tool_type_rectangle_round_trip() {
        assert_eq!(DrawingToolType::Rectangle.as_str(), "rectangle");
        assert_eq!(DrawingToolType::from_str("rectangle").unwrap(), DrawingToolType::Rectangle);
    }

    #[test]
    fn tool_type_arrow_round_trip() {
        assert_eq!(DrawingToolType::Arrow.as_str(), "arrow");
        assert_eq!(DrawingToolType::from_str("arrow").unwrap(), DrawingToolType::Arrow);
    }

    #[test]
    fn tool_type_highlight_round_trip() {
        assert_eq!(DrawingToolType::Highlight.as_str(), "highlight");
        assert_eq!(DrawingToolType::from_str("highlight").unwrap(), DrawingToolType::Highlight);
    }

    #[test]
    fn tool_type_text_round_trip() {
        assert_eq!(DrawingToolType::Text.as_str(), "text");
        assert_eq!(DrawingToolType::from_str("text").unwrap(), DrawingToolType::Text);
    }

    #[test]
    fn tool_type_invalid_rejected() {
        let err = DrawingToolType::from_str("eraser").unwrap_err();
        assert!(err.to_string().contains("Invalid drawing tool type"));
    }

    #[test]
    fn tool_type_empty_rejected() {
        assert!(DrawingToolType::from_str("").is_err());
    }

    // -- validate_stroke_width ---------------------------------------------

    #[test]
    fn stroke_width_at_minimum() {
        assert!(validate_stroke_width(MIN_STROKE_WIDTH).is_ok());
    }

    #[test]
    fn stroke_width_at_maximum() {
        assert!(validate_stroke_width(MAX_STROKE_WIDTH).is_ok());
    }

    #[test]
    fn stroke_width_mid_range() {
        assert!(validate_stroke_width(5.0).is_ok());
    }

    #[test]
    fn stroke_width_below_minimum_rejected() {
        assert!(validate_stroke_width(0.1).is_err());
    }

    #[test]
    fn stroke_width_above_maximum_rejected() {
        assert!(validate_stroke_width(25.0).is_err());
    }

    #[test]
    fn stroke_width_nan_rejected() {
        assert!(validate_stroke_width(f64::NAN).is_err());
    }

    #[test]
    fn stroke_width_infinite_rejected() {
        assert!(validate_stroke_width(f64::INFINITY).is_err());
    }

    // -- validate_annotations_json -----------------------------------------

    #[test]
    fn annotations_json_valid_array() {
        let json = json!([
            {"tool": "pen", "data": {"points": []}},
            {"tool": "text", "data": {"content": "note"}}
        ]);
        assert!(validate_annotations_json(&json).is_ok());
    }

    #[test]
    fn annotations_json_empty_array_accepted() {
        let json = json!([]);
        assert!(validate_annotations_json(&json).is_ok());
    }

    #[test]
    fn annotations_json_not_array_rejected() {
        let json = json!({"tool": "pen"});
        assert!(validate_annotations_json(&json).is_err());
    }

    #[test]
    fn annotations_json_missing_tool_rejected() {
        let json = json!([{"data": {"points": []}}]);
        let err = validate_annotations_json(&json).unwrap_err();
        assert!(err.to_string().contains("missing required key 'tool'"));
    }

    #[test]
    fn annotations_json_missing_data_rejected() {
        let json = json!([{"tool": "pen"}]);
        let err = validate_annotations_json(&json).unwrap_err();
        assert!(err.to_string().contains("missing required key 'data'"));
    }

    #[test]
    fn annotations_json_element_not_object_rejected() {
        let json = json!(["not an object"]);
        assert!(validate_annotations_json(&json).is_err());
    }

    #[test]
    fn annotations_json_exceeds_max_rejected() {
        let items: Vec<serde_json::Value> = (0..MAX_ANNOTATIONS_PER_FRAME + 1)
            .map(|_| json!({"tool": "pen", "data": {}}))
            .collect();
        let json = serde_json::Value::Array(items);
        let err = validate_annotations_json(&json).unwrap_err();
        assert!(err.to_string().contains("maximum is"));
    }

    // -- validate_color_hex ------------------------------------------------

    #[test]
    fn color_hex_rrggbb_accepted() {
        assert!(validate_color_hex("#FF4444").is_ok());
        assert!(validate_color_hex("#000000").is_ok());
        assert!(validate_color_hex("#aabbcc").is_ok());
    }

    #[test]
    fn color_hex_rrggbbaa_accepted() {
        assert!(validate_color_hex("#FF444480").is_ok());
        assert!(validate_color_hex("#00000000").is_ok());
    }

    #[test]
    fn color_hex_missing_hash_rejected() {
        assert!(validate_color_hex("FF4444").is_err());
    }

    #[test]
    fn color_hex_too_short_rejected() {
        assert!(validate_color_hex("#F44").is_err());
    }

    #[test]
    fn color_hex_invalid_chars_rejected() {
        assert!(validate_color_hex("#GGGGGG").is_err());
    }

    #[test]
    fn color_hex_empty_rejected() {
        assert!(validate_color_hex("").is_err());
    }

    // -- summarize_annotations ---------------------------------------------

    #[test]
    fn summarize_with_text_tool() {
        let json = json!([
            {"tool": "pen", "data": {}},
            {"tool": "text", "data": {"content": "hello"}}
        ]);
        let entry = summarize_annotations(1, 10, 100, &json);
        assert_eq!(entry.id, 1);
        assert_eq!(entry.frame_number, 10);
        assert_eq!(entry.tool_count, 2);
        assert_eq!(entry.user_id, 100);
        assert!(entry.has_text);
    }

    #[test]
    fn summarize_without_text_tool() {
        let json = json!([
            {"tool": "pen", "data": {}},
            {"tool": "circle", "data": {}}
        ]);
        let entry = summarize_annotations(2, 20, 200, &json);
        assert_eq!(entry.tool_count, 2);
        assert!(!entry.has_text);
    }

    #[test]
    fn summarize_empty_array() {
        let json = json!([]);
        let entry = summarize_annotations(3, 0, 300, &json);
        assert_eq!(entry.tool_count, 0);
        assert!(!entry.has_text);
    }

    #[test]
    fn summarize_non_array_returns_zero() {
        let json = json!({"tool": "pen"});
        let entry = summarize_annotations(4, 5, 400, &json);
        assert_eq!(entry.tool_count, 0);
        assert!(!entry.has_text);
    }
}
