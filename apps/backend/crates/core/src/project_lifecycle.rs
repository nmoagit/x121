//! Project lifecycle state machine, completion checklists, and summary helpers (PRD-72).
//!
//! Defines the five lifecycle states (`setup`, `active`, `delivered`, `archived`,
//! `closed`), valid transitions between them, edit-lock semantics, and a
//! completion checklist evaluator used before delivery.

use chrono::{DateTime, Utc};

// ---------------------------------------------------------------------------
// Lifecycle state constants
// ---------------------------------------------------------------------------

/// Project is being configured; avatars onboarded, no generation started.
pub const STATE_SETUP: &str = "setup";

/// Project is actively generating scenes.
pub const STATE_ACTIVE: &str = "active";

/// All scenes approved and delivery ZIP exported; locked from new generation.
pub const STATE_DELIVERED: &str = "delivered";

/// Project archived; read-only, supporting files eligible for tiered storage.
pub const STATE_ARCHIVED: &str = "archived";

/// Permanently concluded; supporting files eligible for reclamation.
pub const STATE_CLOSED: &str = "closed";

/// All valid lifecycle state names.
pub const ALL_STATES: &[&str] = &[
    STATE_SETUP,
    STATE_ACTIVE,
    STATE_DELIVERED,
    STATE_ARCHIVED,
    STATE_CLOSED,
];

/// States where projects are edit-locked (no new generation, no metadata edits).
pub const LOCKED_STATES: &[&str] = &[STATE_DELIVERED, STATE_ARCHIVED, STATE_CLOSED];

// ---------------------------------------------------------------------------
// LifecycleState enum
// ---------------------------------------------------------------------------

/// Strongly-typed lifecycle state for transition validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleState {
    Setup,
    Active,
    Delivered,
    Archived,
    Closed,
}

impl LifecycleState {
    /// Parse a lifecycle state from its database string representation.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            STATE_SETUP => Ok(Self::Setup),
            STATE_ACTIVE => Ok(Self::Active),
            STATE_DELIVERED => Ok(Self::Delivered),
            STATE_ARCHIVED => Ok(Self::Archived),
            STATE_CLOSED => Ok(Self::Closed),
            other => Err(format!("Unknown lifecycle state: '{other}'")),
        }
    }

    /// Return the database string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Setup => STATE_SETUP,
            Self::Active => STATE_ACTIVE,
            Self::Delivered => STATE_DELIVERED,
            Self::Archived => STATE_ARCHIVED,
            Self::Closed => STATE_CLOSED,
        }
    }

    /// Return the set of states this state may transition to.
    pub fn valid_transitions(&self) -> &'static [LifecycleState] {
        match self {
            Self::Setup => &[Self::Active],
            Self::Active => &[Self::Delivered],
            Self::Delivered => &[Self::Active, Self::Archived],
            Self::Archived => &[Self::Active, Self::Closed],
            Self::Closed => &[],
        }
    }

    /// Check whether transitioning to `target` is allowed.
    pub fn can_transition_to(&self, target: LifecycleState) -> bool {
        self.valid_transitions().contains(&target)
    }

    /// Whether projects in this state should be edit-locked.
    pub fn is_edit_locked(&self) -> bool {
        matches!(self, Self::Delivered | Self::Archived | Self::Closed)
    }
}

// ---------------------------------------------------------------------------
// Transition validation (string-based convenience)
// ---------------------------------------------------------------------------

/// Validate a state transition using string state names.
///
/// Returns `Ok(())` if the transition is allowed, or a descriptive error.
pub fn validate_transition(from: &str, to: &str) -> Result<(), String> {
    let from_state = LifecycleState::from_str(from)?;
    let to_state = LifecycleState::from_str(to)?;
    if from_state.can_transition_to(to_state) {
        Ok(())
    } else {
        let valid: Vec<&str> = from_state
            .valid_transitions()
            .iter()
            .map(|s| s.as_str())
            .collect();
        Err(format!(
            "Cannot transition from '{from}' to '{to}'. Valid targets: {valid:?}"
        ))
    }
}

// ---------------------------------------------------------------------------
// Completion checklist
// ---------------------------------------------------------------------------

/// A single item in the completion checklist.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChecklistItem {
    /// Short machine-friendly name.
    pub name: String,
    /// Human-readable description.
    pub description: String,
    /// Whether this item currently passes.
    pub passed: bool,
    /// Whether failure of this item blocks the transition.
    pub blocking: bool,
    /// Optional detail message when the item fails.
    pub details: Option<String>,
}

/// Result of evaluating the completion checklist.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChecklistResult {
    /// Whether all blocking items passed.
    pub passed: bool,
    /// Individual checklist items.
    pub items: Vec<ChecklistItem>,
}

