//! Repository for the `library_avatars` and `project_avatar_links` tables (PRD-60).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::library_avatar::{
    CreateLibraryAvatar, CreateProjectAvatarLink, LibraryAvatar, LibraryUsageEntry,
    ProjectAvatarLink, UpdateLibraryAvatar,
};

/* --------------------------------------------------------------------------
LibraryAvatarRepo
-------------------------------------------------------------------------- */

const LC_COLUMNS: &str = "id, name, source_avatar_id, source_project_id, master_metadata, \
     tags, description, thumbnail_path, is_published, created_by_id, created_at, updated_at";

/// Provides CRUD operations for library avatars.
pub struct LibraryAvatarRepo;

impl LibraryAvatarRepo {
    /// Insert a new library avatar, returning the created row.
    pub async fn create(
        pool: &PgPool,
        created_by_id: DbId,
        input: &CreateLibraryAvatar,
    ) -> Result<LibraryAvatar, sqlx::Error> {
        let query = format!(
            "INSERT INTO library_avatars \
                (name, source_avatar_id, source_project_id, master_metadata, tags, \
                 description, thumbnail_path, is_published, created_by_id) \
             VALUES ($1, $2, $3, COALESCE($4, '{{}}'::jsonb), COALESCE($5, '[]'::jsonb), \
                     $6, $7, COALESCE($8, false), $9) \
             RETURNING {LC_COLUMNS}"
        );
        sqlx::query_as::<_, LibraryAvatar>(&query)
            .bind(&input.name)
            .bind(input.source_avatar_id)
            .bind(input.source_project_id)
            .bind(&input.master_metadata)
            .bind(&input.tags)
            .bind(&input.description)
            .bind(&input.thumbnail_path)
            .bind(input.is_published)
            .bind(created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find a library avatar by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<LibraryAvatar>, sqlx::Error> {
        let query = format!("SELECT {LC_COLUMNS} FROM library_avatars WHERE id = $1");
        sqlx::query_as::<_, LibraryAvatar>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all library avatars (published, plus unpublished owned by the given user).
    pub async fn list(pool: &PgPool, user_id: DbId) -> Result<Vec<LibraryAvatar>, sqlx::Error> {
        let query = format!(
            "SELECT {LC_COLUMNS} FROM library_avatars \
             WHERE is_published = true OR created_by_id = $1 \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, LibraryAvatar>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// List library avatars with optional scene-type and track filters.
    ///
    /// When `scene_type_ids` or `track_ids` are provided, only library avatars
    /// that have linked project avatars with scenes matching those filters are
    /// returned. Both filters use AND logic when both are present.
    pub async fn list_filtered(
        pool: &PgPool,
        user_id: DbId,
        scene_type_ids: Option<&[DbId]>,
        track_ids: Option<&[DbId]>,
    ) -> Result<Vec<LibraryAvatar>, sqlx::Error> {
        // Fast path: no filters — delegate to the simple list.
        if scene_type_ids.is_none() && track_ids.is_none() {
            return Self::list(pool, user_id).await;
        }

        // Build a dynamic query with optional joins and filters.
        // Prefix each column with `lc.` for the DISTINCT join query.
        let prefixed_cols = LC_COLUMNS
            .split(", ")
            .map(|c| format!("lc.{c}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut sql = format!("SELECT DISTINCT {prefixed_cols} FROM library_avatars lc");

        // Join through project_avatar_links → scenes when filters are active.
        sql.push_str(
            " JOIN project_avatar_links pcl ON pcl.library_avatar_id = lc.id \
             JOIN scenes s ON s.avatar_id = pcl.project_avatar_id",
        );

        sql.push_str(" WHERE (lc.is_published = true OR lc.created_by_id = $1)");

        let mut param_idx = 2u32;

        if scene_type_ids.is_some() {
            sql.push_str(&format!(" AND s.scene_type_id = ANY(${param_idx})"));
            param_idx += 1;
        }

        if track_ids.is_some() {
            sql.push_str(&format!(" AND s.track_id = ANY(${param_idx})"));
        }

        sql.push_str(" ORDER BY lc.name ASC");

        // We need to bind dynamically based on which filters are present.
        // sqlx requires static bind counts, so we branch.
        match (scene_type_ids, track_ids) {
            (Some(st_ids), Some(tr_ids)) => {
                sqlx::query_as::<_, LibraryAvatar>(&sql)
                    .bind(user_id)
                    .bind(st_ids)
                    .bind(tr_ids)
                    .fetch_all(pool)
                    .await
            }
            (Some(st_ids), None) => {
                sqlx::query_as::<_, LibraryAvatar>(&sql)
                    .bind(user_id)
                    .bind(st_ids)
                    .fetch_all(pool)
                    .await
            }
            (None, Some(tr_ids)) => {
                sqlx::query_as::<_, LibraryAvatar>(&sql)
                    .bind(user_id)
                    .bind(tr_ids)
                    .fetch_all(pool)
                    .await
            }
            (None, None) => unreachable!("fast path handles this case"),
        }
    }

    /// Update a library avatar. Only non-`None` fields in `input` are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateLibraryAvatar,
    ) -> Result<Option<LibraryAvatar>, sqlx::Error> {
        let query = format!(
            "UPDATE library_avatars SET \
                name = COALESCE($2, name), \
                master_metadata = COALESCE($3, master_metadata), \
                tags = COALESCE($4, tags), \
                description = COALESCE($5, description), \
                thumbnail_path = COALESCE($6, thumbnail_path), \
                is_published = COALESCE($7, is_published) \
             WHERE id = $1 \
             RETURNING {LC_COLUMNS}"
        );
        sqlx::query_as::<_, LibraryAvatar>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.master_metadata)
            .bind(&input.tags)
            .bind(&input.description)
            .bind(&input.thumbnail_path)
            .bind(input.is_published)
            .fetch_optional(pool)
            .await
    }

    /// Delete a library avatar by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM library_avatars WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Search library avatars by name (case-insensitive ILIKE).
    pub async fn search_by_name(
        pool: &PgPool,
        query_str: &str,
    ) -> Result<Vec<LibraryAvatar>, sqlx::Error> {
        let query = format!(
            "SELECT {LC_COLUMNS} FROM library_avatars \
             WHERE name ILIKE '%' || $1 || '%' \
             ORDER BY name ASC \
             LIMIT 50"
        );
        sqlx::query_as::<_, LibraryAvatar>(&query)
            .bind(query_str)
            .fetch_all(pool)
            .await
    }
}

/* --------------------------------------------------------------------------
ProjectAvatarLinkRepo
-------------------------------------------------------------------------- */

const PCL_COLUMNS: &str = "id, project_id, library_avatar_id, project_avatar_id, \
     linked_fields, imported_at, created_at, updated_at";

/// Provides CRUD operations for project-avatar links.
pub struct ProjectAvatarLinkRepo;

impl ProjectAvatarLinkRepo {
    /// Create a new project-avatar link.
    pub async fn create_link(
        pool: &PgPool,
        input: &CreateProjectAvatarLink,
    ) -> Result<ProjectAvatarLink, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_avatar_links \
                (project_id, library_avatar_id, project_avatar_id, linked_fields) \
             VALUES ($1, $2, $3, COALESCE($4, '[]'::jsonb)) \
             RETURNING {PCL_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectAvatarLink>(&query)
            .bind(input.project_id)
            .bind(input.library_avatar_id)
            .bind(input.project_avatar_id)
            .bind(&input.linked_fields)
            .fetch_one(pool)
            .await
    }

    /// Find a link by project and library avatar (unique constraint).
    pub async fn find_by_project_and_library(
        pool: &PgPool,
        project_id: DbId,
        library_avatar_id: DbId,
    ) -> Result<Option<ProjectAvatarLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_avatar_links \
             WHERE project_id = $1 AND library_avatar_id = $2"
        );
        sqlx::query_as::<_, ProjectAvatarLink>(&query)
            .bind(project_id)
            .bind(library_avatar_id)
            .fetch_optional(pool)
            .await
    }

    /// List all links for a given project.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectAvatarLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_avatar_links \
             WHERE project_id = $1 \
             ORDER BY imported_at DESC"
        );
        sqlx::query_as::<_, ProjectAvatarLink>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List all links for a given library avatar (cross-project usage).
    pub async fn list_by_library_avatar(
        pool: &PgPool,
        library_avatar_id: DbId,
    ) -> Result<Vec<ProjectAvatarLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_avatar_links \
             WHERE library_avatar_id = $1 \
             ORDER BY imported_at DESC"
        );
        sqlx::query_as::<_, ProjectAvatarLink>(&query)
            .bind(library_avatar_id)
            .fetch_all(pool)
            .await
    }

