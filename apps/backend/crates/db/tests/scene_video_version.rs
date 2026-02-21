//! Integration tests for scene video version CRUD and version-management operations.
//!
//! Exercises the `SceneVideoVersionRepo` against a real database:
//! - Create version with auto-incremented version_number
//! - `create_as_final` unmarks previous final version
//! - `set_final` swaps the final marker atomically
//! - `next_version_number` returns correct values
//! - `list_by_scene` returns versions in descending version_number order
//! - `find_final_for_scene` returns the current final
//! - `find_scenes_missing_final` identifies scenes without a final version
//! - Soft-delete hides versions from queries

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

fn new_project(name: &str) -> CreateProject {
    CreateProject {
        name: name.to_string(),
        description: None,
        status_id: None,
        retention_days: None,
    }
}

fn new_character(project_id: i64, name: &str) -> CreateCharacter {
    CreateCharacter {
        project_id,
        name: name.to_string(),
        status_id: None,
        metadata: None,
        settings: None,
    }
}

fn new_scene_type(project_id: Option<i64>, name: &str) -> CreateSceneType {
    CreateSceneType {
        project_id,
        name: name.to_string(),
        status_id: None,
        workflow_json: None,
        lora_config: None,
        prompt_template: None,
        target_duration_secs: None,
        segment_duration_secs: None,
        variant_applicability: None,
        transition_segment_index: None,
        is_studio_level: None,
    }
}

fn new_image_variant(character_id: i64, label: &str, path: &str) -> CreateImageVariant {
    CreateImageVariant {
        character_id,
        source_image_id: None,
        derived_image_id: None,
        variant_label: label.to_string(),
        status_id: None,
        file_path: path.to_string(),
        variant_type: None,
        provenance: None,
        is_hero: None,
        file_size_bytes: None,
        width: None,
        height: None,
        format: None,
        version: None,
        parent_variant_id: None,
        generation_params: None,
    }
}

fn new_scene(character_id: i64, scene_type_id: i64, image_variant_id: i64) -> CreateScene {
    CreateScene {
        character_id,
        scene_type_id,
        image_variant_id,
        status_id: None,
        transition_mode: None,
    }
}

fn new_version(scene_id: i64) -> CreateSceneVideoVersion {
    CreateSceneVideoVersion {
        scene_id,
        source: "generated".to_string(),
        file_path: "/path/to/video.mp4".to_string(),
        file_size_bytes: Some(1024),
        duration_secs: Some(5.5),
        is_final: None,
        notes: None,
    }
}

/// Build the full prerequisite hierarchy needed for scene video version tests.
/// Returns (project_id, scene_id).
async fn setup_hierarchy(pool: &PgPool, suffix: &str) -> (i64, i64) {
    let project = ProjectRepo::create(pool, &new_project(&format!("VVP_{suffix}")))
        .await
        .unwrap();
    let character =
        CharacterRepo::create(pool, &new_character(project.id, &format!("VVC_{suffix}")))
            .await
            .unwrap();
    let scene_type = SceneTypeRepo::create(
        pool,
        &new_scene_type(Some(project.id), &format!("VVST_{suffix}")),
    )
    .await
    .unwrap();
    let variant = ImageVariantRepo::create(
        pool,
        &new_image_variant(character.id, "clothed", &format!("/img/vv_{suffix}.png")),
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(pool, &new_scene(character.id, scene_type.id, variant.id))
        .await
        .unwrap();
    (project.id, scene.id)
}

// ---------------------------------------------------------------------------
// Test: create version assigns version_number and correct defaults
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_version(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "create").await;

    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    assert!(version.id > 0, "id should be auto-generated");
    assert_eq!(version.scene_id, scene_id);
    assert_eq!(version.version_number, 1);
    assert_eq!(version.source, "generated");
    assert!(!version.is_final, "default is_final should be false");
    assert_eq!(version.file_size_bytes, Some(1024));
    assert_eq!(version.duration_secs, Some(5.5));
}

// ---------------------------------------------------------------------------
// Test: create_as_final unmarks previous final version
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_as_final_unmarks_previous(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "as_final").await;

    // Create v1 as final.
    let v1 = SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene_id))
        .await
        .unwrap();
    assert!(v1.is_final, "v1 should be final");
    assert_eq!(v1.version_number, 1);

    // Create v2 as final -- should unmark v1.
    let v2 = SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene_id))
        .await
        .unwrap();
    assert!(v2.is_final, "v2 should be final");
    assert_eq!(v2.version_number, 2);

    // Verify v1 is no longer final.
    let v1_reloaded = SceneVideoVersionRepo::find_by_id(&pool, v1.id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !v1_reloaded.is_final,
        "v1 should no longer be final after v2 was created as final"
    );
}

