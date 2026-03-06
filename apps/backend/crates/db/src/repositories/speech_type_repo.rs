//! Repository for the `speech_types` lookup table (PRD-124).

use sqlx::PgPool;

use crate::models::speech_type::SpeechType;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, created_at";

/// Provides CRUD operations for speech types.
pub struct SpeechTypeRepo;

impl SpeechTypeRepo {
    /// List all speech types, ordered by name.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<SpeechType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM speech_types ORDER BY name");
        sqlx::query_as::<_, SpeechType>(&query)
            .fetch_all(pool)
            .await
    }

    /// Create a new speech type. Returns the created type.
    pub async fn create(pool: &PgPool, name: &str) -> Result<SpeechType, sqlx::Error> {
        let query = format!("INSERT INTO speech_types (name) VALUES ($1) RETURNING {COLUMNS}");
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
