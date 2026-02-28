//! Handlers for Director's View mobile/tablet review (PRD-55).
//!
//! Provides endpoints for the mobile review queue, swipe actions,
//! push notification subscription management, offline sync, and
//! a simplified mobile activity feed.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use x121_core::directors_view;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::directors_view::CreatePushSubscription;
use x121_db::repositories::{OfflineSyncRepo, PushSubscriptionRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for the review queue endpoint.
#[derive(Debug, Deserialize)]
pub struct ReviewQueueParams {
    pub status: Option<String>,
    pub project_id: Option<DbId>,
    pub sort_by: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/// Request body for submitting a review action on a segment.
#[derive(Debug, Deserialize)]
pub struct ReviewActionRequest {
    pub action: String,
    pub notes: Option<String>,
}

/// Request body for deleting a push subscription.
#[derive(Debug, Deserialize)]
pub struct DeletePushSubscriptionRequest {
    pub endpoint: String,
}

/// A single offline action in a sync batch.
#[derive(Debug, Deserialize)]
pub struct OfflineSyncItem {
    pub target_id: DbId,
    pub action_type: String,
    pub client_timestamp: chrono::DateTime<chrono::Utc>,
}

/// Request body for syncing offline actions.
#[derive(Debug, Deserialize)]
pub struct SyncRequest {
    pub actions: Vec<OfflineSyncItem>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Response for the sync endpoint.
#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub synced: i64,
    pub conflicts: Vec<directors_view::SyncConflict>,
}

/// Response for a submitted review action.
#[derive(Debug, Serialize)]
pub struct ReviewActionResponse {
    pub segment_id: DbId,
    pub action: String,
    pub status: String,
}

/// A simplified activity feed entry for mobile.
#[derive(Debug, Serialize)]
pub struct ActivityFeedEntry {
    pub id: DbId,
    pub action_type: String,
    pub target_id: DbId,
    pub synced: bool,
    pub client_timestamp: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /user/review-queue
///
/// Fetch the mobile review queue for the authenticated user.
/// Supports optional status filter, project_id filter, sorting, and pagination.
pub async fn get_review_queue(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ReviewQueueParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);
    let sort_by = params.sort_by.as_deref().unwrap_or("submitted_at");

    let rows = fetch_review_queue(
        &state.pool,
        params.status.as_deref(),
        params.project_id,
        sort_by,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: rows }))
}

