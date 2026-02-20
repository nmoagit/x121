use axum::extract::State;
use axum::{routing::get, Json, Router};
use serde::Serialize;

use crate::state::AppState;

/// Health check response payload.
#[derive(Serialize)]
pub struct HealthResponse {
    /// Overall service status.
    pub status: &'static str,
    /// Crate version from Cargo.toml.
    pub version: &'static str,
    /// Whether the database is reachable.
    pub db_healthy: bool,
}

/// GET /health -- returns service and database health.
async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_healthy = trulience_db::health_check(&state.pool).await.is_ok();

    let status = if db_healthy { "ok" } else { "degraded" };

    Json(HealthResponse {
        status,
        version: env!("CARGO_PKG_VERSION"),
        db_healthy,
    })
}

/// Mount health check routes (intended for root-level, NOT under `/api/v1`).
pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}
