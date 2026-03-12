//! Handlers for the live activity console & logging system (PRD-118).
//!
//! REST endpoints for querying, exporting, and managing activity logs,
//! plus a WebSocket endpoint for real-time streaming.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use x121_core::activity::{
    ActivityLogCategory, ActivityLogEntry, ActivityLogLevel, ActivityLogSource,
};
use x121_db::models::activity_log::{ActivityLogPage, ActivityLogQuery, UpdateActivityLogSettings};
use x121_db::repositories::{ActivityLogRepo, ActivityLogSettingsRepo};

use x121_core::roles::ROLE_ADMIN;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::query::parse_timestamp;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// REST query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for activity log queries.
#[derive(Debug, Deserialize)]
pub struct ActivityLogQueryParams {
    pub level: Option<String>,
    pub source: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<i64>,
    pub job_id: Option<i64>,
    pub user_id: Option<i64>,
    pub project_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub search: Option<String>,
    pub mode: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for activity log export.
#[derive(Debug, Deserialize)]
pub struct ExportParams {
    pub from: Option<String>,
    pub to: Option<String>,
    pub format: Option<String>,
    pub level: Option<String>,
    pub source: Option<String>,
    pub mode: Option<String>,
}

/// Query parameters for manual purge.
#[derive(Debug, Deserialize)]
pub struct PurgeParams {
    pub before: String,
}

// ---------------------------------------------------------------------------
// WebSocket subscription types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct WsClientMessage {
    action: String,
    #[serde(default)]
    levels: Vec<String>,
    #[serde(default)]
    sources: Vec<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    entity_type: Option<String>,
    #[serde(default)]
    entity_id: Option<i64>,
    #[serde(default)]
    search: Option<String>,
}

/// Server-side filter state for a WebSocket subscription.
struct WsFilter {
    levels: Vec<ActivityLogLevel>,
    sources: Vec<ActivityLogSource>,
    mode: Option<ActivityLogCategory>,
    entity_type: Option<String>,
    entity_id: Option<i64>,
    search: Option<String>,
}

impl WsFilter {
    fn from_message(msg: &WsClientMessage) -> Self {
        Self {
            levels: msg
                .levels
                .iter()
                .filter_map(|s| ActivityLogLevel::from_str(s))
                .collect(),
            sources: msg
                .sources
                .iter()
                .filter_map(|s| ActivityLogSource::from_str(s))
                .collect(),
            mode: msg.mode.as_deref().and_then(ActivityLogCategory::from_str),
            entity_type: msg.entity_type.clone(),
            entity_id: msg.entity_id,
            search: msg.search.clone(),
        }
    }

