//! Repository for the `shared_links` and `link_access_log` tables (PRD-84).

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::shared_link::{LinkAccessLogEntry, SharedLink};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const LINK_COLUMNS: &str = "\
    id, token_hash, scope_type, scope_id, created_by, \
    expires_at, max_views, current_views, password_hash, is_revoked, \
    settings_json, created_at, updated_at";

const LOG_COLUMNS: &str = "\
    id, link_id, accessed_at, ip_address, user_agent, \
    feedback_text, decision, viewer_name, created_at";

/// Provides CRUD operations for shared links and access log entries.
pub struct SharedLinkRepo;

impl SharedLinkRepo {
    // -----------------------------------------------------------------------
    // Shared link CRUD
    // -----------------------------------------------------------------------

    /// Create a new shared link. Returns the full row.
    pub async fn create(
        pool: &PgPool,
        token_hash: &str,
        scope_type: &str,
        scope_id: DbId,
        created_by: DbId,
        expires_at: Timestamp,
        max_views: Option<i32>,
        password_hash: Option<&str>,
        settings_json: Option<&serde_json::Value>,
    ) -> Result<SharedLink, sqlx::Error> {
        let query = format!(
            "INSERT INTO shared_links \
                (token_hash, scope_type, scope_id, created_by, expires_at, \
                 max_views, password_hash, settings_json) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {LINK_COLUMNS}"
        );
        sqlx::query_as::<_, SharedLink>(&query)
            .bind(token_hash)
            .bind(scope_type)
            .bind(scope_id)
            .bind(created_by)
            .bind(expires_at)
            .bind(max_views)
            .bind(password_hash)
            .bind(settings_json)
            .fetch_one(pool)
            .await
    }

    /// Find a shared link by its database ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SharedLink>, sqlx::Error> {
        let query = format!("SELECT {LINK_COLUMNS} FROM shared_links WHERE id = $1");
        sqlx::query_as::<_, SharedLink>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a shared link by its token hash.
    pub async fn find_by_token_hash(
        pool: &PgPool,
        token_hash: &str,
    ) -> Result<Option<SharedLink>, sqlx::Error> {
        let query = format!("SELECT {LINK_COLUMNS} FROM shared_links WHERE token_hash = $1");
        sqlx::query_as::<_, SharedLink>(&query)
            .bind(token_hash)
            .fetch_optional(pool)
            .await
    }

    /// List shared links created by a specific user, newest first.
    pub async fn list_by_creator(
        pool: &PgPool,
        user_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SharedLink>, sqlx::Error> {
        let query = format!(
            "SELECT {LINK_COLUMNS} FROM shared_links \
             WHERE created_by = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, SharedLink>(&query)
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Revoke a shared link by setting `is_revoked = true`.
    pub async fn revoke(pool: &PgPool, id: DbId) -> Result<Option<SharedLink>, sqlx::Error> {
        let query = format!(
            "UPDATE shared_links SET is_revoked = true \
             WHERE id = $1 AND is_revoked = false \
             RETURNING {LINK_COLUMNS}"
        );
        sqlx::query_as::<_, SharedLink>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Bulk-revoke multiple shared links. Returns the number of rows updated.
    pub async fn bulk_revoke(pool: &PgPool, ids: &[DbId]) -> Result<i64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE shared_links SET is_revoked = true \
             WHERE id = ANY($1) AND is_revoked = false",
        )
        .bind(ids)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }

    /// Increment the current view count for a shared link.
    pub async fn increment_views(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE shared_links SET current_views = current_views + 1 WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Delete a shared link permanently.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM shared_links WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Access log operations
    // -----------------------------------------------------------------------

    /// Log an access event (view) for a shared link.
    pub async fn log_access(
        pool: &PgPool,
        link_id: DbId,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<LinkAccessLogEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO link_access_log (link_id, ip_address, user_agent) \
             VALUES ($1, $2, $3) \
             RETURNING {LOG_COLUMNS}"
        );
        sqlx::query_as::<_, LinkAccessLogEntry>(&query)
            .bind(link_id)
            .bind(ip_address)
            .bind(user_agent)
            .fetch_one(pool)
            .await
    }

    /// Log reviewer feedback for a shared link.
    pub async fn log_feedback(
        pool: &PgPool,
        link_id: DbId,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
        viewer_name: Option<&str>,
        decision: Option<&str>,
        feedback_text: Option<&str>,
    ) -> Result<LinkAccessLogEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO link_access_log \
                (link_id, ip_address, user_agent, viewer_name, decision, feedback_text) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {LOG_COLUMNS}"
        );
        sqlx::query_as::<_, LinkAccessLogEntry>(&query)
            .bind(link_id)
            .bind(ip_address)
            .bind(user_agent)
            .bind(viewer_name)
            .bind(decision)
            .bind(feedback_text)
            .fetch_one(pool)
            .await
    }

    /// List access log entries for a given link, newest first.
    pub async fn list_access_log(
        pool: &PgPool,
        link_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<LinkAccessLogEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {LOG_COLUMNS} FROM link_access_log \
             WHERE link_id = $1 \
             ORDER BY accessed_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, LinkAccessLogEntry>(&query)
            .bind(link_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count feedback entries (those with a non-null decision) for a given link.
    pub async fn count_feedback(pool: &PgPool, link_id: DbId) -> Result<i64, sqlx::Error> {
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM link_access_log \
             WHERE link_id = $1 AND decision IS NOT NULL",
        )
        .bind(link_id)
        .fetch_one(pool)
        .await?;
        Ok(count.unwrap_or(0))
    }

    /// Count total access log entries for a given link.
    pub async fn count_access(pool: &PgPool, link_id: DbId) -> Result<i64, sqlx::Error> {
        let count: Option<i64> =
            sqlx::query_scalar("SELECT COUNT(*) FROM link_access_log WHERE link_id = $1")
                .bind(link_id)
                .fetch_one(pool)
                .await?;
        Ok(count.unwrap_or(0))
    }
}