/// Internal helper to fetch review queue with optional filters.
async fn fetch_review_queue(
    pool: &sqlx::PgPool,
    status: Option<&str>,
    project_id: Option<DbId>,
    order_by: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<ReviewQueueRow>, sqlx::Error> {
    let order_clause = match order_by {
        "character" => "ch.name ASC",
        "scene_type" => "COALESCE(st.name, 'unknown') ASC",
        _ => "seg.created_at ASC",
    };

    let query_str = format!(
        "SELECT
            seg.id AS segment_id,
            ch.name AS character_name,
            COALESCE(st.name, 'unknown') AS scene_type,
            COALESCE(sa_latest.decision, 'pending') AS status,
            NULL::TEXT AS thumbnail_url,
            NULL::TEXT AS video_url,
            seg.created_at AS submitted_at,
            COALESCE(u.name, 'unknown') AS submitted_by
         FROM segments seg
         JOIN scenes sc ON sc.id = seg.scene_id
         JOIN characters ch ON ch.id = sc.character_id
         LEFT JOIN scene_types st ON st.id = sc.scene_type_id
         LEFT JOIN users u ON u.id = ch.created_by
         LEFT JOIN LATERAL (
            SELECT decision FROM segment_approvals
            WHERE segment_id = seg.id
            ORDER BY decided_at DESC
            LIMIT 1
         ) sa_latest ON true
         WHERE seg.deleted_at IS NULL
           AND ($1::TEXT IS NULL OR COALESCE(sa_latest.decision, 'pending') = $1)
           AND ($2::BIGINT IS NULL OR ch.project_id = $2)
         ORDER BY {order_clause}
         LIMIT $3 OFFSET $4"
    );

    sqlx::query_as::<_, ReviewQueueRow>(&query_str)
        .bind(status)
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
}

/// Row type for review queue queries.
#[derive(Debug, sqlx::FromRow, Serialize)]
pub struct ReviewQueueRow {
    pub segment_id: DbId,
    pub character_name: String,
    pub scene_type: String,
    pub status: String,
    pub thumbnail_url: Option<String>,
    pub video_url: Option<String>,
    pub submitted_at: chrono::DateTime<chrono::Utc>,
    pub submitted_by: String,
}

/// POST /user/review-queue/:segment_id/action
///
/// Submit a review action (approve, reject, or flag) for a specific segment.
pub async fn submit_review_action(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(request): Json<ReviewActionRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate the action string
    let action = directors_view::parse_swipe_action(&request.action).map_err(AppError::Core)?;

    // Map the swipe action to the segment_approvals decision string
    let decision = match action {
        directors_view::SwipeAction::Approve => "approved",
        directors_view::SwipeAction::Reject => "rejected",
        directors_view::SwipeAction::Flag => "flagged",
    };

    // Insert the approval/rejection/flag record
    sqlx::query(
        "INSERT INTO segment_approvals
            (segment_id, user_id, decision, comment, segment_version)
         VALUES ($1, $2, $3, $4, 1)",
    )
    .bind(segment_id)
    .bind(auth.user_id)
    .bind(decision)
    .bind(request.notes.as_deref())
    .execute(&state.pool)
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        action = %request.action,
        "Review action submitted"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: ReviewActionResponse {
                segment_id,
                action: request.action,
                status: "recorded".to_string(),
            },
        }),
    ))
}

/// POST /user/push-subscription
///
/// Register or update a Web Push subscription for the authenticated user.
pub async fn register_push_subscription(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreatePushSubscription>,
) -> AppResult<impl IntoResponse> {
    let subscription = PushSubscriptionRepo::create_or_update(
        &state.pool,
        auth.user_id,
        &input.endpoint,
        &input.p256dh_key,
        &input.auth_key,
        input.user_agent.as_deref(),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        subscription_id = subscription.id,
        "Push subscription registered"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse { data: subscription }),
    ))
}

/// DELETE /user/push-subscription
///
/// Remove a push subscription by endpoint for the authenticated user.
pub async fn delete_push_subscription(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<DeletePushSubscriptionRequest>,
) -> AppResult<impl IntoResponse> {
    let deleted =
        PushSubscriptionRepo::delete_by_endpoint(&state.pool, auth.user_id, &input.endpoint)
            .await?;

    if !deleted {
        return Err(AppError::BadRequest(
            "No matching push subscription found".to_string(),
        ));
    }

    tracing::info!(user_id = auth.user_id, "Push subscription deleted");

    Ok(StatusCode::NO_CONTENT)
}

