//! Repository for the `user_onboarding` table (PRD-53).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::onboarding::{UpdateOnboarding, UserOnboarding};

/// Column list for `user_onboarding` queries.
const COLUMNS: &str = "\
    id, user_id, tour_completed, hints_dismissed_json, \
    checklist_progress_json, feature_reveal_json, \
    sample_project_id, created_at, updated_at";

/// Provides CRUD operations for user onboarding state.
pub struct OnboardingRepo;

impl OnboardingRepo {
    /// Get the onboarding record for a user, creating one with defaults if
    /// it does not exist yet (upsert pattern).
    ///
    /// Uses a no-op `DO UPDATE` to guarantee `RETURNING` always produces a
    /// row, matching the established pattern in `workspace_repo.rs`.
    pub async fn get_or_create(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<UserOnboarding, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_onboarding (user_id) \
             VALUES ($1) \
             ON CONFLICT (user_id) DO UPDATE SET user_id = user_onboarding.user_id \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserOnboarding>(&query)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Partial update of onboarding state for a user.
    ///
    /// - `tour_completed` is SET directly.
    /// - JSONB fields are merged with the existing value using `||` (concatenation).
    /// - `hints_dismissed_json` merges the provided array into the existing array.
    /// - `checklist_progress_json` and `feature_reveal_json` merge objects.
    pub async fn update(
        pool: &PgPool,
        user_id: DbId,
        input: &UpdateOnboarding,
    ) -> Result<UserOnboarding, sqlx::Error> {
        let mut set_clauses: Vec<String> = Vec::new();
        let mut param_idx: usize = 2; // $1 is user_id

        // We build the SET clause dynamically based on which fields are present.
        if input.tour_completed.is_some() {
            set_clauses.push(format!("tour_completed = ${param_idx}"));
            param_idx += 1;
        }
        if input.hints_dismissed_json.is_some() {
            // Merge: take the union of old and new arrays via jsonb concatenation,
            // then deduplicate with a subquery.
            set_clauses.push(format!(
                "hints_dismissed_json = (\
                    SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb) \
                    FROM jsonb_array_elements(hints_dismissed_json || ${param_idx}) AS elem\
                )"
            ));
            param_idx += 1;
        }
        if input.checklist_progress_json.is_some() {
            set_clauses.push(format!(
                "checklist_progress_json = checklist_progress_json || ${param_idx}"
            ));
            param_idx += 1;
        }
        if input.feature_reveal_json.is_some() {
            set_clauses.push(format!(
                "feature_reveal_json = feature_reveal_json || ${param_idx}"
            ));
            // No need to increment — this is the last possible parameter.
            let _ = param_idx;
        }

        if set_clauses.is_empty() {
            // Nothing to update — just return current state.
            let select = format!("SELECT {COLUMNS} FROM user_onboarding WHERE user_id = $1");
            return sqlx::query_as::<_, UserOnboarding>(&select)
                .bind(user_id)
                .fetch_one(pool)
                .await;
        }

        let query = format!(
            "UPDATE user_onboarding SET {} WHERE user_id = $1 RETURNING {COLUMNS}",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, UserOnboarding>(&query).bind(user_id);

        if let Some(ref tc) = input.tour_completed {
            q = q.bind(tc);
        }
        if let Some(ref hints) = input.hints_dismissed_json {
            q = q.bind(serde_json::to_value(hints).unwrap_or_default());
        }
        if let Some(ref checklist) = input.checklist_progress_json {
            q = q.bind(serde_json::to_value(checklist).unwrap_or_default());
        }
        if let Some(ref features) = input.feature_reveal_json {
            q = q.bind(serde_json::to_value(features).unwrap_or_default());
        }

        q.fetch_one(pool).await
    }

    /// Reset all onboarding progress to defaults for a user.
    pub async fn reset(pool: &PgPool, user_id: DbId) -> Result<UserOnboarding, sqlx::Error> {
        let query = format!(
            "UPDATE user_onboarding \
             SET tour_completed = FALSE, \
                 hints_dismissed_json = '[]'::jsonb, \
                 checklist_progress_json = '{{}}'::jsonb, \
                 feature_reveal_json = '{{}}'::jsonb, \
                 sample_project_id = NULL \
             WHERE user_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserOnboarding>(&query)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Set the sample project FK for a user's onboarding record.
    pub async fn set_sample_project(
        pool: &PgPool,
        user_id: DbId,
        project_id: DbId,
    ) -> Result<UserOnboarding, sqlx::Error> {
        let query = format!(
            "UPDATE user_onboarding SET sample_project_id = $2 \
             WHERE user_id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserOnboarding>(&query)
            .bind(user_id)
            .bind(project_id)
            .fetch_one(pool)
            .await
    }

    /// Clear the sample project FK for a user's onboarding record.
    pub async fn clear_sample_project(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<UserOnboarding, sqlx::Error> {
        let query = format!(
            "UPDATE user_onboarding SET sample_project_id = NULL \
             WHERE user_id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserOnboarding>(&query)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }
}
