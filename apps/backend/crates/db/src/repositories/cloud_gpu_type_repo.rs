//! Repository for the `cloud_gpu_types` table (PRD-114).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::cloud_provider::{CloudGpuType, CreateCloudGpuType, UpdateCloudGpuType};

const COLUMNS: &str = "\
    id, provider_id, gpu_id, name, vram_mb, cost_per_hour_cents, \
    max_gpu_count, available, metadata, created_at, updated_at";

pub struct CloudGpuTypeRepo;

impl CloudGpuTypeRepo {
    /// Upsert a GPU type (used during sync from provider).
    pub async fn upsert(
        pool: &PgPool,
        provider_id: DbId,
        input: &CreateCloudGpuType,
    ) -> Result<CloudGpuType, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_gpu_types \
                (provider_id, gpu_id, name, vram_mb, cost_per_hour_cents, max_gpu_count, metadata) \
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 1), COALESCE($7, '{{}}'::jsonb)) \
             ON CONFLICT (provider_id, gpu_id) DO UPDATE SET \
                name = EXCLUDED.name, \
                vram_mb = EXCLUDED.vram_mb, \
                cost_per_hour_cents = EXCLUDED.cost_per_hour_cents, \
                max_gpu_count = EXCLUDED.max_gpu_count, \
                metadata = EXCLUDED.metadata \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudGpuType>(&query)
            .bind(provider_id)
            .bind(&input.gpu_id)
            .bind(&input.name)
            .bind(input.vram_mb)
            .bind(input.cost_per_hour_cents)
            .bind(input.max_gpu_count)
            .bind(&input.metadata)
            .fetch_one(pool)
            .await
    }

    /// Find a GPU type by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudGpuType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM cloud_gpu_types WHERE id = $1");
        sqlx::query_as::<_, CloudGpuType>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all GPU types for a provider.
    pub async fn list_by_provider(
        pool: &PgPool,
        provider_id: DbId,
    ) -> Result<Vec<CloudGpuType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_gpu_types WHERE provider_id = $1 ORDER BY name ASC"
        );
        sqlx::query_as::<_, CloudGpuType>(&query)
            .bind(provider_id)
            .fetch_all(pool)
            .await
    }

    /// List only available GPU types for a provider.
    pub async fn list_available(
        pool: &PgPool,
        provider_id: DbId,
    ) -> Result<Vec<CloudGpuType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_gpu_types \
             WHERE provider_id = $1 AND available = true \
             ORDER BY cost_per_hour_cents ASC"
        );
        sqlx::query_as::<_, CloudGpuType>(&query)
            .bind(provider_id)
            .fetch_all(pool)
            .await
    }

    /// Update a GPU type.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCloudGpuType,
    ) -> Result<Option<CloudGpuType>, sqlx::Error> {
        let query = format!(
            "UPDATE cloud_gpu_types SET \
                name = COALESCE($2, name), \
                cost_per_hour_cents = COALESCE($3, cost_per_hour_cents), \
                max_gpu_count = COALESCE($4, max_gpu_count), \
                available = COALESCE($5, available), \
                metadata = COALESCE($6, metadata) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudGpuType>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.cost_per_hour_cents)
            .bind(input.max_gpu_count)
            .bind(input.available)
            .bind(&input.metadata)
            .fetch_optional(pool)
            .await
    }
}
