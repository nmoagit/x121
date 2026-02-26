//! Repository for the `roles` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::role::Role;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, description, created_at, updated_at";

/// Provides read operations for roles.
pub struct RoleRepo;

impl RoleRepo {
    /// Find a role by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Role>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM roles WHERE id = $1");
        sqlx::query_as::<_, Role>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a role by name (case-sensitive).
    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<Role>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM roles WHERE name = $1");
        sqlx::query_as::<_, Role>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// List all roles ordered by ID ascending.
    pub async fn list(pool: &PgPool) -> Result<Vec<Role>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM roles ORDER BY id ASC");
        sqlx::query_as::<_, Role>(&query).fetch_all(pool).await
    }

    /// Resolve a role ID to its name, returning `"unknown"` if the ID is missing.
    pub async fn resolve_name(pool: &PgPool, role_id: DbId) -> Result<String, sqlx::Error> {
        Ok(Self::find_by_id(pool, role_id)
            .await?
            .map(|r| r.name)
            .unwrap_or_else(|| "unknown".to_string()))
    }
}
