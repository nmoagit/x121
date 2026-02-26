//! Repositories for storage backends, asset locations, tiering policies,
//! and storage migrations (PRD-48).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::status::StatusId;
use crate::models::storage::{
    AssetLocation, CreateAssetLocation, CreateStorageBackend, CreateStorageMigration,
    CreateTieringPolicy, StorageBackend, StorageMigration, TieringCandidate, TieringPolicy,
    UpdateStorageBackend, UpdateTieringPolicy,
};

// ---------------------------------------------------------------------------
// StorageBackendRepo
// ---------------------------------------------------------------------------

/// Column list for `storage_backends` queries.
const BACKEND_COLUMNS: &str = "\
    id, name, backend_type_id, status_id, tier, config, is_default, \
    total_capacity_bytes, used_bytes, project_id, created_at, updated_at";

/// Provides CRUD operations for storage backends.
pub struct StorageBackendRepo;

impl StorageBackendRepo {
    /// Create a new storage backend.
    pub async fn create(
        pool: &PgPool,
        input: &CreateStorageBackend,
    ) -> Result<StorageBackend, sqlx::Error> {
        let query = format!(
            "INSERT INTO storage_backends \
                (name, backend_type_id, tier, config, is_default, total_capacity_bytes, project_id) \
             VALUES ($1, $2, COALESCE($3, 'hot'), $4, COALESCE($5, false), $6, $7) \
             RETURNING {BACKEND_COLUMNS}"
        );
        sqlx::query_as::<_, StorageBackend>(&query)
            .bind(&input.name)
            .bind(input.backend_type_id)
            .bind(&input.tier)
            .bind(&input.config)
            .bind(input.is_default)
            .bind(input.total_capacity_bytes)
            .bind(input.project_id)
            .fetch_one(pool)
            .await
    }

