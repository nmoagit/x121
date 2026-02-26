//! Route definitions for Project Configuration Templates (PRD-74).
//!
//! ```text
//! PROJECT CONFIGS:
//! GET    /                          list_configs (?limit, offset)
//! GET    /recommended               list_recommended
//! POST   /                          create_config
//! GET    /{id}                      get_config
//! PUT    /{id}                      update_config
//! DELETE /{id}                      delete_config
//! POST   /import                    import_config
//! POST   /{id}/diff/{project_id}    diff_config
//!
//! PROJECT EXPORT (merged into /projects):
//! POST   /{id}/export-config        export_project_config
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::project_config;
use crate::state::AppState;

/// Config template routes -- mounted at `/project-configs`.
pub fn project_config_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(project_config::create_config).get(project_config::list_configs),
        )
        .route("/recommended", get(project_config::list_recommended))
        .route(
            "/{id}",
            get(project_config::get_config)
                .put(project_config::update_config)
                .delete(project_config::delete_config),
        )
        .route("/import", post(project_config::import_config))
}

/// Config diff routes -- mounted at `/project-configs`.
pub fn project_config_diff_router() -> Router<AppState> {
    Router::new().route("/{id}/diff/{project_id}", post(project_config::diff_config))
}

/// Project export route -- merged into `/projects`.
pub fn project_export_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/export-config",
        post(project_config::export_project_config),
    )
}
