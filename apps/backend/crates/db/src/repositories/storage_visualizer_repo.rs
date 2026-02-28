//! Repository for storage visualizer: file type categories and storage usage
//! snapshots (PRD-19).

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::storage_visualizer::{
    CreateFileTypeCategory, FileTypeCategory, StorageUsageSnapshot, UpdateFileTypeCategory,
    UpsertStorageSnapshot,
};

/// Column list for `file_type_categories` queries.
const CATEGORY_COLUMNS: &str = "\
    id, name, description, extensions, color, created_at, updated_at";

/// Column list for `storage_usage_snapshots` queries.
const SNAPSHOT_COLUMNS: &str = "\
    id, entity_type, entity_id, entity_name, parent_entity_type, parent_entity_id, \
    total_bytes, file_count, video_bytes, image_bytes, intermediate_bytes, \
    metadata_bytes, model_bytes, reclaimable_bytes, snapshot_at, created_at, updated_at";

/// Provides CRUD operations for storage visualizer entities.
pub struct StorageVisualizerRepo;

impl StorageVisualizerRepo {
    // ── File Type Categories ────────────────────────────────────────

    /// List all file type categories, ordered by name.
    pub async fn list_categories(pool: &PgPool) -> Result<Vec<FileTypeCategory>, sqlx::Error> {
        let query = format!("SELECT {CATEGORY_COLUMNS} FROM file_type_categories ORDER BY name");
        sqlx::query_as::<_, FileTypeCategory>(&query)
            .fetch_all(pool)
            .await
    }

    /// Get a single file type category by ID.
    pub async fn get_category(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<FileTypeCategory>, sqlx::Error> {
        let query = format!("SELECT {CATEGORY_COLUMNS} FROM file_type_categories WHERE id = $1");
        sqlx::query_as::<_, FileTypeCategory>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new file type category.
    pub async fn create_category(
        pool: &PgPool,
        input: &CreateFileTypeCategory,
    ) -> Result<FileTypeCategory, sqlx::Error> {
        let query = format!(
            "INSERT INTO file_type_categories (name, description, extensions, color) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {CATEGORY_COLUMNS}"
        );
        sqlx::query_as::<_, FileTypeCategory>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.extensions)
            .bind(&input.color)
            .fetch_one(pool)
            .await
    }

    /// Update an existing file type category. Returns `None` if not found.
    pub async fn update_category(
        pool: &PgPool,
        id: DbId,
        input: &UpdateFileTypeCategory,
    ) -> Result<Option<FileTypeCategory>, sqlx::Error> {
        let query = format!(
            "UPDATE file_type_categories SET \
                 name = COALESCE($2, name), \
                 description = COALESCE($3, description), \
                 extensions = COALESCE($4, extensions), \
                 color = COALESCE($5, color) \
             WHERE id = $1 \
             RETURNING {CATEGORY_COLUMNS}"
        );
        sqlx::query_as::<_, FileTypeCategory>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.extensions)
            .bind(&input.color)
            .fetch_optional(pool)
            .await
    }

