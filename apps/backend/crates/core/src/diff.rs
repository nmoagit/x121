//! Shared diff-status enum used across multiple modules (PRD-50, PRD-74, etc.).
//!
//! Provides a canonical set of diff states for comparing configuration snapshots,
//! branch parameters, and other key-by-key comparisons.

use serde::{Deserialize, Serialize};

/// The status of an item in a diff comparison.
///
/// - `Added`     -- present only in the incoming/new side.
/// - `Removed`   -- present only in the current/old side.
/// - `Changed`   -- present in both sides but with different values.
/// - `Unchanged` -- present in both sides with identical values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffStatus {
    Added,
    Removed,
    Changed,
    Unchanged,
}

impl DiffStatus {
    /// String representation for display, logging, and database storage.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Added => "added",
            Self::Removed => "removed",
            Self::Changed => "changed",
            Self::Unchanged => "unchanged",
        }
    }
}

impl std::fmt::Display for DiffStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_returns_correct_strings() {
        assert_eq!(DiffStatus::Added.as_str(), "added");
        assert_eq!(DiffStatus::Removed.as_str(), "removed");
        assert_eq!(DiffStatus::Changed.as_str(), "changed");
        assert_eq!(DiffStatus::Unchanged.as_str(), "unchanged");
    }

    #[test]
    fn display_matches_as_str() {
        assert_eq!(format!("{}", DiffStatus::Added), "added");
        assert_eq!(format!("{}", DiffStatus::Changed), "changed");
    }

    #[test]
    fn serde_roundtrip() {
        let status = DiffStatus::Changed;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"changed\"");
        let parsed: DiffStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, status);
    }
}
