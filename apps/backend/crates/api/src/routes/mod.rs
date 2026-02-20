pub mod health;

use axum::routing::get;
use axum::Router;

use crate::state::AppState;
use crate::ws;

/// Build the `/api/v1` route tree.
///
/// Each route group will be added here as the corresponding PRD is implemented:
/// - `/auth`       -- PRD-03: Authentication
/// - `/users`      -- PRD-04: User management
/// - `/projects`   -- PRD-05: Project management
/// - `/assets`     -- PRD-06: Asset pipeline
/// - `/pipeline`   -- PRD-07: ComfyUI pipeline
/// - `/ws`         -- PRD-02 Phase 6: WebSocket
pub fn api_routes() -> Router<AppState> {
    Router::new()
        // WebSocket endpoint.
        .route("/ws", get(ws::ws_handler))
    // Additional route groups will be nested here as they are implemented.
}
