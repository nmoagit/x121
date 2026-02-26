//! `x121-agent` -- lightweight GPU metrics daemon.
//!
//! Runs on GPU worker machines, collects NVIDIA GPU metrics via NVML,
//! and pushes them to the X121 backend over WebSocket.  Also
//! listens for service restart commands from the backend.
//!
//! # Environment variables
//!
//! | Variable               | Required | Default | Description                           |
//! |------------------------|----------|---------|---------------------------------------|
//! | `BACKEND_WS_URL`       | yes      | --      | WebSocket endpoint, e.g. `ws://host:3000/ws/metrics` |
//! | `WORKER_ID`            | yes      | --      | Integer ID for this worker            |
//! | `METRICS_INTERVAL_SECS`| no       | `5`     | Seconds between metric pushes         |

use std::time::Duration;

use x121_agent::collector;
use x121_agent::sender;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Default interval between metrics collection + push cycles.
const DEFAULT_INTERVAL_SECS: u64 = 5;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "x121_agent=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let ws_url = std::env::var("BACKEND_WS_URL").unwrap_or_else(|_| {
        tracing::error!("BACKEND_WS_URL environment variable is required");
        std::process::exit(1);
    });

    let worker_id: i64 = std::env::var("WORKER_ID")
        .unwrap_or_else(|_| {
            tracing::error!("WORKER_ID environment variable is required");
            std::process::exit(1);
        })
        .parse()
        .unwrap_or_else(|_| {
            tracing::error!("WORKER_ID must be a valid integer");
            std::process::exit(1);
        });

    let interval_secs: u64 = std::env::var("METRICS_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_INTERVAL_SECS);

    let interval = Duration::from_secs(interval_secs);

    tracing::info!(
        worker_id,
        ws_url = %ws_url,
        interval_secs,
        "Starting x121-agent",
    );

    let collector = collector::MetricsCollector::new();

    tracing::info!(gpu_count = collector.gpu_count(), "GPU detection complete",);

    sender::run(&ws_url, worker_id, interval, &collector).await;
}
