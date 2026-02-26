//! Platform events emitted by the ComfyUI bridge.
//!
//! These events represent high-level state changes that the rest of
//! the platform cares about.  They are produced by the bridge layer
//! (not yet implemented) after interpreting raw WebSocket messages.

use serde::Serialize;
use x121_core::types::DbId;

/// A platform-level event originating from a ComfyUI instance.
#[derive(Debug, Clone, Serialize)]
pub enum ComfyUIEvent {
    /// The WebSocket connection to an instance was established.
    InstanceConnected { instance_id: DbId },

    /// The WebSocket connection to an instance was lost.
    InstanceDisconnected { instance_id: DbId },

    /// A generation job made progress (step N of M).
    GenerationProgress {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        /// Completion percentage (0-100).
        percent: i16,
        /// The node currently executing, if known.
        current_node: Option<String>,
    },

    /// A generation job completed successfully.
    GenerationCompleted {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        /// Raw output data from ComfyUI (images, filenames, etc.).
        outputs: serde_json::Value,
    },

    /// A generation job failed with an error.
    GenerationError {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
        /// Human-readable error description.
        error: String,
    },

    /// A generation job was cancelled by the platform.
    GenerationCancelled {
        instance_id: DbId,
        platform_job_id: DbId,
        prompt_id: String,
    },
}
