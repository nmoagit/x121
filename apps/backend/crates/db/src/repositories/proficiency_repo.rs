//! Repository for the `user_proficiency` and `user_focus_preferences` tables (PRD-32).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::proficiency::{UserFocusPreference, UserProficiency};

/// Column list for `user_proficiency` queries.
const PROF_COLUMNS: &str =
    "id, user_id, feature_area, proficiency_level, usage_count, manual_override, created_at, updated_at";

/// Column list for `user_focus_preferences` queries.
const FOCUS_COLUMNS: &str = "id, user_id, focus_mode, created_at, updated_at";

/// Usage-count threshold at which a user is promoted from beginner to intermediate.
const INTERMEDIATE_THRESHOLD: i32 = 20;

/// Usage-count threshold at which a user is promoted from intermediate to expert.
const EXPERT_THRESHOLD: i32 = 100;

/// Provides CRUD operations for user proficiency tracking and focus preferences.
pub struct ProficiencyRepo;

impl ProficiencyRepo {
    /// List all proficiency records for a user, ordered by feature area.
    pub async fn get_all_proficiency(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<UserProficiency>, sqlx::Error> {
        let query = format!(
            "SELECT {PROF_COLUMNS} FROM user_proficiency \
             WHERE user_id = $1 \
             ORDER BY feature_area"
        );
        sqlx::query_as::<_, UserProficiency>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Record a feature usage event.
    ///
    /// Inserts or increments `usage_count` for the given feature area. When
    /// `manual_override` is false, the proficiency level is auto-promoted at
    /// configured thresholds (beginner -> intermediate at 20, intermediate ->
    /// expert at 100).
    pub async fn record_feature_usage(
        pool: &PgPool,
        user_id: DbId,
        feature_area: &str,
    ) -> Result<UserProficiency, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_proficiency (user_id, feature_area, usage_count) \
             VALUES ($1, $2, 1) \
             ON CONFLICT (user_id, feature_area) DO UPDATE SET \
                 usage_count = user_proficiency.usage_count + 1, \
                 proficiency_level = CASE \
                     WHEN user_proficiency.manual_override THEN user_proficiency.proficiency_level \
                     WHEN user_proficiency.usage_count + 1 >= $3 THEN 'expert' \
                     WHEN user_proficiency.usage_count + 1 >= $4 THEN 'intermediate' \
                     ELSE user_proficiency.proficiency_level \
                 END \
             RETURNING {PROF_COLUMNS}"
        );
        sqlx::query_as::<_, UserProficiency>(&query)
            .bind(user_id)
            .bind(feature_area)
            .bind(EXPERT_THRESHOLD)
            .bind(INTERMEDIATE_THRESHOLD)
            .fetch_one(pool)
            .await
    }

    /// Manually set a user's proficiency level for a feature area.
    ///
    /// Sets `manual_override = true` so that auto-promotion from usage
    /// tracking is disabled for this feature area.
    pub async fn set_proficiency(
        pool: &PgPool,
        user_id: DbId,
        feature_area: &str,
        level: &str,
    ) -> Result<UserProficiency, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_proficiency (user_id, feature_area, proficiency_level, manual_override) \
             VALUES ($1, $2, $3, TRUE) \
             ON CONFLICT (user_id, feature_area) DO UPDATE SET \
                 proficiency_level = EXCLUDED.proficiency_level, \
                 manual_override = TRUE \
             RETURNING {PROF_COLUMNS}"
        );
        sqlx::query_as::<_, UserProficiency>(&query)
            .bind(user_id)
            .bind(feature_area)
            .bind(level)
            .fetch_one(pool)
            .await
    }

    /// Get the user's focus mode preference.
    pub async fn get_focus_preference(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserFocusPreference>, sqlx::Error> {
        let query =
            format!("SELECT {FOCUS_COLUMNS} FROM user_focus_preferences WHERE user_id = $1");
        sqlx::query_as::<_, UserFocusPreference>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Set (upsert) the user's focus mode preference.
    pub async fn set_focus_preference(
        pool: &PgPool,
        user_id: DbId,
        focus_mode: Option<&str>,
    ) -> Result<UserFocusPreference, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_focus_preferences (user_id, focus_mode) \
             VALUES ($1, $2) \
             ON CONFLICT (user_id) DO UPDATE SET \
                 focus_mode = EXCLUDED.focus_mode \
             RETURNING {FOCUS_COLUMNS}"
        );
        sqlx::query_as::<_, UserFocusPreference>(&query)
            .bind(user_id)
            .bind(focus_mode)
            .fetch_one(pool)
            .await
    }
}
