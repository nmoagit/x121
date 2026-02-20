//! ComfyUI WebSocket and REST client library.
//!
//! Provides typed message parsing, WebSocket connection management,
//! HTTP API wrappers, reconnection logic, and platform event types
//! for integrating with ComfyUI image-generation servers.

pub mod api;
pub mod client;
pub mod events;
pub mod manager;
pub mod messages;
pub mod processor;
pub mod reconnect;
