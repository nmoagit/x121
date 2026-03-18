//! Repository for the `speech_types` lookup table (PRD-124, PRD-136).

use sqlx::PgPool;

use crate::models::speech_type::SpeechType;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, sort_order, created_at";

/// Provides CRUD operations for speech types.
pub struct SpeechTypeRepo;

impl SpeechTypeRepo {
    /// List all speech types, ordered by sort_order then name.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<SpeechType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM speech_types ORDER BY sort_order ASC, name ASC");
        sqlx::query_as::<_, SpeechType>(&query)
            .fetch_all(pool)
            .await
    }

    /// Create a new speech type with auto-assigned sort_order (MAX + 1).
    pub async fn create(pool: &PgPool, name: &str) -> Result<SpeechType, sqlx::Error> {
        let query = format!(
            "INSERT INTO speech_types (name, sort_order) \
             VALUES ($1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM speech_types)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SpeechType>(&query)
            .bind(name)
            .fetch_one(pool)
            .await
    }

    /// Find a speech type by exact name.
    pub async fn find_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<SpeechType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM speech_types WHERE name = $1");
        sqlx::query_as::<_, SpeechType>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Find a speech type by name, or create it if it does not exist.
    pub async fn find_or_create(pool: &PgPool, name: &str) -> Result<SpeechType, sqlx::Error> {
        if let Some(existing) = Self::find_by_name(pool, name).await? {
            return Ok(existing);
        }
        Self::create(pool, name).await
    }
}
