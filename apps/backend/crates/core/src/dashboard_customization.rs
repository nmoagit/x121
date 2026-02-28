//! Dashboard Widget Customization pure logic (PRD-89).
//!
//! Provides widget catalog, layout validation, overlap detection,
//! basic widget settings validation, share token generation, and
//! layout priority resolution. All functions are pure (no I/O).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of columns in the dashboard grid.
pub const MAX_GRID_COLS: i32 = 12;

/// Maximum number of rows in the dashboard grid.
pub const MAX_GRID_ROWS: i32 = 100;

/// Maximum widgets per dashboard layout.
pub const MAX_WIDGETS_PER_LAYOUT: usize = 50;

// ---------------------------------------------------------------------------
// Widget category
// ---------------------------------------------------------------------------

/// Categories for organizing dashboard widgets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WidgetCategory {
    /// System monitoring widgets (GPU, health, disk).
    Monitoring,
    /// Task and workflow productivity widgets.
    Productivity,
    /// Reporting and analytics widgets.
    Reporting,
    /// System-level widgets.
    System,
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/// Describes a single widget type available in the catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetDefinition {
    /// Unique widget type identifier (e.g. "active-tasks").
    pub id: String,
    /// Human-readable display name.
    pub name: String,
    /// Short description of the widget.
    pub description: String,
    /// Widget category for grouping.
    pub category: WidgetCategory,
    /// Default width in grid columns.
    pub default_width: i32,
    /// Default height in grid rows.
    pub default_height: i32,
    /// Minimum width in grid columns.
    pub min_width: i32,
    /// Minimum height in grid rows.
    pub min_height: i32,
    /// Optional JSON schema for widget-specific settings.
    pub settings_schema: Option<serde_json::Value>,
    /// Source of the widget: "native" or an extension id.
    pub source: String,
}

// ---------------------------------------------------------------------------
// Layout item
// ---------------------------------------------------------------------------

/// A single widget placement on the grid.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LayoutItem {
    /// Widget type identifier.
    pub widget_id: String,
    /// Unique instance identifier (allows multiple of the same widget).
    pub instance_id: String,
    /// Column position (0-based).
    pub x: i32,
    /// Row position (0-based).
    pub y: i32,
    /// Width in grid columns.
    pub w: i32,
    /// Height in grid rows.
    pub h: i32,
}

// ---------------------------------------------------------------------------
// Layout validation
// ---------------------------------------------------------------------------

/// Validate that all layout items fit within the grid and have valid sizes.
///
/// Checks:
/// - Each widget has positive width and height
/// - Each widget fits within the column bounds (`max_cols`)
/// - Each widget fits within the row bounds (`MAX_GRID_ROWS`)
/// - No overlapping widgets (via [`detect_overlaps`])
/// - Total widget count does not exceed [`MAX_WIDGETS_PER_LAYOUT`]
pub fn validate_layout(items: &[LayoutItem], max_cols: i32) -> Result<(), CoreError> {
    if items.len() > MAX_WIDGETS_PER_LAYOUT {
        return Err(CoreError::Validation(format!(
            "Layout exceeds maximum of {} widgets (found {})",
            MAX_WIDGETS_PER_LAYOUT,
            items.len()
        )));
    }

    for (i, item) in items.iter().enumerate() {
        if item.w <= 0 || item.h <= 0 {
            return Err(CoreError::Validation(format!(
                "Widget at index {} has non-positive size: w={}, h={}",
                i, item.w, item.h
            )));
        }

        if item.x < 0 || item.y < 0 {
            return Err(CoreError::Validation(format!(
                "Widget at index {} has negative position: x={}, y={}",
                i, item.x, item.y
            )));
        }

        if item.x + item.w > max_cols {
            return Err(CoreError::Validation(format!(
                "Widget '{}' at index {} exceeds grid width: x({}) + w({}) > {}",
                item.instance_id, i, item.x, item.w, max_cols
            )));
        }

        if item.y + item.h > MAX_GRID_ROWS {
            return Err(CoreError::Validation(format!(
                "Widget '{}' at index {} exceeds grid height: y({}) + h({}) > {}",
                item.instance_id, i, item.y, item.h, MAX_GRID_ROWS
            )));
        }
    }

    let overlaps = detect_overlaps(items);
    if !overlaps.is_empty() {
        let (a, b) = overlaps[0];
        return Err(CoreError::Validation(format!(
            "Widgets overlap: '{}' (index {}) and '{}' (index {})",
            items[a].instance_id, a, items[b].instance_id, b
        )));
    }

    Ok(())
}

