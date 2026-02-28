//! GPU power management constants, validators, and calculations (PRD-87).
//!
//! Pure functions for power state transitions, schedule evaluation, and
//! energy consumption estimation. Lives in `core` to maintain zero internal
//! dependency constraint.

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Power state constants
// ---------------------------------------------------------------------------

/// Worker is powered on and available.
pub const POWER_ON: &str = "on";
/// Worker is idle (no active jobs).
pub const POWER_IDLE: &str = "idle";
/// Worker is gracefully shutting down.
pub const POWER_SHUTTING_DOWN: &str = "shutting_down";
/// Worker is in sleep/suspended state.
pub const POWER_SLEEPING: &str = "sleeping";
/// Worker is waking up from sleep.
pub const POWER_WAKING: &str = "waking";
/// All valid power states.
pub const VALID_POWER_STATES: &[&str] = &[
    POWER_ON,
    POWER_IDLE,
    POWER_SHUTTING_DOWN,
    POWER_SLEEPING,
    POWER_WAKING,
];

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

/// Schedule applies to a single worker.
pub const SCOPE_INDIVIDUAL: &str = "individual";
/// Schedule applies fleet-wide.
pub const SCOPE_FLEET: &str = "fleet";
/// All valid scope values.
pub const VALID_SCOPES: &[&str] = &[SCOPE_INDIVIDUAL, SCOPE_FLEET];

// ---------------------------------------------------------------------------
// Wake method constants
// ---------------------------------------------------------------------------

/// Wake-on-LAN method.
pub const WAKE_WOL: &str = "wol";
/// SSH-based wake method.
pub const WAKE_SSH: &str = "ssh";
/// API-based wake method (e.g. RunPod, cloud provider).
pub const WAKE_API: &str = "api";
/// All valid wake methods.
pub const VALID_WAKE_METHODS: &[&str] = &[WAKE_WOL, WAKE_SSH, WAKE_API];

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

/// Default idle timeout before a worker is considered for sleep (minutes).
pub const DEFAULT_IDLE_TIMEOUT_MINUTES: i32 = 30;
/// Default graceful shutdown timeout (minutes).
pub const DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES: i32 = 10;
/// Idle power consumption as a fraction of TDP (30%).
pub const IDLE_POWER_RATIO: f64 = 0.3;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/// Validate that a power state string is one of the known states.
pub fn validate_power_state(state: &str) -> Result<(), CoreError> {
    if VALID_POWER_STATES.contains(&state) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid power state '{state}'. Must be one of: {}",
            VALID_POWER_STATES.join(", ")
        )))
    }
}

/// Validate that a scope string is one of the known scopes.
pub fn validate_scope(scope: &str) -> Result<(), CoreError> {
    if VALID_SCOPES.contains(&scope) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid scope '{scope}'. Must be one of: {}",
            VALID_SCOPES.join(", ")
        )))
    }
}

/// Validate that a wake method string is one of the known methods.
pub fn validate_wake_method(method: &str) -> Result<(), CoreError> {
    if VALID_WAKE_METHODS.contains(&method) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Invalid wake method '{method}'. Must be one of: {}",
            VALID_WAKE_METHODS.join(", ")
        )))
    }
}

/// Validate an idle timeout in minutes (must be 1..=1440).
pub fn validate_idle_timeout(minutes: i32) -> Result<(), CoreError> {
    if (1..=1440).contains(&minutes) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "Idle timeout must be between 1 and 1440 minutes, got {minutes}"
        )))
    }
}

/// Validate a GPU TDP wattage (must be 1..=2000).
pub fn validate_tdp_watts(watts: i32) -> Result<(), CoreError> {
    if (1..=2000).contains(&watts) {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "GPU TDP must be between 1 and 2000 watts, got {watts}"
        )))
    }
}

// ---------------------------------------------------------------------------
// Power consumption calculations
// ---------------------------------------------------------------------------

/// Estimate actual energy consumption in kWh given active and idle time.
///
/// Uses the worker's TDP for active power and `IDLE_POWER_RATIO * TDP` for
/// idle power. Off time consumes zero energy.
pub fn estimate_kwh(active_minutes: i32, idle_minutes: i32, tdp_watts: i32) -> f64 {
    let active_hours = active_minutes as f64 / 60.0;
    let idle_hours = idle_minutes as f64 / 60.0;
    let idle_watts = tdp_watts as f64 * IDLE_POWER_RATIO;
    (active_hours * tdp_watts as f64 + idle_hours * idle_watts) / 1000.0
}

/// Estimate what consumption would be if the worker ran at full TDP the
/// entire time (no idle or off periods).
pub fn estimate_always_on_kwh(total_minutes: i32, tdp_watts: i32) -> f64 {
    (total_minutes as f64 / 60.0) * tdp_watts as f64 / 1000.0
}