    fn matches(&self, entry: &ActivityLogEntry) -> bool {
        if !self.levels.is_empty() && !self.levels.contains(&entry.level) {
            return false;
        }
        if !self.sources.is_empty() && !self.sources.contains(&entry.source) {
            return false;
        }
        if let Some(ref mode) = self.mode {
            if entry.category != *mode {
                return false;
            }
        }
        if let Some(ref et) = self.entity_type {
            if entry.entity_type.as_deref() != Some(et.as_str()) {
                return false;
            }
        }
        if let Some(eid) = self.entity_id {
            if entry.entity_id != Some(eid) {
                return false;
            }
        }
        if let Some(ref search) = self.search {
            if !entry
                .message
                .to_lowercase()
                .contains(&search.to_lowercase())
            {
                return false;
            }
        }
        true
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an `ActivityLogQuery` from REST query parameters.
fn build_query(params: &ActivityLogQueryParams) -> AppResult<ActivityLogQuery> {
    let from = if params.from.is_some() {
        Some(parse_timestamp(&params.from, chrono::Utc::now())?)
    } else {
        None
    };
    let to = if params.to.is_some() {
        Some(parse_timestamp(&params.to, chrono::Utc::now())?)
    } else {
        None
    };

    Ok(ActivityLogQuery {
        level: params.level.clone(),
        source: params.source.clone(),
        entity_type: params.entity_type.clone(),
        entity_id: params.entity_id,
        job_id: params.job_id,
        user_id: params.user_id,
        project_id: params.project_id,
        from,
        to,
        search: params.search.clone(),
        mode: params.mode.clone(),
        limit: params.limit,
        offset: params.offset,
    })
}

// ---------------------------------------------------------------------------
// REST handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/activity-logs
///
/// Query persisted activity log entries with filters. Role-based scoping applied.
pub async fn query_activity_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ActivityLogQueryParams>,
) -> AppResult<impl IntoResponse> {
    let mut query = build_query(&params)?;

    // Role-based scoping: non-admin users only see their own entries.
    if auth.role != ROLE_ADMIN {
        query.user_id = Some(auth.user_id);
    }

    let items = ActivityLogRepo::query(&state.pool, &query).await?;
    let total = ActivityLogRepo::count(&state.pool, &query).await?;

    Ok(Json(DataResponse {
        data: ActivityLogPage { items, total },
    }))
}

/// GET /api/v1/activity-logs/export
///
/// Export activity log entries as JSON or plain text.
pub async fn export_activity_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ExportParams>,
) -> AppResult<impl IntoResponse> {
    let from = parse_timestamp(&params.from, chrono::Utc::now() - chrono::Duration::days(7))?;
    let to = parse_timestamp(&params.to, chrono::Utc::now())?;

    let mut query = ActivityLogQuery {
        level: params.level,
        source: params.source,
        mode: params.mode,
        ..Default::default()
    };

    if auth.role != ROLE_ADMIN {
        query.user_id = Some(auth.user_id);
    }

    let logs = ActivityLogRepo::export_range(&state.pool, from, to, &query).await?;

    let format = params.format.as_deref().unwrap_or("json");
    match format {
        "text" => {
            let mut output = String::new();
            for log in &logs {
                output.push_str(&format!(
                    "[{}] [{}] [{}] {}\n",
                    log.timestamp.to_rfc3339(),
                    log.level_id,
                    log.source_id,
                    log.message,
                ));
            }

            Ok(axum::response::Response::builder()
                .status(200)
                .header("Content-Type", "text/plain")
                .header(
                    "Content-Disposition",
                    "attachment; filename=\"activity-logs.txt\"",
                )
                .body(axum::body::Body::from(output))
                .unwrap()
                .into_response())
        }
        _ => Ok(Json(DataResponse { data: logs }).into_response()),
    }
}

