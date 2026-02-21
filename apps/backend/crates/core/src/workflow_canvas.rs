//! Workflow canvas constants and validation (PRD-33).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future pipeline or worker tooling.
//!
//! Defines node types, port types, canvas defaults, and validation functions
//! for the node-based workflow canvas.

// ---------------------------------------------------------------------------
// Node type constants
// ---------------------------------------------------------------------------

/// Node types matching ComfyUI pipeline stages.
pub mod node_types {
    pub const LOADER: &str = "loader";
    pub const SAMPLER: &str = "sampler";
    pub const VAE: &str = "vae";
    pub const CONTROLNET: &str = "controlnet";
    pub const CLIP: &str = "clip";
    pub const CONDITIONING: &str = "conditioning";
    pub const LATENT: &str = "latent";
    pub const IMAGE: &str = "image";
    pub const OUTPUT: &str = "output";
    pub const PREPROCESSOR: &str = "preprocessor";
    pub const UPSCALER: &str = "upscaler";
    pub const CUSTOM: &str = "custom";

    /// All recognised node types.
    pub const ALL: &[&str] = &[
        LOADER,
        SAMPLER,
        VAE,
        CONTROLNET,
        CLIP,
        CONDITIONING,
        LATENT,
        IMAGE,
        OUTPUT,
        PREPROCESSOR,
        UPSCALER,
        CUSTOM,
    ];
}

// ---------------------------------------------------------------------------
// Port type constants
// ---------------------------------------------------------------------------

/// Data types that flow through connections between nodes.
pub mod port_types {
    pub const MODEL: &str = "MODEL";
    pub const CLIP_PORT: &str = "CLIP";
    pub const VAE_PORT: &str = "VAE";
    pub const CONDITIONING_PORT: &str = "CONDITIONING";
    pub const LATENT_PORT: &str = "LATENT";
    pub const IMAGE_PORT: &str = "IMAGE";
    pub const MASK: &str = "MASK";
    pub const CONTROL_NET: &str = "CONTROL_NET";
    pub const STRING: &str = "STRING";
    pub const INT: &str = "INT";
    pub const FLOAT: &str = "FLOAT";

    /// All recognised port types.
    pub const ALL: &[&str] = &[
        MODEL,
        CLIP_PORT,
        VAE_PORT,
        CONDITIONING_PORT,
        LATENT_PORT,
        IMAGE_PORT,
        MASK,
        CONTROL_NET,
        STRING,
        INT,
        FLOAT,
    ];
}

// ---------------------------------------------------------------------------
// Canvas defaults
// ---------------------------------------------------------------------------

/// Default canvas viewport zoom level.
pub const DEFAULT_ZOOM: f64 = 1.0;

/// Minimum allowed zoom level.
pub const MIN_ZOOM: f64 = 0.1;

/// Maximum allowed zoom level.
pub const MAX_ZOOM: f64 = 4.0;

/// Default canvas viewport X position.
pub const DEFAULT_VIEWPORT_X: f64 = 0.0;

/// Default canvas viewport Y position.
pub const DEFAULT_VIEWPORT_Y: f64 = 0.0;

/// Default node width in pixels.
pub const DEFAULT_NODE_WIDTH: u32 = 200;

/// Default node height in pixels.
pub const DEFAULT_NODE_HEIGHT: u32 = 100;

/// Spacing between auto-laid-out nodes (pixels).
pub const NODE_SPACING: u32 = 50;

/// Maximum number of nodes allowed on a single canvas.
pub const MAX_NODES_PER_CANVAS: usize = 500;

// ---------------------------------------------------------------------------
// Timing telemetry thresholds (milliseconds)
// ---------------------------------------------------------------------------

/// Nodes completing under this threshold are marked "fast" (green).
pub const TIMING_FAST_MS: u64 = 1_000;

/// Nodes completing under this threshold are marked "moderate" (yellow).
/// Above this is "slow" (red).
pub const TIMING_MODERATE_MS: u64 = 5_000;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Check whether a node type string is recognised.
pub fn is_valid_node_type(node_type: &str) -> bool {
    node_types::ALL.contains(&node_type)
}

/// Check whether a port type string is recognised.
pub fn is_valid_port_type(port_type: &str) -> bool {
    port_types::ALL.contains(&port_type)
}

/// Check whether two port types are compatible for a connection.
///
/// Connections are valid when the output port type matches the input port
/// type exactly. Numeric types (`INT`, `FLOAT`) are interchangeable.
pub fn ports_compatible(output_type: &str, input_type: &str) -> bool {
    if output_type == input_type {
        return true;
    }

    // Numeric types are interchangeable.
    let numeric = [port_types::INT, port_types::FLOAT];
    if numeric.contains(&output_type) && numeric.contains(&input_type) {
        return true;
    }

    false
}

