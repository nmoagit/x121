//! Repository for the `cloud_scaling_events` audit table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::cloud_provider::{CloudScalingEvent, CreateCloudScalingEvent};

const COLUMNS: &str = "\
    id, rule_id, provider_id, action, reason, instances_changed, \
    queue_depth, current_count, budget_spent_cents, cooldown_remaining_secs, \
    created_at";

pub struct CloudScalingEventRepo;

impl CloudScalingEventRepo {
    /// Record a scaling decision.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCloudScalingEvent,
    ) -> Result<CloudScalingEvent, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_scaling_events \
                (rule_id, provider_id, action, reason, instances_changed, \
                 queue_depth, current_count, budget_spent_cents, cooldown_remaining_secs) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudScalingEvent>(&query)
            .bind(input.rule_id)
            .bind(input.provider_id)
            .bind(&input.action)
            .bind(&input.reason)
            .bind(input.instances_changed)
            .bind(input.queue_depth)
            .bind(input.current_count)
            .bind(input.budget_spent_cents)
            .bind(input.cooldown_remaining_secs)
            .fetch_one(pool)
            .await
    }

    /// List recent scaling events for a provider, newest first.
    pub async fn list_by_provider(
        pool: &PgPool,
        provider_id: DbId,
        limit: i64,
    ) -> Result<Vec<CloudScalingEvent>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_scaling_events \
             WHERE provider_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2"
        );
        sqlx::query_as::<_, CloudScalingEvent>(&query)
            .bind(provider_id)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List recent scaling events for a specific rule, newest first.
    pub async fn list_by_rule(
        pool: &PgPool,
        rule_id: DbId,
        limit: i64,
    ) -> Result<Vec<CloudScalingEvent>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_scaling_events \
             WHERE rule_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2"
        );
        sqlx::query_as::<_, CloudScalingEvent>(&query)
            .bind(rule_id)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Delete all scaling events for a provider. Returns the number of deleted rows.
    pub async fn delete_by_provider(pool: &PgPool, provider_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM cloud_scaling_events WHERE provider_id = $1")
            .bind(provider_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Prune old events, keeping only the most recent N per provider.
    pub async fn prune(pool: &PgPool, keep_per_provider: i64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM cloud_scaling_events WHERE id NOT IN ( \
                 SELECT id FROM ( \
                     SELECT id, ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY created_at DESC) AS rn \
                     FROM cloud_scaling_events \
                 ) ranked WHERE rn <= $1 \
             )"
        )
        .bind(keep_per_provider)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
