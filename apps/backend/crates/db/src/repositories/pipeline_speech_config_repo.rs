//! Repository for the `pipeline_speech_config` table (PRD-143).
//!
//! Pipeline-level defaults for speech variant requirements. Project configs
//! override these when present.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::pipeline_speech_config::{PipelineSpeechConfig, PipelineSpeechConfigEntry};

/// Column list shared across queries.
const COLUMNS: &str = "id, pipeline_id, speech_type_id, language_id, min_variants, created_at";

/// Provides CRUD operations for pipeline speech configuration.
pub struct PipelineSpeechConfigRepo;

impl PipelineSpeechConfigRepo {
    /// List all speech config entries for a pipeline.
    pub async fn list_by_pipeline(
        pool: &PgPool,
        pipeline_id: DbId,
    ) -> Result<Vec<PipelineSpeechConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM pipeline_speech_config \
             WHERE pipeline_id = $1 \
             ORDER BY speech_type_id, language_id"
        );
        sqlx::query_as::<_, PipelineSpeechConfig>(&query)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Upsert speech config entries for a pipeline. Uses ON CONFLICT to update
    /// existing entries and insert new ones.
    pub async fn bulk_upsert(
        pool: &PgPool,
        pipeline_id: DbId,
        entries: &[PipelineSpeechConfigEntry],
    ) -> Result<Vec<PipelineSpeechConfig>, sqlx::Error> {
        let query = format!(
            "INSERT INTO pipeline_speech_config \
                 (pipeline_id, speech_type_id, language_id, min_variants) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (pipeline_id, speech_type_id, language_id) \
             DO UPDATE SET min_variants = EXCLUDED.min_variants \
             RETURNING {COLUMNS}"
        );

        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let row = sqlx::query_as::<_, PipelineSpeechConfig>(&query)
                .bind(pipeline_id)
                .bind(entry.speech_type_id)
                .bind(entry.language_id)
                .bind(entry.min_variants)
                .fetch_one(pool)
                .await?;
            results.push(row);
        }
        Ok(results)
    }

    /// Delete a single pipeline speech config entry by ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM pipeline_speech_config WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
