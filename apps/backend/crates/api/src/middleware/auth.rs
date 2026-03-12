//! JWT-based authentication extractor for Axum handlers.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use x121_core::error::CoreError;
use x121_core::types::DbId;

use crate::auth::jwt::validate_token;
use crate::error::AppError;
use crate::state::AppState;

/// Authenticated user extracted from a JWT Bearer token in the `Authorization` header.
///
/// Use this as an extractor parameter in any handler that requires authentication:
///
/// ```ignore
/// async fn my_handler(user: AuthUser) -> AppResult<Json<()>> {
///     tracing::info!(user_id = user.user_id, role = %user.role, "handling request");
///     Ok(Json(()))
/// }
/// ```
#[derive(Debug, Clone)]
pub struct AuthUser {
    /// The user's internal database id (from `claims.sub`).
    pub user_id: DbId,
    /// The user's role name (e.g. `"admin"`, `"creator"`, `"reviewer"`).
    pub role: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Try Authorization header first, then fall back to ?token= query param
        // (needed for WebSocket connections which can't set custom headers).
        let token = if let Some(auth_header) = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
        {
            auth_header.strip_prefix("Bearer ").ok_or_else(|| {
                AppError::Core(CoreError::Unauthorized(
                    "Invalid Authorization format. Expected: Bearer <token>".into(),
                ))
            })?
        } else if let Some(query) = parts.uri.query() {
            query
                .split('&')
                .find_map(|pair| pair.strip_prefix("token="))
                .ok_or_else(|| {
                    AppError::Core(CoreError::Unauthorized(
                        "Missing Authorization header or token query parameter".into(),
                    ))
                })?
        } else {
            return Err(AppError::Core(CoreError::Unauthorized(
                "Missing Authorization header".into(),
            )));
        };

        let claims = validate_token(token, &state.config.jwt).map_err(|_| {
            AppError::Core(CoreError::Unauthorized("Invalid or expired token".into()))
        })?;

        Ok(AuthUser {
            user_id: claims.sub,
            role: claims.role,
        })
    }
}
