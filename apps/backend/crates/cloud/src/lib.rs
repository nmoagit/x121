//! Cloud GPU provider integration (PRD-114).
//!
//! This crate contains:
//! - RunPod provider implementation (GraphQL + Serverless REST)
//! - Provider registry for runtime provider management
//! - Background services (scaling, monitoring, reconciliation)
//! - S3 file transfer bridge

pub mod registry;
pub mod runpod;
pub mod services;
pub mod storage;
