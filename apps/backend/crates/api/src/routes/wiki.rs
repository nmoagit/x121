//! Route definitions for the Studio Wiki & Contextual Help feature (PRD-56).
//!
//! Registered under `/wiki/articles`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::wiki;
use crate::state::AppState;

/// Wiki article routes, registered as `/wiki/articles`.
///
/// ```text
/// GET    /                          list_articles
/// POST   /                          create_article
/// GET    /search                    search_articles
/// GET    /pinned                    list_pinned
/// GET    /help/{element_id}         get_contextual_help
/// GET    /{slug}                    get_article_by_slug
/// PUT    /{slug}                    update_article
/// DELETE /{slug}                    delete_article
/// GET    /{slug}/versions           list_versions
/// GET    /{slug}/versions/{version} get_version
/// POST   /{slug}/revert/{version}   revert_to_version
/// GET    /{slug}/diff               diff_versions
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(wiki::list_articles).post(wiki::create_article))
        .route("/search", get(wiki::search_articles))
        .route("/pinned", get(wiki::list_pinned))
        .route("/help/{element_id}", get(wiki::get_contextual_help))
        .route(
            "/{slug}",
            get(wiki::get_article_by_slug)
                .put(wiki::update_article)
                .delete(wiki::delete_article),
        )
        .route("/{slug}/versions", get(wiki::list_versions))
        .route("/{slug}/versions/{version}", get(wiki::get_version))
        .route("/{slug}/revert/{version}", post(wiki::revert_to_version))
        .route("/{slug}/diff", get(wiki::diff_versions))
}
