//! Repository for the `project_speech_config` table (PRD-136).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project_speech_config::{ProjectSpeechConfig, SpeechConfigEntry};

/// Column list shared across queries.
const COLUMNS: &str = "id, project_id, speech_type_id, language_id, min_variants, created_at";

/// Default minimum variants when no project config exists.
const DEFAULT_MIN_VARIANTS: i32 = 3;

/// Default language ID (English).
const DEFAULT_LANGUAGE_ID: i16 = 1;

/// Provides CRUD operations for project speech configuration.
pub struct ProjectSpeechConfigRepo;

impl ProjectSpeechConfigRepo {
    /// List all speech config entries for a project.
    pub async fn list_for_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectSpeechConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM project_speech_config \
             WHERE project_id = $1 \
             ORDER BY speech_type_id, language_id"
        );
        sqlx::query_as::<_, ProjectSpeechConfig>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Replace all speech config entries for a project in a single transaction.
    ///
    /// Deletes existing entries, then inserts the new set.
    pub async fn replace_all(
        pool: &PgPool,
        project_id: DbId,
        entries: &[SpeechConfigEntry],
    ) -> Result<Vec<ProjectSpeechConfig>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        sqlx::query("DELETE FROM project_speech_config WHERE project_id = $1")
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

        let insert_query = format!(
            "INSERT INTO project_speech_config \
                 (project_id, speech_type_id, language_id, min_variants) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {COLUMNS}"
        );

        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let row = sqlx::query_as::<_, ProjectSpeechConfig>(&insert_query)
                .bind(project_id)
                .bind(entry.speech_type_id)
                .bind(entry.language_id)
                .bind(entry.min_variants)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }

    /// Get speech config for a project, or generate defaults if none exist.
    ///
    /// Defaults: all 8 seeded speech types x English (language_id=1) x 3 min_variants.
    pub async fn get_or_default(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectSpeechConfig>, sqlx::Error> {
        let existing = Self::list_for_project(pool, project_id).await?;
        if !existing.is_empty() {
            return Ok(existing);
        }

        // Build defaults from all existing speech types.
        let type_ids: Vec<i16> =
            sqlx::query_scalar("SELECT id FROM speech_types ORDER BY sort_order ASC, name ASC")
                .fetch_all(pool)
                .await?;

        let entries: Vec<SpeechConfigEntry> = type_ids
            .into_iter()
            .map(|tid| SpeechConfigEntry {
                speech_type_id: tid,
                language_id: DEFAULT_LANGUAGE_ID,
                min_variants: DEFAULT_MIN_VARIANTS,
            })
            .collect();

        Self::replace_all(pool, project_id, &entries).await
    }
}
