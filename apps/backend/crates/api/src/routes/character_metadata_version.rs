//! Route definitions for character metadata versions.
//!
//! Mounted under `/characters`:
//! ```text
//! GET    /{character_id}/metadata/versions                  -> list_versions
//! POST   /{character_id}/metadata/versions                  -> create_manual_version
//! POST   /{character_id}/metadata/versions/generate         -> generate_version
//! GET    /{character_id}/metadata/versions/{version_id}     -> get_version
//! PATCH  /{character_id}/metadata/versions/{version_id}     -> update_version
//! DELETE /{character_id}/metadata/versions/{version_id}     -> delete_version
//! PUT    /{character_id}/metadata/versions/{version_id}/activate -> activate_version
//! PUT    /{character_id}/metadata/versions/{version_id}/reject   -> reject_version
//! POST   /{character_id}/metadata/versions/{version_id}/approve -> approve_metadata_version
//! POST   /{character_id}/metadata/versions/{version_id}/reject-approval -> reject_metadata_approval
//! POST   /{character_id}/metadata/mark-outdated                -> mark_metadata_outdated
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::character_metadata_version;
use crate::state::AppState;

/// Character-scoped metadata version routes, nested under `/characters`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/metadata/versions",
            get(character_metadata_version::list_versions)
                .post(character_metadata_version::create_manual_version),
        )
        .route(
            "/{character_id}/metadata/versions/generate",
            post(character_metadata_version::generate_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}",
            get(character_metadata_version::get_version)
                .patch(character_metadata_version::update_version)
                .delete(character_metadata_version::delete_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/activate",
            put(character_metadata_version::activate_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/reject",
            put(character_metadata_version::reject_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/approve",
            post(character_metadata_version::approve_metadata_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/unapprove",
            post(character_metadata_version::unapprove_metadata_version),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/reject-approval",
            post(character_metadata_version::reject_metadata_approval),
        )
        .route(
            "/{character_id}/metadata/mark-outdated",
            post(character_metadata_version::mark_metadata_outdated),
        )
}