// ---------------------------------------------------------------------------
// Test: set_final swaps correctly
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final_swaps_correctly(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "set_final").await;

    // Create v1 (not final) and v2 as final.
    let v1 = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();
    let v2 = SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene_id))
        .await
        .unwrap();
    assert!(!v1.is_final);
    assert!(v2.is_final);

    // Set v1 as final -- should swap.
    let v1_set = SceneVideoVersionRepo::set_final(&pool, scene_id, v1.id)
        .await
        .unwrap()
        .expect("set_final should return Some");
    assert!(v1_set.is_final, "v1 should now be final");

    // Verify v2 is no longer final.
    let v2_reloaded = SceneVideoVersionRepo::find_by_id(&pool, v2.id)
        .await
        .unwrap()
        .unwrap();
    assert!(
        !v2_reloaded.is_final,
        "v2 should no longer be final after set_final(v1)"
    );
}

// ---------------------------------------------------------------------------
// Test: set_final with nonexistent version returns None
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_set_final_nonexistent_returns_none(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "set_final_404").await;

    let result = SceneVideoVersionRepo::set_final(&pool, scene_id, 999_999)
        .await
        .unwrap();
    assert!(
        result.is_none(),
        "set_final with non-existent version_id should return None"
    );
}

// ---------------------------------------------------------------------------
// Test: next_version_number increments correctly
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_next_version_number_increments(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "next_ver").await;

    let first = SceneVideoVersionRepo::next_version_number(&pool, scene_id)
        .await
        .unwrap();
    assert_eq!(
        first, 1,
        "next_version_number should be 1 when no versions exist"
    );

    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let second = SceneVideoVersionRepo::next_version_number(&pool, scene_id)
        .await
        .unwrap();
    assert_eq!(
        second, 2,
        "next_version_number should be 2 after one version"
    );
}

// ---------------------------------------------------------------------------
// Test: list_by_scene ordered by version_number descending
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_by_scene_ordered_desc(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "list_desc").await;

    // Create 3 versions.
    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();
    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();
    SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let versions = SceneVideoVersionRepo::list_by_scene(&pool, scene_id)
        .await
        .unwrap();
    assert_eq!(versions.len(), 3);
    // Descending order: 3, 2, 1.
    assert_eq!(versions[0].version_number, 3);
    assert_eq!(versions[1].version_number, 2);
    assert_eq!(versions[2].version_number, 1);
}

// ---------------------------------------------------------------------------
// Test: find_final_for_scene returns current final
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_final_for_scene(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "find_final").await;

    // No final version yet.
    let none = SceneVideoVersionRepo::find_final_for_scene(&pool, scene_id)
        .await
        .unwrap();
    assert!(
        none.is_none(),
        "should be None when no final version exists"
    );

    // Create a final version.
    let v1 = SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let found = SceneVideoVersionRepo::find_final_for_scene(&pool, scene_id)
        .await
        .unwrap()
        .expect("should find the final version");
    assert_eq!(found.id, v1.id);
    assert!(found.is_final);
}

// ---------------------------------------------------------------------------
// Test: find_scenes_missing_final identifies scenes without a final version
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_scenes_missing_final(pool: PgPool) {
    // Set up a project with two scenes (need unique scene_types or image_variants).
    let project = ProjectRepo::create(&pool, &new_project("MissingFinal"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "MFChar"))
        .await
        .unwrap();
    let st1 = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "MF_Dance"))
        .await
        .unwrap();
    let st2 = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "MF_Run"))
        .await
        .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/mf.png"),
    )
    .await
    .unwrap();

    let scene1 = SceneRepo::create(&pool, &new_scene(character.id, st1.id, variant.id))
        .await
        .unwrap();
    let scene2 = SceneRepo::create(&pool, &new_scene(character.id, st2.id, variant.id))
        .await
        .unwrap();

    // Give scene1 a final version.
    SceneVideoVersionRepo::create_as_final(&pool, &new_version(scene1.id))
        .await
        .unwrap();

    // scene2 has no final version.
    let missing = SceneVideoVersionRepo::find_scenes_missing_final(&pool, project.id)
        .await
        .unwrap();
    assert_eq!(
        missing.len(),
        1,
        "only scene2 should be missing a final version"
    );
    assert_eq!(missing[0], scene2.id);
}

// ---------------------------------------------------------------------------
// Test: soft_delete hides version from find_by_id and list_by_scene
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_version(pool: PgPool) {
    let (_project_id, scene_id) = setup_hierarchy(&pool, "sd_ver").await;

    let version = SceneVideoVersionRepo::create(&pool, &new_version(scene_id))
        .await
        .unwrap();

    let deleted = SceneVideoVersionRepo::soft_delete(&pool, version.id)
        .await
        .unwrap();
    assert!(deleted, "soft_delete should return true");

    let found = SceneVideoVersionRepo::find_by_id(&pool, version.id)
        .await
        .unwrap();
    assert!(
        found.is_none(),
        "find_by_id should return None for soft-deleted version"
    );

    let list = SceneVideoVersionRepo::list_by_scene(&pool, scene_id)
        .await
        .unwrap();
    assert!(
        !list.iter().any(|v| v.id == version.id),
        "list_by_scene should not include soft-deleted version"
    );
}
