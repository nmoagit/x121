//! Handlers for the Bulk Character Onboarding Wizard (PRD-67).
//!
//! Provides endpoints for creating, advancing, navigating, and managing
//! onboarding wizard sessions that guide users through multi-step bulk
//! character onboarding.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::onboarding_wizard;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::onboarding_session::{
    CreateOnboardingSession, OnboardingSession, UpdateOnboardingStepData,
};
use x121_db::repositories::OnboardingSessionRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination parameters for listing sessions.
#[derive(Debug, Deserialize)]
pub struct ListSessionsParams {
    pub project_id: DbId,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that an onboarding session exists, returning the full row.
async fn ensure_session_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<OnboardingSession> {
    OnboardingSessionRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OnboardingSession",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /onboarding-sessions
// ---------------------------------------------------------------------------

/// Create a new onboarding wizard session for the authenticated user.
pub async fn create_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateOnboardingSession>,
) -> AppResult<impl IntoResponse> {
    let session = OnboardingSessionRepo::create(&state.pool, body.project_id, auth.user_id).await?;

    tracing::info!(
        session_id = session.id,
        project_id = body.project_id,
        user_id = auth.user_id,
        "Onboarding session created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: session })))
}

// ---------------------------------------------------------------------------
// GET /onboarding-sessions/{id}
// ---------------------------------------------------------------------------

/// Get a single onboarding session by ID.
pub async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: session }))
}

// ---------------------------------------------------------------------------
// POST /onboarding-sessions/{id}/advance
// ---------------------------------------------------------------------------

/// Advance the wizard to the next step.
///
/// Validates the current step's data before allowing advancement.
pub async fn advance_step(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;

    if session.status != onboarding_wizard::OnboardingStatus::InProgress.as_str() {
        return Err(AppError::Core(CoreError::Validation(
            "Cannot advance a session that is not in progress".to_string(),
        )));
    }

    let current = session.current_step as u8;
    let next = current + 1;

    // Validate step transition.
    onboarding_wizard::validate_step_transition(current, next)?;

    // Validate that current step data is sufficient to advance.
    onboarding_wizard::validate_step_data(current, &session.step_data)?;

    let updated = OnboardingSessionRepo::update_step(&state.pool, id, next as i32)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OnboardingSession",
                id,
            })
        })?;

    tracing::info!(
        session_id = id,
        from_step = current,
        to_step = next,
        "Onboarding session advanced"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /onboarding-sessions/{id}/go-back
// ---------------------------------------------------------------------------

/// Go back one step in the wizard.
pub async fn go_back(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;

    if session.status != onboarding_wizard::OnboardingStatus::InProgress.as_str() {
        return Err(AppError::Core(CoreError::Validation(
            "Cannot navigate a session that is not in progress".to_string(),
        )));
    }

    let current = session.current_step as u8;
    if current <= onboarding_wizard::MIN_STEP {
        return Err(AppError::Core(CoreError::Validation(
            "Already on the first step; cannot go back".to_string(),
        )));
    }

    let prev = current - 1;
    onboarding_wizard::validate_step_transition(current, prev)?;

    let updated = OnboardingSessionRepo::update_step(&state.pool, id, prev as i32)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OnboardingSession",
                id,
            })
        })?;

    tracing::info!(
        session_id = id,
        from_step = current,
        to_step = prev,
        "Onboarding session went back"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// PUT /onboarding-sessions/{id}/step-data
// ---------------------------------------------------------------------------

/// Update the step data for the current step.
pub async fn update_step_data(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateOnboardingStepData>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;

    if session.status != onboarding_wizard::OnboardingStatus::InProgress.as_str() {
        return Err(AppError::Core(CoreError::Validation(
            "Cannot update step data for a session that is not in progress".to_string(),
        )));
    }

    let updated = OnboardingSessionRepo::update_step_data(&state.pool, id, &body.step_data)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "OnboardingSession",
                id,
            })
        })?;

    tracing::info!(
        session_id = id,
        step = session.current_step,
        "Onboarding session step data updated"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /onboarding-sessions/{id}/abandon
// ---------------------------------------------------------------------------

/// Mark an onboarding session as abandoned.
pub async fn abandon_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;

    onboarding_wizard::can_abandon_session(&session.status)?;

    let updated = OnboardingSessionRepo::update_status(
        &state.pool,
        id,
        onboarding_wizard::OnboardingStatus::Abandoned.as_str(),
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "OnboardingSession",
            id,
        })
    })?;

    tracing::info!(
        session_id = id,
        user_id = auth.user_id,
        "Onboarding session abandoned"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /onboarding-sessions/{id}/complete
// ---------------------------------------------------------------------------

/// Mark an onboarding session as completed.
///
/// Only allowed when the session is on step 6 (Summary).
pub async fn complete_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let session = ensure_session_exists(&state.pool, id).await?;

    if session.status != onboarding_wizard::OnboardingStatus::InProgress.as_str() {
        return Err(AppError::Core(CoreError::Validation(
            "Cannot complete a session that is not in progress".to_string(),
        )));
    }

    onboarding_wizard::can_complete_session(session.current_step as u8)?;

    let updated = OnboardingSessionRepo::update_status(
        &state.pool,
        id,
        onboarding_wizard::OnboardingStatus::Completed.as_str(),
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "OnboardingSession",
            id,
        })
    })?;

    tracing::info!(
        session_id = id,
        user_id = auth.user_id,
        character_count = session.character_ids.len(),
        "Onboarding session completed"
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// GET /onboarding-sessions
// ---------------------------------------------------------------------------

/// List onboarding sessions for a project.
pub async fn list_sessions(
    State(state): State<AppState>,
    Query(params): Query<ListSessionsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 25, 100);
    let offset = clamp_offset(params.offset);

    let items =
        OnboardingSessionRepo::list_by_project(&state.pool, params.project_id, limit, offset)
            .await?;

    tracing::debug!(
        count = items.len(),
        project_id = params.project_id,
        "Listed onboarding sessions"
    );

    Ok(Json(DataResponse { data: items }))
}
