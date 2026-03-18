//! Route definitions for video streaming, metadata, and thumbnails.
//!
//! Mounted at `/videos`. Videos are identified by a polymorphic
//! `source_type` (segment | version) and `source_id`.
//!
//! ```text
//! POST /generate-previews                                generate_previews
//! POST /generate-web-playback                            generate_web_playback
//! POST /backfill-metadata                                backfill_video_metadata
//! POST /backfill-snapshots                               backfill_snapshots
//! GET  /{source_type}/{source_id}/stream                 stream_video
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
        .route("/generate-previews", post(video::generate_previews))
        .route("/generate-web-playback", post(video::generate_web_playback))
        .route("/backfill-metadata", post(video::backfill_video_metadata))
        .route("/backfill-snapshots", post(video::backfill_snapshots))
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
