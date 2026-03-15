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

/// A scaling decision with a human-readable reason explaining why.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScalingDecision {
    pub action: ScalingAction,
    pub reason: String,
    /// Cooldown remaining at decision time (0 if not in cooldown).
    pub cooldown_remaining_secs: i64,
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
    evaluate_scaling_decision_with_reason(input).action
}

/// Evaluate scaling with a human-readable reason for the decision.
pub fn evaluate_scaling_decision_with_reason(input: &ScalingInput) -> ScalingDecision {
    // Check cooldown
    let cooldown_remaining = if let Some(last) = input.last_scaled_at {
        let elapsed = (input.now - last).num_seconds();
        let remaining = input.cooldown_secs as i64 - elapsed;
        if remaining > 0 {
            return ScalingDecision {
                action: ScalingAction::NoChange,
                reason: format!(
                    "Cooldown active — {remaining}s remaining (last scaled {}s ago)",
                    elapsed,
                ),
                cooldown_remaining_secs: remaining,
            };
        }
        0
    } else {
        0
    };

    // Check budget
    if let Some(limit) = input.budget_limit_cents {
        if input.budget_spent_cents >= limit {
            // Budget exhausted — can only scale down, never up
            if input.current_count > 0 && input.current_count > input.min_instances {
                let excess = input.current_count - input.min_instances;
                if excess > 0 {
                    return ScalingDecision {
                        action: ScalingAction::ScaleDown(excess),
                        reason: format!(
                            "Budget exhausted ({} of {} cents spent) — scaling down {} to minimum",
                            input.budget_spent_cents, limit, excess,
                        ),
                        cooldown_remaining_secs: cooldown_remaining,
                    };
                }
            }
            return ScalingDecision {
                action: ScalingAction::NoChange,
                reason: format!(
                    "Budget exhausted ({} of {} cents spent) — already at minimum",
                    input.budget_spent_cents, limit,
                ),
                cooldown_remaining_secs: cooldown_remaining,
            };
        }
    }

    // Scale up: queue exceeds threshold, we haven't hit max, AND there are more
    // pending jobs than existing instances. The last check prevents spinning up
    // extra instances when current instances just haven't picked up jobs yet
    // (e.g. after a restart, reconnecting, or still booting up).
    if input.queue_depth >= input.queue_threshold && input.current_count < input.max_instances {
        // Only scale if pending jobs outnumber existing instances
        if input.queue_depth as u16 > input.current_count {
            let can_add = input.max_instances - input.current_count;
            // How many MORE instances are needed beyond what we already have
            let shortfall = (input.queue_depth as u16) - input.current_count;
            let needed = shortfall.min(can_add);
            if needed > 0 {
                return ScalingDecision {
                    action: ScalingAction::ScaleUp(needed),
                    reason: format!(
                        "Queue depth ({}) > current instances ({}) with max {} — scaling up {}",
                        input.queue_depth,
                        input.current_count,
                        input.max_instances,
                        needed,
                    ),
                    cooldown_remaining_secs: cooldown_remaining,
                };
            }
        } else {
            return ScalingDecision {
                action: ScalingAction::NoChange,
                reason: format!(
                    "Queue has {} pending jobs but already at max instances ({}/{})",
                    input.queue_depth,
                    input.current_count,
                    input.max_instances,
                ),
                cooldown_remaining_secs: cooldown_remaining,
            };
        }
    }

    // Scale down: more instances than needed and above minimum.
    // We do NOT terminate immediately here — the idle instance detector
    // (detect_idle_instances) handles actual termination after the configurable
    // idle timeout (default 5 min). This just reports the excess for logging.
    if input.current_count > input.min_instances {
        let needed = (input.queue_depth as u16).max(input.min_instances);
        if input.current_count > needed {
            return ScalingDecision {
                action: ScalingAction::NoChange,
                reason: format!(
                    "Excess instances: {} running, {} needed (queue {}, min {}) — idle detector will handle",
                    input.current_count, needed, input.queue_depth, input.min_instances,
                ),
                cooldown_remaining_secs: cooldown_remaining,
            };
        }
    }

    // Enforce minimum
    if input.current_count < input.min_instances {
        let deficit = input.min_instances - input.current_count;
        return ScalingDecision {
            action: ScalingAction::ScaleUp(deficit),
            reason: format!(
                "Below minimum instances ({}/{}) — scaling up {}",
                input.current_count, input.min_instances, deficit,
            ),
            cooldown_remaining_secs: cooldown_remaining,
        };
    }

    // Why no change?
    let reason = if input.queue_depth > 0 && input.current_count >= input.max_instances {
        format!(
            "Queue has {} pending jobs but already at max instances ({}/{})",
            input.queue_depth, input.current_count, input.max_instances,
        )
    } else if input.queue_depth < input.queue_threshold {
        format!(
            "Queue depth ({}) below threshold ({}) — no action needed",
            input.queue_depth, input.queue_threshold,
        )
    } else {
        format!(
            "Stable — {} instances, {} pending jobs",
            input.current_count, input.queue_depth,
        )
    };

    ScalingDecision {
        action: ScalingAction::NoChange,
        reason,
        cooldown_remaining_secs: cooldown_remaining,
    }
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
    fn scale_up_when_queue_exceeds_instances() {
        // 5 pending, 1 instance → shortfall = 4, can_add = 4 → ScaleUp(4)
        let input = ScalingInput {
            queue_depth: 5,
            current_count: 1,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::ScaleUp(4));
    }

    #[test]
    fn no_scale_up_when_instances_cover_queue() {
        // 1 pending job, 1 instance already exists → no scale up
        // (instance just hasn't picked up the job yet)
        let input = ScalingInput {
            queue_depth: 1,
            current_count: 1,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
    }

    #[test]
    fn no_immediate_scale_down_when_instances_exceed_queue() {
        // 2 pending jobs, 3 instances → NoChange (idle detector handles actual shutdown)
        let input = ScalingInput {
            queue_depth: 2,
            current_count: 3,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
    }

    #[test]
    fn scale_up_multiple_when_queue_demands_it() {
        // 9 pending, 0 instances, max 5 → shortfall = 9, capped at 5 → ScaleUp(5)
        let input = ScalingInput {
            queue_depth: 9,
            current_count: 0,
            max_instances: 5,
            queue_threshold: 3,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::ScaleUp(5));
    }

    #[test]
    fn scale_up_capped_at_max_instances() {
        // 12 pending, 1 instance, max 3 → shortfall = 11, can_add = 2 → ScaleUp(2)
        let input = ScalingInput {
            queue_depth: 12,
            current_count: 1,
            max_instances: 3,
            queue_threshold: 3,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::ScaleUp(2));
    }

    #[test]
    fn no_immediate_scale_down_when_queue_empty() {
        // Queue empty, 3 instances, min 1 → NoChange (idle detector handles after timeout)
        let input = ScalingInput {
            queue_depth: 0,
            current_count: 3,
            min_instances: 1,
            ..base_input()
        };
        assert_eq!(evaluate_scaling_decision(&input), ScalingAction::NoChange);
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
