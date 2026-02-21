//! Shared types for the reclamation subsystem.
//!
//! These types are used across the API and core layers to communicate
//! reclamation preview results and cleanup reports.

use serde::Serialize;

/// A file identified as reclaimable by policy evaluation.
#[derive(Debug, Clone, Serialize)]
pub struct ReclaimableFile {
    pub entity_type: String,
    pub entity_id: i64,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub project_id: Option<i64>,
    pub policy_name: String,
    pub age_days: i64,
    pub grace_period_days: i32,
}

/// Per-project summary of reclaimable space.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectReclamationSummary {
    pub project_id: Option<i64>,
    pub project_name: Option<String>,
    pub file_count: i64,
    pub total_bytes: i64,
}

/// Preview of what a reclamation run would do, without actually deleting.
#[derive(Debug, Clone, Serialize)]
pub struct ReclamationPreview {
    pub total_files: i64,
    pub total_bytes: i64,
    pub per_project: Vec<ProjectReclamationSummary>,
}

/// Report returned after a cleanup run completes.
#[derive(Debug, Clone, Serialize)]
pub struct CleanupReport {
    pub run_id: i64,
    pub files_scanned: i32,
    pub files_marked: i32,
    pub files_deleted: i32,
    pub bytes_reclaimed: i64,
    pub errors: Vec<String>,
}

/// Report returned after purging expired trash entries.
#[derive(Debug, Clone, Serialize)]
pub struct PurgeReport {
    pub files_deleted: i32,
    pub bytes_reclaimed: i64,
    pub errors: Vec<String>,
}

/// Human-readable byte formatting.
pub fn format_bytes(bytes: i64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    const TB: f64 = GB * 1024.0;

    let b = bytes as f64;
    if b >= TB {
        format!("{:.2} TB", b / TB)
    } else if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{bytes} B")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(1_048_576), "1.00 MB");
        assert_eq!(format_bytes(1_073_741_824), "1.00 GB");
        assert_eq!(format_bytes(1_099_511_627_776), "1.00 TB");
    }
}
