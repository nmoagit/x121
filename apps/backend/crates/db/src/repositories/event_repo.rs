//! Repository for the `events` and `event_types` tables.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::event::{Event, EventType};

/// Column list for `event_types` queries.
const EVENT_TYPE_COLUMNS: &str =
    "id, name, category, description, is_critical, created_at, updated_at";

/// Column list for `events` queries.
const EVENT_COLUMNS: &str =
    "id, event_type_id, source_entity_type, source_entity_id, actor_user_id, payload, created_at";

/// Provides read/write operations for events and event types.
pub struct EventRepo;

impl EventRepo {
    /// Find an event type by its dot-separated name (e.g. `"project.published"`).
    pub async fn get_event_type_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<EventType>, sqlx::Error> {
        let query = format!("SELECT {EVENT_TYPE_COLUMNS} FROM event_types WHERE name = $1");
        sqlx::query_as::<_, EventType>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// List all event types ordered by category then name.
    pub async fn list_event_types(pool: &PgPool) -> Result<Vec<EventType>, sqlx::Error> {
        let query = format!("SELECT {EVENT_TYPE_COLUMNS} FROM event_types ORDER BY category, name");
        sqlx::query_as::<_, EventType>(&query).fetch_all(pool).await
    }

    /// Check whether the given event type name is marked as critical.
    ///
    /// Returns `false` if the event type does not exist.
    pub async fn is_critical(pool: &PgPool, event_type_name: &str) -> Result<bool, sqlx::Error> {
        let result: Option<bool> =
            sqlx::query_scalar("SELECT is_critical FROM event_types WHERE name = $1")
                .bind(event_type_name)
                .fetch_optional(pool)
                .await?;
        Ok(result.unwrap_or(false))
    }

    /// Insert a new event row, returning the generated ID.
    pub async fn insert(
        pool: &PgPool,
        event_type_id: DbId,
        source_entity_type: Option<&str>,
        source_entity_id: Option<DbId>,
        actor_user_id: Option<DbId>,
        payload: &serde_json::Value,
    ) -> Result<DbId, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO events \
                (event_type_id, source_entity_type, source_entity_id, actor_user_id, payload) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING id",
        )
        .bind(event_type_id)
        .bind(source_entity_type)
        .bind(source_entity_id)
        .bind(actor_user_id)
        .bind(payload)
        .fetch_one(pool)
        .await
    }

    /// List recent events ordered newest-first.
    pub async fn list_recent(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Event>, sqlx::Error> {
        let query = format!(
            "SELECT {EVENT_COLUMNS} FROM events ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, Event>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}
