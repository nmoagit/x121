//! Route definitions for the `/notifications` resource.
//!
//! All endpoints require authentication.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::notification;
use crate::state::AppState;

/// Routes mounted at `/notifications`.
///
/// ```text
/// GET    /                          -> list_notifications
/// POST   /read-all                  -> mark_all_read
/// GET    /unread-count              -> unread_count
/// POST   /{id}/read                 -> mark_read
///
/// GET    /preferences               -> get_preferences
/// PUT    /preferences/{event_type_id} -> update_preference
///
/// GET    /settings                  -> get_settings
/// PUT    /settings                  -> update_settings
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        // Core notification endpoints
        .route("/", get(notification::list_notifications))
        .route("/read-all", post(notification::mark_all_read))
        .route("/unread-count", get(notification::unread_count))
        .route("/{id}/read", post(notification::mark_read))
        // Preferences endpoints
        .route("/preferences", get(notification::get_preferences))
        .route(
            "/preferences/{event_type_id}",
            put(notification::update_preference),
        )
        // Settings endpoints
        .route(
            "/settings",
            get(notification::get_settings).put(notification::update_settings),
        )
}
