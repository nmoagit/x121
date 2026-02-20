use std::time::Duration;

use sqlx::postgres::PgPoolOptions;

pub type DbPool = sqlx::PgPool;

/// Connection pool configuration with sensible defaults.
pub struct PoolConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub idle_timeout_secs: u64,
    pub acquire_timeout_secs: u64,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 2,
            idle_timeout_secs: 300,
            acquire_timeout_secs: 5,
        }
    }
}

/// Create a connection pool from a database URL with default settings.
pub async fn create_pool(database_url: &str) -> Result<DbPool, sqlx::Error> {
    create_pool_with_config(database_url, PoolConfig::default()).await
}

/// Create a connection pool from a database URL with custom settings.
pub async fn create_pool_with_config(
    database_url: &str,
    config: PoolConfig,
) -> Result<DbPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .idle_timeout(Duration::from_secs(config.idle_timeout_secs))
        .acquire_timeout(Duration::from_secs(config.acquire_timeout_secs))
        .connect(database_url)
        .await
}

/// Verify database connectivity by executing a simple query.
pub async fn health_check(pool: &DbPool) -> Result<(), sqlx::Error> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await?;
    Ok(())
}

/// Run all pending migrations from the workspace `migrations/` directory.
pub async fn run_migrations(pool: &DbPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
