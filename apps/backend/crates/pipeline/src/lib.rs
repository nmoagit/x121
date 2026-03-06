//! Video generation pipeline (PRD-24).
//!
//! Orchestrates the flow: load scene context → build ComfyUI workflow →
//! submit to ComfyUI → handle completion → drive the recursive loop.

pub mod completion_handler;
pub mod context_loader;
pub mod error;
pub mod loop_driver;
pub mod submitter;
pub mod workflow_builder;

pub use error::{load_scene_and_type, PipelineError};
pub use workflow_builder::{build_workflow, GenerationContext};