/// GET /api/v1/admin/activity-logs/settings
///
/// Get current activity log retention/batch settings. Admin only.
pub async fn get_settings(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let settings = ActivityLogSettingsRepo::get(&state.pool).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/admin/activity-logs/settings
///
/// Update activity log retention/batch settings. Admin only.
pub async fn update_settings(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
    Json(input): Json<UpdateActivityLogSettings>,
) -> AppResult<impl IntoResponse> {
    // Validate minimum retention values.
    if let Some(days) = input.retention_days_debug {
        if days < 1 {
            return Err(AppError::BadRequest(
                "retention_days_debug must be at least 1".into(),
            ));
        }
    }
    if let Some(days) = input.retention_days_info {
        if days < 1 {
            return Err(AppError::BadRequest(
                "retention_days_info must be at least 1".into(),
            ));
        }
    }
    if let Some(days) = input.retention_days_warn {
        if days < 1 {
            return Err(AppError::BadRequest(
                "retention_days_warn must be at least 1".into(),
            ));
        }
    }
    if let Some(days) = input.retention_days_error {
        if days < 7 {
            return Err(AppError::BadRequest(
                "retention_days_error must be at least 7".into(),
            ));
        }
    }
    if let Some(batch_size) = input.batch_size {
        if batch_size < 1 || batch_size > 10000 {
            return Err(AppError::BadRequest(
                "batch_size must be between 1 and 10000".into(),
            ));
        }
    }
    if let Some(flush_ms) = input.flush_interval_ms {
        if flush_ms < 100 || flush_ms > 60000 {
            return Err(AppError::BadRequest(
                "flush_interval_ms must be between 100 and 60000".into(),
            ));
        }
    }

    let settings = ActivityLogSettingsRepo::update(&state.pool, &input).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// DELETE /api/v1/admin/activity-logs
///
/// Manual purge of entries older than a specified date. Admin only.
pub async fn manual_purge(
    State(state): State<AppState>,
    RequireAdmin(_): RequireAdmin,
    Query(params): Query<PurgeParams>,
) -> AppResult<impl IntoResponse> {
    let cutoff = params
        .before
        .parse::<chrono::DateTime<chrono::Utc>>()
        .map_err(|_| AppError::BadRequest("Invalid 'before' date format".into()))?;

    // Purge all levels up to the cutoff.
    let mut total_deleted: u64 = 0;
    for level_id in 1..=4i16 {
        let deleted = ActivityLogRepo::delete_older_than(&state.pool, level_id, cutoff).await?;
        total_deleted += deleted;
    }

    #[derive(Serialize)]
    struct PurgeResult {
        deleted: u64,
        cutoff: String,
    }

    Ok(Json(DataResponse {
        data: PurgeResult {
            deleted: total_deleted,
            cutoff: cutoff.to_rfc3339(),
        },
    }))
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

/// WS /ws/activity-logs
///
/// Real-time streaming of activity log entries with per-client filtering.
pub async fn ws_activity_logs(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: AuthUser,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_activity_ws(socket, state, auth))
}

async fn handle_activity_ws(socket: WebSocket, state: AppState, auth: AuthUser) {
    let conn_id = uuid::Uuid::new_v4().to_string();
    let is_admin = auth.role == ROLE_ADMIN;

    tracing::info!(
        conn_id = %conn_id,
        user_id = auth.user_id,
        "Activity console WebSocket connected"
    );

    // Publish a curated entry about the connection.
    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            "Activity console WebSocket connected",
        )
        .with_user(auth.user_id),
    );

    let mut rx = state.activity_broadcaster.subscribe();
    let (mut sink, mut stream) = socket.split();

    // Default filter: all levels, all sources, no mode restriction (show everything).
    let mut filter = WsFilter {
        levels: vec![
            ActivityLogLevel::Info,
            ActivityLogLevel::Warn,
            ActivityLogLevel::Error,
        ],
        sources: vec![],
        mode: None,
        entity_type: None,
        entity_id: None,
        search: None,
    };

    loop {
        tokio::select! {
            // Inbound: client messages (subscribe, update_filter).
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(client_msg) = serde_json::from_str::<WsClientMessage>(&text) {
                            match client_msg.action.as_str() {
                                "subscribe" | "update_filter" => {
                                    filter = WsFilter::from_message(&client_msg);
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        tracing::debug!(conn_id = %conn_id, error = %e, "Activity WS receive error");
                        break;
                    }
                    _ => {}
                }
            }

            // Outbound: broadcast entries.
            result = rx.recv() => {
                match result {
                    Ok(entry) => {
                        // Role-based scoping.
                        if !is_admin {
                            let visible = entry.user_id == Some(auth.user_id)
                                || entry.user_id.is_none() && entry.project_id.is_none();
                            if !visible {
                                continue;
                            }
                        }

                        if !filter.matches(&entry) {
                            continue;
                        }

                        let payload = serde_json::json!({
                            "type": "entry",
                            "timestamp": entry.timestamp.to_rfc3339(),
                            "level": entry.level,
                            "source": entry.source,
                            "message": entry.message,
                            "fields": entry.fields,
                            "category": entry.category,
                            "entity_type": entry.entity_type,
                            "entity_id": entry.entity_id,
                            "user_id": entry.user_id,
                            "job_id": entry.job_id,
                            "project_id": entry.project_id,
                            "trace_id": entry.trace_id,
                        });

                        let msg = Message::Text(payload.to_string().into());
                        if sink.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        let msg = serde_json::json!({
                            "type": "lagged",
                            "skipped": n,
                        });
                        let _ = sink.send(Message::Text(msg.to_string().into())).await;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    // Publish a curated entry about disconnection.
    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            "Activity console WebSocket disconnected",
        )
        .with_user(auth.user_id),
    );

    tracing::info!(
        conn_id = %conn_id,
        user_id = auth.user_id,
        "Activity console WebSocket disconnected"
    );
}
