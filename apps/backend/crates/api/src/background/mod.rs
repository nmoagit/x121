//! Background tasks and scheduled jobs.
//!
//! Each submodule provides a long-running async function intended to be
//! spawned via `tokio::spawn`. All tasks accept a [`CancellationToken`]
//! for graceful shutdown.

pub mod metrics_retention;
