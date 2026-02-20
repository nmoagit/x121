//! Authentication and authorization primitives.
//!
//! - [`password`] -- Argon2id password hashing and verification.
//! - [`jwt`] -- JWT access-token generation, validation, and refresh-token helpers.

pub mod jwt;
pub mod password;
