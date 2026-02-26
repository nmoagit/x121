//! Handlers for audit logging & compliance endpoints (PRD-45).
//!
//! All endpoints require admin role.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::audit::compute_integrity_hash;
use x121_db::models::audit::{
    AuditLogPage, AuditQuery, IntegrityCheckResult, UpdateRetentionPolicy,
};
use x121_db::repositories::{AuditLogRepo, AuditRetentionPolicyRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for audit log queries.
#[derive(Debug, Deserialize)]
pub struct AuditLogQueryParams {
    pub user_id: Option<i64>,
    pub action_type: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub search_text: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for audit log export.
#[derive(Debug, Deserialize)]
pub struct ExportParams {
    pub from: Option<String>,
    pub to: Option<String>,
    pub format: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse an optional ISO 8601 date string, with a fallback.
fn parse_timestamp(
    s: &Option<String>,
    fallback: chrono::DateTime<chrono::Utc>,
) -> AppResult<chrono::DateTime<chrono::Utc>> {
    match s {
        Some(v) => v
            .parse::<chrono::DateTime<chrono::Utc>>()
            .map_err(|_| AppError::BadRequest("Invalid date format".into())),
        None => Ok(fallback),
    }
}

// ---------------------------------------------------------------------------
// Query audit logs
// ---------------------------------------------------------------------------

/// GET /admin/audit-logs
///
/// Query audit logs with filters and pagination. Admin only.
pub async fn query_audit_logs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<AuditLogQueryParams>,
) -> AppResult<impl IntoResponse> {
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

    let query = AuditQuery {
        user_id: params.user_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        from,
        to,
        search_text: params.search_text,
        limit: params.limit,
        offset: params.offset,
    };

    let logs = AuditLogRepo::query(&state.pool, &query).await?;
    let total = AuditLogRepo::count(&state.pool, &query).await?;

    Ok(Json(DataResponse {
        data: AuditLogPage { items: logs, total },
    }))
}

// ---------------------------------------------------------------------------
// Export audit logs
// ---------------------------------------------------------------------------

/// GET /admin/audit-logs/export?format=csv|json&from=X&to=Y
///
/// Export audit logs for a date range. Admin only.
pub async fn export_audit_logs(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ExportParams>,
) -> AppResult<impl IntoResponse> {
    let from = parse_timestamp(
        &params.from,
        chrono::Utc::now() - chrono::Duration::days(30),
    )?;
    let to = parse_timestamp(&params.to, chrono::Utc::now())?;

    let logs = AuditLogRepo::export_range(&state.pool, from, to).await?;

    let format = params.format.as_deref().unwrap_or("json");

    match format {
        "csv" => {
            // Build CSV output.
            let mut csv_output = String::from(
                "id,timestamp,user_id,session_id,action_type,entity_type,entity_id,ip_address,user_agent\n",
            );
            for log in &logs {
                csv_output.push_str(&format!(
                    "{},{},{},{},{},{},{},{},{}\n",
                    log.id,
                    log.timestamp.to_rfc3339(),
                    log.user_id.map_or(String::new(), |id| id.to_string()),
                    log.session_id.as_deref().unwrap_or(""),
                    log.action_type,
                    log.entity_type.as_deref().unwrap_or(""),
                    log.entity_id.map_or(String::new(), |id| id.to_string()),
                    log.ip_address.as_deref().unwrap_or(""),
                    log.user_agent.as_deref().unwrap_or(""),
                ));
            }

            Ok(axum::response::Response::builder()
                .status(200)
                .header("Content-Type", "text/csv")
                .header(
                    "Content-Disposition",
                    "attachment; filename=\"audit-logs.csv\"",
                )
                .body(axum::body::Body::from(csv_output))
                .unwrap()
                .into_response())
        }
        _ => {
            // Default: JSON export.
            Ok(Json(DataResponse { data: logs }).into_response())
        }
    }
}

// ---------------------------------------------------------------------------
// Integrity check
// ---------------------------------------------------------------------------

/// GET /admin/audit-logs/integrity-check
///
/// Run integrity verification on the audit log hash chain. Admin only.
pub async fn check_integrity(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let entries = AuditLogRepo::fetch_for_integrity_check(&state.pool, None, None).await?;

    let mut verified: i64 = 0;
    let mut prev_hash: Option<String> = None;
    let mut first_break: Option<i64> = None;

    for entry in &entries {
        // Build canonical entry data for hash computation.
        let entry_data = format!(
            "{}|{}|{}|{}|{}",
            entry.timestamp.to_rfc3339(),
            entry.user_id.map_or(String::new(), |id| id.to_string()),
            entry.action_type,
            entry.entity_type.as_deref().unwrap_or(""),
            entry.entity_id.map_or(String::new(), |id| id.to_string()),
        );

        let expected_hash = compute_integrity_hash(prev_hash.as_deref(), &entry_data);

        if let Some(ref stored_hash) = entry.integrity_hash {
            if *stored_hash != expected_hash {
                first_break = Some(entry.id);
                break;
            }
        }
        // Entries without a hash (e.g., legacy entries) are skipped in chain
        // validation but still counted.

        verified += 1;
        prev_hash = entry.integrity_hash.clone();
    }

    let result = IntegrityCheckResult {
        verified_entries: verified,
        chain_valid: first_break.is_none(),
        first_break,
    };

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// Retention policies
// ---------------------------------------------------------------------------

/// GET /admin/audit-logs/retention
///
/// List all retention policies. Admin only.
pub async fn list_retention_policies(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let policies = AuditRetentionPolicyRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: policies }))
}

/// PUT /admin/audit-logs/retention/{category}
///
/// Update a retention policy by category. Admin only.
pub async fn update_retention_policy(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(category): Path<String>,
    Json(input): Json<UpdateRetentionPolicy>,
) -> AppResult<impl IntoResponse> {
    // Validate retention days are positive if provided.
    if let Some(days) = input.active_retention_days {
        if days <= 0 {
            return Err(AppError::BadRequest(
                "active_retention_days must be positive".into(),
            ));
        }
    }
    if let Some(days) = input.archive_retention_days {
        if days <= 0 {
            return Err(AppError::BadRequest(
                "archive_retention_days must be positive".into(),
            ));
        }
    }

    let policy = AuditRetentionPolicyRepo::update(&state.pool, &category, &input)
        .await?
        .ok_or(AppError::BadRequest(format!(
            "Retention policy for category '{category}' not found"
        )))?;

    tracing::info!(
        category = %category,
        user_id = admin.user_id,
        "Audit retention policy updated",
    );

    Ok(Json(DataResponse { data: policy }))
}
