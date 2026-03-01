//! Auto-scaling decision logic for cloud GPU instances (PRD-114).
//!
//! Pure functions — no DB or network I/O. Takes current state and returns
//! a scaling action.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// The result of evaluating a scaling rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScalingAction {
    /// Provision `count` new instances.
    ScaleUp(u16),
    /// Terminate `count` instances.
    ScaleDown(u16),
    /// No change needed.
    NoChange,
}

/// Inputs for a scaling decision.
#[derive(Debug, Clone)]
pub struct ScalingInput {
    /// Minimum instances to maintain.
    pub min_instances: u16,
    /// Maximum instances allowed.
    pub max_instances: u16,
    /// Number of pending jobs before triggering scale-up.
    pub queue_threshold: u32,
    /// Minimum seconds between scaling actions.
    pub cooldown_secs: u32,
    /// Per-rule budget cap in cents (None = unlimited).
    pub budget_limit_cents: Option<i64>,
    /// Currently active instances for this GPU type.
    pub current_count: u16,
    /// Current pending job queue depth.
    pub queue_depth: u32,
    /// Total cost spent in the current budget period.
    pub budget_spent_cents: i64,
    /// When the last scaling action occurred (None = never).
    pub last_scaled_at: Option<DateTime<Utc>>,
    /// Current time.
    pub now: DateTime<Utc>,
}

/// Evaluate whether to scale up, scale down, or do nothing.
pub fn evaluate_scaling_decision(input: &ScalingInput) -> ScalingAction {
    // Check cooldown
    if let Some(last) = input.last_scaled_at {
        let elapsed = (input.now - last).num_seconds();
        if elapsed < input.cooldown_secs as i64 {
            return ScalingAction::NoChange;
        }
    }

    // Check budget
    if let Some(limit) = input.budget_limit_cents {
        if input.budget_spent_cents >= limit {
            // Budget exhausted — can only scale down, never up
            if input.current_count > 0 && input.current_count > input.min_instances {
                let excess = input.current_count - input.min_instances;
                if excess > 0 {
                    return ScalingAction::ScaleDown(excess);
                }
            }
            return ScalingAction::NoChange;
        }
    }

    // Scale up: queue exceeds threshold and we haven't hit max
    if input.queue_depth >= input.queue_threshold && input.current_count < input.max_instances {
        // Scale up by 1 at a time to avoid over-provisioning
        let can_add = input.max_instances - input.current_count;
        let needed = 1u16.min(can_add);
        if needed > 0 {
            return ScalingAction::ScaleUp(needed);
        }
    }

    // Scale down: queue is empty and we're above minimum
    if input.queue_depth == 0 && input.current_count > input.min_instances {
        // Scale down by 1 at a time for graceful drain
        return ScalingAction::ScaleDown(1);
    }

    // Enforce minimum
    if input.current_count < input.min_instances {
        let deficit = input.min_instances - input.current_count;
        return ScalingAction::ScaleUp(deficit);
    }

    ScalingAction::NoChange
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> ScalingInput {
        ScalingInput {
            min_instances: 0,
            max_instances: 5,
            queue_threshold: 3,
            cooldown_secs: 300,
            budget_limit_cents: None,
            current_count: 1,
            queue_depth: 0,
            budget_spent_cents: 0,
            last_scaled_at: None,
            now: Utc::now(),
        }
    }

    #[test]
    fn no_change_when_idle_at_minimum() {
        let input = ScalingInput {
            min_instances: 1,
            current_count: 1,
            queue_depth: 0,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
    }

    #[test]
    fn scale_up_when_queue_exceeds_threshold() {
        let input = ScalingInput {
            queue_depth: 5,
            current_count: 1,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::ScaleUp(1));
    }

    #[test]
    fn scale_down_when_queue_empty_above_min() {
        let input = ScalingInput {
            queue_depth: 0,
            current_count: 3,
            min_instances: 1,
            ..base_input()
        };
        assert_eq!(
            evaluate_scaling_decision(&input),
            ScalingAction::ScaleDown(1)
        );
    }

    #[test]
    fn no_scale_up_at_max() {
        let input = ScalingInput {
            queue_depth: 10,
            current_count: 5,
            max_instances: 5,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
    }

    #[test]
    fn cooldown_prevents_action() {
        let input = ScalingInput {
            queue_depth: 10,
            current_count: 1,
            last_scaled_at: Some(Utc::now()),
            cooldown_secs: 300,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
    }

    #[test]
    fn budget_exceeded_prevents_scale_up() {
        let input = ScalingInput {
            queue_depth: 10,
            current_count: 1,
            min_instances: 0,
            budget_limit_cents: Some(1000),
            budget_spent_cents: 1200,
            ..base_input()
        };
        assert_eq!(
            evaluate_scaling_decision(&input),
            ScalingAction::ScaleDown(1)
        );
    }

    #[test]
    fn enforce_minimum_instances() {
        let input = ScalingInput {
            min_instances: 2,
            current_count: 0,
            queue_depth: 0,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::ScaleUp(2));
    }
}
