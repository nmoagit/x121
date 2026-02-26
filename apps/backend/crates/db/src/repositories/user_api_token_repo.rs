//! Repository for the `user_api_tokens` table (PRD-104).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::user_api_token::{ApiTokenInfo, UserApiToken};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, user_id, service_name, encrypted_token, token_hint, \
    is_valid, last_used_at, created_at, updated_at";

/// Provides CRUD operations for user API tokens.
pub struct UserApiTokenRepo;

impl UserApiTokenRepo {
    /// Upsert a token: insert or update if one already exists for the user/service pair.
    pub async fn upsert(
        pool: &PgPool,
        user_id: DbId,
        service_name: &str,
        encrypted_token: &[u8],
        token_hint: &str,
    ) -> Result<UserApiToken, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_api_tokens (user_id, service_name, encrypted_token, token_hint)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, service_name) DO UPDATE SET
                encrypted_token = EXCLUDED.encrypted_token,
                token_hint = EXCLUDED.token_hint,
                is_valid = true
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, UserApiToken>(&query)
            .bind(user_id)
            .bind(service_name)
            .bind(encrypted_token)
            .bind(token_hint)
            .fetch_one(pool)
            .await
    }

    /// Find a token by user and service.
    pub async fn find_by_user_service(
        pool: &PgPool,
        user_id: DbId,
        service_name: &str,
    ) -> Result<Option<UserApiToken>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM user_api_tokens WHERE user_id = $1 AND service_name = $2"
        );
        sqlx::query_as::<_, UserApiToken>(&query)
            .bind(user_id)
            .bind(service_name)
            .fetch_optional(pool)
            .await
    }

    /// List all tokens for a user (returns safe info only, no encrypted token).
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<ApiTokenInfo>, sqlx::Error> {
        let rows: Vec<ApiTokenInfo> = sqlx::query_as(
            "SELECT service_name, token_hint, is_valid, last_used_at \
             FROM user_api_tokens WHERE user_id = $1 ORDER BY service_name",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }

    /// Delete a token for a user/service pair. Returns `true` if a row was deleted.
    pub async fn delete(
        pool: &PgPool,
        user_id: DbId,
        service_name: &str,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM user_api_tokens WHERE user_id = $1 AND service_name = $2")
                .bind(user_id)
                .bind(service_name)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Update the `last_used_at` timestamp for a token.
    pub async fn update_last_used(
        pool: &PgPool,
        user_id: DbId,
        service_name: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_api_tokens SET last_used_at = NOW() \
             WHERE user_id = $1 AND service_name = $2",
        )
        .bind(user_id)
        .bind(service_name)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
