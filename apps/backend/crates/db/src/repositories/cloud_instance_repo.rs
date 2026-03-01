//! Repository for the `cloud_instances` table (PRD-114).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::cloud_provider::{CloudInstance, CreateCloudInstance};
use crate::models::status::{CloudInstanceStatus, StatusId};

const COLUMNS: &str = "\
    id, provider_id, gpu_type_id, external_id, name, status_id, \
    ip_address, ssh_port, gpu_count, cost_per_hour_cents, total_cost_cents, \
    metadata, started_at, stopped_at, last_health_check, \
    created_at, updated_at";

pub struct CloudInstanceRepo;

impl CloudInstanceRepo {
    /// Insert a newly provisioned instance.
    pub async fn create(
        pool: &PgPool,
        provider_id: DbId,
        input: &CreateCloudInstance,
    ) -> Result<CloudInstance, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_instances \
                (provider_id, gpu_type_id, external_id, name, status_id, gpu_count, cost_per_hour_cents, metadata) \
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 1), $7, COALESCE($8, '{{}}'::jsonb)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(provider_id)
            .bind(input.gpu_type_id)
            .bind(&input.external_id)
            .bind(&input.name)
            .bind(CloudInstanceStatus::Provisioning.id())
            .bind(input.gpu_count)
            .bind(input.cost_per_hour_cents)
            .bind(&input.metadata)
            .fetch_one(pool)
            .await
    }

    /// Find an instance by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudInstance>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM cloud_instances WHERE id = $1");
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find an instance by its external (provider) ID within a provider.
    pub async fn find_by_external_id(
        pool: &PgPool,
        provider_id: DbId,
        external_id: &str,
    ) -> Result<Option<CloudInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_instances \
             WHERE provider_id = $1 AND external_id = $2"
        );
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(provider_id)
            .bind(external_id)
            .fetch_optional(pool)
            .await
    }

    /// List all instances for a provider.
    pub async fn list_by_provider(
        pool: &PgPool,
        provider_id: DbId,
    ) -> Result<Vec<CloudInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_instances \
             WHERE provider_id = $1 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(provider_id)
            .fetch_all(pool)
            .await
    }

    /// Count active (non-terminated, non-error) instances for a provider + GPU type.
    pub async fn active_count_by_gpu_type(
        pool: &PgPool,
        provider_id: DbId,
        gpu_type_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM cloud_instances \
             WHERE provider_id = $1 AND gpu_type_id = $2 \
               AND status_id NOT IN ($3, $4)",
        )
        .bind(provider_id)
        .bind(gpu_type_id)
        .bind(CloudInstanceStatus::Terminated.id())
        .bind(CloudInstanceStatus::Error.id())
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    /// Update instance status.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE cloud_instances SET status_id = $2 WHERE id = $1")
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update instance network info (after provision completes).
    pub async fn update_network(
        pool: &PgPool,
        id: DbId,
        ip_address: &str,
        ssh_port: Option<i32>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE cloud_instances SET ip_address = $2, ssh_port = $3, started_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .bind(ip_address)
        .bind(ssh_port)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Record a health check timestamp.
    pub async fn touch_health_check(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE cloud_instances SET last_health_check = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Mark instance as stopped.
    pub async fn mark_stopped(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE cloud_instances SET status_id = $2, stopped_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(CloudInstanceStatus::Stopped.id())
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Mark instance as terminated and record final cost.
    pub async fn mark_terminated(
        pool: &PgPool,
        id: DbId,
        total_cost_cents: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE cloud_instances SET status_id = $2, stopped_at = NOW(), total_cost_cents = $3 WHERE id = $1",
        )
        .bind(id)
        .bind(CloudInstanceStatus::Terminated.id())
        .bind(total_cost_cents)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// List all non-terminated instances for a provider (for emergency stop).
    pub async fn list_active_by_provider(
        pool: &PgPool,
        provider_id: DbId,
    ) -> Result<Vec<CloudInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_instances \
             WHERE provider_id = $1 AND status_id NOT IN ($2, $3) \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(provider_id)
            .bind(CloudInstanceStatus::Terminated.id())
            .bind(CloudInstanceStatus::Error.id())
            .fetch_all(pool)
            .await
    }

    /// List all active instances across all providers (for global emergency stop).
    pub async fn list_all_active(pool: &PgPool) -> Result<Vec<CloudInstance>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_instances \
             WHERE status_id NOT IN ($1, $2) \
             ORDER BY provider_id, created_at DESC"
        );
        sqlx::query_as::<_, CloudInstance>(&query)
            .bind(CloudInstanceStatus::Terminated.id())
            .bind(CloudInstanceStatus::Error.id())
            .fetch_all(pool)
            .await
    }
}
