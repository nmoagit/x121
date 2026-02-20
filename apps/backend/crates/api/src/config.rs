use crate::auth::jwt::JwtConfig;

/// Server configuration loaded from environment variables.
///
/// All fields have sensible defaults suitable for local development.
/// In production, override via environment variables.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Bind address (default: `0.0.0.0`).
    pub host: String,
    /// Bind port (default: `3000`).
    pub port: u16,
    /// Allowed CORS origins, parsed from comma-separated `CORS_ORIGINS` env var.
    pub cors_origins: Vec<String>,
    /// HTTP request timeout in seconds (default: `30`).
    pub request_timeout_secs: u64,
    /// Graceful shutdown timeout in seconds (default: `30`).
    /// Used in Phase 7 (graceful shutdown with drain).
    #[allow(dead_code)]
    pub shutdown_timeout_secs: u64,
    /// JWT token configuration (secret, expiry durations).
    pub jwt: JwtConfig,
}

impl ServerConfig {
    /// Load configuration from environment variables with defaults.
    ///
    /// | Env Var                | Default                    |
    /// |------------------------|----------------------------|
    /// | `HOST`                 | `0.0.0.0`                  |
    /// | `PORT`                 | `3000`                     |
    /// | `CORS_ORIGINS`         | `http://localhost:5173`    |
    /// | `REQUEST_TIMEOUT_SECS` | `30`                       |
    /// | `SHUTDOWN_TIMEOUT_SECS`| `30`                       |
    pub fn from_env() -> Self {
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());

        let port: u16 = std::env::var("PORT")
            .unwrap_or_else(|_| "3000".into())
            .parse()
            .expect("PORT must be a valid u16");

        let cors_origins: Vec<String> = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:5173".into())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let request_timeout_secs: u64 = std::env::var("REQUEST_TIMEOUT_SECS")
            .unwrap_or_else(|_| "30".into())
            .parse()
            .expect("REQUEST_TIMEOUT_SECS must be a valid u64");

        let shutdown_timeout_secs: u64 = std::env::var("SHUTDOWN_TIMEOUT_SECS")
            .unwrap_or_else(|_| "30".into())
            .parse()
            .expect("SHUTDOWN_TIMEOUT_SECS must be a valid u64");

        let jwt = JwtConfig::from_env();

        Self {
            host,
            port,
            cors_origins,
            request_timeout_secs,
            shutdown_timeout_secs,
            jwt,
        }
    }
}
