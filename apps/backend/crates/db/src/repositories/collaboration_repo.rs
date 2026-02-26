//! Repositories for `entity_locks` and `user_presence` tables (PRD-11).

use sqlx::PgPool;
use x121_core::collaboration::DEFAULT_LOCK_DURATION_MINS;
use x121_core::types::DbId;

use crate::models::collaboration::{EntityLock, UserPresence};

// ---------------------------------------------------------------------------
// EntityLockRepo
// ---------------------------------------------------------------------------

/// Column list for `entity_locks` queries.
const LOCK_COLUMNS: &str = "id, entity_type, entity_id, user_id, lock_type, \
                             acquired_at, expires_at, released_at, is_active, \
                             created_at, updated_at";

/// Provides CRUD operations for exclusive entity locks.
pub struct EntityLockRepo;

impl EntityLockRepo {
    /// Attempt to acquire an exclusive lock on an entity.
    ///
    /// Uses `INSERT ... ON CONFLICT DO NOTHING` against the partial unique
    /// index on active locks. If the insert succeeds, the lock is returned.
    /// If the insert is a no-op (conflict), `None` is returned.
    pub async fn acquire(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<Option<EntityLock>, sqlx::Error> {
        let query = format!(
            "INSERT INTO entity_locks (entity_type, entity_id, user_id, expires_at) \
             VALUES ($1, $2, $3, NOW() + INTERVAL '{DEFAULT_LOCK_DURATION_MINS} minutes') \
             ON CONFLICT (entity_type, entity_id) WHERE is_active = true \
             DO NOTHING \
             RETURNING {LOCK_COLUMNS}"
        );
        sqlx::query_as::<_, EntityLock>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Release a lock. Only the holder (matching user_id) can release.
    ///
    /// Returns `true` if a lock was released, `false` if no matching
    /// active lock was found.
    pub async fn release(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE entity_locks SET is_active = false, released_at = NOW() \
             WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3 AND is_active = true",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Extend an active lock's expiration. Only the holder can extend.
    ///
    /// Returns the updated lock, or `None` if the caller is not the holder.
    pub async fn extend(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        user_id: DbId,
    ) -> Result<Option<EntityLock>, sqlx::Error> {
        let query = format!(
            "UPDATE entity_locks SET expires_at = NOW() + INTERVAL '{DEFAULT_LOCK_DURATION_MINS} minutes' \
             WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3 AND is_active = true \
             RETURNING {LOCK_COLUMNS}"
        );
        sqlx::query_as::<_, EntityLock>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Get the currently active lock for an entity, or `None` if unlocked.
    pub async fn get_active(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<EntityLock>, sqlx::Error> {
        let query = format!(
            "SELECT {LOCK_COLUMNS} FROM entity_locks \
             WHERE entity_type = $1 AND entity_id = $2 AND is_active = true"
        );
        sqlx::query_as::<_, EntityLock>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    /// Release all expired active locks. Returns the number of locks released.
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE entity_locks SET is_active = false, released_at = NOW() \
             WHERE is_active = true AND expires_at < NOW()",
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// UserPresenceRepo
// ---------------------------------------------------------------------------

/// Column list for `user_presence` queries.
const PRESENCE_COLUMNS: &str = "id, user_id, entity_type, entity_id, \
                                 last_seen_at, is_active, created_at, updated_at";

/// Provides CRUD operations for user presence tracking.
pub struct UserPresenceRepo;

impl UserPresenceRepo {
    /// Record or refresh a user's presence on an entity.
    ///
    /// Uses upsert: inserts a new presence row or updates `last_seen_at` and
    /// reactivates if the user was previously marked inactive.
    pub async fn upsert(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<UserPresence, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_presence (user_id, entity_type, entity_id) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (user_id, entity_type, entity_id) WHERE is_active = true \
             DO UPDATE SET last_seen_at = NOW() \
             RETURNING {PRESENCE_COLUMNS}"
        );
        sqlx::query_as::<_, UserPresence>(&query)
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_one(pool)
            .await
    }

    /// Mark a user as no longer present on an entity.
    ///
    /// Returns `true` if a presence record was deactivated.
    pub async fn leave(
        pool: &PgPool,
        user_id: DbId,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_presence SET is_active = false \
             WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3 AND is_active = true",
        )
        .bind(user_id)
        .bind(entity_type)
        .bind(entity_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get all currently present users for an entity.
    pub async fn get_present(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Vec<UserPresence>, sqlx::Error> {
        let query = format!(
            "SELECT {PRESENCE_COLUMNS} FROM user_presence \
             WHERE entity_type = $1 AND entity_id = $2 AND is_active = true \
             ORDER BY last_seen_at DESC"
        );
        sqlx::query_as::<_, UserPresence>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_all(pool)
            .await
    }

    /// Mark all presence records older than `stale_secs` as inactive.
    /// Returns the number of stale records cleaned up.
    pub async fn cleanup_stale(pool: &PgPool, stale_secs: i64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_presence SET is_active = false \
             WHERE is_active = true AND last_seen_at < NOW() - ($1 || ' seconds')::interval",
        )
        .bind(stale_secs.to_string())
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
