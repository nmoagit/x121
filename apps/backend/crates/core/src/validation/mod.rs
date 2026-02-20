//! Data validation engine.
//!
//! Provides rule types, a pure-logic evaluator, and import preview / conflict
//! detection — all without database dependencies.

pub mod conflict;
pub mod evaluator;
pub mod import_preview;
pub mod rules;
