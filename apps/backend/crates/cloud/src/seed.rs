//! One-time env-to-DB seed migration for cloud provider configuration (PRD-130).
//!
//! Reads RunPod configuration from environment variables and creates a
//! `cloud_providers` row if none exists. This bridges the legacy `.env`-based
//! `PodOrchestrator` config with the DB-driven provider registry.

use sqlx::PgPool;
use x121_core::cloud::CloudProviderError;
use x121_core::types::DbId;

use x121_db::repositories::{CloudGpuTypeRepo, CloudProviderRepo};

/// Seed the database with cloud provider configuration from environment
/// variables. One-time migration from `.env` to DB config.
///
/// Does nothing if:
/// - A `cloud_providers` row with `provider_type = 'runpod'` already exists
/// - `RUNPOD_API_KEY` env var is not set
///
/// On success, returns `Some(provider_id)` of the newly created row.
pub async fn seed_provider_from_env(
    pool: &PgPool,
    master_key: &[u8; 32],
) -> Result<Option<DbId>, CloudProviderError> {
    // Check if a RunPod provider already exists in the DB.
    let existing = CloudProviderRepo::find_by_type(pool, "runpod")
        .await
        .map_err(|e| CloudProviderError::ApiError(format!("DB query failed: {e}")))?;

    if !existing.is_empty() {
        tracing::debug!(
            count = existing.len(),
            "RunPod provider(s) already exist in DB, skipping env seed"
        );
        return Ok(None);
    }

    // Read the API key from env — if not set, seeding is not applicable.
    let api_key = match std::env::var("RUNPOD_API_KEY") {
        Ok(key) if !key.is_empty() => key,
        _ => {
            tracing::debug!("RUNPOD_API_KEY not set, skipping env seed");
            return Ok(None);
        }
    };

    // Encrypt the API key for storage.
    let (encrypted, nonce) =
        x121_core::crypto::encrypt_api_key(&api_key, master_key).map_err(|e| {
            CloudProviderError::InvalidConfig(format!("Failed to encrypt API key: {e}"))
        })?;

    // Build the RunPod settings JSON from env vars.
    let template_id = std::env::var("RUNPOD_TEMPLATE_ID").ok();
    let gpu_type_id = std::env::var("RUNPOD_GPU_TYPE_ID").ok();
    let network_volume_id = std::env::var("RUNPOD_NETWORK_VOLUME_ID").ok();
    let ssh_key_path = std::env::var("SSH_KEY_PATH").ok();

    let settings = serde_json::json!({
        "template_id": template_id,
        "network_volume_id": network_volume_id,
        "gpu_type_id": gpu_type_id,
        "ssh_key_path": ssh_key_path,
    });

    // Insert the provider row.
    let provider = CloudProviderRepo::create(
        pool, "RunPod", "runpod", &encrypted, &nonce,
        None, // base_url — RunPod uses the default GraphQL endpoint
        &settings, None, // budget_limit_cents
    )
    .await
    .map_err(|e| CloudProviderError::ApiError(format!("Failed to create provider row: {e}")))?;

    tracing::info!(
        provider_id = provider.id,
        "Seeded RunPod cloud provider from environment variables"
    );

    // If a GPU type ID is set, seed a gpu_types row so scaling rules can reference it.
    if let Some(ref gpu_id) = gpu_type_id {
        let gpu_input = x121_db::models::cloud_provider::CreateCloudGpuType {
            gpu_id: gpu_id.clone(),
            name: gpu_id.clone(), // Use the ID as name; will be updated on first sync
            vram_mb: 0,           // Unknown until first sync
            cost_per_hour_cents: 0,
            max_gpu_count: None,
            metadata: None,
        };

        match CloudGpuTypeRepo::upsert(pool, provider.id, &gpu_input).await {
            Ok(gpu_type) => {
                tracing::info!(
                    gpu_type_id = gpu_type.id,
                    gpu_id,
                    "Seeded GPU type from env"
                );
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    gpu_id,
                    "Failed to seed GPU type (provider was created successfully)"
                );
            }
        }
    }

    Ok(Some(provider.id))
}
