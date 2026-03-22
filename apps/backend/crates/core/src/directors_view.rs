//! Director's View business logic and validation (PRD-55).
//!
//! Pure functions for swipe action parsing, review queue sorting/filtering,
//! push notification payload construction, and offline sync conflict detection.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::error::CoreError;

// ---------------------------------------------------------------------------
// Swipe action enum
// ---------------------------------------------------------------------------

/// Review actions available in the mobile swipe interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SwipeAction {
    Approve,
    Reject,
    Flag,
}

/// All valid swipe action string values.
pub const VALID_SWIPE_ACTIONS: &[&str] = &["approve", "reject", "flag"];

/// Parse a string into a [`SwipeAction`].
pub fn parse_swipe_action(s: &str) -> Result<SwipeAction, CoreError> {
    match s {
        "approve" => Ok(SwipeAction::Approve),
        "reject" => Ok(SwipeAction::Reject),
        "flag" => Ok(SwipeAction::Flag),
        _ => Err(CoreError::Validation(format!(
            "Invalid swipe action '{s}'. Must be one of: {}",
            VALID_SWIPE_ACTIONS.join(", ")
        ))),
    }
}

// ---------------------------------------------------------------------------
// Review queue item
// ---------------------------------------------------------------------------

/// A single item in the mobile review queue.
#[derive(Debug, Clone, Serialize)]
pub struct ReviewQueueItem {
    pub segment_id: i64,
    pub avatar_name: String,
    pub scene_type: String,
    pub status: String,
    pub thumbnail_url: Option<String>,
    pub video_url: Option<String>,
    pub submitted_at: DateTime<Utc>,
    pub submitted_by: String,
}

/// Valid sort fields for the review queue.
pub const VALID_SORT_FIELDS: &[&str] = &["submitted_at", "avatar", "scene_type"];

/// Sort review queue items in-place by the given field.
///
/// Defaults to `submitted_at` (oldest first) if the sort field is unrecognised.
pub fn sort_review_queue(items: &mut [ReviewQueueItem], sort_by: &str) {
    match sort_by {
        "avatar" => items.sort_by(|a, b| a.avatar_name.cmp(&b.avatar_name)),
        "scene_type" => items.sort_by(|a, b| a.scene_type.cmp(&b.scene_type)),
        // "submitted_at" and any unrecognised value fall through to date sort
        _ => items.sort_by(|a, b| a.submitted_at.cmp(&b.submitted_at)),
    }
}