impl ChecklistResult {
    /// Build a result from a list of items, deriving `passed` from blocking items.
    pub fn from_items(items: Vec<ChecklistItem>) -> Self {
        let passed = items.iter().filter(|i| i.blocking).all(|i| i.passed);
        Self { passed, items }
    }
}

/// Evaluate the completion checklist from aggregate project counts.
///
/// Used before transitioning from `active` to `delivered` to verify the
/// project is ready.
pub fn evaluate_checklist(
    total_scenes: i64,
    approved_scenes: i64,
    total_avatars: i64,
    avatars_with_metadata: i64,
) -> ChecklistResult {
    let mut items = Vec::new();

    items.push(ChecklistItem {
        name: "has_avatars".to_string(),
        description: "Project has at least one avatar".to_string(),
        passed: total_avatars > 0,
        blocking: true,
        details: if total_avatars == 0 {
            Some("No avatars in project".to_string())
        } else {
            None
        },
    });

    items.push(ChecklistItem {
        name: "has_scenes".to_string(),
        description: "Project has at least one scene".to_string(),
        passed: total_scenes > 0,
        blocking: true,
        details: if total_scenes == 0 {
            Some("No scenes in project".to_string())
        } else {
            None
        },
    });

    items.push(ChecklistItem {
        name: "all_scenes_approved".to_string(),
        description: format!("{approved_scenes} of {total_scenes} scenes approved"),
        passed: total_scenes > 0 && approved_scenes == total_scenes,
        blocking: true,
        details: if total_scenes > 0 && approved_scenes < total_scenes {
            Some(format!(
                "{} scene(s) still need approval",
                total_scenes - approved_scenes
            ))
        } else {
            None
        },
    });

    items.push(ChecklistItem {
        name: "metadata_complete".to_string(),
        description: format!(
            "{avatars_with_metadata} of {total_avatars} avatars have complete metadata"
        ),
        passed: total_avatars > 0 && avatars_with_metadata == total_avatars,
        blocking: true,
        details: if total_avatars > 0 && avatars_with_metadata < total_avatars {
            Some(format!(
                "{} avatar(s) missing metadata",
                total_avatars - avatars_with_metadata
            ))
        } else {
            None
        },
    });

    ChecklistResult::from_items(items)
}

// ---------------------------------------------------------------------------
// Summary report helpers
// ---------------------------------------------------------------------------

/// Aggregate data for a project summary report.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectSummaryData {
    pub total_avatars: i32,
    pub total_scenes: i32,
    pub total_segments: i32,
    pub approved_scenes: i32,
    pub qa_pass_rate: f64,
    pub regeneration_count: i32,
    pub wall_clock_days: f64,
}

/// Compute QA pass rate as a percentage.
///
/// Returns `0.0` when `total` is zero to avoid division by zero.
pub fn compute_qa_pass_rate(passed: i64, total: i64) -> f64 {
    if total == 0 {
        0.0
    } else {
        (passed as f64 / total as f64) * 100.0
    }
}

