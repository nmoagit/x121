//! Repository for the `character_scene_overrides` table (PRD-111, PRD-123).
//!
//! Leaf tier of the four-level inheritance chain:
//! scene_type defaults -> project settings -> group settings -> character overrides.
//!
//! Settings are keyed on `(character_id, scene_type_id, track_id)` to allow
//! per-track granularity. `track_id` is nullable — scene types without tracks
//! have a single row with `track_id IS NULL`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_scene_override::{
    CharacterSceneOverride, CharacterSceneOverrideUpdate, EffectiveCharacterSceneSetting,
};

/// Column list for the `character_scene_overrides` table.
const COLUMNS: &str =
    "id, character_id, scene_type_id, track_id, is_enabled, created_at, updated_at";

/// Provides data access for per-character scene overrides.
pub struct CharacterSceneOverrideRepo;

impl CharacterSceneOverrideRepo {
    /// List the effective scene settings for a character.
    ///
    /// Four-level merge per `(scene_type, track)` pair:
    /// 1. Start with scene_type `is_active` as the base default.
    /// 2. Override with project setting if one exists.
    /// 3. Override with group setting if one exists.
    /// 4. Override with character setting if one exists.
    ///
    /// Scene types with tracks produce one row per active track (via CROSS JOIN);
    /// scene types without tracks produce a single row with NULL track fields.
    ///
    /// When `group_id` is `None`, the group layer is skipped (equivalent to
    /// the previous three-level merge).
    pub async fn list_effective(
        pool: &PgPool,
        character_id: DbId,
        project_id: DbId,
        group_id: Option<DbId>,
    ) -> Result<Vec<EffectiveCharacterSceneSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveCharacterSceneSetting>(
            "SELECT scene_type_id, name, slug, is_enabled, source, track_id, track_name, track_slug, has_clothes_off_transition FROM ( \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(cso.is_enabled, gss.is_enabled, pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE \
                         WHEN cso.id IS NOT NULL THEN 'character' \
                         WHEN gss.id IS NOT NULL THEN 'group' \
                         WHEN pss.id IS NOT NULL THEN 'project' \
                         ELSE 'scene_type' \
                     END AS source, \
                     t.id   AS track_id, \
                     t.name AS track_name, \
                     t.slug AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     t.sort_order  AS t_sort \
                 FROM scene_types st \
                 JOIN scene_type_tracks stt ON stt.scene_type_id = st.id \
                 JOIN tracks t ON t.id = stt.track_id AND t.is_active = true \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $2 \
                    AND pss.track_id = t.id \
                 LEFT JOIN group_scene_settings gss \
                     ON gss.scene_type_id = st.id \
                    AND gss.group_id = $3 \
                    AND gss.track_id = t.id \
                 LEFT JOIN character_scene_overrides cso \
                     ON cso.scene_type_id = st.id \
                    AND cso.character_id = $1 \
                    AND cso.track_id = t.id \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                 UNION ALL \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(cso.is_enabled, gss.is_enabled, pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE \
                         WHEN cso.id IS NOT NULL THEN 'character' \
                         WHEN gss.id IS NOT NULL THEN 'group' \
                         WHEN pss.id IS NOT NULL THEN 'project' \
                         ELSE 'scene_type' \
                     END AS source, \
                     NULL::BIGINT AS track_id, \
                     NULL::TEXT   AS track_name, \
                     NULL::TEXT   AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     NULL::INT     AS t_sort \
                 FROM scene_types st \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $2 \
                    AND pss.track_id IS NULL \
                 LEFT JOIN group_scene_settings gss \
                     ON gss.scene_type_id = st.id \
                    AND gss.group_id = $3 \
                    AND gss.track_id IS NULL \
                 LEFT JOIN character_scene_overrides cso \
                     ON cso.scene_type_id = st.id \
                    AND cso.character_id = $1 \
                    AND cso.track_id IS NULL \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                   AND NOT EXISTS ( \
                       SELECT 1 FROM scene_type_tracks stt WHERE stt.scene_type_id = st.id \
                   ) \
             ) sub \
             ORDER BY sub.st_sort, sub.name, sub.t_sort NULLS LAST, sub.track_name NULLS LAST",
        )
        .bind(character_id)
        .bind(project_id)
        .bind(group_id)
        .fetch_all(pool)
        .await
    }

    /// Upsert a single character scene override.
    pub async fn upsert(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
        is_enabled: bool,
    ) -> Result<CharacterSceneOverride, sqlx::Error> {
        let update = CharacterSceneOverrideUpdate {
            scene_type_id,
            track_id,
            is_enabled,
        };
        let mut results = Self::bulk_upsert(pool, character_id, &[update]).await?;
        // bulk_upsert always returns one row per input
        Ok(results.remove(0))
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
            "INSERT INTO character_scene_overrides (character_id, scene_type_id, track_id, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (character_id, scene_type_id, track_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for ovr in overrides {
            let row = sqlx::query_as::<_, CharacterSceneOverride>(&query)
                .bind(character_id)
                .bind(ovr.scene_type_id)
                .bind(ovr.track_id)
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
        track_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM character_scene_overrides \
             WHERE character_id = $1 \
               AND scene_type_id = $2 \
               AND track_id IS NOT DISTINCT FROM $3",
        )
        .bind(character_id)
        .bind(scene_type_id)
        .bind(track_id)
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
