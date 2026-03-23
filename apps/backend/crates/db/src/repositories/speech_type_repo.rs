//! Repository for the `speech_types` lookup table (PRD-124, PRD-136, PRD-143).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::speech_type::SpeechType;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, pipeline_id, name, sort_order, created_at";

/// Provides CRUD operations for speech types.
pub struct SpeechTypeRepo;

impl SpeechTypeRepo {
    /// List all speech types across all pipelines, ordered by sort_order then name.
    ///
    /// Kept for backward compatibility with export/lookup use-cases.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<SpeechType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM speech_types ORDER BY sort_order ASC, name ASC");
        sqlx::query_as::<_, SpeechType>(&query)
            .fetch_all(pool)
            .await
    }

    /// List speech types for a specific pipeline, ordered by sort_order then name.
    pub async fn list_by_pipeline(
        pool: &PgPool,
        pipeline_id: DbId,
    ) -> Result<Vec<SpeechType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM speech_types \
             WHERE pipeline_id = $1 \
             ORDER BY sort_order ASC, name ASC"
        );
        sqlx::query_as::<_, SpeechType>(&query)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new speech type with auto-assigned sort_order (MAX + 1).
    /// Name is normalised to lowercase. Scoped to a pipeline.
    pub async fn create(
        pool: &PgPool,
        pipeline_id: DbId,
        name: &str,
    ) -> Result<SpeechType, sqlx::Error> {
        let normalised = name.to_lowercase();
        let query = format!(
            "INSERT INTO speech_types (pipeline_id, name, sort_order) \
             VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM speech_types WHERE pipeline_id = $1)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SpeechType>(&query)
            .bind(pipeline_id)
            .bind(&normalised)
            .fetch_one(pool)
            .await
    }

    /// Find a speech type by name within a pipeline (case-insensitive).
    pub async fn find_by_name(
        pool: &PgPool,
        pipeline_id: DbId,
        name: &str,
    ) -> Result<Option<SpeechType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM speech_types \
             WHERE pipeline_id = $1 AND LOWER(name) = LOWER($2)"
        );
        sqlx::query_as::<_, SpeechType>(&query)
            .bind(pipeline_id)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Find a speech type by name within a pipeline, or create it if it does not exist.
    pub async fn find_or_create(
        pool: &PgPool,
        pipeline_id: DbId,
        name: &str,
    ) -> Result<SpeechType, sqlx::Error> {
        if let Some(existing) = Self::find_by_name(pool, pipeline_id, name).await? {
            return Ok(existing);
        }
        Self::create(pool, pipeline_id, name).await
    }
}
