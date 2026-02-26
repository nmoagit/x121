//! Repository for `undo_trees` table (PRD-51).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::undo_tree::{SaveUndoTree, UndoTree};

/// Column list for `undo_trees` queries.
const COLUMNS: &str =
    "id, user_id, entity_type, entity_id, tree_json, current_node_id, created_at, updated_at";

/// Provides CRUD operations for per-user, per-entity undo trees.
pub struct UndoTreeRepo;

impl UndoTreeRepo {
    /// Get an undo tree for a specific user + entity combination.
    /// Returns `None` if no tree exists yet.
    pub async fn get_tree(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<UndoTree>, sqlx::Error> {
        let sql = format!(
            "SELECT {COLUMNS} FROM undo_trees \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3"
        );
        sqlx::query_as::<_, UndoTree>(&sql)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert an undo tree. Creates if absent, replaces tree_json and
    /// current_node_id if the row already exists.
    pub async fn save_tree(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
        input: &SaveUndoTree,
    ) -> Result<UndoTree, sqlx::Error> {
        let sql = format!(
            "INSERT INTO undo_trees (user_id, entity_type, entity_id, tree_json, current_node_id) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE \
             SET tree_json = EXCLUDED.tree_json, \
                 current_node_id = EXCLUDED.current_node_id \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UndoTree>(&sql)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .bind(&input.tree_json)
            .bind(&input.current_node_id)
            .fetch_one(pool)
            .await
    }

    /// Delete an undo tree for a specific user + entity combination.
    /// Returns `true` if a row was deleted.
    pub async fn delete_tree(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "DELETE FROM undo_trees \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3",
        )
        .bind(user_id)
        .bind(entity_type)
        .bind(entity_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// List all undo trees belonging to a user, ordered by most recently updated.
    pub async fn list_trees_for_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<UndoTree>, sqlx::Error> {
        let sql = format!(
            "SELECT {COLUMNS} FROM undo_trees \
             WHERE user_id = $1 ORDER BY updated_at DESC"
        );
        sqlx::query_as::<_, UndoTree>(&sql)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }
}
