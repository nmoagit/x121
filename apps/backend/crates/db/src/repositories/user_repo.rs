//! Repository for the `users` table.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::user::{CreateUser, UpdateUser, User};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, username, email, password_hash, role_id, is_active, \
                        last_login_at, failed_login_count, locked_until, created_at, updated_at";

/// Provides CRUD operations for users.
pub struct UserRepo;

impl UserRepo {
    /// Insert a new user, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateUser) -> Result<User, sqlx::Error> {
        let query = format!(
            "INSERT INTO users (username, email, password_hash, role_id)
             VALUES ($1, $2, $3, $4)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, User>(&query)
            .bind(&input.username)
            .bind(&input.email)
            .bind(&input.password_hash)
            .bind(input.role_id)
            .fetch_one(pool)
            .await
    }

    /// Find a user by internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<User>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM users WHERE id = $1");
        sqlx::query_as::<_, User>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a user by username (case-sensitive).
    pub async fn find_by_username(
        pool: &PgPool,
        username: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM users WHERE username = $1");
        sqlx::query_as::<_, User>(&query)
            .bind(username)
            .fetch_optional(pool)
            .await
    }

    /// Find a user by email (case-sensitive).
    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM users WHERE email = $1");
        sqlx::query_as::<_, User>(&query)
            .bind(email)
            .fetch_optional(pool)
            .await
    }

    /// List all users ordered by most recently created first.
    pub async fn list(pool: &PgPool) -> Result<Vec<User>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM users ORDER BY created_at DESC");
        sqlx::query_as::<_, User>(&query).fetch_all(pool).await
    }

    /// Update a user. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateUser,
    ) -> Result<Option<User>, sqlx::Error> {
        let query = format!(
            "UPDATE users SET
                username = COALESCE($2, username),
                email = COALESCE($3, email),
                role_id = COALESCE($4, role_id),
                is_active = COALESCE($5, is_active)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, User>(&query)
            .bind(id)
            .bind(&input.username)
            .bind(&input.email)
            .bind(input.role_id)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Soft-deactivate a user by setting `is_active = false`.
    ///
    /// Returns `true` if the row was updated.
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE users SET is_active = false WHERE id = $1 AND is_active = true")
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Increment the failed login counter by 1.
    pub async fn increment_failed_login(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Lock a user account until the specified timestamp.
    pub async fn lock_account(
        pool: &PgPool,
        id: DbId,
        until: Timestamp,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE users SET locked_until = $2 WHERE id = $1")
            .bind(id)
            .bind(until)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Record a successful login: reset `failed_login_count` to 0, clear `locked_until`,
    /// and set `last_login_at` to now.
    pub async fn record_successful_login(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE users SET
                failed_login_count = 0,
                locked_until = NULL,
                last_login_at = NOW()
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update a user's password hash. Returns `true` if the row was updated.
    pub async fn update_password(
        pool: &PgPool,
        id: DbId,
        password_hash: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
            .bind(id)
            .bind(password_hash)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
