use std::net::SocketAddr;

use axum::Router;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trulience_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = trulience_db::create_pool(&database_url)
        .await
        .expect("Failed to connect to database");
    tracing::info!("Database connection pool created");

    trulience_db::health_check(&pool)
        .await
        .expect("Database health check failed");
    tracing::info!("Database health check passed");

    trulience_db::run_migrations(&pool)
        .await
        .expect("Failed to run database migrations");
    tracing::info!("Database migrations applied");

    let app = Router::new()
        .merge(routes::health::router())
        .layer(TraceLayer::new_for_http());

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()
        .expect("PORT must be a number");

    let addr = SocketAddr::new(host.parse().expect("Invalid HOST"), port);
    tracing::info!("Starting server on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
