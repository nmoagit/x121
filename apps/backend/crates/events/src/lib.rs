//! Trulience event bus and notification infrastructure.
//!
//! This crate provides the core building blocks for the platform-wide
//! event system (PRD-10):
//!
//! - [`EventBus`] — in-process publish/subscribe hub backed by
//!   `tokio::sync::broadcast`.
//! - [`PlatformEvent`] — the canonical domain event envelope.
//! - [`EventPersistence`] — background service that durably writes every
//!   event to the `events` table.
//! - [`delivery`] — external delivery channels (webhook, email).
//! - [`DigestScheduler`] — periodic digest notification processor.

pub mod bus;
pub mod delivery;
pub mod digest;
pub mod persistence;

pub use bus::{EventBus, PlatformEvent};
pub use delivery::email::{EmailConfig, EmailDelivery};
pub use delivery::webhook::WebhookDelivery;
pub use digest::DigestScheduler;
pub use persistence::EventPersistence;
