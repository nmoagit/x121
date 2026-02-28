//! Repository for the `cloud_providers` table (PRD-114).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::cloud_provider::{
    CloudProvider, CloudProviderSafe, UpdateCloudProvider,
};
use crate::models::status::StatusId;

/// Column list for `cloud_providers` queries (full, including key material).
const COLUMNS: &str = "\
    id, name, provider_type, api_key_encrypted, api_key_nonce, \
    base_url, settings, status_id, budget_limit_cents, budget_period_start, \
    created_at, updated_at";

/// Column list without encrypted key material.
const SAFE_COLUMNS: &str = "\
    id, name, provider_type, base_url, settings, status_id, \
    budget_limit_cents, budget_period_start, created_at, updated_at";

pub struct CloudProviderRepo;

impl CloudProviderRepo {
    /// Insert a new cloud provider.
    pub async fn create(
        pool: &PgPool,
        name: &str,
        provider_type: &str,
        api_key_encrypted: &[u8],
        api_key_nonce: &[u8],
        base_url: Option<&str>,
        settings: &serde_json::Value,
        budget_limit_cents: Option<i64>,
    ) -> Result<CloudProvider, sqlx::Error> {
        let query = format!(
            "INSERT INTO cloud_providers \
                (name, provider_type, api_key_encrypted, api_key_nonce, base_url, settings, budget_limit_cents, budget_period_start) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CloudProvider>(&query)
            .bind(name)
            .bind(provider_type)
            .bind(api_key_encrypted)
            .bind(api_key_nonce)
            .bind(base_url)
            .bind(settings)
            .bind(budget_limit_cents)
            .fetch_one(pool)
            .await
    }

    /// Find a provider by ID (includes encrypted key for decryption).
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CloudProvider>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM cloud_providers WHERE id = $1");
        sqlx::query_as::<_, CloudProvider>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a provider by ID (safe view, no key material).
    pub async fn find_by_id_safe(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CloudProviderSafe>, sqlx::Error> {
        let query = format!("SELECT {SAFE_COLUMNS} FROM cloud_providers WHERE id = $1");
        sqlx::query_as::<_, CloudProviderSafe>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all providers (safe view).
    pub async fn list(pool: &PgPool) -> Result<Vec<CloudProviderSafe>, sqlx::Error> {
        let query = format!(
            "SELECT {SAFE_COLUMNS} FROM cloud_providers ORDER BY name ASC"
        );
        sqlx::query_as::<_, CloudProviderSafe>(&query)
            .fetch_all(pool)
            .await
    }

    /// List active providers.
    pub async fn list_active(pool: &PgPool) -> Result<Vec<CloudProvider>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM cloud_providers WHERE status_id = $1 ORDER BY name ASC"
        );
        sqlx::query_as::<_, CloudProvider>(&query)
            .bind(crate::models::status::CloudProviderStatus::Active.id())
            .fetch_all(pool)
            .await
    }

    /// Find providers by type.
    pub async fn find_by_type(
        pool: &PgPool,
        provider_type: &str,
    ) -> Result<Vec<CloudProviderSafe>, sqlx::Error> {
        let query = format!(
            "SELECT {SAFE_COLUMNS} FROM cloud_providers WHERE provider_type = $1 ORDER BY name ASC"
        );
        sqlx::query_as::<_, CloudProviderSafe>(&query)
            .bind(provider_type)
            .fetch_all(pool)
            .await
    }

    /// Update a provider. Non-`None` fields are applied.
    /// Note: api_key update is handled separately via update_api_key.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCloudProvider,
    ) -> Result<Option<CloudProviderSafe>, sqlx::Error> {
        let query = format!(
            "UPDATE cloud_providers SET \
                name = COALESCE($2, name), \
                base_url = COALESCE($3, base_url), \
                settings = COALESCE($4, settings), \
                status_id = COALESCE($5, status_id), \
                budget_limit_cents = COALESCE($6, budget_limit_cents) \
             WHERE id = $1 \
             RETURNING {SAFE_COLUMNS}"
        );
        sqlx::query_as::<_, CloudProviderSafe>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.base_url)
            .bind(&input.settings)
            .bind(input.status_id)
            .bind(input.budget_limit_cents)
            .fetch_optional(pool)
            .await
    }

    /// Update the encrypted API key for a provider.
    pub async fn update_api_key(
        pool: &PgPool,
        id: DbId,
        encrypted: &[u8],
        nonce: &[u8],
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE cloud_providers SET api_key_encrypted = $2, api_key_nonce = $3 WHERE id = $1",
        )
        .bind(id)
        .bind(encrypted)
        .bind(nonce)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update provider status.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE cloud_providers SET status_id = $2 WHERE id = $1")
            .bind(id)
            .bind(status_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Delete a provider.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM cloud_providers WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
