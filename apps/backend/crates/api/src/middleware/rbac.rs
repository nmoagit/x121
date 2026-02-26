//! Role-based access control (RBAC) extractors.
//!
//! Each extractor wraps [`AuthUser`] and rejects requests whose role does not
//! meet the minimum requirement. Use these in route handlers to enforce
//! authorization at the type level.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use x121_core::error::CoreError;
use x121_core::roles::{ROLE_ADMIN, ROLE_CREATOR};

use super::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

/// Requires the `admin` role. Rejects with 403 Forbidden otherwise.
///
/// ```ignore
/// async fn admin_only(RequireAdmin(user): RequireAdmin) -> AppResult<Json<()>> {
///     // user is guaranteed to be an admin here
///     Ok(Json(()))
/// }
/// ```
pub struct RequireAdmin(pub AuthUser);

impl FromRequestParts<AppState> for RequireAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != ROLE_ADMIN {
            return Err(AppError::Core(CoreError::Forbidden(
                "Admin role required".into(),
            )));
        }
        Ok(RequireAdmin(user))
    }
}

/// Requires `creator` or `admin` role. Rejects with 403 Forbidden otherwise.
///
/// ```ignore
/// async fn creator_or_admin(RequireCreator(user): RequireCreator) -> AppResult<Json<()>> {
///     Ok(Json(()))
/// }
/// ```
pub struct RequireCreator(pub AuthUser);

impl FromRequestParts<AppState> for RequireCreator {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != ROLE_ADMIN && user.role != ROLE_CREATOR {
            return Err(AppError::Core(CoreError::Forbidden(
                "Creator or Admin role required".into(),
            )));
        }
        Ok(RequireCreator(user))
    }
}

/// Requires any authenticated user (any valid role).
///
/// Functionally equivalent to [`AuthUser`] but named explicitly for use in
/// route definitions where the intent "this route requires authentication"
/// should be self-documenting.
///
/// ```ignore
/// async fn any_authed(RequireAuth(user): RequireAuth) -> AppResult<Json<()>> {
///     Ok(Json(()))
/// }
/// ```
pub struct RequireAuth(pub AuthUser);

impl FromRequestParts<AppState> for RequireAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        Ok(RequireAuth(user))
    }
}
