//! Well-known QA score status constants.
//!
//! These must match the status values stored in the `image_quality_scores.status`
//! column and used by the QA handler, Python analysis scripts, and any future
//! QA-related PRDs (PRD-49, PRD-76).

/// The check passed all thresholds.
pub const QA_PASS: &str = "pass";

/// The check fell below the warn threshold but above the fail threshold.
pub const QA_WARN: &str = "warn";

/// The check fell below the fail threshold.
pub const QA_FAIL: &str = "fail";
