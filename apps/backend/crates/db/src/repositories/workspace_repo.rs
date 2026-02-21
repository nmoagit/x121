//! Repository for `workspace_states` and `undo_snapshots` tables (PRD-04).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::workspace::{UndoSnapshot, UpdateWorkspaceState, WorkspaceState};

// ---------------------------------------------------------------------------
// WorkspaceRepo
// ---------------------------------------------------------------------------

/// Column list for `workspace_states` queries.
const WS_COLUMNS: &str =
    "id, user_id, device_type, layout_state, navigation_state, preferences, created_at, updated_at";

/// Provides CRUD operations for per-user, per-device workspace state.
pub struct WorkspaceRepo;

impl WorkspaceRepo {
    /// Get a user's workspace state for the given device type.
    /// Creates a default row if none exists (upsert with defaults).
    pub async fn get_or_create(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
    ) -> Result<WorkspaceState, sqlx::Error> {
        let query = format!(
            "INSERT INTO workspace_states (user_id, device_type) \
             VALUES ($1, $2) \
             ON CONFLICT (user_id, device_type) DO UPDATE SET user_id = workspace_states.user_id \
             RETURNING {WS_COLUMNS}"
        );
        sqlx::query_as::<_, WorkspaceState>(&query)
            .bind(user_id)
            .bind(device_type)
            .fetch_one(pool)
            .await
    }

    /// Partially update a workspace state. Only non-`None` fields are merged
    /// using PostgreSQL `||` JSONB concatenation for deep merge.
    pub async fn update(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
        input: &UpdateWorkspaceState,
    ) -> Result<WorkspaceState, sqlx::Error> {
        let query = format!(
            "UPDATE workspace_states SET \
                 layout_state = CASE WHEN $3::jsonb IS NOT NULL THEN layout_state || $3 ELSE layout_state END, \
                 navigation_state = CASE WHEN $4::jsonb IS NOT NULL THEN navigation_state || $4 ELSE navigation_state END, \
                 preferences = CASE WHEN $5::jsonb IS NOT NULL THEN preferences || $5 ELSE preferences END \
             WHERE user_id = $1 AND device_type = $2 \
             RETURNING {WS_COLUMNS}"
        );
        sqlx::query_as::<_, WorkspaceState>(&query)
            .bind(user_id)
            .bind(device_type)
            .bind(&input.layout_state)
            .bind(&input.navigation_state)
            .bind(&input.preferences)
            .fetch_one(pool)
            .await
    }

    /// Reset all state fields to empty JSON defaults.
    pub async fn reset_to_default(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
    ) -> Result<WorkspaceState, sqlx::Error> {
        let query = format!(
            "UPDATE workspace_states \
             SET layout_state = '{{}}', navigation_state = '{{}}', preferences = '{{}}' \
             WHERE user_id = $1 AND device_type = $2 \
             RETURNING {WS_COLUMNS}"
        );
        sqlx::query_as::<_, WorkspaceState>(&query)
            .bind(user_id)
            .bind(device_type)
            .fetch_one(pool)
            .await
    }

    /// Delete a workspace state row (used when a user wants a full clean start).
    pub async fn delete(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM workspace_states WHERE user_id = $1 AND device_type = $2",
        )
        .bind(user_id)
        .bind(device_type)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}

// ---------------------------------------------------------------------------
// UndoSnapshotRepo
// ---------------------------------------------------------------------------

/// Column list for `undo_snapshots` queries.
const UNDO_COLUMNS: &str = "id, user_id, entity_type, entity_id, snapshot_data, \
                             snapshot_size_bytes, created_at, updated_at";

/// Provides CRUD operations for per-user, per-entity undo snapshots.
pub struct UndoSnapshotRepo;

impl UndoSnapshotRepo {
    /// Get an undo snapshot for a specific entity. Returns `None` if no snapshot exists.
    pub async fn get(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<UndoSnapshot>, sqlx::Error> {
        let query = format!(
            "SELECT {UNDO_COLUMNS} FROM undo_snapshots \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3"
        );
        sqlx::query_as::<_, UndoSnapshot>(&query)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert an undo snapshot. Creates if absent, replaces if exists.
    pub async fn save(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
        snapshot_data: &serde_json::Value,
        snapshot_size_bytes: i32,
    ) -> Result<UndoSnapshot, sqlx::Error> {
        let query = format!(
            "INSERT INTO undo_snapshots (user_id, entity_type, entity_id, snapshot_data, snapshot_size_bytes) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE \
             SET snapshot_data = EXCLUDED.snapshot_data, \
                 snapshot_size_bytes = EXCLUDED.snapshot_size_bytes \
             RETURNING {UNDO_COLUMNS}"
        );
        sqlx::query_as::<_, UndoSnapshot>(&query)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .bind(snapshot_data)
            .bind(snapshot_size_bytes)
            .fetch_one(pool)
            .await
    }

    /// Delete an undo snapshot for a specific entity.
    pub async fn delete(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM undo_snapshots \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3",
        )
        .bind(user_id)
        .bind(entity_type)
        .bind(entity_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all undo snapshots for a user.
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<UndoSnapshot>, sqlx::Error> {
        let query = format!(
            "SELECT {UNDO_COLUMNS} FROM undo_snapshots \
             WHERE user_id = $1 ORDER BY updated_at DESC"
        );
        sqlx::query_as::<_, UndoSnapshot>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }
}
