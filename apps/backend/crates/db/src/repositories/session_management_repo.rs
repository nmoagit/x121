//! Repositories for session management tables (PRD-98).
//!
//! Three zero-sized structs providing async CRUD for:
//! - `active_sessions` table
//! - `login_attempts` table
//! - `session_configs` table

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::session_management::{
    ActiveSession, CreateActiveSession, CreateLoginAttempt, LoginAttempt, SessionConfig,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const SESSION_COLUMNS: &str = "\
    id, user_id, token_hash, status, ip_address, user_agent, \
    current_view, last_activity, started_at, ended_at, created_at, updated_at";

const LOGIN_COLUMNS: &str = "\
    id, username, user_id, ip_address, user_agent, success, \
    failure_reason, created_at";

const CONFIG_COLUMNS: &str = "\
    id, key, value, description, created_at, updated_at";

// ---------------------------------------------------------------------------
// ActiveSessionRepo
// ---------------------------------------------------------------------------

/// CRUD operations for the `active_sessions` table.
pub struct ActiveSessionRepo;

impl ActiveSessionRepo {
    /// Insert a new active session.
    pub async fn create(
        pool: &PgPool,
        dto: &CreateActiveSession,
    ) -> Result<ActiveSession, sqlx::Error> {
        let query = format!(
            "INSERT INTO active_sessions (user_id, token_hash, ip_address, user_agent) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(dto.user_id)
            .bind(&dto.token_hash)
            .bind(&dto.ip_address)
            .bind(&dto.user_agent)
            .fetch_one(pool)
            .await
    }

    /// Update `last_activity` to now (heartbeat).
    pub async fn heartbeat(
        pool: &PgPool,
        session_id: DbId,
        current_view: Option<&str>,
    ) -> Result<Option<ActiveSession>, sqlx::Error> {
        let query = format!(
            "UPDATE active_sessions \
             SET last_activity = NOW(), \
                 current_view = COALESCE($2, current_view), \
                 status = 'active' \
             WHERE id = $1 AND status != 'terminated' \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(session_id)
            .bind(current_view)
            .fetch_optional(pool)
            .await
    }

    /// Mark a session as idle.
    pub async fn mark_idle(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Option<ActiveSession>, sqlx::Error> {
        let query = format!(
            "UPDATE active_sessions SET status = 'idle' \
             WHERE id = $1 AND status = 'active' \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(session_id)
            .fetch_optional(pool)
            .await
    }

    /// Terminate a session (set status and ended_at).
    pub async fn terminate(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Option<ActiveSession>, sqlx::Error> {
        let query = format!(
            "UPDATE active_sessions \
             SET status = 'terminated', ended_at = NOW() \
             WHERE id = $1 AND status != 'terminated' \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(session_id)
            .fetch_optional(pool)
            .await
    }

    /// List active (non-terminated) sessions with pagination.
    pub async fn list_active(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ActiveSession>, sqlx::Error> {
        let query = format!(
            "SELECT {SESSION_COLUMNS} FROM active_sessions \
             WHERE status IN ('active', 'idle') \
             ORDER BY last_activity DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count active (non-terminated) sessions.
    pub async fn count_active(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM active_sessions WHERE status IN ('active', 'idle')",
        )
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    /// List sessions for a specific user.
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<ActiveSession>, sqlx::Error> {
        let query = format!(
            "SELECT {SESSION_COLUMNS} FROM active_sessions \
             WHERE user_id = $1 AND status != 'terminated' \
             ORDER BY last_activity DESC"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Find the most recently active (non-terminated) session for a user.
    pub async fn find_most_recent_active_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<ActiveSession>, sqlx::Error> {
        let query = format!(
            "SELECT {SESSION_COLUMNS} FROM active_sessions \
             WHERE user_id = $1 AND status != 'terminated' \
             ORDER BY last_activity DESC \
             LIMIT 1"
        );
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Count active (non-terminated) sessions for a user.
    pub async fn count_active_by_user(pool: &PgPool, user_id: DbId) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM active_sessions \
             WHERE user_id = $1 AND status IN ('active', 'idle')",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    /// Find a session by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Option<ActiveSession>, sqlx::Error> {
        let query = format!("SELECT {SESSION_COLUMNS} FROM active_sessions WHERE id = $1");
        sqlx::query_as::<_, ActiveSession>(&query)
            .bind(session_id)
            .fetch_optional(pool)
            .await
    }

    /// Count all sessions (for analytics).
    pub async fn count_total(pool: &PgPool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM active_sessions")
            .fetch_one(pool)
            .await
    }

    /// Count sessions by a specific status.
    pub async fn count_by_status(pool: &PgPool, status: &str) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM active_sessions WHERE status = $1")
            .bind(status)
            .fetch_one(pool)
            .await
    }

    /// Find the peak concurrent session count (sessions that overlapped).
    ///
    /// Uses a simplified approach: count sessions active within the last 24h
    /// where `started_at` < other's `ended_at` (or still running).
    pub async fn peak_concurrent_last_24h(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(MAX(cnt), 0) FROM ( \
                 SELECT COUNT(*) as cnt \
                 FROM active_sessions a \
                 WHERE a.started_at >= NOW() - INTERVAL '24 hours' \
                 GROUP BY date_trunc('hour', a.started_at) \
             ) sub",
        )
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    /// Fetch terminated session durations for analytics.
    pub async fn terminated_durations_seconds(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<f64>, sqlx::Error> {
        let rows = sqlx::query_scalar::<_, f64>(
            "SELECT EXTRACT(EPOCH FROM (ended_at - started_at)) \
             FROM active_sessions \
             WHERE status = 'terminated' AND ended_at IS NOT NULL \
             ORDER BY ended_at DESC \
             LIMIT $1",
        )
        .bind(limit)
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }
}

// ---------------------------------------------------------------------------
// LoginAttemptRepo
// ---------------------------------------------------------------------------

/// CRUD operations for the `login_attempts` table.
pub struct LoginAttemptRepo;

impl LoginAttemptRepo {
    /// Record a login attempt.
    pub async fn record(
        pool: &PgPool,
        dto: &CreateLoginAttempt,
    ) -> Result<LoginAttempt, sqlx::Error> {
        let query = format!(
            "INSERT INTO login_attempts \
                 (username, user_id, ip_address, user_agent, success, failure_reason) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {LOGIN_COLUMNS}"
        );
        sqlx::query_as::<_, LoginAttempt>(&query)
            .bind(&dto.username)
            .bind(dto.user_id)
            .bind(&dto.ip_address)
            .bind(&dto.user_agent)
            .bind(dto.success)
            .bind(&dto.failure_reason)
            .fetch_one(pool)
            .await
    }

    /// List recent login attempts for a user, newest first.
    pub async fn list_recent_by_user(
        pool: &PgPool,
        user_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<LoginAttempt>, sqlx::Error> {
        let query = format!(
            "SELECT {LOGIN_COLUMNS} FROM login_attempts \
             WHERE user_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, LoginAttempt>(&query)
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List recent login attempts from a specific IP, newest first.
    pub async fn list_recent_by_ip(
        pool: &PgPool,
        ip_address: &str,
        limit: i64,
    ) -> Result<Vec<LoginAttempt>, sqlx::Error> {
        let query = format!(
            "SELECT {LOGIN_COLUMNS} FROM login_attempts \
             WHERE ip_address = $1 \
             ORDER BY created_at DESC \
             LIMIT $2"
        );
        sqlx::query_as::<_, LoginAttempt>(&query)
            .bind(ip_address)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Count recent failures for a user within the last N minutes.
    pub async fn count_failures(
        pool: &PgPool,
        user_id: DbId,
        window_minutes: i64,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM login_attempts \
             WHERE user_id = $1 \
               AND success = FALSE \
               AND created_at >= NOW() - ($2 || ' minutes')::INTERVAL",
        )
        .bind(user_id)
        .bind(window_minutes.to_string())
        .fetch_one(pool)
        .await
    }

    /// List all login attempts with pagination (admin view).
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<LoginAttempt>, sqlx::Error> {
        let query = format!(
            "SELECT {LOGIN_COLUMNS} FROM login_attempts \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, LoginAttempt>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count total login attempts (for pagination).
    pub async fn count_total(pool: &PgPool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM login_attempts")
            .fetch_one(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// SessionConfigRepo
// ---------------------------------------------------------------------------

/// CRUD operations for the `session_configs` table.
pub struct SessionConfigRepo;

impl SessionConfigRepo {
    /// Get a config value by key.
    pub async fn get_by_key(
        pool: &PgPool,
        key: &str,
    ) -> Result<Option<SessionConfig>, sqlx::Error> {
        let query = format!("SELECT {CONFIG_COLUMNS} FROM session_configs WHERE key = $1");
        sqlx::query_as::<_, SessionConfig>(&query)
            .bind(key)
            .fetch_optional(pool)
            .await
    }

    /// Update a config value by key.
    pub async fn update(
        pool: &PgPool,
        key: &str,
        value: &str,
    ) -> Result<Option<SessionConfig>, sqlx::Error> {
        let query = format!(
            "UPDATE session_configs SET value = $2 \
             WHERE key = $1 \
             RETURNING {CONFIG_COLUMNS}"
        );
        sqlx::query_as::<_, SessionConfig>(&query)
            .bind(key)
            .bind(value)
            .fetch_optional(pool)
            .await
    }

    /// List all config entries.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<SessionConfig>, sqlx::Error> {
        let query = format!("SELECT {CONFIG_COLUMNS} FROM session_configs ORDER BY key ASC");
        sqlx::query_as::<_, SessionConfig>(&query)
            .fetch_all(pool)
            .await
    }
}
