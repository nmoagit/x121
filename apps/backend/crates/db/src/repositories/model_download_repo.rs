//! Repository for the `model_downloads` table (PRD-104).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::model_download::{CreateModelDownload, ModelDownload};
use crate::models::status::{DownloadStatus, StatusId};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, status_id, source_type, source_url, source_model_id, \
    source_version_id, model_name, model_type, base_model, file_name, \
    file_size_bytes, downloaded_bytes, download_speed_bps, target_path, \
    expected_hash, actual_hash, hash_verified, hash_mismatch, source_metadata, \
    asset_id, error_message, retry_count, initiated_by, started_at, \
    completed_at, created_at, updated_at";

/// Provides CRUD and status management for model downloads.
pub struct ModelDownloadRepo;

impl ModelDownloadRepo {
    /// Insert a new model download record. Returns the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateModelDownload,
    ) -> Result<ModelDownload, sqlx::Error> {
        let query = format!(
            "INSERT INTO model_downloads
                (source_type, source_url, source_model_id, source_version_id,
                 model_name, model_type, base_model, file_name, file_size_bytes,
                 target_path, expected_hash, source_metadata, initiated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ModelDownload>(&query)
            .bind(&input.source_type)
            .bind(&input.source_url)
            .bind(&input.source_model_id)
            .bind(&input.source_version_id)
            .bind(&input.model_name)
            .bind(&input.model_type)
            .bind(&input.base_model)
            .bind(&input.file_name)
            .bind(input.file_size_bytes)
            .bind(&input.target_path)
            .bind(&input.expected_hash)
            .bind(
                input
                    .source_metadata
                    .as_ref()
                    .unwrap_or(&serde_json::json!({})),
            )
            .bind(input.initiated_by)
            .fetch_one(pool)
            .await
    }

    /// Find a model download by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ModelDownload>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM model_downloads WHERE id = $1");
        sqlx::query_as::<_, ModelDownload>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all model downloads, ordered by creation time descending.
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ModelDownload>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM model_downloads ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ModelDownload>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List model downloads filtered by status ID.
    pub async fn list_by_status(
        pool: &PgPool,
        status_id: StatusId,
    ) -> Result<Vec<ModelDownload>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM model_downloads WHERE status_id = $1 ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ModelDownload>(&query)
            .bind(status_id)
            .fetch_all(pool)
            .await
    }

    /// Update download progress (downloaded bytes and speed).
    pub async fn update_progress(
        pool: &PgPool,
        id: DbId,
        downloaded_bytes: i64,
        speed: Option<i64>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE model_downloads SET \
                downloaded_bytes = $2, \
                download_speed_bps = COALESCE($3, download_speed_bps) \
             WHERE id = $1",
        )
        .bind(id)
        .bind(downloaded_bytes)
        .bind(speed)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Update the status of a download.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE model_downloads SET status_id = $2 WHERE id = $1")
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Mark a download as completed with hash and optional asset ID.
    pub async fn mark_completed(
        pool: &PgPool,
        id: DbId,
        actual_hash: Option<&str>,
        asset_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE model_downloads SET \
                status_id = $4, \
                actual_hash = COALESCE($2, actual_hash), \
                hash_verified = CASE WHEN expected_hash IS NOT NULL AND $2 IS NOT NULL \
                    THEN expected_hash = $2 ELSE hash_verified END, \
                hash_mismatch = CASE WHEN expected_hash IS NOT NULL AND $2 IS NOT NULL \
                    THEN expected_hash != $2 ELSE hash_mismatch END, \
                asset_id = COALESCE($3, asset_id), \
                completed_at = NOW() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(actual_hash)
        .bind(asset_id)
        .bind(DownloadStatus::Completed.id())
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Mark a download as failed with an error message.
    pub async fn mark_failed(
        pool: &PgPool,
        id: DbId,
        error_message: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE model_downloads SET \
                status_id = $3, \
                error_message = $2, \
                retry_count = retry_count + 1 \
             WHERE id = $1",
        )
        .bind(id)
        .bind(error_message)
        .bind(DownloadStatus::Failed.id())
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Check if a download with the given expected hash already exists.
    /// Returns the existing download ID if found.
    pub async fn check_duplicate_hash(
        pool: &PgPool,
        hash: &str,
    ) -> Result<Option<DbId>, sqlx::Error> {
        let row: Option<(DbId,)> = sqlx::query_as(
            "SELECT id FROM model_downloads \
             WHERE expected_hash = $1 AND status_id = $2 \
             LIMIT 1",
        )
        .bind(hash)
        .bind(DownloadStatus::Completed.id())
        .fetch_optional(pool)
        .await?;
        Ok(row.map(|r| r.0))
    }
}