/// Detect all pairs of overlapping widgets in a layout.
///
/// Returns a vec of `(index_a, index_b)` pairs where `index_a < index_b`.
/// Two widgets overlap if their bounding rectangles intersect.
pub fn detect_overlaps(items: &[LayoutItem]) -> Vec<(usize, usize)> {
    let mut overlaps = Vec::new();

    for i in 0..items.len() {
        for j in (i + 1)..items.len() {
            let a = &items[i];
            let b = &items[j];

            // Two rectangles do NOT overlap when one is fully left/right/above/below the other.
            let no_overlap =
                a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

            if !no_overlap {
                overlaps.push((i, j));
            }
        }
    }

    overlaps
}

// ---------------------------------------------------------------------------
// Widget settings validation
// ---------------------------------------------------------------------------

/// Basic JSON schema validation for widget settings.
///
/// Checks that all `required` keys exist in `settings` and that their JSON
/// types match the schema's `properties.<key>.type` field. Supports types:
/// `"string"`, `"number"`, `"boolean"`, `"object"`, `"array"`.
pub fn validate_widget_settings(
    settings: &serde_json::Value,
    schema: &serde_json::Value,
) -> Result<(), CoreError> {
    let settings_obj = settings.as_object().ok_or_else(|| {
        CoreError::Validation("Widget settings must be a JSON object".to_string())
    })?;

    // Check required keys exist.
    if let Some(required) = schema.get("required").and_then(|v| v.as_array()) {
        for req in required {
            if let Some(key) = req.as_str() {
                if !settings_obj.contains_key(key) {
                    return Err(CoreError::Validation(format!(
                        "Missing required widget setting: '{key}'"
                    )));
                }
            }
        }
    }

    // Check types of provided values against schema properties.
    if let Some(properties) = schema.get("properties").and_then(|v| v.as_object()) {
        for (key, prop_schema) in properties {
            if let Some(value) = settings_obj.get(key) {
                if let Some(expected_type) = prop_schema.get("type").and_then(|t| t.as_str()) {
                    if !json_type_matches(value, expected_type) {
                        return Err(CoreError::Validation(format!(
                            "Widget setting '{key}' expected type '{expected_type}', got '{}'",
                            json_type_name(value)
                        )));
                    }
                }
            }
        }
    }

    Ok(())
}

/// Check whether a JSON value matches the named type.
fn json_type_matches(value: &serde_json::Value, expected: &str) -> bool {
    match expected {
        "string" => value.is_string(),
        "number" | "integer" => value.is_number(),
        "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        "array" => value.is_array(),
        "null" => value.is_null(),
        _ => true, // unknown type, allow
    }
}

