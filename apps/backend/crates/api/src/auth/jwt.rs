//! JWT access-token generation/validation and refresh-token helpers.
//!
//! Access tokens are HS256-signed JWTs containing a [`Claims`] payload.
//! Refresh tokens are opaque random strings; only their SHA-256 hash is stored
//! server-side so a database leak does not compromise active sessions.

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use x121_core::types::DbId;

/// JWT claims embedded in every access token.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    /// Subject -- the user's internal database id.
    pub sub: DbId,
    /// The user's role name (e.g. `"admin"`, `"user"`).
    pub role: String,
    /// Expiration time (UTC Unix timestamp).
    pub exp: i64,
    /// Issued-at time (UTC Unix timestamp).
    pub iat: i64,
    /// Unique token identifier (UUID v4) for revocation / audit.
    pub jti: String,
}

/// Configuration for JWT token generation and validation.
#[derive(Debug, Clone)]
pub struct JwtConfig {
    /// HMAC-SHA256 secret used to sign and verify tokens.
    pub secret: String,
    /// Access token lifetime in minutes (default: 15).
    pub access_token_expiry_mins: i64,
    /// Refresh token lifetime in days (default: 7).
    pub refresh_token_expiry_days: i64,
}

/// Default access token expiry in minutes.
const DEFAULT_ACCESS_EXPIRY_MINS: i64 = 15;
/// Default refresh token expiry in days.
const DEFAULT_REFRESH_EXPIRY_DAYS: i64 = 7;

impl JwtConfig {
    /// Load JWT configuration from environment variables.
    ///
    /// | Env Var                    | Required | Default |
    /// |----------------------------|----------|---------|
    /// | `JWT_SECRET`               | **yes**  | --      |
    /// | `JWT_ACCESS_EXPIRY_MINS`   | no       | `15`    |
    /// | `JWT_REFRESH_EXPIRY_DAYS`  | no       | `7`     |
    ///
    /// # Panics
    ///
    /// Panics if `JWT_SECRET` is not set or is empty.
    pub fn from_env() -> Self {
        let secret =
            std::env::var("JWT_SECRET").expect("JWT_SECRET must be set in the environment");
        assert!(!secret.is_empty(), "JWT_SECRET must not be empty");

        let access_token_expiry_mins: i64 = std::env::var("JWT_ACCESS_EXPIRY_MINS")
            .unwrap_or_else(|_| DEFAULT_ACCESS_EXPIRY_MINS.to_string())
            .parse()
            .expect("JWT_ACCESS_EXPIRY_MINS must be a valid i64");

        let refresh_token_expiry_days: i64 = std::env::var("JWT_REFRESH_EXPIRY_DAYS")
            .unwrap_or_else(|_| DEFAULT_REFRESH_EXPIRY_DAYS.to_string())
            .parse()
            .expect("JWT_REFRESH_EXPIRY_DAYS must be a valid i64");

        Self {
            secret,
            access_token_expiry_mins,
            refresh_token_expiry_days,
        }
    }
}

/// Generate an HS256 access token for the given user.
///
/// The token contains the user id, role, issue time, expiration, and a unique
/// `jti` claim that can be used for revocation.
pub fn generate_access_token(
    user_id: DbId,
    role: &str,
    config: &JwtConfig,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now().timestamp();
    let exp = now + config.access_token_expiry_mins * 60;

    let claims = Claims {
        sub: user_id,
        role: role.to_string(),
        exp,
        iat: now,
        jti: Uuid::new_v4().to_string(),
    };

    encode(
        &Header::default(), // HS256
        &claims,
        &EncodingKey::from_secret(config.secret.as_bytes()),
    )
}

/// Validate and decode an access token, returning the embedded [`Claims`].
///
/// Validates the signature, expiration, and issued-at claims automatically.
pub fn validate_token(
    token: &str,
    config: &JwtConfig,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.secret.as_bytes()),
        &Validation::default(), // HS256, validates exp
    )?;
    Ok(token_data.claims)
}

/// Generate a cryptographically random refresh token.
///
/// Returns a tuple of `(plaintext_token, sha256_hex_hash)`. The plaintext is
/// sent to the client; only the hash should be persisted server-side.
pub fn generate_refresh_token() -> (String, String) {
    let plaintext = Uuid::new_v4().to_string();
    let hash = hash_refresh_token(&plaintext);
    (plaintext, hash)
}

/// Compute the SHA-256 hex digest of a refresh token.
///
/// Use this to compare an incoming refresh token against the stored hash.
pub fn hash_refresh_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to build a test config with a known secret.
    fn test_config() -> JwtConfig {
        JwtConfig {
            secret: "test-secret-that-is-long-enough-for-hmac".to_string(),
            access_token_expiry_mins: 15,
            refresh_token_expiry_days: 7,
        }
    }

    #[test]
    fn test_generate_and_validate_access_token() {
        let config = test_config();
        let token =
            generate_access_token(42, "admin", &config).expect("token generation should succeed");

        let claims = validate_token(&token, &config).expect("token validation should succeed");
        assert_eq!(claims.sub, 42);
        assert_eq!(claims.role, "admin");
        assert!(claims.exp > claims.iat);
        assert!(!claims.jti.is_empty());
    }

    #[test]
    fn test_expired_token_fails() {
        let config = test_config();

        // Manually create an already-expired token.
        // Use a margin well beyond the default 60-second leeway.
        let now = chrono::Utc::now().timestamp();
        let claims = Claims {
            sub: 1,
            role: "user".to_string(),
            exp: now - 300, // expired 5 minutes ago (well past leeway)
            iat: now - 600,
            jti: Uuid::new_v4().to_string(),
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(config.secret.as_bytes()),
        )
        .expect("encoding should succeed");

        let result = validate_token(&token, &config);
        assert!(result.is_err(), "expired token must fail validation");
    }

    #[test]
    fn test_refresh_token_hash_matches() {
        let (plaintext, hash) = generate_refresh_token();

        // Re-hashing the same plaintext must produce the same digest.
        let rehashed = hash_refresh_token(&plaintext);
        assert_eq!(hash, rehashed, "hash of the same token must be stable");

        // Sanity: the hash should be a 64-char hex string (SHA-256).
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_different_secrets_fail() {
        let config_a = JwtConfig {
            secret: "secret-alpha".to_string(),
            access_token_expiry_mins: 15,
            refresh_token_expiry_days: 7,
        };
        let config_b = JwtConfig {
            secret: "secret-bravo".to_string(),
            access_token_expiry_mins: 15,
            refresh_token_expiry_days: 7,
        };

        let token =
            generate_access_token(1, "user", &config_a).expect("token generation should succeed");

        let result = validate_token(&token, &config_b);
        assert!(
            result.is_err(),
            "token signed with a different secret must fail"
        );
    }
}
