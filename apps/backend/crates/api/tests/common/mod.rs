// All functions in this module are shared test helpers. Not every test binary
// uses every helper, so we suppress dead_code warnings at the item level.
#![allow(dead_code)]

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

use trulience_api::auth::jwt::JwtConfig;
use trulience_api::auth::password::hash_password;
use trulience_api::config::ServerConfig;
use trulience_api::router::build_app_router;
use trulience_api::scripting::orchestrator::ScriptOrchestrator;
use trulience_api::state::AppState;
use trulience_api::ws::WsManager;
use trulience_db::models::user::{CreateUser, User};
use trulience_db::repositories::UserRepo;

/// Build a test `ServerConfig` with safe defaults.
///
/// Uses `http://localhost:5173` as CORS origin (matching the dev default)
/// and a 30-second request timeout.
pub fn test_config() -> ServerConfig {
    ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 0,
        cors_origins: vec!["http://localhost:5173".to_string()],
        request_timeout_secs: 30,
        shutdown_timeout_secs: 30,
        jwt: JwtConfig {
            secret: "test-secret-for-integration-tests-minimum-length".to_string(),
            access_token_expiry_mins: 15,
            refresh_token_expiry_days: 7,
        },
    }
}

/// Build the full application router with all middleware layers, using the
/// given database pool and an optional script orchestrator.
///
/// Delegates to [`build_app_router`] so integration tests exercise the same
/// middleware stack (CORS, request ID, timeout, tracing, panic recovery)
/// that production uses.
pub async fn build_test_app(pool: PgPool) -> Router {
    build_test_app_with(pool, None).await
}

/// Build the test app with a script orchestrator enabled.
pub async fn build_test_app_with_orchestrator(pool: PgPool) -> Router {
    let orchestrator = ScriptOrchestrator::new(pool.clone(), "/tmp/trulience_test_venvs".into());
    build_test_app_with(pool, Some(Arc::new(orchestrator))).await
}

/// Internal builder that accepts an optional orchestrator.
async fn build_test_app_with(
    pool: PgPool,
    script_orchestrator: Option<Arc<ScriptOrchestrator>>,
) -> Router {
    let config = test_config();
    let ws_manager = Arc::new(WsManager::new());
    let comfyui_manager = trulience_comfyui::manager::ComfyUIManager::start(pool.clone()).await;

    let event_bus = Arc::new(trulience_events::EventBus::default());

    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        ws_manager,
        comfyui_manager,
        event_bus,
        script_orchestrator,
    };

    build_app_router(state, &config)
}

// ---------------------------------------------------------------------------
// Shared HTTP test helpers
// ---------------------------------------------------------------------------

/// Collect the response body into a `serde_json::Value`.
pub async fn body_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

/// Send a JSON request with the given HTTP method.
pub async fn send_json(
    app: Router,
    method: Method,
    uri: &str,
    body: serde_json::Value,
) -> axum::response::Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// POST JSON to the given URI and return the response.
pub async fn post_json(
    app: Router,
    uri: &str,
    body: serde_json::Value,
) -> axum::response::Response {
    send_json(app, Method::POST, uri, body).await
}

/// PUT JSON to the given URI and return the response.
pub async fn put_json(app: Router, uri: &str, body: serde_json::Value) -> axum::response::Response {
    send_json(app, Method::PUT, uri, body).await
}

/// GET from the given URI.
pub async fn get(app: Router, uri: &str) -> axum::response::Response {
    let request = Request::builder().uri(uri).body(Body::empty()).unwrap();
    app.oneshot(request).await.unwrap()
}

/// DELETE the given URI.
pub async fn delete(app: Router, uri: &str) -> axum::response::Response {
    let request = Request::builder()
        .method(Method::DELETE)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}

// ---------------------------------------------------------------------------
// Authenticated HTTP test helpers
// ---------------------------------------------------------------------------

/// Send a JSON request with the given HTTP method and a Bearer token.
pub async fn send_json_auth(
    app: Router,
    method: Method,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// POST JSON with a Bearer token.
pub async fn post_json_auth(
    app: Router,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    send_json_auth(app, Method::POST, uri, body, token).await
}

/// PUT JSON with a Bearer token.
pub async fn put_json_auth(
    app: Router,
    uri: &str,
    body: serde_json::Value,
    token: &str,
) -> axum::response::Response {
    send_json_auth(app, Method::PUT, uri, body, token).await
}

/// GET from the given URI with a Bearer token.
pub async fn get_auth(app: Router, uri: &str, token: &str) -> axum::response::Response {
    let request = Request::builder()
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}

/// DELETE the given URI with a Bearer token.
pub async fn delete_auth(app: Router, uri: &str, token: &str) -> axum::response::Response {
    let request = Request::builder()
        .method(Method::DELETE)
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    app.oneshot(request).await.unwrap()
}

// ---------------------------------------------------------------------------
// Shared user / auth test helpers
// ---------------------------------------------------------------------------

/// Create a test user directly in the database and return the user row plus
/// the plaintext password used.
pub async fn create_test_user(
    pool: &PgPool,
    username: &str,
    role_id: i64,
) -> (User, String) {
    let password = "test_password_123!";
    let hashed = hash_password(password).expect("hashing should succeed");
    let input = CreateUser {
        username: username.to_string(),
        email: format!("{username}@test.com"),
        password_hash: hashed,
        role_id,
    };
    let user = UserRepo::create(pool, &input)
        .await
        .expect("user creation should succeed");
    (user, password.to_string())
}

/// Log in a user via the API and return the JSON response containing
/// `access_token`, `refresh_token`, and `user` info.
pub async fn login_user(app: Router, username: &str, password: &str) -> serde_json::Value {
    let body = serde_json::json!({ "username": username, "password": password });
    let response = post_json(app, "/api/v1/auth/login", body).await;
    assert_eq!(response.status(), StatusCode::OK);
    body_json(response).await
}

/// Convenience: log in and return just the access token string.
pub async fn login_for_token(app: Router, username: &str, password: &str) -> String {
    let json = login_user(app, username, password).await;
    json["access_token"]
        .as_str()
        .expect("access_token should be a string")
        .to_string()
}
