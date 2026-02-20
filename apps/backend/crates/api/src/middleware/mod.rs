//! Authentication and authorization middleware extractors.
//!
//! - [`auth::AuthUser`] -- Extracts the authenticated user from a JWT Bearer token.
//! - [`rbac::RequireAdmin`] -- Requires the `admin` role.
//! - [`rbac::RequireCreator`] -- Requires `creator` or `admin` role.
//! - [`rbac::RequireAuth`] -- Requires any authenticated user.

pub mod auth;
pub mod rbac;
