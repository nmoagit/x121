//! Repository for the `cloud_cost_events` table (PRD-114).

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::cloud_provider::{CloudCostEvent, CreateCloudCostEvent, ProviderCostSummary};

const COLUMNS: &str = "\
    id, instance_id, provider_id, event_type, amount_cents, description, created_at";

pub struct CloudCostEventRepo;

impl CloudCostEventRepo {
    /// Record a cost event.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCloudCostEvent,
    ) -> Result<CloudCostEvent, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_cost_events \
                (instance_id, provider_id, event_type, amount_cents, description) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudCostEvent>(&query)
            .bind(input.instance_id)
            .bind(input.provider_id)
            .bind(&input.event_type)
            .bind(input.amount_cents)
            .bind(&input.description)
            .fetch_one(pool)
            .await
    }

    /// List cost events for an instance.
    pub async fn list_by_instance(
        pool: &PgPool,
        instance_id: DbId,
    ) -> Result<Vec<CloudCostEvent>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_cost_events \
             WHERE instance_id = $1 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CloudCostEvent>(&query)
            .bind(instance_id)
            .fetch_all(pool)
            .await
    }

    /// List cost events for a provider, optionally filtered by date range.
    pub async fn list_by_provider(
        pool: &PgPool,
        provider_id: DbId,
        since: Option<Timestamp>,
        until: Option<Timestamp>,
    ) -> Result<Vec<CloudCostEvent>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_cost_events \
             WHERE provider_id = $1 \
               AND ($2::timestamptz IS NULL OR created_at >= $2) \
               AND ($3::timestamptz IS NULL OR created_at <= $3) \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CloudCostEvent>(&query)
            .bind(provider_id)
            .bind(since)
            .bind(until)
            .fetch_all(pool)
            .await
    }

    /// Sum cost for a provider within a date range.
    pub async fn sum_by_provider_in_range(
        pool: &PgPool,
        provider_id: DbId,
        since: Timestamp,
        until: Timestamp,
    ) -> Result<ProviderCostSummary, sqlx::Error> {
        sqlx::query_as::<_, ProviderCostSummary>(
            "SELECT \
                COALESCE(SUM(amount_cents), 0)::BIGINT AS total_cost_cents, \
                COUNT(*) AS event_count \
             FROM cloud_cost_events \
             WHERE provider_id = $1 AND created_at >= $2 AND created_at <= $3",
        )
        .bind(provider_id)
        .bind(since)
        .bind(until)
        .fetch_one(pool)
        .await
    }
}
