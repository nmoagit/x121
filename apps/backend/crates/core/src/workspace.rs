//! Workspace persistence constants and validation (PRD-04).

/// Maximum size in bytes for a single undo snapshot (1 MB).
pub const MAX_UNDO_SNAPSHOT_BYTES: usize = 1_048_576;

/// Default device type when none is specified.
pub const DEFAULT_DEVICE_TYPE: &str = "desktop";

/// Set of valid device type strings.
pub const VALID_DEVICE_TYPES: &[&str] = &["desktop", "tablet", "mobile"];

/// Returns `true` if the given device type string is valid.
pub fn is_valid_device_type(device_type: &str) -> bool {
    VALID_DEVICE_TYPES.contains(&device_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_device_types() {
        assert!(is_valid_device_type("desktop"));
        assert!(is_valid_device_type("tablet"));
        assert!(is_valid_device_type("mobile"));
    }

    #[test]
    fn test_invalid_device_types() {
        assert!(!is_valid_device_type("phone"));
        assert!(!is_valid_device_type(""));
        assert!(!is_valid_device_type("DESKTOP"));
    }

    #[test]
    fn test_max_undo_snapshot_bytes_is_one_mb() {
        assert_eq!(MAX_UNDO_SNAPSHOT_BYTES, 1024 * 1024);
    }

    #[test]
    fn test_default_device_type() {
        assert_eq!(DEFAULT_DEVICE_TYPE, "desktop");
        assert!(is_valid_device_type(DEFAULT_DEVICE_TYPE));
    }
}
