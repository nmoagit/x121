//! Notification routing infrastructure.
//!
//! The [`NotificationRouter`] subscribes to the event bus and delivers
//! notifications to users based on their preferences, DND settings, and
//! digest configuration.

pub mod router;

pub use router::NotificationRouter;
