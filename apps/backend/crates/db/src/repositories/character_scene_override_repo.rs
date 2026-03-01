//! Repository for the `character_scene_overrides` table (PRD-111, PRD-123).
//!
//! Leaf tier of the three-level inheritance chain:
//! scene_type defaults -> project settings -> character overrides.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_scene_override::{
    CharacterSceneOverride, CharacterSceneOverrideUpdate, EffectiveCharacterSceneSetting,
};

/// Column list for the `character_scene_overrides` table.
const COLUMNS: &str = "id, character_id, scene_type_id, is_enabled, created_at, updated_at";

/// Provides data access for per-character scene overrides.
pub struct CharacterSceneOverrideRepo;

impl CharacterSceneOverrideRepo {
    /// List the effective scene settings for a character.
    ///
    /// Three-level merge:
    /// 1. Start with scene_type `is_active` as the base default.
    /// 2. Override with project setting if one exists.
    /// 3. Override with character setting if one exists.
    ///
    /// `project_id` is required to resolve the middle tier.
    pub async fn list_effective(
        pool: &PgPool,
        character_id: DbId,
        project_id: DbId,
    ) -> Result<Vec<EffectiveCharacterSceneSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveCharacterSceneSetting>(
            "SELECT \
                st.id AS scene_type_id, \
                st.name, \
                st.slug, \
                COALESCE(cso.is_enabled, pss.is_enabled, st.is_active) AS is_enabled, \
                CASE \
                    WHEN cso.id IS NOT NULL THEN 'character' \
                    WHEN pss.id IS NOT NULL THEN 'project' \
                    ELSE 'scene_type' \
                END AS source \
             FROM scene_types st \
             LEFT JOIN project_scene_settings pss \
                ON pss.scene_type_id = st.id AND pss.project_id = $2 \
             LEFT JOIN character_scene_overrides cso \
                ON cso.scene_type_id = st.id AND cso.character_id = $1 \
             WHERE st.is_active = true AND st.deleted_at IS NULL \
             ORDER BY st.sort_order, st.name",
        )
        .bind(character_id)
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Upsert a single character scene override.
    pub async fn upsert(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
        is_enabled: bool,
    ) -> Result<CharacterSceneOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_scene_overrides (character_id, scene_type_id, is_enabled) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (character_id, scene_type_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterSceneOverride>(&query)
            .bind(character_id)
            .bind(scene_type_id)
            .bind(is_enabled)
            .fetch_one(pool)
            .await
    }

    /// Bulk upsert character scene overrides within a transaction.
    pub async fn bulk_upsert(
        pool: &PgPool,
        character_id: DbId,
        overrides: &[CharacterSceneOverrideUpdate],
    ) -> Result<Vec<CharacterSceneOverride>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(overrides.len());

        let query = format!(
            "INSERT INTO character_scene_overrides (character_id, scene_type_id, is_enabled) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (character_id, scene_type_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for ovr in overrides {
            let row = sqlx::query_as::<_, CharacterSceneOverride>(&query)
                .bind(character_id)
                .bind(ovr.scene_type_id)
                .bind(ovr.is_enabled)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }

    /// Delete a character scene override (reverts to project/scene_type default).
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM character_scene_overrides \
             WHERE character_id = $1 AND scene_type_id = $2",
        )
        .bind(character_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all character scene overrides for a character.
    ///
    /// Returns the number of rows removed.
    pub async fn delete_all(pool: &PgPool, character_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_scene_overrides WHERE character_id = $1")
            .bind(character_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
