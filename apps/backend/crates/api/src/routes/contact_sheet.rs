//! Route definitions for the character face contact sheet (PRD-103).
//!
//! Character-scoped routes are merged into `/characters`.
//! The standalone delete route is mounted separately.

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::contact_sheet;
use crate::state::AppState;

/// Character-scoped contact sheet routes, merged into `/characters`.
///
/// ```text
/// GET    /{id}/contact-sheet              -> list_character_images
/// POST   /{id}/contact-sheet              -> create_image
/// POST   /{id}/contact-sheet/generate     -> generate_contact_sheet
/// GET    /{id}/contact-sheet/export       -> export_contact_sheet
/// ```
pub fn character_contact_sheet_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/contact-sheet",
            get(contact_sheet::list_character_images).post(contact_sheet::create_image),
        )
        .route(
            "/{id}/contact-sheet/generate",
            post(contact_sheet::generate_contact_sheet),
        )
        .route(
            "/{id}/contact-sheet/export",
            get(contact_sheet::export_contact_sheet),
        )
}

/// Standalone contact sheet image delete route.
///
/// ```text
/// DELETE /{id}                            -> delete_image
/// ```
pub fn contact_sheet_image_router() -> Router<AppState> {
    Router::new().route("/{id}", delete(contact_sheet::delete_image))
}
