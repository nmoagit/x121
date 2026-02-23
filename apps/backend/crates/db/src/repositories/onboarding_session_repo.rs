//! Repository for the `onboarding_sessions` table (PRD-67).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::onboarding_session::OnboardingSession;

/// Column list for `onboarding_sessions` queries.
const COLUMNS: &str = "id, project_id, created_by_id, current_step, step_data, \
     character_ids, status, created_at, updated_at";

/// Provides CRUD operations for onboarding sessions.
pub struct OnboardingSessionRepo;

impl OnboardingSessionRepo {
    /// Insert a new onboarding session.
    pub async fn create(
        pool: &PgPool,
        project_id: DbId,
        created_by_id: DbId,
    ) -> Result<OnboardingSession, sqlx::Error> {
        let query = format!(
            "INSERT INTO onboarding_sessions (project_id, created_by_id) \
             VALUES ($1, $2) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(project_id)
            .bind(created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find an onboarding session by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<OnboardingSession>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM onboarding_sessions WHERE id = $1");
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find in-progress sessions for a user in a project.
    pub async fn find_by_project_and_user(
        pool: &PgPool,
        project_id: DbId,
        user_id: DbId,
    ) -> Result<Vec<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM onboarding_sessions \
             WHERE project_id = $1 AND created_by_id = $2 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(project_id)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Update the current step of a session.
    pub async fn update_step(
        pool: &PgPool,
        id: DbId,
        step: i32,
    ) -> Result<Option<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "UPDATE onboarding_sessions SET current_step = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(id)
            .bind(step)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of a session.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<Option<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "UPDATE onboarding_sessions SET status = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(id)
            .bind(status)
            .fetch_optional(pool)
            .await
    }

    /// Update the step data for a session.
    pub async fn update_step_data(
        pool: &PgPool,
        id: DbId,
        step_data: &serde_json::Value,
    ) -> Result<Option<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "UPDATE onboarding_sessions SET step_data = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(id)
            .bind(step_data)
            .fetch_optional(pool)
            .await
    }

    /// Append character IDs to the session's character_ids array.
    pub async fn add_character_ids(
        pool: &PgPool,
        id: DbId,
        character_ids: &[DbId],
    ) -> Result<Option<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "UPDATE onboarding_sessions \
             SET character_ids = character_ids || $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(id)
            .bind(character_ids)
            .fetch_optional(pool)
            .await
    }

    /// List sessions for a project, ordered by most recent first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<OnboardingSession>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM onboarding_sessions \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, OnboardingSession>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count sessions for a project.
    pub async fn count_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM onboarding_sessions WHERE project_id = $1")
                .bind(project_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}
