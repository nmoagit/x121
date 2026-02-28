//! Cloud GPU provider trait and shared types (PRD-114).
//!
//! Defines the interface that each cloud GPU provider (RunPod, Lambda, etc.)
//! must implement, plus common data types shared across providers.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Provider trait
// ---------------------------------------------------------------------------

/// Trait implemented by each cloud GPU provider backend.
#[async_trait::async_trait]
pub trait CloudGpuProvider: Send + Sync {
    /// Provision a new GPU instance.
    async fn provision_instance(
        &self,
        gpu_type: &str,
        config: &ProvisionConfig,
    ) -> Result<InstanceInfo, CloudProviderError>;

    /// Start a stopped instance.
    async fn start_instance(&self, external_id: &str) -> Result<(), CloudProviderError>;

    /// Stop a running instance (preserves state).
    async fn stop_instance(&self, external_id: &str) -> Result<(), CloudProviderError>;

    /// Terminate an instance permanently.
    async fn terminate_instance(&self, external_id: &str) -> Result<(), CloudProviderError>;

    /// Get the current status of an instance.
    async fn get_instance_status(
        &self,
        external_id: &str,
    ) -> Result<InstanceStatus, CloudProviderError>;

    /// List available GPU types from the provider.
    async fn list_gpu_types(&self) -> Result<Vec<GpuTypeInfo>, CloudProviderError>;

    /// Submit a serverless job.
    async fn submit_serverless_job(
        &self,
        endpoint_id: &str,
        input: serde_json::Value,
    ) -> Result<String, CloudProviderError>;

    /// Get the status of a serverless job.
    async fn get_serverless_job_status(
        &self,
        endpoint_id: &str,
        job_id: &str,
    ) -> Result<ServerlessJobStatus, CloudProviderError>;

    /// Cancel a serverless job.
    async fn cancel_serverless_job(
        &self,
        endpoint_id: &str,
        job_id: &str,
    ) -> Result<(), CloudProviderError>;

    /// Health check against the provider API.
    async fn health_check(&self) -> Result<ProviderHealth, CloudProviderError>;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/// Configuration for provisioning a new instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionConfig {
    pub name: Option<String>,
    pub gpu_count: u32,
    pub volume_mount_path: Option<String>,
    pub network_volume_id: Option<String>,
    pub docker_image: Option<String>,
    pub env_vars: std::collections::HashMap<String, String>,
    pub template_id: Option<String>,
}

impl Default for ProvisionConfig {
    fn default() -> Self {
        Self {
            name: None,
            gpu_count: 1,
            volume_mount_path: None,
            network_volume_id: None,
            docker_image: None,
            env_vars: std::collections::HashMap::new(),
            template_id: None,
        }
    }
}

/// Information about a provisioned instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceInfo {
    pub external_id: String,
    pub name: Option<String>,
    pub ip_address: Option<String>,
    pub ssh_port: Option<u16>,
    pub status: InstanceStatus,
    pub cost_per_hour_cents: u32,
}

/// Instance lifecycle status (provider-agnostic).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceStatus {
    Provisioning,
    Starting,
    Running,
    Stopping,
    Stopped,
    Terminating,
    Terminated,
    Error,
}

impl InstanceStatus {
    /// Map to the corresponding DB status ID.
    ///
    /// Sync: db/src/models/status.rs `CloudInstanceStatus` enum discriminants.
    pub fn to_db_status_id(self) -> i16 {
        match self {
            Self::Provisioning => 1,
            Self::Starting => 2,
            Self::Running => 3,
            Self::Stopping => 4,
            Self::Stopped => 5,
            Self::Terminating => 6,
            Self::Terminated => 7,
            Self::Error => 8,
        }
    }
}

/// Information about a GPU type offered by a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuTypeInfo {
    pub gpu_id: String,
    pub name: String,
    pub vram_mb: u32,
    pub cost_per_hour_cents: u32,
    pub max_gpu_count: u16,
    pub available: bool,
}

/// Serverless job status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerlessJobStatus {
    pub job_id: String,
    pub status: ServerlessStatus,
    pub output: Option<serde_json::Value>,
    pub execution_time_ms: Option<u64>,
}

/// Serverless job lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerlessStatus {
    InQueue,
    InProgress,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}

/// Provider health check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub healthy: bool,
    pub latency_ms: u64,
    pub message: Option<String>,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors from cloud GPU provider operations.
#[derive(Debug, thiserror::Error)]
pub enum CloudProviderError {
    #[error("Provider API error: {0}")]
    ApiError(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("Instance not found: {0}")]
    NotFound(String),

    #[error("Rate limited by provider")]
    RateLimited,

    #[error("Budget exceeded: spent {spent_cents} of {limit_cents} cents")]
    BudgetExceeded { spent_cents: i64, limit_cents: i64 },

    #[error("Provisioning failed: {0}")]
    ProvisionFailed(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Provider temporarily unavailable")]
    Unavailable,
}