    /// Find a storage backend by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<StorageBackend>, sqlx::Error> {
        let query = format!("SELECT {BACKEND_COLUMNS} FROM storage_backends WHERE id = $1");
        sqlx::query_as::<_, StorageBackend>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all storage backends ordered by name.
    pub async fn list(pool: &PgPool) -> Result<Vec<StorageBackend>, sqlx::Error> {
        let query = format!("SELECT {BACKEND_COLUMNS} FROM storage_backends ORDER BY name ASC");
        sqlx::query_as::<_, StorageBackend>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a storage backend. Only non-`None` fields in `input` are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateStorageBackend,
    ) -> Result<Option<StorageBackend>, sqlx::Error> {
        let query = format!(
            "UPDATE storage_backends SET \
                name = COALESCE($2, name), \
                tier = COALESCE($3, tier), \
                config = COALESCE($4, config), \
                is_default = COALESCE($5, is_default), \
                total_capacity_bytes = COALESCE($6, total_capacity_bytes), \
                project_id = COALESCE($7, project_id) \
             WHERE id = $1 \
             RETURNING {BACKEND_COLUMNS}"
        );
        sqlx::query_as::<_, StorageBackend>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.tier)
            .bind(&input.config)
            .bind(input.is_default)
            .bind(input.total_capacity_bytes)
            .bind(input.project_id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of a storage backend.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE storage_backends SET status_id = $2 WHERE id = $1")
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// AssetLocationRepo
// ---------------------------------------------------------------------------

/// Column list for `asset_locations` queries.
const LOCATION_COLUMNS: &str = "\
    id, entity_type, entity_id, file_field, backend_id, storage_path, \
    file_size_bytes, checksum_sha256, last_accessed_at, access_count, \
    created_at, updated_at";

/// Provides CRUD operations for asset locations.
pub struct AssetLocationRepo;

impl AssetLocationRepo {
    /// Create an asset location (upsert on entity_type + entity_id + file_field).
    pub async fn create(
        pool: &PgPool,
        input: &CreateAssetLocation,
    ) -> Result<AssetLocation, sqlx::Error> {
        let query = format!(
            "INSERT INTO asset_locations \
                (entity_type, entity_id, file_field, backend_id, storage_path, \
                 file_size_bytes, checksum_sha256) \
             VALUES ($1, $2, COALESCE($3, 'primary'), $4, $5, COALESCE($6, 0), $7) \
             ON CONFLICT (entity_type, entity_id, file_field) DO UPDATE SET \
                backend_id = EXCLUDED.backend_id, \
                storage_path = EXCLUDED.storage_path, \
                file_size_bytes = EXCLUDED.file_size_bytes, \
                checksum_sha256 = EXCLUDED.checksum_sha256 \
             RETURNING {LOCATION_COLUMNS}"
        );
        sqlx::query_as::<_, AssetLocation>(&query)
            .bind(&input.entity_type)
            .bind(input.entity_id)
            .bind(&input.file_field)
            .bind(input.backend_id)
            .bind(&input.storage_path)
            .bind(input.file_size_bytes)
            .bind(&input.checksum_sha256)
            .fetch_one(pool)
            .await
    }

    /// Find the asset location for a specific entity and file field.
    pub async fn find_by_entity(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        file_field: &str,
    ) -> Result<Option<AssetLocation>, sqlx::Error> {
        let query = format!(
            "SELECT {LOCATION_COLUMNS} FROM asset_locations \
             WHERE entity_type = $1 AND entity_id = $2 AND file_field = $3"
        );
        sqlx::query_as::<_, AssetLocation>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .bind(file_field)
            .fetch_optional(pool)
            .await
    }

    /// Move an asset to a different backend.
    pub async fn update_backend(
        pool: &PgPool,
        id: DbId,
        new_backend_id: DbId,
        new_storage_path: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE asset_locations SET backend_id = $2, storage_path = $3 WHERE id = $1")
            .bind(id)
            .bind(new_backend_id)
            .bind(new_storage_path)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Record an access to an asset (increment counter, update timestamp).
    pub async fn update_access_tracking(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE asset_locations SET \
                access_count = access_count + 1, \
                last_accessed_at = NOW() \
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Find assets that match tiering-policy criteria for migration.
    ///
    /// Returns assets in the given tier that have not been accessed within
    /// `access_threshold_days` or were created more than `age_threshold_days` ago.
    pub async fn find_tiering_candidates(
        pool: &PgPool,
        entity_type: &str,
        source_tier: &str,
        age_threshold_days: Option<i32>,
        access_threshold_days: Option<i32>,
    ) -> Result<Vec<TieringCandidate>, sqlx::Error> {
        let query = "\
            SELECT \
                al.entity_type, al.entity_id, al.file_field, al.file_size_bytes, \
                al.backend_id AS current_backend_id, al.last_accessed_at, al.access_count \
            FROM asset_locations al \
            JOIN storage_backends sb ON sb.id = al.backend_id \
            WHERE al.entity_type = $1 \
              AND sb.tier = $2 \
              AND ( \
                ($3::int IS NOT NULL AND al.created_at < NOW() - ($3 || ' days')::interval) \
                OR \
                ($4::int IS NOT NULL AND (al.last_accessed_at IS NULL OR al.last_accessed_at < NOW() - ($4 || ' days')::interval)) \
              ) \
            ORDER BY al.file_size_bytes DESC \
            LIMIT 500";
        sqlx::query_as::<_, TieringCandidate>(query)
            .bind(entity_type)
            .bind(source_tier)
            .bind(age_threshold_days)
            .bind(access_threshold_days)
            .fetch_all(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// TieringPolicyRepo
// ---------------------------------------------------------------------------

/// Column list for `tiering_policies` queries.
const POLICY_COLUMNS: &str = "\
    id, name, description, source_tier, target_tier, target_backend_id, \
    entity_type, condition_field, condition_operator, condition_value, \
    age_threshold_days, access_threshold_days, project_id, is_active, \
    created_at, updated_at";

/// Provides CRUD operations for tiering policies.
pub struct TieringPolicyRepo;

impl TieringPolicyRepo {
    /// Create a new tiering policy.
    pub async fn create(
        pool: &PgPool,
        input: &CreateTieringPolicy,
    ) -> Result<TieringPolicy, sqlx::Error> {
        let query = format!(
            "INSERT INTO tiering_policies \
                (name, description, source_tier, target_tier, target_backend_id, \
                 entity_type, condition_field, condition_operator, condition_value, \
                 age_threshold_days, access_threshold_days, project_id, is_active) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, true)) \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, TieringPolicy>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.source_tier)
            .bind(&input.target_tier)
            .bind(input.target_backend_id)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.age_threshold_days)
            .bind(input.access_threshold_days)
            .bind(input.project_id)
            .bind(input.is_active)
            .fetch_one(pool)
            .await
    }

    /// List all tiering policies ordered by name.
    pub async fn list(pool: &PgPool) -> Result<Vec<TieringPolicy>, sqlx::Error> {
        let query = format!("SELECT {POLICY_COLUMNS} FROM tiering_policies ORDER BY name ASC");
        sqlx::query_as::<_, TieringPolicy>(&query)
            .fetch_all(pool)
            .await
    }

    /// List only active tiering policies.
    pub async fn list_active(pool: &PgPool) -> Result<Vec<TieringPolicy>, sqlx::Error> {
        let query = format!(
            "SELECT {POLICY_COLUMNS} FROM tiering_policies WHERE is_active = true ORDER BY name ASC"
        );
        sqlx::query_as::<_, TieringPolicy>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a tiering policy. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateTieringPolicy,
    ) -> Result<Option<TieringPolicy>, sqlx::Error> {
        let query = format!(
            "UPDATE tiering_policies SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                source_tier = COALESCE($4, source_tier), \
                target_tier = COALESCE($5, target_tier), \
                target_backend_id = COALESCE($6, target_backend_id), \
                entity_type = COALESCE($7, entity_type), \
                condition_field = COALESCE($8, condition_field), \
                condition_operator = COALESCE($9, condition_operator), \
                condition_value = COALESCE($10, condition_value), \
                age_threshold_days = COALESCE($11, age_threshold_days), \
                access_threshold_days = COALESCE($12, access_threshold_days), \
                project_id = COALESCE($13, project_id), \
                is_active = COALESCE($14, is_active) \
             WHERE id = $1 \
             RETURNING {POLICY_COLUMNS}"
        );
        sqlx::query_as::<_, TieringPolicy>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.source_tier)
            .bind(&input.target_tier)
            .bind(input.target_backend_id)
            .bind(&input.entity_type)
            .bind(&input.condition_field)
            .bind(&input.condition_operator)
            .bind(&input.condition_value)
            .bind(input.age_threshold_days)
            .bind(input.access_threshold_days)
            .bind(input.project_id)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Delete a tiering policy by ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM tiering_policies WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

// ---------------------------------------------------------------------------
// StorageMigrationRepo
// ---------------------------------------------------------------------------

/// Column list for `storage_migrations` queries.
const MIGRATION_COLUMNS: &str = "\
    id, status_id, source_backend_id, target_backend_id, \
    total_files, transferred_files, verified_files, failed_files, \
    total_bytes, transferred_bytes, error_log, \
    started_at, completed_at, initiated_by, created_at, updated_at";

/// Provides CRUD operations for storage migrations.
pub struct StorageMigrationRepo;

impl StorageMigrationRepo {
    /// Create a new storage migration record.
    pub async fn create(
        pool: &PgPool,
        input: &CreateStorageMigration,
        initiated_by: Option<DbId>,
    ) -> Result<StorageMigration, sqlx::Error> {
        let query = format!(
            "INSERT INTO storage_migrations \
                (source_backend_id, target_backend_id, initiated_by, started_at) \
             VALUES ($1, $2, $3, NOW()) \
             RETURNING {MIGRATION_COLUMNS}"
        );
        sqlx::query_as::<_, StorageMigration>(&query)
            .bind(input.source_backend_id)
            .bind(input.target_backend_id)
            .bind(initiated_by)
            .fetch_one(pool)
            .await
    }

    /// Find a storage migration by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<StorageMigration>, sqlx::Error> {
        let query = format!("SELECT {MIGRATION_COLUMNS} FROM storage_migrations WHERE id = $1");
        sqlx::query_as::<_, StorageMigration>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update transfer progress counters.
    pub async fn update_progress(
        pool: &PgPool,
        id: DbId,
        total_files: i32,
        transferred_files: i32,
        verified_files: i32,
        failed_files: i32,
        total_bytes: i64,
        transferred_bytes: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE storage_migrations SET \
                total_files = $2, transferred_files = $3, \
                verified_files = $4, failed_files = $5, \
                total_bytes = $6, transferred_bytes = $7 \
             WHERE id = $1",
        )
        .bind(id)
        .bind(total_files)
        .bind(transferred_files)
        .bind(verified_files)
        .bind(failed_files)
        .bind(total_bytes)
        .bind(transferred_bytes)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update the status of a migration. Sets `completed_at` when the status
    /// is Completed, Failed, or RolledBack.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        // Status IDs 4 (Completed), 5 (Failed), 6 (RolledBack) are terminal.
        let is_terminal = status_id >= 4;
        let query = if is_terminal {
            "UPDATE storage_migrations SET status_id = $2, completed_at = NOW() WHERE id = $1"
        } else {
            "UPDATE storage_migrations SET status_id = $2 WHERE id = $1"
        };
        sqlx::query(query)
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
