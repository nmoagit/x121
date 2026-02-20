//! Repository for the `user_sessions` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::session::{CreateSession, UserSession};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, user_id, refresh_token_hash, expires_at, is_revoked, \
                        user_agent, ip_address, created_at, updated_at";

/// Provides CRUD operations for user sessions.
pub struct SessionRepo;

impl SessionRepo {
    /// Insert a new session, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateSession) -> Result<UserSession, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserSession>(&query)
            .bind(input.user_id)
            .bind(&input.refresh_token_hash)
            .bind(input.expires_at)
            .bind(&input.user_agent)
            .bind(&input.ip_address)
            .fetch_one(pool)
            .await
    }

    /// Find an active session by its refresh token hash.
    ///
    /// Only returns sessions that are not revoked and not expired.
    pub async fn find_by_refresh_token_hash(
        pool: &PgPool,
        hash: &str,
    ) -> Result<Option<UserSession>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM user_sessions
             WHERE refresh_token_hash = $1
               AND is_revoked = false
               AND expires_at > NOW()"
        );
        sqlx::query_as::<_, UserSession>(&query)
            .bind(hash)
            .fetch_optional(pool)
            .await
    }

    /// Revoke a single session. Returns `true` if the row was updated.
    pub async fn revoke(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_sessions SET is_revoked = true WHERE id = $1 AND is_revoked = false",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Revoke all active sessions for a user. Returns the count of revoked sessions.
    pub async fn revoke_all_for_user(pool: &PgPool, user_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_sessions SET is_revoked = true
             WHERE user_id = $1 AND is_revoked = false",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete expired or revoked sessions. Returns the count of deleted rows.
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM user_sessions WHERE expires_at < NOW() OR is_revoked = true")
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }
}
