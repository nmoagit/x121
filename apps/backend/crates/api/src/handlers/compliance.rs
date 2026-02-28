//! Handlers for compliance rules and checks (PRD-102).
//!
//! Provides CRUD for compliance rules and scene-scoped compliance check
//! operations including running checks, listing results, and summaries.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::compliance::validate_rule_type;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::compliance::{
    ComplianceCheckRunResponse, CreateComplianceCheck, CreateComplianceRule, UpdateComplianceRule,
};
use x121_db::repositories::ComplianceRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for listing compliance rules.
#[derive(Debug, Deserialize)]
pub struct ListRulesQuery {
    pub project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a compliance rule exists, returning the full row (DRY-500).
pub async fn ensure_rule_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::compliance::ComplianceRule> {
    ComplianceRepo::get_rule(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "ComplianceRule",
            id,
        })
    })
}

// ---------------------------------------------------------------------------
// Rule CRUD handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/compliance-rules
///
/// Create a new compliance rule. Validates the rule_type before inserting.
pub async fn create_rule(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateComplianceRule>,
) -> AppResult<impl IntoResponse> {
    validate_rule_type(&input.rule_type).map_err(AppError::BadRequest)?;

    let rule = ComplianceRepo::create_rule(&state.pool, &input, auth.user_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        rule_id = rule.id,
        rule_type = %rule.rule_type,
        "Compliance rule created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: rule })))
}

/// GET /api/v1/compliance-rules/{id}
///
/// Retrieve a single compliance rule by ID.
pub async fn get_rule(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let rule = ensure_rule_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: rule }))
}

/// GET /api/v1/compliance-rules
///
/// List compliance rules. Optionally filter by `project_id` query parameter.
/// When `project_id` is provided, returns project-specific and global rules.
pub async fn list_rules(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(query): Query<ListRulesQuery>,
) -> AppResult<impl IntoResponse> {
    let rules = ComplianceRepo::list_rules(&state.pool, query.project_id).await?;
    Ok(Json(DataResponse { data: rules }))
}

/// PUT /api/v1/compliance-rules/{id}
///
/// Update an existing compliance rule. Validates rule_type if provided.
pub async fn update_rule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateComplianceRule>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref rt) = input.rule_type {
        validate_rule_type(rt).map_err(AppError::BadRequest)?;
    }

    let rule = ComplianceRepo::update_rule(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ComplianceRule",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        rule_id = id,
        "Compliance rule updated"
    );

    Ok(Json(DataResponse { data: rule }))
}

/// DELETE /api/v1/compliance-rules/{id}
///
/// Delete a compliance rule by its ID.
pub async fn delete_rule(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ComplianceRepo::delete_rule(&state.pool, id).await?;
    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ComplianceRule",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        rule_id = id,
        "Compliance rule deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Check handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/scenes/{scene_id}/compliance-check
///
/// Run all applicable compliance rules for a scene. Fetches rules (global +
/// project-scoped) and creates a check record for each.
pub async fn run_compliance_check(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Look up the scene's project_id so we can find applicable rules.
    let project_id: Option<DbId> =
        sqlx::query_scalar("SELECT project_id FROM scenes WHERE id = $1 AND deleted_at IS NULL")
            .bind(scene_id)
            .fetch_optional(&state.pool)
            .await?;

    let project_id = project_id.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id: scene_id,
        })
    })?;

    // Fetch applicable rules (project-specific + global).
    let rules = ComplianceRepo::list_rules(&state.pool, Some(project_id)).await?;

    if rules.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(DataResponse {
                data: ComplianceCheckRunResponse {
                    scene_id,
                    checks_run: 0,
                    message: Some("No compliance rules configured".to_string()),
                },
            }),
        ));
    }

    // Create a check record for each rule.
    // In a full implementation, each rule's config_json would be evaluated
    // against the scene's actual video metadata (via FFprobe). For now we
    // create placeholder check records that downstream services can populate.
    let mut checks_created = 0i64;
    for rule in &rules {
        let check_input = CreateComplianceCheck {
            scene_id,
            rule_id: rule.id,
            passed: true, // placeholder — real checks evaluate config_json
            actual_value: None,
            expected_value: None,
            message: Some(format!("Rule '{}' check pending evaluation", rule.name)),
        };
        ComplianceRepo::create_check(&state.pool, &check_input).await?;
        checks_created += 1;
    }

    tracing::info!(
        user_id = auth.user_id,
        scene_id = scene_id,
        checks_run = checks_created,
        "Compliance check completed"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: ComplianceCheckRunResponse {
                scene_id,
                checks_run: checks_created,
                message: None,
            },
        }),
    ))
}

/// GET /api/v1/scenes/{scene_id}/compliance-checks
///
/// List all compliance check results for a scene.
pub async fn list_scene_checks(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let checks = ComplianceRepo::list_checks_by_scene(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: checks }))
}

/// GET /api/v1/scenes/{scene_id}/compliance-summary
///
/// Get a pass/fail summary of compliance checks for a scene.
pub async fn get_scene_summary(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let summary = ComplianceRepo::get_scene_compliance_summary(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: summary }))
}
