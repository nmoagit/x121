//! Repository for the `model_checksums` table (PRD-43).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::model_checksum::{CreateModelChecksum, ModelChecksum, UpdateModelChecksum};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, model_name, file_path, expected_hash, file_size_bytes, model_type, source_url, created_at, updated_at";

/// Provides CRUD operations for model checksums.
pub struct ModelChecksumRepo;

impl ModelChecksumRepo {
    /// Insert a new model checksum record, returning the created row.
    pub async fn create(
        pool: &PgPool,
        body: &CreateModelChecksum,
    ) -> Result<ModelChecksum, sqlx::Error> {
        let query = format!(
            "INSERT INTO model_checksums
                (model_name, file_path, expected_hash, file_size_bytes, model_type, source_url)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(&body.model_name)
            .bind(&body.file_path)
            .bind(&body.expected_hash)
            .bind(body.file_size_bytes)
            .bind(&body.model_type)
            .bind(&body.source_url)
            .fetch_one(pool)
            .await
    }

    /// Find a single model checksum by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ModelChecksum>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM model_checksums WHERE id = $1");
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a model checksum by its unique model name.
    pub async fn find_by_name(
        pool: &PgPool,
        model_name: &str,
    ) -> Result<Option<ModelChecksum>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM model_checksums WHERE model_name = $1");
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(model_name)
            .fetch_optional(pool)
            .await
    }

    /// List all model checksums, ordered by model name.
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ModelChecksum>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM model_checksums
             ORDER BY model_name
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List model checksums filtered by model type.
    pub async fn list_by_type(
        pool: &PgPool,
        model_type: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ModelChecksum>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM model_checksums
             WHERE model_type = $1
             ORDER BY model_name
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(model_type)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update an existing model checksum. Only non-None fields are updated.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        body: &UpdateModelChecksum,
    ) -> Result<ModelChecksum, sqlx::Error> {
        let query = format!(
            "UPDATE model_checksums
             SET model_name     = COALESCE($2, model_name),
                 file_path      = COALESCE($3, file_path),
                 expected_hash  = COALESCE($4, expected_hash),
                 file_size_bytes = COALESCE($5, file_size_bytes),
                 model_type     = COALESCE($6, model_type),
                 source_url     = COALESCE($7, source_url)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ModelChecksum>(&query)
            .bind(id)
            .bind(&body.model_name)
            .bind(&body.file_path)
            .bind(&body.expected_hash)
            .bind(body.file_size_bytes)
            .bind(&body.model_type)
            .bind(&body.source_url)
            .fetch_one(pool)
            .await
    }

    /// Delete a model checksum by ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM model_checksums WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
