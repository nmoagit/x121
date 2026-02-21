//! Hardware monitoring domain logic (PRD-06).
//!
//! Contains the threshold evaluation engine and related types.
//! All logic in this module is pure (no DB access) — it lives in the `core`
//! crate so it can be tested in isolation.

pub mod thresholds;
