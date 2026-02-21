//! Repository for the `dashboard_configs` table (PRD-42).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::dashboard::{DashboardConfig, SaveDashboardConfig};

/// Column list for `dashboard_configs` queries.
const COLUMNS: &str =
    "id, user_id, layout_json, widget_settings_json, created_at, updated_at";

/// Provides CRUD operations for per-user dashboard configuration.
pub struct DashboardRepo;

impl DashboardRepo {
    /// Find a user's dashboard config. Returns `None` if no config exists yet.
    pub async fn find_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<DashboardConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM dashboard_configs WHERE user_id = $1"
        );
        sqlx::query_as::<_, DashboardConfig>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a user's dashboard config. Creates if absent, updates if exists.
    ///
    /// Uses `ON CONFLICT (user_id) DO UPDATE` to guarantee one row per user.
    pub async fn upsert(
        pool: &PgPool,
        user_id: DbId,
        input: &SaveDashboardConfig,
    ) -> Result<DashboardConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO dashboard_configs (user_id, layout_json, widget_settings_json) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (user_id) DO UPDATE \
             SET layout_json = EXCLUDED.layout_json, \
                 widget_settings_json = EXCLUDED.widget_settings_json \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DashboardConfig>(&query)
            .bind(user_id)
            .bind(&input.layout_json)
            .bind(&input.widget_settings_json)
            .fetch_one(pool)
            .await
    }
}
