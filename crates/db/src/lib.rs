use sqlx::postgres::PgPoolOptions;

pub type DbPool = sqlx::PgPool;

/// Create a connection pool from a database URL.
pub async fn create_pool(database_url: &str) -> Result<DbPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
}
