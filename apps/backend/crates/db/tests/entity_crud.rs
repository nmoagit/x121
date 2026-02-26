//! Integration tests for PRD-01 entity CRUD operations.
//!
//! Exercises the full repository layer against a real database:
//! - Create full hierarchy (project -> character -> scene -> segment)
//! - Cascade delete behaviour
//! - Unique constraint violations
//! - Foreign key violations
//! - Update and list operations

use sqlx::PgPool;
use x121_db::models::character::CreateCharacter;
use x121_db::models::image::{CreateImageVariant, CreateSourceImage};
use x121_db::models::project::{CreateProject, UpdateProject};
use x121_db::models::scene::CreateScene;
use x121_db::models::scene_type::CreateSceneType;
use x121_db::models::segment::CreateSegment;
use x121_db::repositories::{
    CharacterRepo, ImageVariantRepo, ProjectRepo, SceneRepo, SceneTypeRepo, SegmentRepo,
    SourceImageRepo,
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
        description: None,
        model_config: None,
        negative_prompt_template: None,
        prompt_start_clip: None,
        negative_prompt_start_clip: None,
        prompt_continuation_clip: None,
        negative_prompt_continuation_clip: None,
        target_duration_secs: None,
        segment_duration_secs: None,
        duration_tolerance_secs: None,
        transition_segment_index: None,
        generation_params: None,
        sort_order: None,
        is_active: None,
        is_studio_level: None,
    }
}

fn new_source_image(character_id: i64, path: &str) -> CreateSourceImage {
    CreateSourceImage {
        character_id,
        file_path: path.to_string(),
        description: None,
        is_primary: None,
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

fn new_segment(scene_id: i64, index: i32) -> CreateSegment {
    CreateSegment {
        scene_id,
        sequence_index: index,
        status_id: None,
        seed_frame_path: None,
        output_video_path: None,
        last_frame_path: None,
        quality_scores: None,
    }
}

// ---------------------------------------------------------------------------
// Test: Full hierarchy creation
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_full_hierarchy(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Hierarchy Test"))
        .await
        .unwrap();
    assert_eq!(project.name, "Hierarchy Test");
    assert_eq!(project.status_id, 1); // Draft default

    let character = CharacterRepo::create(&pool, &new_character(project.id, "Alice"))
        .await
        .unwrap();
    assert_eq!(character.project_id, project.id);
    assert_eq!(character.name, "Alice");

    let scene_type = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "Dance"))
        .await
        .unwrap();
    assert_eq!(scene_type.name, "Dance");

    let source_image =
        SourceImageRepo::create(&pool, &new_source_image(character.id, "/img/alice.png"))
            .await
            .unwrap();
    assert_eq!(source_image.character_id, character.id);

    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/alice_clothed.png"),
    )
    .await
    .unwrap();
    assert_eq!(variant.variant_label, "clothed");

    let scene = SceneRepo::create(&pool, &new_scene(character.id, scene_type.id, variant.id))
        .await
        .unwrap();
    assert_eq!(scene.character_id, character.id);
    assert_eq!(scene.transition_mode, "cut"); // default

    let segment = SegmentRepo::create(&pool, &new_segment(scene.id, 0))
        .await
        .unwrap();
    assert_eq!(segment.scene_id, scene.id);
    assert_eq!(segment.sequence_index, 0);
}

// ---------------------------------------------------------------------------
// Test: Cascade delete project removes all children
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_cascade_delete_project(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Cascade Test"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "Bob"))
        .await
        .unwrap();
    let scene_type = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "Idle"))
        .await
        .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/bob.png"),
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(&pool, &new_scene(character.id, scene_type.id, variant.id))
        .await
        .unwrap();
    let segment = SegmentRepo::create(&pool, &new_segment(scene.id, 0))
        .await
        .unwrap();

    // Hard-delete project — should cascade through the entire hierarchy.
    let deleted = ProjectRepo::hard_delete(&pool, project.id).await.unwrap();
    assert!(deleted);

    // All children should be gone.
    assert!(CharacterRepo::find_by_id(&pool, character.id)
        .await
        .unwrap()
        .is_none());
    assert!(SceneRepo::find_by_id(&pool, scene.id)
        .await
        .unwrap()
        .is_none());
    assert!(SegmentRepo::find_by_id(&pool, segment.id)
        .await
        .unwrap()
        .is_none());
    assert!(ImageVariantRepo::find_by_id(&pool, variant.id)
        .await
        .unwrap()
        .is_none());
}

// ---------------------------------------------------------------------------
// Test: Unique constraint violation on duplicate project name
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_duplicate_project_name_rejected(pool: PgPool) {
    ProjectRepo::create(&pool, &new_project("UniqueProj"))
        .await
        .unwrap();
    let result = ProjectRepo::create(&pool, &new_project("UniqueProj")).await;
    assert!(result.is_err(), "Duplicate project name should fail");
}

// ---------------------------------------------------------------------------
// Test: Unique constraint on scene (character_id, scene_type_id, image_variant_id)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_duplicate_scene_triple_rejected(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Scene UQ"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "Charlie"))
        .await
        .unwrap();
    let scene_type = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "Walk"))
        .await
        .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/charlie.png"),
    )
    .await
    .unwrap();

    // First scene: OK.
    SceneRepo::create(&pool, &new_scene(character.id, scene_type.id, variant.id))
        .await
        .unwrap();

    // Second scene with same triple: should fail.
    let result =
        SceneRepo::create(&pool, &new_scene(character.id, scene_type.id, variant.id)).await;
    assert!(
        result.is_err(),
        "Duplicate (character_id, scene_type_id, image_variant_id) should fail"
    );
}

