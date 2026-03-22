//! Route definitions for avatar metadata versions.
//!
//! Mounted under `/avatars`:
//! ```text
//! GET    /{avatar_id}/metadata/versions                  -> list_versions
//! POST   /{avatar_id}/metadata/versions                  -> create_manual_version
//! POST   /{avatar_id}/metadata/versions/generate         -> generate_version
//! GET    /{avatar_id}/metadata/versions/{version_id}     -> get_version
//! PATCH  /{avatar_id}/metadata/versions/{version_id}     -> update_version
//! DELETE /{avatar_id}/metadata/versions/{version_id}     -> delete_version
//! PUT    /{avatar_id}/metadata/versions/{version_id}/activate -> activate_version
//! PUT    /{avatar_id}/metadata/versions/{version_id}/reject   -> reject_version
//! POST   /{avatar_id}/metadata/versions/{version_id}/approve -> approve_metadata_version
//! POST   /{avatar_id}/metadata/versions/{version_id}/reject-approval -> reject_metadata_approval
//! POST   /{avatar_id}/metadata/mark-outdated                -> mark_metadata_outdated
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::avatar_metadata_version;
use crate::state::AppState;

/// Avatar-scoped metadata version routes, nested under `/avatars`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/metadata/versions",
            get(avatar_metadata_version::list_versions)
                .post(avatar_metadata_version::create_manual_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/generate",
            post(avatar_metadata_version::generate_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}",
            get(avatar_metadata_version::get_version)
                .patch(avatar_metadata_version::update_version)
                .delete(avatar_metadata_version::delete_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}/activate",
            put(avatar_metadata_version::activate_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}/reject",
            put(avatar_metadata_version::reject_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}/approve",
            post(avatar_metadata_version::approve_metadata_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}/unapprove",
            post(avatar_metadata_version::unapprove_metadata_version),
        )
        .route(
            "/{avatar_id}/metadata/versions/{version_id}/reject-approval",
            post(avatar_metadata_version::reject_metadata_approval),
        )
        .route(
            "/{avatar_id}/metadata/mark-outdated",
            post(avatar_metadata_version::mark_metadata_outdated),
        )
}