/// Compute the percentage of power saved compared to always-on operation.
///
/// Returns 0.0 if the always-on baseline is zero or negative.
pub fn compute_power_savings(actual_kwh: f64, always_on_kwh: f64) -> f64 {
    if always_on_kwh <= 0.0 {
        return 0.0;
    }
    ((always_on_kwh - actual_kwh) / always_on_kwh) * 100.0
}

// ---------------------------------------------------------------------------
// Power state transitions
// ---------------------------------------------------------------------------

/// Return the set of valid target states for a given power state.
pub fn valid_power_transitions(from: &str) -> &[&str] {
    match from {
        "on" => &["idle"],
        "idle" => &["on", "shutting_down"],
        "shutting_down" => &["sleeping"],
        "sleeping" => &["waking"],
        "waking" => &["on"],
        _ => &[],
    }
}

/// Check whether a transition from one power state to another is valid.
pub fn can_transition_power(from: &str, to: &str) -> bool {
    valid_power_transitions(from).contains(&to)
}

// ---------------------------------------------------------------------------
// Schedule evaluation
// ---------------------------------------------------------------------------

/// Check whether the current time falls within the on/off window for a day.
///
/// The `schedule_json` is expected to have keys like `"monday"`, `"tuesday"`,
/// etc., each containing `{ "on": "HH:MM", "off": "HH:MM" }`.
///
/// Returns `false` if the day is not present in the schedule (day off).
pub fn is_within_schedule_window(
    schedule_json: &serde_json::Value,
    day_of_week: &str,
    current_time_hhmm: &str,
) -> bool {
    if let Some(day_schedule) = schedule_json.get(day_of_week) {
        let on_time = day_schedule
            .get("on")
            .and_then(|v| v.as_str())
            .unwrap_or("00:00");
        let off_time = day_schedule
            .get("off")
            .and_then(|v| v.as_str())
            .unwrap_or("23:59");
        current_time_hhmm >= on_time && current_time_hhmm <= off_time
    } else {
        false
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_power_state -------------------------------------------------

    #[test]
    fn valid_power_states_accepted() {
        for state in VALID_POWER_STATES {
            assert!(validate_power_state(state).is_ok(), "should accept {state}");
        }
    }

    #[test]
    fn invalid_power_state_rejected() {
        assert!(validate_power_state("off").is_err());
        assert!(validate_power_state("").is_err());
        assert!(validate_power_state("ON").is_err());
    }

    // -- validate_scope -------------------------------------------------------

    #[test]
    fn valid_scopes_accepted() {
        for scope in VALID_SCOPES {
            assert!(validate_scope(scope).is_ok(), "should accept {scope}");
        }
    }

    #[test]
    fn invalid_scope_rejected() {
        assert!(validate_scope("global").is_err());
        assert!(validate_scope("").is_err());
    }

    // -- validate_wake_method -------------------------------------------------

    #[test]
    fn valid_wake_methods_accepted() {
        for method in VALID_WAKE_METHODS {
            assert!(
                validate_wake_method(method).is_ok(),
                "should accept {method}"
            );
        }
    }

    #[test]
    fn invalid_wake_method_rejected() {
        assert!(validate_wake_method("magic").is_err());
        assert!(validate_wake_method("").is_err());
    }

    // -- validate_idle_timeout ------------------------------------------------

    #[test]
    fn valid_idle_timeout_accepted() {
        assert!(validate_idle_timeout(1).is_ok());
        assert!(validate_idle_timeout(30).is_ok());
        assert!(validate_idle_timeout(1440).is_ok());
    }

    #[test]
    fn invalid_idle_timeout_rejected() {
        assert!(validate_idle_timeout(0).is_err());
        assert!(validate_idle_timeout(-1).is_err());
        assert!(validate_idle_timeout(1441).is_err());
    }

    // -- validate_tdp_watts ---------------------------------------------------

    #[test]
    fn valid_tdp_watts_accepted() {
        assert!(validate_tdp_watts(1).is_ok());
        assert!(validate_tdp_watts(300).is_ok());
        assert!(validate_tdp_watts(2000).is_ok());
    }

    #[test]
    fn invalid_tdp_watts_rejected() {
        assert!(validate_tdp_watts(0).is_err());
        assert!(validate_tdp_watts(-50).is_err());
        assert!(validate_tdp_watts(2001).is_err());
    }

    // -- estimate_kwh ---------------------------------------------------------

    #[test]
    fn kwh_active_only() {
        // 60 min active at 300W = 0.3 kWh
        let kwh = estimate_kwh(60, 0, 300);
        assert!((kwh - 0.3).abs() < 1e-9);
    }

    #[test]
    fn kwh_idle_only() {
        // 60 min idle at 300W TDP = 300 * 0.3 / 1000 = 0.09 kWh
        let kwh = estimate_kwh(0, 60, 300);
        assert!((kwh - 0.09).abs() < 1e-9);
    }

    #[test]
    fn kwh_mixed() {
        // 60 min active (0.3) + 60 min idle (0.09) = 0.39 kWh
        let kwh = estimate_kwh(60, 60, 300);
        assert!((kwh - 0.39).abs() < 1e-9);
    }

    #[test]
    fn kwh_zero_time() {
        assert_eq!(estimate_kwh(0, 0, 300), 0.0);
    }

    // -- estimate_always_on_kwh -----------------------------------------------

    #[test]
    fn always_on_kwh_one_hour() {
        // 60 min at 300W = 0.3 kWh
        let kwh = estimate_always_on_kwh(60, 300);
        assert!((kwh - 0.3).abs() < 1e-9);
    }

    #[test]
    fn always_on_kwh_zero_minutes() {
        assert_eq!(estimate_always_on_kwh(0, 300), 0.0);
    }

    // -- compute_power_savings ------------------------------------------------

    #[test]
    fn power_savings_normal() {
        // Saved 50% if actual is half of always-on
        let savings = compute_power_savings(0.15, 0.3);
        assert!((savings - 50.0).abs() < 1e-9);
    }

    #[test]
    fn power_savings_zero_baseline() {
        assert_eq!(compute_power_savings(0.1, 0.0), 0.0);
    }

    #[test]
    fn power_savings_negative_baseline() {
        assert_eq!(compute_power_savings(0.1, -1.0), 0.0);
    }

    #[test]
    fn power_savings_no_savings() {
        let savings = compute_power_savings(0.3, 0.3);
        assert!(savings.abs() < 1e-9);
    }

    // -- valid_power_transitions ----------------------------------------------

    #[test]
    fn transitions_from_on() {
        assert_eq!(valid_power_transitions("on"), &["idle"]);
    }

    #[test]
    fn transitions_from_idle() {
        let t = valid_power_transitions("idle");
        assert!(t.contains(&"on"));
        assert!(t.contains(&"shutting_down"));
        assert_eq!(t.len(), 2);
    }

    #[test]
    fn transitions_from_shutting_down() {
        assert_eq!(valid_power_transitions("shutting_down"), &["sleeping"]);
    }

    #[test]
    fn transitions_from_sleeping() {
        assert_eq!(valid_power_transitions("sleeping"), &["waking"]);
    }

    #[test]
    fn transitions_from_waking() {
        assert_eq!(valid_power_transitions("waking"), &["on"]);
    }

    #[test]
    fn transitions_from_unknown() {
        assert!(valid_power_transitions("unknown").is_empty());
    }

    // -- can_transition_power -------------------------------------------------

    #[test]
    fn valid_transition_allowed() {
        assert!(can_transition_power("on", "idle"));
        assert!(can_transition_power("idle", "shutting_down"));
        assert!(can_transition_power("sleeping", "waking"));
        assert!(can_transition_power("waking", "on"));
    }

    #[test]
    fn invalid_transition_rejected() {
        assert!(!can_transition_power("on", "sleeping"));
        assert!(!can_transition_power("sleeping", "on"));
        assert!(!can_transition_power("waking", "idle"));
        assert!(!can_transition_power("on", "on"));
    }

    // -- is_within_schedule_window --------------------------------------------

    #[test]
    fn within_window() {
        let schedule = serde_json::json!({
            "monday": { "on": "08:00", "off": "18:00" }
        });
        assert!(is_within_schedule_window(&schedule, "monday", "12:00"));
    }

    #[test]
    fn outside_window() {
        let schedule = serde_json::json!({
            "monday": { "on": "08:00", "off": "18:00" }
        });
        assert!(!is_within_schedule_window(&schedule, "monday", "19:00"));
    }

    #[test]
    fn at_boundary_on() {
        let schedule = serde_json::json!({
            "monday": { "on": "08:00", "off": "18:00" }
        });
        assert!(is_within_schedule_window(&schedule, "monday", "08:00"));
    }

    #[test]
    fn at_boundary_off() {
        let schedule = serde_json::json!({
            "monday": { "on": "08:00", "off": "18:00" }
        });
        assert!(is_within_schedule_window(&schedule, "monday", "18:00"));
    }

    #[test]
    fn day_not_in_schedule() {
        let schedule = serde_json::json!({
            "monday": { "on": "08:00", "off": "18:00" }
        });
        assert!(!is_within_schedule_window(&schedule, "saturday", "12:00"));
    }

    #[test]
    fn empty_schedule() {
        let schedule = serde_json::json!({});
        assert!(!is_within_schedule_window(&schedule, "monday", "12:00"));
    }
}
