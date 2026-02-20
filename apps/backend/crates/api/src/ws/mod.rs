//! WebSocket infrastructure for real-time communication.
//!
//! Provides connection management, heartbeat monitoring, and the HTTP
//! upgrade handler used by Axum routes.

mod handler;
mod heartbeat;
pub mod manager;

pub use handler::ws_handler;
pub use heartbeat::start_heartbeat;
pub use manager::WsManager;