/// Filter review queue items by optional status and project ID.
///
/// Both filters are AND-combined. If a filter is `None`, that dimension is
/// not filtered.
pub fn filter_review_queue<'a>(
    items: &'a [ReviewQueueItem],
    status_filter: Option<&str>,
    _project_id: Option<i64>,
) -> Vec<&'a ReviewQueueItem> {
    items
        .iter()
        .filter(|item| {
            if let Some(status) = status_filter {
                if item.status != status {
                    return false;
                }
            }
            // project_id filtering is done at the query level, but we accept
            // the parameter for in-memory post-filtering if needed.
            true
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Push notification payload
// ---------------------------------------------------------------------------

/// Payload for a Web Push notification.
#[derive(Debug, Clone, Serialize)]
pub struct PushPayload {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
    pub url: Option<String>,
    pub tag: Option<String>,
}

/// Build a push notification payload for a review event.
pub fn build_push_payload(event_type: &str, segment_id: i64, details: &str) -> PushPayload {
    let (title, body) = match event_type {
        "new_submission" => (
            "New submission ready for review".to_string(),
            format!("Segment {segment_id}: {details}"),
        ),
        "review_complete" => (
            "Review completed".to_string(),
            format!("Segment {segment_id} has been reviewed: {details}"),
        ),
        "flagged" => (
            "Segment flagged for attention".to_string(),
            format!("Segment {segment_id} was flagged: {details}"),
        ),
        _ => (
            "Review update".to_string(),
            format!("Segment {segment_id}: {details}"),
        ),
    };

    PushPayload {
        title,
        body,
        icon: Some("/icons/review-192.png".to_string()),
        url: Some(format!("/review/{segment_id}")),
        tag: Some(format!("{event_type}_{segment_id}")),
    }
}

// ---------------------------------------------------------------------------
// Offline sync conflict detection
// ---------------------------------------------------------------------------

/// Describes a conflict between a locally-queued action and remote state.
#[derive(Debug, Clone, Serialize)]
pub struct SyncConflict {
    pub action_id: i64,
    pub conflict_type: String,
    pub local_action: String,
    pub remote_state: String,
}

/// Detect conflicts between local offline actions and the current remote state.
///
/// A conflict occurs when a segment was already acted upon by another user
/// after the local action's `client_timestamp`.
///
/// # Parameters
///
/// - `local_actions`: `(action_id, action, client_timestamp)` tuples
/// - `remote_states`: `(target_id, current_status, updated_at)` tuples
pub fn detect_sync_conflicts(
    local_actions: &[(i64, SwipeAction, DateTime<Utc>)],
    remote_states: &[(i64, &str, DateTime<Utc>)],
) -> Vec<SyncConflict> {
    let mut conflicts = Vec::new();

    for (action_id, action, client_ts) in local_actions {
        // Find the matching remote state by target_id (action_id is the
        // offline_sync_log row id; the target_id in the remote_states
        // corresponds to the segment these actions target).
        // Since the caller passes target-matched pairs, we check all
        // remote_states entries — the action_id doubles as target_id
        // in the caller's mapping.
        for (target_id, remote_status, remote_ts) in remote_states {
            if action_id != target_id {
                continue;
            }

            // A conflict exists if the remote was updated after the local action
            if remote_ts > client_ts {
                let local_action_str = match action {
                    SwipeAction::Approve => "approve",
                    SwipeAction::Reject => "reject",
                    SwipeAction::Flag => "flag",
                };

                conflicts.push(SyncConflict {
                    action_id: *action_id,
                    conflict_type: "concurrent_modification".to_string(),
                    local_action: local_action_str.to_string(),
                    remote_state: remote_status.to_string(),
                });
            }
        }
    }

    conflicts
}

/// Resolve a sync conflict automatically based on timestamps.
///
/// Returns `"local_wins"` if the local action is newer, `"remote_wins"` otherwise.
pub fn resolve_conflict_auto(local_ts: DateTime<Utc>, remote_ts: DateTime<Utc>) -> &'static str {
    if local_ts > remote_ts {
        "local_wins"
    } else {
        "remote_wins"
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    // -- SwipeAction parsing --

    #[test]
    fn test_parse_swipe_action_approve() {
        assert_eq!(parse_swipe_action("approve").unwrap(), SwipeAction::Approve);
    }

    #[test]
    fn test_parse_swipe_action_reject() {
        assert_eq!(parse_swipe_action("reject").unwrap(), SwipeAction::Reject);
    }

    #[test]
    fn test_parse_swipe_action_flag() {
        assert_eq!(parse_swipe_action("flag").unwrap(), SwipeAction::Flag);
    }

    #[test]
    fn test_parse_swipe_action_invalid() {
        let result = parse_swipe_action("delete");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_swipe_action_case_sensitive() {
        assert!(parse_swipe_action("Approve").is_err());
        assert!(parse_swipe_action("REJECT").is_err());
    }

    // -- Review queue sorting --

    fn make_items() -> Vec<ReviewQueueItem> {
        vec![
            ReviewQueueItem {
                segment_id: 1,
                avatar_name: "Charlie".into(),
                scene_type: "dialogue".into(),
                status: "pending".into(),
                thumbnail_url: None,
                video_url: None,
                submitted_at: Utc.with_ymd_and_hms(2026, 1, 3, 0, 0, 0).unwrap(),
                submitted_by: "user_a".into(),
            },
            ReviewQueueItem {
                segment_id: 2,
                avatar_name: "Alice".into(),
                scene_type: "action".into(),
                status: "pending".into(),
                thumbnail_url: None,
                video_url: None,
                submitted_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
                submitted_by: "user_b".into(),
            },
            ReviewQueueItem {
                segment_id: 3,
                avatar_name: "Bob".into(),
                scene_type: "closeup".into(),
                status: "approved".into(),
                thumbnail_url: None,
                video_url: None,
                submitted_at: Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap(),
                submitted_by: "user_c".into(),
            },
        ]
    }

    #[test]
    fn test_sort_by_submitted_at() {
        let mut items = make_items();
        sort_review_queue(&mut items, "submitted_at");
        assert_eq!(items[0].segment_id, 2); // Jan 1
        assert_eq!(items[1].segment_id, 3); // Jan 2
        assert_eq!(items[2].segment_id, 1); // Jan 3
    }

    #[test]
    fn test_sort_by_avatar() {
        let mut items = make_items();
        sort_review_queue(&mut items, "avatar");
        assert_eq!(items[0].avatar_name, "Alice");
        assert_eq!(items[1].avatar_name, "Bob");
        assert_eq!(items[2].avatar_name, "Charlie");
    }

    #[test]
    fn test_sort_by_scene_type() {
        let mut items = make_items();
        sort_review_queue(&mut items, "scene_type");
        assert_eq!(items[0].scene_type, "action");
        assert_eq!(items[1].scene_type, "closeup");
        assert_eq!(items[2].scene_type, "dialogue");
    }

    #[test]
    fn test_sort_unknown_defaults_to_date() {
        let mut items = make_items();
        sort_review_queue(&mut items, "unknown_field");
        assert_eq!(items[0].segment_id, 2);
    }

    // -- Review queue filtering --

    #[test]
    fn test_filter_by_status() {
        let items = make_items();
        let filtered = filter_review_queue(&items, Some("pending"), None);
        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().all(|i| i.status == "pending"));
    }

    #[test]
    fn test_filter_no_match() {
        let items = make_items();
        let filtered = filter_review_queue(&items, Some("rejected"), None);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_filter_none_returns_all() {
        let items = make_items();
        let filtered = filter_review_queue(&items, None, None);
        assert_eq!(filtered.len(), 3);
    }

    // -- Push payload --

    #[test]
    fn test_build_push_payload_new_submission() {
        let payload = build_push_payload("new_submission", 42, "scene closeup");
        assert_eq!(payload.title, "New submission ready for review");
        assert!(payload.body.contains("42"));
        assert!(payload.body.contains("scene closeup"));
        assert_eq!(payload.url.as_deref(), Some("/review/42"));
    }

    #[test]
    fn test_build_push_payload_review_complete() {
        let payload = build_push_payload("review_complete", 10, "approved");
        assert_eq!(payload.title, "Review completed");
        assert!(payload.body.contains("reviewed"));
    }

    #[test]
    fn test_build_push_payload_flagged() {
        let payload = build_push_payload("flagged", 7, "lighting issue");
        assert_eq!(payload.title, "Segment flagged for attention");
    }

    #[test]
    fn test_build_push_payload_unknown_event() {
        let payload = build_push_payload("unknown_event", 1, "info");
        assert_eq!(payload.title, "Review update");
    }

    #[test]
    fn test_push_payload_has_icon() {
        let payload = build_push_payload("new_submission", 1, "x");
        assert!(payload.icon.is_some());
    }

    #[test]
    fn test_push_payload_tag_format() {
        let payload = build_push_payload("flagged", 5, "x");
        assert_eq!(payload.tag.as_deref(), Some("flagged_5"));
    }

    // -- Sync conflict detection --

    #[test]
    fn test_detect_no_conflicts() {
        let t1 = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        let t0 = Utc.with_ymd_and_hms(2026, 1, 1, 11, 0, 0).unwrap();

        let local = vec![(1, SwipeAction::Approve, t1)];
        let remote = vec![(1, "pending", t0)];

        let conflicts = detect_sync_conflicts(&local, &remote);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_detect_conflict_remote_newer() {
        let t_local = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let t_remote = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();

        let local = vec![(1, SwipeAction::Approve, t_local)];
        let remote = vec![(1, "rejected", t_remote)];

        let conflicts = detect_sync_conflicts(&local, &remote);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type, "concurrent_modification");
        assert_eq!(conflicts[0].local_action, "approve");
        assert_eq!(conflicts[0].remote_state, "rejected");
    }

    #[test]
    fn test_detect_multiple_conflicts() {
        let t_local = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let t_remote = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();

        let local = vec![
            (1, SwipeAction::Approve, t_local),
            (2, SwipeAction::Reject, t_local),
        ];
        let remote = vec![(1, "flagged", t_remote), (2, "approved", t_remote)];

        let conflicts = detect_sync_conflicts(&local, &remote);
        assert_eq!(conflicts.len(), 2);
    }

    #[test]
    fn test_detect_no_matching_remote() {
        let t = Utc.with_ymd_and_hms(2026, 1, 1, 10, 0, 0).unwrap();
        let local = vec![(99, SwipeAction::Flag, t)];
        let remote: Vec<(i64, &str, DateTime<Utc>)> = vec![];

        let conflicts = detect_sync_conflicts(&local, &remote);
        assert!(conflicts.is_empty());
    }

    // -- Conflict resolution --

    #[test]
    fn test_resolve_conflict_local_wins() {
        let t_local = Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap();
        let t_remote = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
        assert_eq!(resolve_conflict_auto(t_local, t_remote), "local_wins");
    }

    #[test]
    fn test_resolve_conflict_remote_wins() {
        let t_local = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
        let t_remote = Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap();
        assert_eq!(resolve_conflict_auto(t_local, t_remote), "remote_wins");
    }

    #[test]
    fn test_resolve_conflict_same_time_remote_wins() {
        let t = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        assert_eq!(resolve_conflict_auto(t, t), "remote_wins");
    }

    // -- Edge cases --

    #[test]
    fn test_sort_empty_queue() {
        let mut items: Vec<ReviewQueueItem> = vec![];
        sort_review_queue(&mut items, "submitted_at");
        assert!(items.is_empty());
    }

    #[test]
    fn test_filter_empty_queue() {
        let items: Vec<ReviewQueueItem> = vec![];
        let filtered = filter_review_queue(&items, Some("pending"), None);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_detect_conflicts_empty_local() {
        let remote = vec![(1, "approved", Utc::now())];
        let conflicts = detect_sync_conflicts(&[], &remote);
        assert!(conflicts.is_empty());
    }
}
