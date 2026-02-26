//! Repository for the `api_keys`, `api_key_scopes`, and `api_audit_log` tables (PRD-12).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::api_key::{ApiAuditLogEntry, ApiKey, ApiKeyListItem, ApiKeyScope};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const API_KEY_COLUMNS: &str = "\
    id, name, description, key_hash, key_prefix, scope_id, project_id, \
    created_by, rate_limit_read_per_min, rate_limit_write_per_min, \
    is_active, last_used_at, expires_at, revoked_at, created_at, updated_at";

const API_KEY_LIST_COLUMNS: &str = "\
    ak.id, ak.name, ak.description, ak.key_prefix, aks.name AS scope_name, \
    ak.project_id, ak.rate_limit_read_per_min, ak.rate_limit_write_per_min, \
    ak.is_active, ak.last_used_at, ak.expires_at, ak.revoked_at, ak.created_at";

const SCOPE_COLUMNS: &str = "id, name, description, created_at, updated_at";

const AUDIT_LOG_COLUMNS: &str = "\
    id, api_key_id, method, path, query_params, request_body_size, \
    response_status, response_time_ms, ip_address, user_agent, created_at";

/// Provides CRUD operations for API keys, scopes, and audit log entries.
pub struct ApiKeyRepo;

impl ApiKeyRepo {
    // -----------------------------------------------------------------------
    // Scope operations
    // -----------------------------------------------------------------------

    /// List all API key scopes.
    pub async fn list_scopes(pool: &PgPool) -> Result<Vec<ApiKeyScope>, sqlx::Error> {
        let query = format!("SELECT {SCOPE_COLUMNS} FROM api_key_scopes ORDER BY id");
        sqlx::query_as::<_, ApiKeyScope>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a scope by name.
    pub async fn find_scope_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<ApiKeyScope>, sqlx::Error> {
        let query = format!("SELECT {SCOPE_COLUMNS} FROM api_key_scopes WHERE name = $1");
        sqlx::query_as::<_, ApiKeyScope>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // API Key CRUD
    // -----------------------------------------------------------------------

    /// Create a new API key. Returns the full row (with hash).
    pub async fn create(
        pool: &PgPool,
        name: &str,
        description: Option<&str>,
        key_hash: &str,
        key_prefix: &str,
        scope_id: DbId,
        project_id: Option<DbId>,
        created_by: DbId,
        rate_limit_read: i32,
        rate_limit_write: i32,
        expires_at: Option<&str>,
    ) -> Result<ApiKey, sqlx::Error> {
        let query = format!(
            "INSERT INTO api_keys \
                (name, description, key_hash, key_prefix, scope_id, project_id, \
                 created_by, rate_limit_read_per_min, rate_limit_write_per_min, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, \
                     CASE WHEN $10::TEXT IS NOT NULL THEN $10::TIMESTAMPTZ ELSE NULL END) \
             RETURNING {API_KEY_COLUMNS}"
        );
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(name)
            .bind(description)
            .bind(key_hash)
            .bind(key_prefix)
            .bind(scope_id)
            .bind(project_id)
            .bind(created_by)
            .bind(rate_limit_read)
            .bind(rate_limit_write)
            .bind(expires_at)
            .fetch_one(pool)
            .await
    }

    /// List all API keys with scope name. Does **not** include `key_hash`.
    pub async fn list(pool: &PgPool) -> Result<Vec<ApiKeyListItem>, sqlx::Error> {
        let query = format!(
            "SELECT {API_KEY_LIST_COLUMNS} \
             FROM api_keys ak \
             JOIN api_key_scopes aks ON ak.scope_id = aks.id \
             ORDER BY ak.created_at DESC"
        );
        sqlx::query_as::<_, ApiKeyListItem>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find an API key by its ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ApiKey>, sqlx::Error> {
        let query = format!("SELECT {API_KEY_COLUMNS} FROM api_keys WHERE id = $1");
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find an active, non-revoked, non-expired API key by its SHA-256 hash.
    ///
    /// Used during authentication. Returns the key only if it is valid.
    pub async fn find_by_hash(
        pool: &PgPool,
        key_hash: &str,
    ) -> Result<Option<ApiKey>, sqlx::Error> {
        let query = format!("SELECT {API_KEY_COLUMNS} FROM api_keys WHERE key_hash = $1");
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(key_hash)
            .fetch_optional(pool)
            .await
    }

    /// Update API key settings (name, description, rate limits, is_active).
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        name: Option<&str>,
        description: Option<&str>,
        rate_limit_read: Option<i32>,
        rate_limit_write: Option<i32>,
        is_active: Option<bool>,
    ) -> Result<Option<ApiKey>, sqlx::Error> {
        let query = format!(
            "UPDATE api_keys SET \
                 name = COALESCE($2, name), \
                 description = COALESCE($3, description), \
                 rate_limit_read_per_min = COALESCE($4, rate_limit_read_per_min), \
                 rate_limit_write_per_min = COALESCE($5, rate_limit_write_per_min), \
                 is_active = COALESCE($6, is_active) \
             WHERE id = $1 \
             RETURNING {API_KEY_COLUMNS}"
        );
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(id)
            .bind(name)
            .bind(description)
            .bind(rate_limit_read)
            .bind(rate_limit_write)
            .bind(is_active)
            .fetch_optional(pool)
            .await
    }

    /// Revoke an API key by setting `revoked_at` to now.
    pub async fn revoke(pool: &PgPool, id: DbId) -> Result<Option<ApiKey>, sqlx::Error> {
        let query = format!(
            "UPDATE api_keys SET revoked_at = NOW(), is_active = false \
             WHERE id = $1 AND revoked_at IS NULL \
             RETURNING {API_KEY_COLUMNS}"
        );
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Rotate an API key: update the hash and prefix, reset `revoked_at`.
    ///
    /// The caller generates the new key and passes the new hash/prefix.
    pub async fn rotate(
        pool: &PgPool,
        id: DbId,
        new_hash: &str,
        new_prefix: &str,
    ) -> Result<Option<ApiKey>, sqlx::Error> {
        let query = format!(
            "UPDATE api_keys SET \
                 key_hash = $2, key_prefix = $3, \
                 revoked_at = NULL, is_active = true \
             WHERE id = $1 \
             RETURNING {API_KEY_COLUMNS}"
        );
        sqlx::query_as::<_, ApiKey>(&query)
            .bind(id)
            .bind(new_hash)
            .bind(new_prefix)
            .fetch_optional(pool)
            .await
    }

    /// Update `last_used_at` to the current timestamp.
    pub async fn touch_last_used(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Audit log
    // -----------------------------------------------------------------------

    /// Insert an audit log entry for an external API call.
    pub async fn insert_audit_log(
        pool: &PgPool,
        api_key_id: Option<DbId>,
        method: &str,
        path: &str,
        query_params: Option<&str>,
        request_body_size: Option<i32>,
        response_status: i16,
        response_time_ms: Option<i32>,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<DbId, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO api_audit_log \
                (api_key_id, method, path, query_params, request_body_size, \
                 response_status, response_time_ms, ip_address, user_agent) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING id",
        )
        .bind(api_key_id)
        .bind(method)
        .bind(path)
        .bind(query_params)
        .bind(request_body_size)
        .bind(response_status)
        .bind(response_time_ms)
        .bind(ip_address)
        .bind(user_agent)
        .fetch_one(pool)
        .await
    }

    /// List recent audit log entries, newest first.
    pub async fn list_audit_log(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiAuditLogEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {AUDIT_LOG_COLUMNS} FROM api_audit_log \
             ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ApiAuditLogEntry>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}
