//! Trulience API server library.
//!
//! Exposes the core building blocks (config, state, error handling, routes,
//! WebSocket infrastructure) so integration tests and the binary entrypoint
//! can both access them.

pub mod auth;
pub mod background;
pub mod config;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod notifications;
pub mod response;
pub mod routes;
pub mod scripting;
pub mod state;
pub mod ws;
