//! HTTP-level integration tests for PRD-01 entity API endpoints.
//!
//! Uses Axum's tower::ServiceExt to send requests directly to the router
//! without an actual TCP listener.

mod common;

use axum::http::StatusCode;
use common::{body_json, delete, get, post_json, put_json};
use sqlx::PgPool;

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_project_returns_201(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "Test Project"}),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    assert_eq!(json["name"], "Test Project");
    assert!(json["id"].is_number());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_project_by_id(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    let create_resp = post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "Get Me"}),
    )
    .await;
    let created = body_json(create_resp).await;
    let id = created["id"].as_i64().unwrap();

    let app = common::build_test_app(pool);
    let response = get(app, &format!("/api/v1/projects/{id}")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["name"], "Get Me");
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_nonexistent_project_returns_404(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = get(app, "/api/v1/projects/999999").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_project(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    let create_resp = post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "Original"}),
    )
    .await;
    let created = body_json(create_resp).await;
    let id = created["id"].as_i64().unwrap();

    let app = common::build_test_app(pool);
    let response = put_json(
        app,
        &format!("/api/v1/projects/{id}"),
        serde_json::json!({"name": "Updated"}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["name"], "Updated");
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_project_returns_204(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    let create_resp = post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "Delete Me"}),
    )
    .await;
    let created = body_json(create_resp).await;
    let id = created["id"].as_i64().unwrap();

    let app = common::build_test_app(pool.clone());
    let response = delete(app, &format!("/api/v1/projects/{id}")).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Subsequent GET should 404.
    let app = common::build_test_app(pool);
    let response = get(app, &format!("/api/v1/projects/{id}")).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_projects(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "P1"}),
    )
    .await;

    let app = common::build_test_app(pool.clone());
    post_json(
        app,
        "/api/v1/projects",
        serde_json::json!({"name": "P2"}),
    )
    .await;

    let app = common::build_test_app(pool);
    let response = get(app, "/api/v1/projects").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let arr = json.as_array().unwrap();
    assert!(arr.len() >= 2);
}

// ---------------------------------------------------------------------------
// Character CRUD (nested under projects)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_character_under_project(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    let project = body_json(
        post_json(
            app,
            "/api/v1/projects",
            serde_json::json!({"name": "Char Project"}),
        )
        .await,
    )
    .await;
    let project_id = project["id"].as_i64().unwrap();

    let app = common::build_test_app(pool);
    let response = post_json(
        app,
        &format!("/api/v1/projects/{project_id}/characters"),
        serde_json::json!({"project_id": 0, "name": "Alice"}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);

    let json = body_json(response).await;
    assert_eq!(json["name"], "Alice");
    // project_id in body should be overridden by URL path.
    assert_eq!(json["project_id"], project_id);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_characters_for_project(pool: PgPool) {
    let app = common::build_test_app(pool.clone());
    let project = body_json(
        post_json(
            app,
            "/api/v1/projects",
            serde_json::json!({"name": "List Chars"}),
        )
        .await,
    )
    .await;
    let pid = project["id"].as_i64().unwrap();

    let app = common::build_test_app(pool.clone());
    post_json(
        app,
        &format!("/api/v1/projects/{pid}/characters"),
        serde_json::json!({"project_id": pid, "name": "B1"}),
    )
    .await;

    let app = common::build_test_app(pool.clone());
    post_json(
        app,
        &format!("/api/v1/projects/{pid}/characters"),
        serde_json::json!({"project_id": pid, "name": "B2"}),
    )
    .await;

    let app = common::build_test_app(pool);
    let response = get(app, &format!("/api/v1/projects/{pid}/characters")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json.as_array().unwrap().len(), 2);
}

// ---------------------------------------------------------------------------
// Hierarchical endpoint: Segments under scenes
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_segment_crud_under_scene(pool: PgPool) {
    // Set up: project -> character, scene_type, image_variant -> scene.
    // We use the repository layer directly to avoid many HTTP calls for setup.
    use trulience_db::models::character::CreateCharacter;
    use trulience_db::models::image::CreateImageVariant;
    use trulience_db::models::project::CreateProject;
    use trulience_db::models::scene::CreateScene;
    use trulience_db::models::scene_type::CreateSceneType;
    use trulience_db::repositories::*;

    let project = ProjectRepo::create(
        &pool,
        &CreateProject {
            name: "Seg API".to_string(),
            description: None,
            status_id: None,
            retention_days: None,
        },
    )
    .await
    .unwrap();
    let character = CharacterRepo::create(
        &pool,
        &CreateCharacter {
            project_id: project.id,
            name: "F".to_string(),
            status_id: None,
            metadata: None,
            settings: None,
        },
    )
    .await
    .unwrap();
    let scene_type = SceneTypeRepo::create(
        &pool,
        &CreateSceneType {
            project_id: Some(project.id),
            name: "Run".to_string(),
            status_id: None,
            workflow_json: None,
            lora_config: None,
            prompt_template: None,
            target_duration_secs: None,
            segment_duration_secs: None,
            variant_applicability: None,
            transition_segment_index: None,
            is_studio_level: None,
        },
    )
    .await
    .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &CreateImageVariant {
            character_id: character.id,
            source_image_id: None,
            derived_image_id: None,
            variant_label: "clothed".to_string(),
            status_id: None,
            file_path: "/img/f.png".to_string(),
        },
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(
        &pool,
        &CreateScene {
            character_id: character.id,
            scene_type_id: scene_type.id,
            image_variant_id: variant.id,
            status_id: None,
            transition_mode: None,
        },
    )
    .await
    .unwrap();

    // Now test the HTTP API for segments.
    let scene_id = scene.id;

    // POST /api/v1/scenes/{scene_id}/segments
    let app = common::build_test_app(pool.clone());
    let response = post_json(
        app,
        &format!("/api/v1/scenes/{scene_id}/segments"),
        serde_json::json!({"scene_id": 0, "sequence_index": 0}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let seg = body_json(response).await;
    let seg_id = seg["id"].as_i64().unwrap();
    assert_eq!(seg["scene_id"], scene_id);

    // GET /api/v1/scenes/{scene_id}/segments/{seg_id}
    let app = common::build_test_app(pool.clone());
    let response = get(
        app,
        &format!("/api/v1/scenes/{scene_id}/segments/{seg_id}"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    // GET /api/v1/scenes/{scene_id}/segments (list)
    let app = common::build_test_app(pool.clone());
    let response = get(app, &format!("/api/v1/scenes/{scene_id}/segments")).await;
    assert_eq!(response.status(), StatusCode::OK);
    let list = body_json(response).await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    // DELETE
    let app = common::build_test_app(pool.clone());
    let response = delete(
        app,
        &format!("/api/v1/scenes/{scene_id}/segments/{seg_id}"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // After delete, GET should 404.
    let app = common::build_test_app(pool);
    let response = get(
        app,
        &format!("/api/v1/scenes/{scene_id}/segments/{seg_id}"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Error response format
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_error_response_has_code_and_error_fields(pool: PgPool) {
    let app = common::build_test_app(pool);
    let response = get(app, "/api/v1/projects/999999").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let json = body_json(response).await;
    assert!(json["error"].is_string(), "Error response should have 'error' field");
    assert!(json["code"].is_string(), "Error response should have 'code' field");
    assert_eq!(json["code"], "NOT_FOUND");
}
