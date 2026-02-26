//! Repository for the `user_keymaps` table (PRD-52).
//!
//! Provides CRUD operations for per-user keyboard shortcut presets
//! and custom binding overrides.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::keymap::{UpsertKeymap, UserKeymap};

/// Column list for `user_keymaps` queries.
const COLUMNS: &str = "\
    id, user_id, active_preset, custom_bindings_json, \
    created_at, updated_at";

/// Provides data access for user keymaps.
pub struct KeymapRepo;

impl KeymapRepo {
    /// Get the keymap for a specific user.
    ///
    /// Returns `None` if the user has never saved a keymap.
    pub async fn get_keymap(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserKeymap>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM user_keymaps WHERE user_id = $1");
        sqlx::query_as::<_, UserKeymap>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Insert or update a user's keymap.
    ///
    /// Uses `ON CONFLICT (user_id) DO UPDATE` so only provided fields
    /// are changed (falls back to existing values via `COALESCE`).
    pub async fn upsert_keymap(
        pool: &PgPool,
        user_id: DbId,
        dto: &UpsertKeymap,
    ) -> Result<UserKeymap, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_keymaps \
                 (user_id, active_preset, custom_bindings_json) \
             VALUES ($1, COALESCE($2, 'default'), COALESCE($3, '{{}}')) \
             ON CONFLICT (user_id) DO UPDATE SET \
                 active_preset = COALESCE($2, user_keymaps.active_preset), \
                 custom_bindings_json = COALESCE($3, user_keymaps.custom_bindings_json) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserKeymap>(&query)
            .bind(user_id)
            .bind(&dto.active_preset)
            .bind(&dto.custom_bindings_json)
            .fetch_one(pool)
            .await
    }
}
