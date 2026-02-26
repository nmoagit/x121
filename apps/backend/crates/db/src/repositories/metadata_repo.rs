//! Repository for the `metadata_generations` table (PRD-13).

use sqlx::PgPool;
use x121_core::metadata::{ENTITY_TYPE_CHARACTER, ENTITY_TYPE_SCENE};
use x121_core::types::DbId;

use crate::models::metadata::{CreateMetadataGeneration, MetadataGeneration, StaleMetadata};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, entity_type, entity_id, file_type, file_path, \
    generated_at, source_updated_at, schema_version, file_hash, created_at, updated_at";

/// Provides data-access methods for metadata generation tracking.
pub struct MetadataGenerationRepo;

impl MetadataGenerationRepo {
    /// Upsert a metadata generation record.
    ///
    /// If a record for the same (entity_type, entity_id, file_type) already
    /// exists, updates the mutable columns. Otherwise inserts a new row.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateMetadataGeneration,
    ) -> Result<MetadataGeneration, sqlx::Error> {
        let query = format!(
            "INSERT INTO metadata_generations \
                (entity_type, entity_id, file_type, file_path, source_updated_at, schema_version, file_hash) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             ON CONFLICT (entity_type, entity_id, file_type) \
             DO UPDATE SET \
                file_path = EXCLUDED.file_path, \
                generated_at = NOW(), \
                source_updated_at = EXCLUDED.source_updated_at, \
                schema_version = EXCLUDED.schema_version, \
                file_hash = EXCLUDED.file_hash \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, MetadataGeneration>(&query)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(&input.file_type)
            .bind(&input.file_path)
            .bind(input.source_updated_at)
            .bind(&input.schema_version)
            .bind(&input.file_hash)
            .fetch_one(pool)
            .await
    }

    /// Find the metadata generation record for a specific entity and file type.
    pub async fn find_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        file_type: &str,
    ) -> Result<Option<MetadataGeneration>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM metadata_generations \
             WHERE entity_type = $1 AND entity_id = $2 AND file_type = $3"
        );
        sqlx::query_as::<_, MetadataGeneration>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(file_type)
            .fetch_optional(pool)
            .await
    }

    /// Find stale metadata records for a given entity type.
    ///
    /// Returns entries where the source entity has been updated since the
    /// metadata was last generated.
    async fn find_stale_entities(
        pool: &PgPool,
        entity_type: &str,
        table_name: &str,
    ) -> Result<Vec<StaleMetadata>, sqlx::Error> {
        let query = format!(
            "SELECT mg.entity_type, mg.entity_id, mg.file_type, \
                    mg.generated_at, mg.source_updated_at, \
                    e.updated_at AS current_entity_updated_at \
             FROM metadata_generations mg \
             JOIN {table_name} e ON e.id = mg.entity_id \
             WHERE mg.entity_type = $1 \
               AND mg.source_updated_at < e.updated_at"
        );
        sqlx::query_as::<_, StaleMetadata>(&query)
            .bind(entity_type)
            .fetch_all(pool)
            .await
    }

    /// Find all character metadata records where the source character has been
    /// updated since the metadata was last generated.
    pub async fn find_stale_characters(pool: &PgPool) -> Result<Vec<StaleMetadata>, sqlx::Error> {
        Self::find_stale_entities(pool, ENTITY_TYPE_CHARACTER, "characters").await
    }

    /// Find all scene/video metadata records where the source scene has been
    /// updated since the metadata was last generated.
    pub async fn find_stale_scenes(pool: &PgPool) -> Result<Vec<StaleMetadata>, sqlx::Error> {
        Self::find_stale_entities(pool, ENTITY_TYPE_SCENE, "scenes").await
    }

    /// List all metadata generation records for entities belonging to a project.
    ///
    /// Joins via characters (for character metadata) and scenes (for video
    /// metadata) to resolve project ownership.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<MetadataGeneration>, sqlx::Error> {
        let prefixed = COLUMNS
            .split(", ")
            .map(|c| format!("mg.{c}"))
            .collect::<Vec<_>>()
            .join(", ");

        let query = format!(
            "SELECT {prefixed} FROM metadata_generations mg \
             JOIN characters c ON c.id = mg.entity_id AND mg.entity_type = $1 \
             WHERE c.project_id = $2 \
             UNION ALL \
             SELECT {prefixed} FROM metadata_generations mg \
             JOIN scenes s ON s.id = mg.entity_id AND mg.entity_type = $3 \
             JOIN characters c2 ON c2.id = s.character_id \
             WHERE c2.project_id = $2 \
             ORDER BY entity_type, entity_id"
        );
        sqlx::query_as::<_, MetadataGeneration>(&query)
            .bind(ENTITY_TYPE_CHARACTER)
            .bind(project_id)
            .bind(ENTITY_TYPE_SCENE)
            .fetch_all(pool)
            .await
    }
}
