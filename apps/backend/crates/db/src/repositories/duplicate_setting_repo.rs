//! Repository for the `duplicate_detection_settings` table (PRD-79).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::duplicate_setting::{DuplicateDetectionSetting, UpdateDuplicateSetting};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "\
    id, project_id, similarity_threshold, \
    auto_check_on_upload, auto_check_on_batch, created_at, updated_at";

/// Provides CRUD operations for duplicate detection settings.
pub struct DuplicateSettingRepo;

impl DuplicateSettingRepo {
    /// Get effective settings for a project.
    ///
    /// Returns the project-level row if it exists; otherwise falls back
    /// to the studio-level default (where `project_id IS NULL`).
    pub async fn get_for_project(
        pool: &PgPool,
        project_id: Option<DbId>,
    ) -> Result<DuplicateDetectionSetting, sqlx::Error> {
        if let Some(pid) = project_id {
            // Try project-level first.
            let query = format!(
                "SELECT {COLUMNS} FROM duplicate_detection_settings
                 WHERE project_id = $1"
            );
            let row = sqlx::query_as::<_, DuplicateDetectionSetting>(&query)
                .bind(pid)
                .fetch_optional(pool)
                .await?;
            if let Some(setting) = row {
                return Ok(setting);
            }
        }

        // Fallback to studio default.
        Self::get_studio_default(pool).await
    }

    /// Get the studio-level default settings (where `project_id IS NULL`).
    pub async fn get_studio_default(
        pool: &PgPool,
    ) -> Result<DuplicateDetectionSetting, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM duplicate_detection_settings
             WHERE project_id IS NULL
             LIMIT 1"
        );
        sqlx::query_as::<_, DuplicateDetectionSetting>(&query)
            .fetch_one(pool)
            .await
    }

    /// Upsert settings for a project (or studio-level if `project_id` is `None`).
    pub async fn upsert(
        pool: &PgPool,
        project_id: Option<DbId>,
        body: &UpdateDuplicateSetting,
    ) -> Result<DuplicateDetectionSetting, sqlx::Error> {
        let threshold = body.similarity_threshold.unwrap_or(0.90);
        let auto_upload = body.auto_check_on_upload.unwrap_or(true);
        let auto_batch = body.auto_check_on_batch.unwrap_or(true);

        let query = format!(
            "INSERT INTO duplicate_detection_settings
                (project_id, similarity_threshold, auto_check_on_upload, auto_check_on_batch)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id)
             DO UPDATE SET
                similarity_threshold = COALESCE($5, duplicate_detection_settings.similarity_threshold),
                auto_check_on_upload = COALESCE($6, duplicate_detection_settings.auto_check_on_upload),
                auto_check_on_batch  = COALESCE($7, duplicate_detection_settings.auto_check_on_batch),
                updated_at = NOW()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DuplicateDetectionSetting>(&query)
            .bind(project_id)
            .bind(threshold)
            .bind(auto_upload)
            .bind(auto_batch)
            .bind(body.similarity_threshold)
            .bind(body.auto_check_on_upload)
            .bind(body.auto_check_on_batch)
            .fetch_one(pool)
            .await
    }

    /// Delete a setting row by id.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM duplicate_detection_settings WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
