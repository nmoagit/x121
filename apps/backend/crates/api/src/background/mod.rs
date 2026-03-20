//! Background tasks and scheduled jobs.
//!
//! Each submodule provides a long-running async function intended to be
//! spawned via `tokio::spawn`. All tasks accept a [`CancellationToken`]
//! for graceful shutdown.

pub mod activity_persistence;
pub mod activity_retention;
pub mod activity_tracing;
pub mod delivery_assembly;
pub mod metrics_retention;
pub mod schedule_executor;
