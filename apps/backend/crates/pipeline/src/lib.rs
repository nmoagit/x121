//! Video generation pipeline (PRD-24).
//!
//! Orchestrates the flow: load scene context → build ComfyUI workflow →
//! submit to ComfyUI → handle completion → drive the recursive loop.

pub mod completion_handler;
pub mod context_loader;
pub mod error;
pub mod loop_driver;
pub mod output_classifier;
pub mod snapshot;
pub mod submitter;
pub mod version_creator;
pub mod workflow_builder;

pub use error::{load_scene_and_type, PipelineError};
pub use output_classifier::{classify_outputs, ClassifiedOutput, OutputRole};
pub use snapshot::build_generation_snapshot;
pub use version_creator::create_version_from_completion;
pub use workflow_builder::{build_workflow, GenerationContext};
