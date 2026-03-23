//! Route definitions for generator scripts (PRD-143).

use axum::routing::get;
use axum::Router;

use crate::handlers::generator_script;
use crate::state::AppState;

/// Routes mounted at `/admin/generator-scripts`.
///
/// ```text
/// GET    /           -> list_scripts
/// POST   /           -> create_script
/// GET    /{id}       -> get_script
/// PUT    /{id}       -> update_script
/// DELETE /{id}       -> delete_script
/// POST   /{id}/execute -> execute_script
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(generator_script::list_scripts).post(generator_script::create_script),
        )
        .route(
            "/{id}",
            get(generator_script::get_script)
                .put(generator_script::update_script)
                .delete(generator_script::delete_script),
        )
        .route(
            "/{id}/execute",
            axum::routing::post(generator_script::execute_script),
        )
}