/// Compute the wall-clock duration in fractional days between two timestamps.
pub fn compute_wall_clock_days(created_at: DateTime<Utc>, delivered_at: DateTime<Utc>) -> f64 {
    let duration = delivered_at - created_at;
    duration.num_hours() as f64 / 24.0
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    // -- LifecycleState::from_str ---------------------------------------------

    #[test]
    fn test_lifecycle_from_str() {
        assert_eq!(
            LifecycleState::from_str("setup").unwrap(),
            LifecycleState::Setup
        );
        assert_eq!(
            LifecycleState::from_str("active").unwrap(),
            LifecycleState::Active
        );
        assert_eq!(
            LifecycleState::from_str("delivered").unwrap(),
            LifecycleState::Delivered
        );
        assert_eq!(
            LifecycleState::from_str("archived").unwrap(),
            LifecycleState::Archived
        );
        assert_eq!(
            LifecycleState::from_str("closed").unwrap(),
            LifecycleState::Closed
        );
    }

    #[test]
    fn test_lifecycle_from_str_invalid() {
        assert!(LifecycleState::from_str("unknown").is_err());
        assert!(LifecycleState::from_str("").is_err());
        assert!(LifecycleState::from_str("SETUP").is_err());
    }

    // -- Transition rules -----------------------------------------------------

    #[test]
    fn test_setup_can_transition_to_active() {
        assert!(LifecycleState::Setup.can_transition_to(LifecycleState::Active));
    }

    #[test]
    fn test_setup_cannot_skip() {
        assert!(!LifecycleState::Setup.can_transition_to(LifecycleState::Delivered));
        assert!(!LifecycleState::Setup.can_transition_to(LifecycleState::Archived));
        assert!(!LifecycleState::Setup.can_transition_to(LifecycleState::Closed));
    }

    #[test]
    fn test_active_to_delivered() {
        assert!(LifecycleState::Active.can_transition_to(LifecycleState::Delivered));
    }

    #[test]
    fn test_active_cannot_archive_directly() {
        assert!(!LifecycleState::Active.can_transition_to(LifecycleState::Archived));
    }

    #[test]
    fn test_delivered_can_reopen() {
        assert!(LifecycleState::Delivered.can_transition_to(LifecycleState::Active));
    }

    #[test]
    fn test_delivered_can_archive() {
        assert!(LifecycleState::Delivered.can_transition_to(LifecycleState::Archived));
    }

    #[test]
    fn test_archived_can_reopen() {
        assert!(LifecycleState::Archived.can_transition_to(LifecycleState::Active));
    }

    #[test]
    fn test_archived_can_close() {
        assert!(LifecycleState::Archived.can_transition_to(LifecycleState::Closed));
    }

    #[test]
    fn test_closed_is_terminal() {
        assert!(!LifecycleState::Closed.can_transition_to(LifecycleState::Setup));
        assert!(!LifecycleState::Closed.can_transition_to(LifecycleState::Active));
        assert!(!LifecycleState::Closed.can_transition_to(LifecycleState::Delivered));
        assert!(!LifecycleState::Closed.can_transition_to(LifecycleState::Archived));
    }

    // -- Edit lock ------------------------------------------------------------

    #[test]
    fn test_edit_lock_states() {
        assert!(!LifecycleState::Setup.is_edit_locked());
        assert!(!LifecycleState::Active.is_edit_locked());
        assert!(LifecycleState::Delivered.is_edit_locked());
        assert!(LifecycleState::Archived.is_edit_locked());
        assert!(LifecycleState::Closed.is_edit_locked());
    }

    // -- validate_transition (string-based) -----------------------------------

    #[test]
    fn test_validate_transition_valid() {
        assert!(validate_transition("setup", "active").is_ok());
        assert!(validate_transition("active", "delivered").is_ok());
        assert!(validate_transition("delivered", "active").is_ok());
        assert!(validate_transition("delivered", "archived").is_ok());
        assert!(validate_transition("archived", "active").is_ok());
        assert!(validate_transition("archived", "closed").is_ok());
    }

    #[test]
    fn test_validate_transition_invalid() {
        assert!(validate_transition("setup", "delivered").is_err());
        assert!(validate_transition("active", "archived").is_err());
        assert!(validate_transition("closed", "active").is_err());
        assert!(validate_transition("setup", "bogus").is_err());
        assert!(validate_transition("bogus", "active").is_err());
    }

    // -- evaluate_checklist ---------------------------------------------------

    #[test]
    fn test_evaluate_checklist_all_pass() {
        let result = evaluate_checklist(10, 10, 5, 5);
        assert!(result.passed);
        assert!(result.items.iter().all(|i| i.passed));
    }

    #[test]
    fn test_evaluate_checklist_scenes_unapproved() {
        let result = evaluate_checklist(10, 7, 5, 5);
        assert!(!result.passed);
        let scenes_item = result
            .items
            .iter()
            .find(|i| i.name == "all_scenes_approved")
            .unwrap();
        assert!(!scenes_item.passed);
        assert!(scenes_item.details.as_ref().unwrap().contains("3 scene(s)"));
    }

    #[test]
    fn test_evaluate_checklist_empty_project() {
        let result = evaluate_checklist(0, 0, 0, 0);
        assert!(!result.passed);
        let chars_item = result
            .items
            .iter()
            .find(|i| i.name == "has_avatars")
            .unwrap();
        assert!(!chars_item.passed);
        let scenes_item = result
            .items
            .iter()
            .find(|i| i.name == "has_scenes")
            .unwrap();
        assert!(!scenes_item.passed);
    }

    #[test]
    fn test_evaluate_checklist_metadata_incomplete() {
        let result = evaluate_checklist(10, 10, 5, 3);
        assert!(!result.passed);
        let meta_item = result
            .items
            .iter()
            .find(|i| i.name == "metadata_complete")
            .unwrap();
        assert!(!meta_item.passed);
        assert!(meta_item
            .details
            .as_ref()
            .unwrap()
            .contains("2 avatar(s)"));
    }

    // -- Summary helpers ------------------------------------------------------

    #[test]
    fn test_compute_qa_pass_rate() {
        let rate = compute_qa_pass_rate(80, 100);
        assert!((rate - 80.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_qa_pass_rate_zero() {
        let rate = compute_qa_pass_rate(0, 0);
        assert!((rate - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_wall_clock_days() {
        let start = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2026, 1, 4, 0, 0, 0).unwrap();
        let days = compute_wall_clock_days(start, end);
        assert!((days - 3.0).abs() < f64::EPSILON);
    }
}