// ---------------------------------------------------------------------------
// Test: FK violation when referencing non-existent entity
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_fk_violation_character_bad_project(pool: PgPool) {
    let result = CharacterRepo::create(&pool, &new_character(999_999, "Ghost")).await;
    assert!(
        result.is_err(),
        "FK violation should fail for non-existent project_id"
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_fk_violation_scene_bad_character(pool: PgPool) {
    // scene_type_id and image_variant_id are also bad, but character FK will fail first.
    let result = SceneRepo::create(&pool, &new_scene(999_999, 1, 1)).await;
    assert!(
        result.is_err(),
        "FK violation should fail for non-existent character_id"
    );
}

// ---------------------------------------------------------------------------
// Test: Update returns updated row
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_project(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Before Update"))
        .await
        .unwrap();

    let updated = ProjectRepo::update(
        &pool,
        project.id,
        &UpdateProject {
            name: Some("After Update".to_string()),
            description: Some("A description".to_string()),
            status_id: None,
            retention_days: Some(30),
        },
    )
    .await
    .unwrap()
    .expect("Update should return the row");

    assert_eq!(updated.name, "After Update");
    assert_eq!(updated.description.as_deref(), Some("A description"));
    assert_eq!(updated.retention_days, Some(30));
}

// ---------------------------------------------------------------------------
// Test: Update non-existent returns None
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_nonexistent_returns_none(pool: PgPool) {
    let result = ProjectRepo::update(
        &pool,
        999_999,
        &UpdateProject {
            name: Some("Ghost".to_string()),
            description: None,
            status_id: None,
            retention_days: None,
        },
    )
    .await
    .unwrap();

    assert!(
        result.is_none(),
        "Updating non-existent ID should return None"
    );
}

// ---------------------------------------------------------------------------
// Test: Delete non-existent returns false
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_nonexistent_returns_false(pool: PgPool) {
    let result = ProjectRepo::hard_delete(&pool, 999_999).await.unwrap();
    assert!(!result, "Hard-deleting non-existent ID should return false");
}

// ---------------------------------------------------------------------------
// Test: List by project returns scoped results
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_characters_scoped_to_project(pool: PgPool) {
    let p1 = ProjectRepo::create(&pool, &new_project("P1"))
        .await
        .unwrap();
    let p2 = ProjectRepo::create(&pool, &new_project("P2"))
        .await
        .unwrap();

    CharacterRepo::create(&pool, &new_character(p1.id, "A"))
        .await
        .unwrap();
    CharacterRepo::create(&pool, &new_character(p1.id, "B"))
        .await
        .unwrap();
    CharacterRepo::create(&pool, &new_character(p2.id, "C"))
        .await
        .unwrap();

    let p1_chars = CharacterRepo::list_by_project(&pool, p1.id).await.unwrap();
    assert_eq!(p1_chars.len(), 2);

    let p2_chars = CharacterRepo::list_by_project(&pool, p2.id).await.unwrap();
    assert_eq!(p2_chars.len(), 1);
}

// ---------------------------------------------------------------------------
// Test: Segments ordered by sequence_index
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_segments_ordered_by_sequence_index(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Seg Order"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "D"))
        .await
        .unwrap();
    let scene_type = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "Smile"))
        .await
        .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/d.png"),
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(&pool, &new_scene(character.id, scene_type.id, variant.id))
        .await
        .unwrap();

    // Insert out of order.
    SegmentRepo::create(&pool, &new_segment(scene.id, 2))
        .await
        .unwrap();
    SegmentRepo::create(&pool, &new_segment(scene.id, 0))
        .await
        .unwrap();
    SegmentRepo::create(&pool, &new_segment(scene.id, 1))
        .await
        .unwrap();

    let segments = SegmentRepo::list_by_scene(&pool, scene.id).await.unwrap();
    assert_eq!(segments.len(), 3);
    assert_eq!(segments[0].sequence_index, 0);
    assert_eq!(segments[1].sequence_index, 1);
    assert_eq!(segments[2].sequence_index, 2);
}

// ---------------------------------------------------------------------------
// Test: Character settings CRUD
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_character_settings_crud(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Settings"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "E"))
        .await
        .unwrap();

    // Default settings should be `{}`.
    let settings = CharacterRepo::get_settings(&pool, character.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(settings, serde_json::json!({}));

    // Full replace.
    let new_settings = serde_json::json!({"fps": 30, "resolution": "1080p"});
    CharacterRepo::update_settings(&pool, character.id, &new_settings)
        .await
        .unwrap()
        .unwrap();
    let settings = CharacterRepo::get_settings(&pool, character.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(settings, new_settings);

    // Patch merge.
    let patch = serde_json::json!({"format": "mp4"});
    CharacterRepo::patch_settings(&pool, character.id, &patch)
        .await
        .unwrap()
        .unwrap();
    let settings = CharacterRepo::get_settings(&pool, character.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(settings["fps"], 30);
    assert_eq!(settings["format"], "mp4");
}
