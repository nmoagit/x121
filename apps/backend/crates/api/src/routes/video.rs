//! Route definitions for video streaming, metadata, and thumbnails.
//!
//! Mounted at `/videos`. Videos are identified by a polymorphic
//! `source_type` (segment | version) and `source_id`.
//!
//! ```text
//! GET  /{source_type}/{source_id}/stream                stream_video
//! GET  /{source_type}/{source_id}/metadata               get_metadata
//! GET  /{source_type}/{source_id}/thumbnails/{frame}     get_thumbnail
//! POST /{source_type}/{source_id}/thumbnails             generate_thumbnails
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::video;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{source_type}/{source_id}/stream",
            get(video::stream_video),
        )
        .route(
            "/{source_type}/{source_id}/metadata",
            get(video::get_metadata),
        )
        .route(
            "/{source_type}/{source_id}/thumbnails/{frame}",
            get(video::get_thumbnail),
        )
        .route(
            "/{source_type}/{source_id}/thumbnails",
            post(video::generate_thumbnails),
        )
}