/// Classify a node execution time (ms) into a performance tier.
///
/// Returns `"fast"`, `"moderate"`, or `"slow"`.
pub fn classify_timing(execution_ms: u64) -> &'static str {
    if execution_ms < TIMING_FAST_MS {
        "fast"
    } else if execution_ms < TIMING_MODERATE_MS {
        "moderate"
    } else {
        "slow"
    }
}

/// Validate that a node count does not exceed the canvas limit.
pub fn validate_node_count(count: usize) -> Result<(), String> {
    if count > MAX_NODES_PER_CANVAS {
        Err(format!(
            "Canvas has {count} nodes, exceeding the maximum of {MAX_NODES_PER_CANVAS}"
        ))
    } else {
        Ok(())
    }
}

/// Validate that a zoom level is within allowed bounds.
pub fn validate_zoom(zoom: f64) -> Result<(), String> {
    if zoom < MIN_ZOOM || zoom > MAX_ZOOM {
        Err(format!(
            "Zoom {zoom} is outside the allowed range [{MIN_ZOOM}, {MAX_ZOOM}]"
        ))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Node type validation -----------------------------------------------

    #[test]
    fn valid_node_type_accepted() {
        assert!(is_valid_node_type("loader"));
        assert!(is_valid_node_type("sampler"));
        assert!(is_valid_node_type("output"));
    }

    #[test]
    fn invalid_node_type_rejected() {
        assert!(!is_valid_node_type("nonexistent"));
        assert!(!is_valid_node_type(""));
    }

    // -- Port type validation -----------------------------------------------

    #[test]
    fn valid_port_type_accepted() {
        assert!(is_valid_port_type("MODEL"));
        assert!(is_valid_port_type("IMAGE"));
        assert!(is_valid_port_type("FLOAT"));
    }

    #[test]
    fn invalid_port_type_rejected() {
        assert!(!is_valid_port_type("UNKNOWN"));
        assert!(!is_valid_port_type(""));
    }

    // -- Port compatibility -------------------------------------------------

    #[test]
    fn same_types_compatible() {
        assert!(ports_compatible("IMAGE", "IMAGE"));
        assert!(ports_compatible("MODEL", "MODEL"));
    }

    #[test]
    fn different_types_incompatible() {
        assert!(!ports_compatible("IMAGE", "MODEL"));
        assert!(!ports_compatible("LATENT", "CONDITIONING"));
    }

    #[test]
    fn numeric_types_interchangeable() {
        assert!(ports_compatible("INT", "FLOAT"));
        assert!(ports_compatible("FLOAT", "INT"));
    }

    #[test]
    fn numeric_to_non_numeric_incompatible() {
        assert!(!ports_compatible("INT", "IMAGE"));
        assert!(!ports_compatible("FLOAT", "MODEL"));
    }

    // -- Timing classification ----------------------------------------------

    #[test]
    fn classify_fast_timing() {
        assert_eq!(classify_timing(0), "fast");
        assert_eq!(classify_timing(500), "fast");
        assert_eq!(classify_timing(999), "fast");
    }

    #[test]
    fn classify_moderate_timing() {
        assert_eq!(classify_timing(1_000), "moderate");
        assert_eq!(classify_timing(3_000), "moderate");
        assert_eq!(classify_timing(4_999), "moderate");
    }

    #[test]
    fn classify_slow_timing() {
        assert_eq!(classify_timing(5_000), "slow");
        assert_eq!(classify_timing(10_000), "slow");
        assert_eq!(classify_timing(60_000), "slow");
    }

    // -- Node count validation ----------------------------------------------

    #[test]
    fn node_count_within_limit() {
        assert!(validate_node_count(0).is_ok());
        assert!(validate_node_count(100).is_ok());
        assert!(validate_node_count(MAX_NODES_PER_CANVAS).is_ok());
    }

    #[test]
    fn node_count_exceeds_limit() {
        let err = validate_node_count(MAX_NODES_PER_CANVAS + 1).unwrap_err();
        assert!(err.contains("exceeding the maximum"));
    }

    // -- Zoom validation ----------------------------------------------------

    #[test]
    fn zoom_within_bounds() {
        assert!(validate_zoom(1.0).is_ok());
        assert!(validate_zoom(MIN_ZOOM).is_ok());
        assert!(validate_zoom(MAX_ZOOM).is_ok());
    }

    #[test]
    fn zoom_below_minimum() {
        assert!(validate_zoom(0.01).is_err());
    }

    #[test]
    fn zoom_above_maximum() {
        assert!(validate_zoom(5.0).is_err());
    }
}
