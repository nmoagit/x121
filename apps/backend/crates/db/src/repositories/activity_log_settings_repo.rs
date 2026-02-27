//! Repository for the `activity_log_settings` singleton table (PRD-118).

use sqlx::PgPool;

use crate::models::activity_log::{ActivityLogSettings, UpdateActivityLogSettings};

/// Column list for `activity_log_settings` SELECT queries.
const COLUMNS: &str = "\
    id, retention_days_debug, retention_days_info, retention_days_warn, \
    retention_days_error, batch_size, flush_interval_ms, created_at, updated_at";

/// Provides get and update operations for the activity log settings singleton.
pub struct ActivityLogSettingsRepo;

impl ActivityLogSettingsRepo {
    /// Get the current settings (singleton row id=1).
    pub async fn get(pool: &PgPool) -> Result<ActivityLogSettings, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM activity_log_settings WHERE id = 1");
        sqlx::query_as::<_, ActivityLogSettings>(&query)
            .fetch_one(pool)
            .await
    }

    /// Update settings (partial update, only non-None fields).
    pub async fn update(
        pool: &PgPool,
        dto: &UpdateActivityLogSettings,
    ) -> Result<ActivityLogSettings, sqlx::Error> {
        let mut sets: Vec<String> = Vec::new();
        let mut bind_idx = 1u32;
        let mut bind_values: Vec<SettingsBindValue> = Vec::new();

        if let Some(v) = dto.retention_days_debug {
            sets.push(format!("retention_days_debug = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if let Some(v) = dto.retention_days_info {
            sets.push(format!("retention_days_info = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if let Some(v) = dto.retention_days_warn {
            sets.push(format!("retention_days_warn = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if let Some(v) = dto.retention_days_error {
            sets.push(format!("retention_days_error = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if let Some(v) = dto.batch_size {
            sets.push(format!("batch_size = ${bind_idx}"));
            bind_idx += 1;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if let Some(v) = dto.flush_interval_ms {
            sets.push(format!("flush_interval_ms = ${bind_idx}"));
            let _ = bind_idx;
            bind_values.push(SettingsBindValue::Int(v));
        }

        if sets.is_empty() {
            return Self::get(pool).await;
        }

        let query = format!(
            "UPDATE activity_log_settings SET {} WHERE id = 1 RETURNING {COLUMNS}",
            sets.join(", ")
        );

        let mut q = sqlx::query_as::<_, ActivityLogSettings>(&query);
        for val in &bind_values {
            match val {
                SettingsBindValue::Int(v) => q = q.bind(*v),
            }
        }

        q.fetch_one(pool).await
    }
}

/// Typed bind value for dynamically-built settings queries.
enum SettingsBindValue {
    Int(i32),
}
