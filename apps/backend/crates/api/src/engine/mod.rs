//! Job execution engine (PRD-07).
//!
//! Contains the background dispatcher that polls for pending jobs and
//! assigns them to available ComfyUI workers, plus the progress handler
//! that translates ComfyUI events into job record updates and WebSocket
//! notifications.

pub mod dispatcher;
pub mod progress;
