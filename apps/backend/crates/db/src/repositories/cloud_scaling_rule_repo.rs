//! Repository for the `cloud_scaling_rules` table (PRD-114).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::cloud_provider::{
    CloudScalingRule, CreateCloudScalingRule, UpdateCloudScalingRule,
};

const COLUMNS: &str = "\
    id, provider_id, gpu_type_id, min_instances, max_instances, \
    queue_threshold, cooldown_secs, budget_limit_cents, enabled, \
    last_scaled_at, created_at, updated_at";

pub struct CloudScalingRuleRepo;

impl CloudScalingRuleRepo {
    /// Create a new scaling rule.
    pub async fn create(
        pool: &PgPool,
        provider_id: DbId,
        input: &CreateCloudScalingRule,
    ) -> Result<CloudScalingRule, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_scaling_rules \
                (provider_id, gpu_type_id, min_instances, max_instances, \
                 queue_threshold, cooldown_secs, budget_limit_cents, enabled) \
             VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 1), \
                     COALESCE($5, 5), COALESCE($6, 300), $7, COALESCE($8, true)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .bind(provider_id)
            .bind(input.gpu_type_id)
            .bind(input.min_instances)
            .bind(input.max_instances)
            .bind(input.queue_threshold)
            .bind(input.cooldown_secs)
            .bind(input.budget_limit_cents)
            .bind(input.enabled)
            .fetch_one(pool)
            .await
    }

    /// Find a scaling rule by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CloudScalingRule>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM cloud_scaling_rules WHERE id = $1");
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List scaling rules for a provider.
    pub async fn list_by_provider(
        pool: &PgPool,
        provider_id: DbId,
    ) -> Result<Vec<CloudScalingRule>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_scaling_rules \
             WHERE provider_id = $1 \
             ORDER BY gpu_type_id ASC"
        );
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .bind(provider_id)
            .fetch_all(pool)
            .await
    }

    /// Find a scaling rule for a specific provider + GPU type.
    pub async fn find_by_provider_and_gpu_type(
        pool: &PgPool,
        provider_id: DbId,
        gpu_type_id: DbId,
    ) -> Result<Option<CloudScalingRule>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_scaling_rules \
             WHERE provider_id = $1 AND gpu_type_id = $2"
        );
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .bind(provider_id)
            .bind(gpu_type_id)
            .fetch_optional(pool)
            .await
    }

    /// List all enabled scaling rules (for the background scaling service).
    pub async fn list_enabled(pool: &PgPool) -> Result<Vec<CloudScalingRule>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_scaling_rules WHERE enabled = true ORDER BY id ASC"
        );
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a scaling rule.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCloudScalingRule,
    ) -> Result<Option<CloudScalingRule>, sqlx::Error> {
        let query = format!(
            "UPDATE cloud_scaling_rules SET \
                min_instances = COALESCE($2, min_instances), \
                max_instances = COALESCE($3, max_instances), \
                queue_threshold = COALESCE($4, queue_threshold), \
                cooldown_secs = COALESCE($5, cooldown_secs), \
                budget_limit_cents = COALESCE($6, budget_limit_cents), \
                enabled = COALESCE($7, enabled) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudScalingRule>(&query)
            .bind(id)
            .bind(input.min_instances)
            .bind(input.max_instances)
            .bind(input.queue_threshold)
            .bind(input.cooldown_secs)
            .bind(input.budget_limit_cents)
            .bind(input.enabled)
            .fetch_optional(pool)
            .await
    }

    /// Record a scaling action timestamp.
    pub async fn touch_last_scaled(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE cloud_scaling_rules SET last_scaled_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Reset cooldown for all scaling rules belonging to a provider by clearing `last_scaled_at`.
    pub async fn reset_cooldown_by_provider(pool: &PgPool, provider_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE cloud_scaling_rules SET last_scaled_at = NULL WHERE provider_id = $1",
        )
        .bind(provider_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete a scaling rule.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM cloud_scaling_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
