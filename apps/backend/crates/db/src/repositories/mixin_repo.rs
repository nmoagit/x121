//! Repository for the `mixins` and `scene_type_mixins` tables (PRD-100).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::mixin::{ApplyMixin, CreateMixin, Mixin, SceneTypeMixin, UpdateMixin};

/// Column list for the `mixins` table.
const COLUMNS: &str = "id, name, description, parameters, created_at, updated_at";

/// Provides data access for mixins and their scene type associations.
pub struct MixinRepo;

impl MixinRepo {
    /// Insert a new mixin, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateMixin) -> Result<Mixin, sqlx::Error> {
        let query = format!(
            "INSERT INTO mixins (name, description, parameters) \
             VALUES ($1, $2, COALESCE($3, '{{}}')) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Mixin>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.parameters)
            .fetch_one(pool)
            .await
    }

    /// Find a mixin by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Mixin>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM mixins WHERE id = $1");
        sqlx::query_as::<_, Mixin>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all mixins, ordered by name.
    pub async fn list(pool: &PgPool) -> Result<Vec<Mixin>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM mixins ORDER BY name");
        sqlx::query_as::<_, Mixin>(&query).fetch_all(pool).await
    }

    /// Update a mixin. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateMixin,
    ) -> Result<Option<Mixin>, sqlx::Error> {
        let query = format!(
            "UPDATE mixins SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                parameters = COALESCE($4, parameters) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Mixin>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.parameters)
            .fetch_optional(pool)
            .await
    }

    /// Delete a mixin by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM mixins WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Scene type <-> mixin association
    // -----------------------------------------------------------------------

    /// Apply a mixin to a scene type (or update `apply_order` if already applied).
    pub async fn apply_to_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
        input: &ApplyMixin,
    ) -> Result<SceneTypeMixin, sqlx::Error> {
        sqlx::query_as::<_, SceneTypeMixin>(
            "INSERT INTO scene_type_mixins (scene_type_id, mixin_id, apply_order) \
             VALUES ($1, $2, COALESCE($3, 0)) \
             ON CONFLICT (scene_type_id, mixin_id) \
             DO UPDATE SET apply_order = EXCLUDED.apply_order \
             RETURNING id, scene_type_id, mixin_id, apply_order, created_at",
        )
        .bind(scene_type_id)
        .bind(input.mixin_id)
        .bind(input.apply_order)
        .fetch_one(pool)
        .await
    }

    /// Remove a mixin from a scene type. Returns `true` if a row was removed.
    pub async fn remove_from_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
        mixin_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM scene_type_mixins \
             WHERE scene_type_id = $1 AND mixin_id = $2",
        )
        .bind(scene_type_id)
        .bind(mixin_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all mixins applied to a scene type, ordered by `apply_order`.
    pub async fn list_for_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<Mixin>, sqlx::Error> {
        sqlx::query_as::<_, Mixin>(
            "SELECT m.id, m.name, m.description, m.parameters, m.created_at, m.updated_at \
             FROM mixins m \
             JOIN scene_type_mixins stm ON stm.mixin_id = m.id \
             WHERE stm.scene_type_id = $1 \
             ORDER BY stm.apply_order",
        )
        .bind(scene_type_id)
        .fetch_all(pool)
        .await
    }
}