    /// Delete a file type category by ID. Returns `true` if a row was removed.
    pub async fn delete_category(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM file_type_categories WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Storage Usage Snapshots ─────────────────────────────────────

    /// List all snapshots, optionally filtered by entity type and parent.
    pub async fn list_snapshots(
        pool: &PgPool,
        entity_type: Option<&str>,
        parent_entity_type: Option<&str>,
        parent_entity_id: Option<DbId>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<StorageUsageSnapshot>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);

        let query = format!(
            "SELECT {SNAPSHOT_COLUMNS} FROM storage_usage_snapshots \
             WHERE ($1::TEXT IS NULL OR entity_type = $1) \
               AND ($2::TEXT IS NULL OR parent_entity_type = $2) \
               AND ($3::BIGINT IS NULL OR parent_entity_id = $3) \
             ORDER BY total_bytes DESC \
             LIMIT $4 OFFSET $5"
        );
        sqlx::query_as::<_, StorageUsageSnapshot>(&query)
            .bind(entity_type)
            .bind(parent_entity_type)
            .bind(parent_entity_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Get a single snapshot by entity type and entity ID.
    pub async fn get_snapshot(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Option<StorageUsageSnapshot>, sqlx::Error> {
        let query = format!(
            "SELECT {SNAPSHOT_COLUMNS} FROM storage_usage_snapshots \
             WHERE entity_type = $1 AND entity_id = $2"
        );
        sqlx::query_as::<_, StorageUsageSnapshot>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a storage snapshot. Uses the unique index on (entity_type, entity_id)
    /// to either insert or update the existing row.
    pub async fn upsert_snapshot(
        pool: &PgPool,
        input: &UpsertStorageSnapshot,
    ) -> Result<StorageUsageSnapshot, sqlx::Error> {
        let query = format!(
            "INSERT INTO storage_usage_snapshots \
                 (entity_type, entity_id, entity_name, parent_entity_type, parent_entity_id, \
                  total_bytes, file_count, video_bytes, image_bytes, intermediate_bytes, \
                  metadata_bytes, model_bytes, reclaimable_bytes, snapshot_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) \
             ON CONFLICT (entity_type, entity_id) DO UPDATE SET \
                 entity_name = EXCLUDED.entity_name, \
                 parent_entity_type = EXCLUDED.parent_entity_type, \
                 parent_entity_id = EXCLUDED.parent_entity_id, \
                 total_bytes = EXCLUDED.total_bytes, \
                 file_count = EXCLUDED.file_count, \
                 video_bytes = EXCLUDED.video_bytes, \
                 image_bytes = EXCLUDED.image_bytes, \
                 intermediate_bytes = EXCLUDED.intermediate_bytes, \
                 metadata_bytes = EXCLUDED.metadata_bytes, \
                 model_bytes = EXCLUDED.model_bytes, \
                 reclaimable_bytes = EXCLUDED.reclaimable_bytes, \
                 snapshot_at = NOW() \
             RETURNING {SNAPSHOT_COLUMNS}"
        );
        sqlx::query_as::<_, StorageUsageSnapshot>(&query)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(&input.entity_name)
            .bind(&input.parent_entity_type)
            .bind(input.parent_entity_id)
            .bind(input.total_bytes)
            .bind(input.file_count)
            .bind(input.video_bytes)
            .bind(input.image_bytes)
            .bind(input.intermediate_bytes)
            .bind(input.metadata_bytes)
            .bind(input.model_bytes)
            .bind(input.reclaimable_bytes)
            .fetch_one(pool)
            .await
    }

    /// Delete a snapshot by entity type and entity ID. Returns `true` if removed.
    pub async fn delete_snapshot(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM storage_usage_snapshots WHERE entity_type = $1 AND entity_id = $2",
        )
        .bind(entity_type)
        .bind(entity_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get all snapshots for building the treemap hierarchy.
    /// Returns all snapshots ordered by entity type hierarchy.
    pub async fn get_hierarchy_snapshots(
        pool: &PgPool,
        root_entity_type: Option<&str>,
        root_entity_id: Option<DbId>,
    ) -> Result<Vec<StorageUsageSnapshot>, sqlx::Error> {
        // If a root entity is specified, fetch it and all its descendants.
        // Otherwise, fetch all snapshots.
        let query = if root_entity_type.is_some() && root_entity_id.is_some() {
            format!(
                "WITH RECURSIVE tree AS ( \
                     SELECT {SNAPSHOT_COLUMNS} FROM storage_usage_snapshots \
                     WHERE entity_type = $1 AND entity_id = $2 \
                   UNION ALL \
                     SELECT s.id, s.entity_type, s.entity_id, s.entity_name, \
                            s.parent_entity_type, s.parent_entity_id, \
                            s.total_bytes, s.file_count, s.video_bytes, s.image_bytes, \
                            s.intermediate_bytes, s.metadata_bytes, s.model_bytes, \
                            s.reclaimable_bytes, s.snapshot_at, s.created_at, s.updated_at \
                     FROM storage_usage_snapshots s \
                     INNER JOIN tree t ON s.parent_entity_type = t.entity_type \
                                      AND s.parent_entity_id = t.entity_id \
                 ) \
                 SELECT * FROM tree ORDER BY entity_type, entity_id"
            )
        } else {
            format!(
                "SELECT {SNAPSHOT_COLUMNS} FROM storage_usage_snapshots \
                 ORDER BY entity_type, entity_id"
            )
        };

        let mut q = sqlx::query_as::<_, StorageUsageSnapshot>(&query);
        if root_entity_type.is_some() {
            q = q.bind(root_entity_type).bind(root_entity_id);
        }
        q.fetch_all(pool).await
    }

    /// Get aggregate summary across all snapshots.
    pub async fn get_summary(pool: &PgPool) -> Result<StorageSummaryRow, sqlx::Error> {
        let query = "\
            SELECT \
                COALESCE(SUM(total_bytes), 0) AS total_bytes, \
                COALESCE(SUM(file_count), 0)::INTEGER AS total_files, \
                COALESCE(SUM(reclaimable_bytes), 0) AS reclaimable_bytes, \
                COUNT(*) AS entity_count, \
                MAX(snapshot_at) AS latest_snapshot_at \
            FROM storage_usage_snapshots";
        sqlx::query_as::<_, StorageSummaryRow>(query)
            .fetch_one(pool)
            .await
    }

    /// Delete all snapshots (used before a full refresh).
    pub async fn delete_all_snapshots(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM storage_usage_snapshots")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

/// Raw row from the aggregate summary query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StorageSummaryRow {
    pub total_bytes: i64,
    pub total_files: i32,
    pub reclaimable_bytes: i64,
    pub entity_count: i64,
    /// Most recent snapshot timestamp (`NULL` when no snapshots exist).
    pub latest_snapshot_at: Option<x121_core::types::Timestamp>,
}