/// POST /user/sync
///
/// Sync offline review actions. Returns the count of successfully synced
/// actions and any detected conflicts.
pub async fn sync_offline_actions(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(request): Json<SyncRequest>,
) -> AppResult<impl IntoResponse> {
    if request.actions.is_empty() {
        return Ok(Json(DataResponse {
            data: SyncResponse {
                synced: 0,
                conflicts: vec![],
            },
        }));
    }

    // Validate all action types first
    for item in &request.actions {
        directors_view::parse_swipe_action(&item.action_type).map_err(AppError::Core)?;
    }

    // Collect target_ids to check for conflicts
    let target_ids: Vec<DbId> = request.actions.iter().map(|a| a.target_id).collect();

    // Fetch current remote state for the target segments
    let remote_rows = sqlx::query_as::<_, RemoteStateRow>(
        "SELECT seg.id AS target_id,
                COALESCE(sa.decision, 'pending') AS status,
                COALESCE(sa.decided_at, seg.created_at) AS updated_at
         FROM segments seg
         LEFT JOIN LATERAL (
            SELECT decision, decided_at FROM segment_approvals
            WHERE segment_id = seg.id
            ORDER BY decided_at DESC
            LIMIT 1
         ) sa ON true
         WHERE seg.id = ANY($1::BIGINT[])",
    )
    .bind(&target_ids)
    .fetch_all(&state.pool)
    .await?;

    // Build conflict detection inputs
    let local_actions: Vec<(
        i64,
        directors_view::SwipeAction,
        chrono::DateTime<chrono::Utc>,
    )> = request
        .actions
        .iter()
        .map(|a| {
            (
                a.target_id,
                directors_view::parse_swipe_action(&a.action_type).expect("already validated"),
                a.client_timestamp,
            )
        })
        .collect();

    let remote_states: Vec<(i64, &str, chrono::DateTime<chrono::Utc>)> = remote_rows
        .iter()
        .map(|r| (r.target_id, r.status.as_str(), r.updated_at))
        .collect();

    let conflicts = directors_view::detect_sync_conflicts(&local_actions, &remote_states);

    // Determine which actions have no conflicts and can be synced
    let conflict_target_ids: std::collections::HashSet<i64> =
        conflicts.iter().map(|c| c.action_id).collect();

    let non_conflicting: Vec<_> = request
        .actions
        .iter()
        .filter(|a| !conflict_target_ids.contains(&a.target_id))
        .collect();

    // Record non-conflicting actions in offline_sync_log
    let batch: Vec<(
        DbId,
        &str,
        chrono::DateTime<chrono::Utc>,
        Option<&serde_json::Value>,
    )> = non_conflicting
        .iter()
        .map(|a| {
            (
                a.target_id,
                a.action_type.as_str(),
                a.client_timestamp,
                None,
            )
        })
        .collect();

    let created = OfflineSyncRepo::create_batch(&state.pool, auth.user_id, &batch).await?;

    // Also apply the actual review actions (insert into segment_approvals)
    for item in &non_conflicting {
        let action =
            directors_view::parse_swipe_action(&item.action_type).expect("already validated");
        let decision = match action {
            directors_view::SwipeAction::Approve => "approved",
            directors_view::SwipeAction::Reject => "rejected",
            directors_view::SwipeAction::Flag => "flagged",
        };

        sqlx::query(
            "INSERT INTO segment_approvals
                (segment_id, user_id, decision, segment_version)
             VALUES ($1, $2, $3, 1)",
        )
        .bind(item.target_id)
        .bind(auth.user_id)
        .bind(decision)
        .execute(&state.pool)
        .await?;
    }

    // Mark the created sync log entries as synced
    let synced_ids: Vec<DbId> = created.iter().map(|r| r.id).collect();
    if !synced_ids.is_empty() {
        OfflineSyncRepo::mark_synced(&state.pool, &synced_ids).await?;
    }

    let synced_count = created.len() as i64;

    tracing::info!(
        user_id = auth.user_id,
        synced = synced_count,
        conflicts = conflicts.len(),
        "Offline actions synced"
    );

    Ok(Json(DataResponse {
        data: SyncResponse {
            synced: synced_count,
            conflicts,
        },
    }))
}

/// Row type for fetching current remote state of segments.
#[derive(Debug, sqlx::FromRow)]
struct RemoteStateRow {
    target_id: DbId,
    status: String,
    updated_at: chrono::DateTime<chrono::Utc>,
}

/// GET /user/activity-feed
///
/// Simplified activity feed for mobile, showing the user's recent
/// review actions (from the offline sync log).
pub async fn get_mobile_activity_feed(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let _offset = clamp_offset(params.offset);

    let actions = OfflineSyncRepo::list_recent(&state.pool, auth.user_id, limit).await?;

    let feed: Vec<ActivityFeedEntry> = actions
        .into_iter()
        .map(|a| ActivityFeedEntry {
            id: a.id,
            action_type: a.action_type,
            target_id: a.target_id,
            synced: a.synced,
            client_timestamp: a.client_timestamp,
            created_at: a.created_at,
        })
        .collect();

    Ok(Json(DataResponse { data: feed }))
}
