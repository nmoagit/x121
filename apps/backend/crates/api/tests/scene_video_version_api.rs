//! HTTP-level integration tests for scene video version API endpoints.
//!
//! Uses Axum's tower::ServiceExt to send requests directly to the router.
//! Prerequisite entities (project, character, scene_type, image_variant, scene)
//! are created via the repository layer to keep tests focused on HTTP behaviour.

mod common;

use axum::http::StatusCode;
use common::{body_json, build_test_app, delete, get, put_json};
use sqlx::PgPool;
use trulience_db::models::character::CreateCharacter;
use trulience_db::models::image::CreateImageVariant;
use trulience_db::models::project::CreateProject;
use trulience_db::models::scene::CreateScene;
use trulience_db::models::scene_type::CreateSceneType;
use trulience_db::models::scene_video_version::CreateSceneVideoVersion;
use trulience_db::repositories::{
    CharacterRepo, ImageVariantRepo, ProjectRepo, SceneRepo, SceneTypeRepo, SceneVideoVersionRepo,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build the full prerequisite hierarchy and return the scene_id.
async fn setup_scene(pool: &PgPool, suffix: &str) -> i64 {
    let project = ProjectRepo::create(
        pool,
        &CreateProject {
            name: format!("API_VV_{suffix}"),
            description: None,
            status_id: None,
            retention_days: None,
        },
    )
    .await
    .unwrap();
    let character = CharacterRepo::create(
        pool,
        &CreateCharacter {
            project_id: project.id,
            name: format!("C_{suffix}"),
            status_id: None,
            metadata: None,
            settings: None,
        },
    )
    .await
    .unwrap();
    let scene_type = SceneTypeRepo::create(
        pool,
        &CreateSceneType {
            project_id: Some(project.id),
            name: format!("ST_{suffix}"),
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
        pool,
        &CreateImageVariant {
            character_id: character.id,
            source_image_id: None,
            derived_image_id: None,
            variant_label: "clothed".to_string(),
            status_id: None,
            file_path: format!("/img/{suffix}.png"),
        },
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(
        pool,
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
    scene.id
}

fn new_version(scene_id: i64) -> CreateSceneVideoVersion {
    CreateSceneVideoVersion {
        scene_id,
        source: "generated".to_string(),
        file_path: "/path/to/video.mp4".to_string(),
        file_size_bytes: Some(2048),
        duration_secs: Some(10.0),
        is_final: None,
        notes: None,
    }
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/scenes/{scene_id}/versions returns list
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_versions(pool: PgPool) {
    let scene_id = setup_scene(&pool, "list").await;

    // Create 2 versions via repo.
    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();
    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let app = build_test_app(pool);
    let response = get(app, &format!("/api/v1/scenes/{scene_id}/versions")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let arr = json.as_array().unwrap();
    assert_eq!(arr.len(), 2, "should return 2 versions");
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/scenes/{scene_id}/versions/{id} returns version
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_version(pool: PgPool) {
    let scene_id = setup_scene(&pool, "get").await;

    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let app = build_test_app(pool);
    let response = get(
        app,
        &format!("/api/v1/scenes/{scene_id}/versions/{}", version.id),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["id"], version.id);
    assert_eq!(json["scene_id"], scene_id);
    assert_eq!(json["version_number"], 1);
    assert_eq!(json["source"], "generated");
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/scenes/{scene_id}/versions/99999 returns 404
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_version_404(pool: PgPool) {
    let scene_id = setup_scene(&pool, "get404").await;

    let app = build_test_app(pool);
    let response = get(app, &format!("/api/v1/scenes/{scene_id}/versions/99999")).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Test: PUT /api/v1/scenes/{scene_id}/versions/{id}/set-final
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final(pool: PgPool) {
    let scene_id = setup_scene(&pool, "set_final").await;

    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let app = build_test_app(pool);
    let response = put_json(
        app,
        &format!(
            "/api/v1/scenes/{scene_id}/versions/{}/set-final",
            version.id
        ),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["is_final"], true, "version should now be final");
    assert_eq!(json["id"], version.id);
}

// ---------------------------------------------------------------------------
// Test: DELETE non-final version returns 204
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_version_204(pool: PgPool) {
    let scene_id = setup_scene(&pool, "del204").await;

    // Create a non-final version.
    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();
    assert!(!version.is_final);

    let app = build_test_app(pool);
    let response = delete(
        app,
        &format!("/api/v1/scenes/{scene_id}/versions/{}", version.id),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

// ---------------------------------------------------------------------------
// Test: DELETE final version returns 409
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_final_version_409(pool: PgPool) {
    let scene_id = setup_scene(&pool, "del409").await;

    // Create a final version.
    let version = SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene_id))
        .await
        .unwrap();
    assert!(version.is_final);

    let app = build_test_app(pool);
    let response = delete(
        app,
        &format!("/api/v1/scenes/{scene_id}/versions/{}", version.id),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// ---------------------------------------------------------------------------
// Test: soft-deleted version is hidden from GET
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_get(pool: PgPool) {
    let scene_id = setup_scene(&pool, "sd_get").await;

    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    // Soft-delete via repo.
    SceneVideoVersionRepo::soft_delete(&pool, version.id)
        .await
        .unwrap();

    // GET via API should return 404.
    let app = build_test_app(pool);
    let response = get(
        app,
        &format!("/api/v1/scenes/{scene_id}/versions/{}", version.id),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