    /// Update the linked fields on an existing link.
    pub async fn update_linked_fields(
        pool: &PgPool,
        link_id: DbId,
        linked_fields: &[String],
    ) -> Result<Option<ProjectAvatarLink>, sqlx::Error> {
        let fields_json = serde_json::to_value(linked_fields)
            .unwrap_or_else(|_| serde_json::Value::Array(vec![]));
        let query = format!(
            "UPDATE project_avatar_links SET linked_fields = $2 \
             WHERE id = $1 \
             RETURNING {PCL_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectAvatarLink>(&query)
            .bind(link_id)
            .bind(&fields_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete a link by ID. Returns `true` if a row was removed.
    pub async fn delete_link(pool: &PgPool, link_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_avatar_links WHERE id = $1")
            .bind(link_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get cross-project usage for a library avatar: which projects use it
    /// and which project avatars are linked.
    pub async fn get_usage(
        pool: &PgPool,
        library_avatar_id: DbId,
    ) -> Result<Vec<LibraryUsageEntry>, sqlx::Error> {
        let query = "\
            SELECT \
                pcl.id AS link_id, \
                pcl.project_id, \
                p.name AS project_name, \
                pcl.project_avatar_id, \
                c.name AS avatar_name, \
                pcl.imported_at \
            FROM project_avatar_links pcl \
            JOIN projects p ON p.id = pcl.project_id \
            JOIN avatars c ON c.id = pcl.project_avatar_id \
            WHERE pcl.library_avatar_id = $1 \
            ORDER BY pcl.imported_at DESC";
        sqlx::query_as::<_, LibraryUsageEntry>(query)
            .bind(library_avatar_id)
            .fetch_all(pool)
            .await
    }
}