/// Return the JSON type name for a value.
fn json_type_name(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

// ---------------------------------------------------------------------------
// Share token generation
// ---------------------------------------------------------------------------

/// Generate a random share token for preset sharing (UUID v4).
pub fn generate_share_token() -> String {
    Uuid::new_v4().to_string()
}

// ---------------------------------------------------------------------------
// Layout priority resolution
// ---------------------------------------------------------------------------

/// Default platform layout used when no user or role config exists.
fn platform_default_layout() -> serde_json::Value {
    serde_json::json!([
        {"widget_id": "active-tasks",     "instance_id": "active-tasks-1",     "x": 0, "y": 0, "w": 6, "h": 3},
        {"widget_id": "project-progress", "instance_id": "project-progress-1", "x": 6, "y": 0, "w": 6, "h": 3},
        {"widget_id": "activity-feed",    "instance_id": "activity-feed-1",    "x": 0, "y": 3, "w": 12, "h": 4}
    ])
}

/// Resolve the effective dashboard layout from the priority chain.
///
/// Priority order (first non-None wins):
/// 1. User's active preset layout
/// 2. User's saved dashboard config
/// 3. Role-based default layout
/// 4. Platform default
pub fn resolve_layout_priority(
    user_preset: Option<&serde_json::Value>,
    user_config: Option<&serde_json::Value>,
    role_default: Option<&serde_json::Value>,
) -> serde_json::Value {
    if let Some(layout) = user_preset {
        return layout.clone();
    }
    if let Some(layout) = user_config {
        return layout.clone();
    }
    if let Some(layout) = role_default {
        return layout.clone();
    }
    platform_default_layout()
}

// ---------------------------------------------------------------------------
// Native widget catalog
// ---------------------------------------------------------------------------

/// Return the full catalog of native (built-in) dashboard widgets.
pub fn get_native_widget_catalog() -> Vec<WidgetDefinition> {
    vec![
        WidgetDefinition {
            id: "active-tasks".to_string(),
            name: "Active Tasks".to_string(),
            description: "Shows currently in-progress tasks and their status".to_string(),
            category: WidgetCategory::Productivity,
            default_width: 6,
            default_height: 3,
            min_width: 3,
            min_height: 2,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "max_items": {"type": "number"},
                    "show_assignee": {"type": "boolean"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "disk-health".to_string(),
            name: "Disk Health".to_string(),
            description: "Storage utilization and health indicators".to_string(),
            category: WidgetCategory::Monitoring,
            default_width: 4,
            default_height: 3,
            min_width: 3,
            min_height: 2,
            settings_schema: None,
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "gpu-utilization".to_string(),
            name: "GPU Utilization".to_string(),
            description: "Real-time GPU usage across workers".to_string(),
            category: WidgetCategory::Monitoring,
            default_width: 4,
            default_height: 3,
            min_width: 3,
            min_height: 2,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "refresh_interval_secs": {"type": "number"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "activity-feed".to_string(),
            name: "Activity Feed".to_string(),
            description: "Recent activity stream across the platform".to_string(),
            category: WidgetCategory::Productivity,
            default_width: 6,
            default_height: 4,
            min_width: 4,
            min_height: 3,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "max_items": {"type": "number"},
                    "filter_type": {"type": "string"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "project-progress".to_string(),
            name: "Project Progress".to_string(),
            description: "Completion progress for active projects".to_string(),
            category: WidgetCategory::Reporting,
            default_width: 6,
            default_height: 3,
            min_width: 4,
            min_height: 2,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "project_id": {"type": "number"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "review-queue".to_string(),
            name: "Review Queue".to_string(),
            description: "Pending review items awaiting approval".to_string(),
            category: WidgetCategory::Productivity,
            default_width: 6,
            default_height: 4,
            min_width: 4,
            min_height: 3,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "max_items": {"type": "number"},
                    "sort_by": {"type": "string"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "recent-approvals".to_string(),
            name: "Recent Approvals".to_string(),
            description: "Recently approved or rejected review items".to_string(),
            category: WidgetCategory::Reporting,
            default_width: 6,
            default_height: 4,
            min_width: 4,
            min_height: 3,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "max_items": {"type": "number"},
                    "days_back": {"type": "number"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "job-queue".to_string(),
            name: "Job Queue".to_string(),
            description: "Current job queue depth and processing status".to_string(),
            category: WidgetCategory::System,
            default_width: 4,
            default_height: 3,
            min_width: 3,
            min_height: 2,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "show_completed": {"type": "boolean"}
                }
            })),
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "system-health".to_string(),
            name: "System Health".to_string(),
            description: "Service health overview and uptime indicators".to_string(),
            category: WidgetCategory::System,
            default_width: 4,
            default_height: 3,
            min_width: 3,
            min_height: 2,
            settings_schema: None,
            source: "native".to_string(),
        },
        WidgetDefinition {
            id: "render-timeline".to_string(),
            name: "Render Timeline".to_string(),
            description: "Gantt-style view of the render queue".to_string(),
            category: WidgetCategory::Monitoring,
            default_width: 8,
            default_height: 4,
            min_width: 6,
            min_height: 3,
            settings_schema: Some(serde_json::json!({
                "properties": {
                    "zoom_level": {"type": "string"},
                    "show_completed": {"type": "boolean"}
                }
            })),
            source: "native".to_string(),
        },
    ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- WidgetCategory ------------------------------------------------------

    #[test]
    fn widget_category_serialization() {
        let json = serde_json::to_string(&WidgetCategory::Monitoring).unwrap();
        assert_eq!(json, "\"monitoring\"");
    }

    #[test]
    fn widget_category_deserialization() {
        let cat: WidgetCategory = serde_json::from_str("\"productivity\"").unwrap();
        assert_eq!(cat, WidgetCategory::Productivity);
    }

    // -- get_native_widget_catalog -------------------------------------------

    #[test]
    fn native_catalog_has_10_widgets() {
        let catalog = get_native_widget_catalog();
        assert_eq!(catalog.len(), 10);
    }

    #[test]
    fn native_catalog_ids_are_unique() {
        let catalog = get_native_widget_catalog();
        let mut ids: Vec<&str> = catalog.iter().map(|w| w.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), catalog.len());
    }

    #[test]
    fn native_catalog_all_native_source() {
        let catalog = get_native_widget_catalog();
        for widget in &catalog {
            assert_eq!(widget.source, "native");
        }
    }

    #[test]
    fn native_catalog_min_sizes_positive() {
        let catalog = get_native_widget_catalog();
        for widget in &catalog {
            assert!(widget.min_width > 0, "Widget {} min_width <= 0", widget.id);
            assert!(
                widget.min_height > 0,
                "Widget {} min_height <= 0",
                widget.id
            );
        }
    }

    #[test]
    fn native_catalog_default_at_least_min() {
        let catalog = get_native_widget_catalog();
        for widget in &catalog {
            assert!(
                widget.default_width >= widget.min_width,
                "Widget {} default_width < min_width",
                widget.id
            );
            assert!(
                widget.default_height >= widget.min_height,
                "Widget {} default_height < min_height",
                widget.id
            );
        }
    }

    // -- validate_layout: valid cases ----------------------------------------

    #[test]
    fn validate_layout_empty_is_valid() {
        assert!(validate_layout(&[], MAX_GRID_COLS).is_ok());
    }

    #[test]
    fn validate_layout_single_widget_valid() {
        let items = vec![LayoutItem {
            widget_id: "test".into(),
            instance_id: "test-1".into(),
            x: 0,
            y: 0,
            w: 6,
            h: 3,
        }];
        assert!(validate_layout(&items, MAX_GRID_COLS).is_ok());
    }

    #[test]
    fn validate_layout_non_overlapping_side_by_side() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 6,
                h: 3,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 6,
                y: 0,
                w: 6,
                h: 3,
            },
        ];
        assert!(validate_layout(&items, MAX_GRID_COLS).is_ok());
    }

    #[test]
    fn validate_layout_non_overlapping_stacked() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 12,
                h: 3,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 0,
                y: 3,
                w: 12,
                h: 3,
            },
        ];
        assert!(validate_layout(&items, MAX_GRID_COLS).is_ok());
    }

    // -- validate_layout: invalid cases --------------------------------------

    #[test]
    fn validate_layout_exceeds_max_cols() {
        let items = vec![LayoutItem {
            widget_id: "test".into(),
            instance_id: "test-1".into(),
            x: 10,
            y: 0,
            w: 6,
            h: 3,
        }];
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("exceeds grid width")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_layout_negative_position() {
        let items = vec![LayoutItem {
            widget_id: "test".into(),
            instance_id: "test-1".into(),
            x: -1,
            y: 0,
            w: 6,
            h: 3,
        }];
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("negative position")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_layout_zero_width() {
        let items = vec![LayoutItem {
            widget_id: "test".into(),
            instance_id: "test-1".into(),
            x: 0,
            y: 0,
            w: 0,
            h: 3,
        }];
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("non-positive size")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_layout_negative_height() {
        let items = vec![LayoutItem {
            widget_id: "test".into(),
            instance_id: "test-1".into(),
            x: 0,
            y: 0,
            w: 4,
            h: -1,
        }];
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("non-positive size")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_layout_overlapping_widgets_detected() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 6,
                h: 3,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 5,
                y: 2,
                w: 6,
                h: 3,
            },
        ];
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("overlap")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_layout_too_many_widgets() {
        let items: Vec<LayoutItem> = (0..51)
            .map(|i| LayoutItem {
                widget_id: format!("w-{i}"),
                instance_id: format!("w-{i}-1"),
                x: 0,
                y: i * 2,
                w: 1,
                h: 1,
            })
            .collect();
        let err = validate_layout(&items, MAX_GRID_COLS).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("maximum")),
            _ => panic!("Expected Validation error"),
        }
    }

    // -- detect_overlaps -----------------------------------------------------

    #[test]
    fn detect_overlaps_empty() {
        assert!(detect_overlaps(&[]).is_empty());
    }

    #[test]
    fn detect_overlaps_no_overlap() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 4,
                h: 3,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 4,
                y: 0,
                w: 4,
                h: 3,
            },
        ];
        assert!(detect_overlaps(&items).is_empty());
    }

    #[test]
    fn detect_overlaps_full_overlap() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 6,
                h: 3,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 0,
                y: 0,
                w: 6,
                h: 3,
            },
        ];
        let overlaps = detect_overlaps(&items);
        assert_eq!(overlaps.len(), 1);
        assert_eq!(overlaps[0], (0, 1));
    }

    #[test]
    fn detect_overlaps_partial_overlap() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 4,
                h: 4,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 3,
                y: 3,
                w: 4,
                h: 4,
            },
        ];
        let overlaps = detect_overlaps(&items);
        assert_eq!(overlaps.len(), 1);
    }

    #[test]
    fn detect_overlaps_touching_edges_not_overlapping() {
        let items = vec![
            LayoutItem {
                widget_id: "a".into(),
                instance_id: "a-1".into(),
                x: 0,
                y: 0,
                w: 4,
                h: 4,
            },
            LayoutItem {
                widget_id: "b".into(),
                instance_id: "b-1".into(),
                x: 4,
                y: 0,
                w: 4,
                h: 4,
            },
        ];
        assert!(detect_overlaps(&items).is_empty());
    }

    // -- validate_widget_settings --------------------------------------------

    #[test]
    fn validate_settings_valid() {
        let schema = serde_json::json!({
            "required": ["max_items"],
            "properties": {
                "max_items": {"type": "number"},
                "show_assignee": {"type": "boolean"}
            }
        });
        let settings = serde_json::json!({"max_items": 10, "show_assignee": true});
        assert!(validate_widget_settings(&settings, &schema).is_ok());
    }

    #[test]
    fn validate_settings_missing_required() {
        let schema = serde_json::json!({
            "required": ["max_items"],
            "properties": {
                "max_items": {"type": "number"}
            }
        });
        let settings = serde_json::json!({});
        let err = validate_widget_settings(&settings, &schema).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("max_items")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_settings_wrong_type() {
        let schema = serde_json::json!({
            "properties": {
                "max_items": {"type": "number"}
            }
        });
        let settings = serde_json::json!({"max_items": "not-a-number"});
        let err = validate_widget_settings(&settings, &schema).unwrap_err();
        match err {
            CoreError::Validation(msg) => {
                assert!(msg.contains("max_items"));
                assert!(msg.contains("number"));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_settings_not_object() {
        let schema = serde_json::json!({});
        let settings = serde_json::json!("not-an-object");
        let err = validate_widget_settings(&settings, &schema).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("JSON object")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn validate_settings_no_required_no_properties() {
        let schema = serde_json::json!({});
        let settings = serde_json::json!({"anything": true});
        assert!(validate_widget_settings(&settings, &schema).is_ok());
    }

    // -- generate_share_token ------------------------------------------------

    #[test]
    fn share_token_is_uuid_format() {
        let token = generate_share_token();
        assert!(Uuid::parse_str(&token).is_ok());
    }

    #[test]
    fn share_tokens_are_unique() {
        let a = generate_share_token();
        let b = generate_share_token();
        assert_ne!(a, b);
    }

    // -- resolve_layout_priority ---------------------------------------------

    #[test]
    fn resolve_priority_user_preset_wins() {
        let preset = serde_json::json!([{"widget_id": "preset"}]);
        let config = serde_json::json!([{"widget_id": "config"}]);
        let role = serde_json::json!([{"widget_id": "role"}]);
        let result = resolve_layout_priority(Some(&preset), Some(&config), Some(&role));
        assert_eq!(result, preset);
    }

    #[test]
    fn resolve_priority_user_config_second() {
        let config = serde_json::json!([{"widget_id": "config"}]);
        let role = serde_json::json!([{"widget_id": "role"}]);
        let result = resolve_layout_priority(None, Some(&config), Some(&role));
        assert_eq!(result, config);
    }

    #[test]
    fn resolve_priority_role_default_third() {
        let role = serde_json::json!([{"widget_id": "role"}]);
        let result = resolve_layout_priority(None, None, Some(&role));
        assert_eq!(result, role);
    }

    #[test]
    fn resolve_priority_platform_default_fallback() {
        let result = resolve_layout_priority(None, None, None);
        let arr = result
            .as_array()
            .expect("platform default should be an array");
        assert!(!arr.is_empty());
    }

    // -- json_type_matches (via validate_widget_settings) --------------------

    #[test]
    fn validate_settings_boolean_type() {
        let schema = serde_json::json!({
            "properties": {"flag": {"type": "boolean"}}
        });
        let valid = serde_json::json!({"flag": true});
        assert!(validate_widget_settings(&valid, &schema).is_ok());

        let invalid = serde_json::json!({"flag": "true"});
        assert!(validate_widget_settings(&invalid, &schema).is_err());
    }

    #[test]
    fn validate_settings_string_type() {
        let schema = serde_json::json!({
            "properties": {"name": {"type": "string"}}
        });
        let valid = serde_json::json!({"name": "hello"});
        assert!(validate_widget_settings(&valid, &schema).is_ok());

        let invalid = serde_json::json!({"name": 42});
        assert!(validate_widget_settings(&invalid, &schema).is_err());
    }

    #[test]
    fn validate_settings_array_type() {
        let schema = serde_json::json!({
            "properties": {"items": {"type": "array"}}
        });
        let valid = serde_json::json!({"items": [1, 2, 3]});
        assert!(validate_widget_settings(&valid, &schema).is_ok());

        let invalid = serde_json::json!({"items": "not-array"});
        assert!(validate_widget_settings(&invalid, &schema).is_err());
    }

    // -- MAX constants -------------------------------------------------------

    #[test]
    fn max_grid_cols_is_12() {
        assert_eq!(MAX_GRID_COLS, 12);
    }

    #[test]
    fn max_grid_rows_is_100() {
        assert_eq!(MAX_GRID_ROWS, 100);
    }

    #[test]
    fn max_widgets_per_layout_is_50() {
        assert_eq!(MAX_WIDGETS_PER_LAYOUT, 50);
    }
}
