//! Repository for the `library_characters` and `project_character_links` tables (PRD-60).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::library_character::{
    CreateLibraryCharacter, CreateProjectCharacterLink, LibraryCharacter, LibraryUsageEntry,
    ProjectCharacterLink, UpdateLibraryCharacter,
};

/* --------------------------------------------------------------------------
LibraryCharacterRepo
-------------------------------------------------------------------------- */

const LC_COLUMNS: &str = "id, name, source_character_id, source_project_id, master_metadata, \
     tags, description, thumbnail_path, is_published, created_by_id, created_at, updated_at";

/// Provides CRUD operations for library characters.
pub struct LibraryCharacterRepo;

impl LibraryCharacterRepo {
    /// Insert a new library character, returning the created row.
    pub async fn create(
        pool: &PgPool,
        created_by_id: DbId,
        input: &CreateLibraryCharacter,
    ) -> Result<LibraryCharacter, sqlx::Error> {
        let query = format!(
            "INSERT INTO library_characters \
                (name, source_character_id, source_project_id, master_metadata, tags, \
                 description, thumbnail_path, is_published, created_by_id) \
             VALUES ($1, $2, $3, COALESCE($4, '{{}}'::jsonb), COALESCE($5, '[]'::jsonb), \
                     $6, $7, COALESCE($8, false), $9) \
             RETURNING {LC_COLUMNS}"
        );
        sqlx::query_as::<_, LibraryCharacter>(&query)
            .bind(&input.name)
            .bind(input.source_character_id)
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

    /// Find a library character by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<LibraryCharacter>, sqlx::Error> {
        let query = format!("SELECT {LC_COLUMNS} FROM library_characters WHERE id = $1");
        sqlx::query_as::<_, LibraryCharacter>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all library characters (published, plus unpublished owned by the given user).
    pub async fn list(pool: &PgPool, user_id: DbId) -> Result<Vec<LibraryCharacter>, sqlx::Error> {
        let query = format!(
            "SELECT {LC_COLUMNS} FROM library_characters \
             WHERE is_published = true OR created_by_id = $1 \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, LibraryCharacter>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Update a library character. Only non-`None` fields in `input` are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateLibraryCharacter,
    ) -> Result<Option<LibraryCharacter>, sqlx::Error> {
        let query = format!(
            "UPDATE library_characters SET \
                name = COALESCE($2, name), \
                master_metadata = COALESCE($3, master_metadata), \
                tags = COALESCE($4, tags), \
                description = COALESCE($5, description), \
                thumbnail_path = COALESCE($6, thumbnail_path), \
                is_published = COALESCE($7, is_published) \
             WHERE id = $1 \
             RETURNING {LC_COLUMNS}"
        );
        sqlx::query_as::<_, LibraryCharacter>(&query)
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

    /// Delete a library character by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM library_characters WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Search library characters by name (case-insensitive ILIKE).
    pub async fn search_by_name(
        pool: &PgPool,
        query_str: &str,
    ) -> Result<Vec<LibraryCharacter>, sqlx::Error> {
        let query = format!(
            "SELECT {LC_COLUMNS} FROM library_characters \
             WHERE name ILIKE '%' || $1 || '%' \
             ORDER BY name ASC \
             LIMIT 50"
        );
        sqlx::query_as::<_, LibraryCharacter>(&query)
            .bind(query_str)
            .fetch_all(pool)
            .await
    }
}

/* --------------------------------------------------------------------------
ProjectCharacterLinkRepo
-------------------------------------------------------------------------- */

const PCL_COLUMNS: &str = "id, project_id, library_character_id, project_character_id, \
     linked_fields, imported_at, created_at, updated_at";

/// Provides CRUD operations for project-character links.
pub struct ProjectCharacterLinkRepo;

impl ProjectCharacterLinkRepo {
    /// Create a new project-character link.
    pub async fn create_link(
        pool: &PgPool,
        input: &CreateProjectCharacterLink,
    ) -> Result<ProjectCharacterLink, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_character_links \
                (project_id, library_character_id, project_character_id, linked_fields) \
             VALUES ($1, $2, $3, COALESCE($4, '[]'::jsonb)) \
             RETURNING {PCL_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectCharacterLink>(&query)
            .bind(input.project_id)
            .bind(input.library_character_id)
            .bind(input.project_character_id)
            .bind(&input.linked_fields)
            .fetch_one(pool)
            .await
    }

    /// Find a link by project and library character (unique constraint).
    pub async fn find_by_project_and_library(
        pool: &PgPool,
        project_id: DbId,
        library_character_id: DbId,
    ) -> Result<Option<ProjectCharacterLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_character_links \
             WHERE project_id = $1 AND library_character_id = $2"
        );
        sqlx::query_as::<_, ProjectCharacterLink>(&query)
            .bind(project_id)
            .bind(library_character_id)
            .fetch_optional(pool)
            .await
    }

    /// List all links for a given project.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectCharacterLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_character_links \
             WHERE project_id = $1 \
             ORDER BY imported_at DESC"
        );
        sqlx::query_as::<_, ProjectCharacterLink>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List all links for a given library character (cross-project usage).
    pub async fn list_by_library_character(
        pool: &PgPool,
        library_character_id: DbId,
    ) -> Result<Vec<ProjectCharacterLink>, sqlx::Error> {
        let query = format!(
            "SELECT {PCL_COLUMNS} FROM project_character_links \
             WHERE library_character_id = $1 \
             ORDER BY imported_at DESC"
        );
        sqlx::query_as::<_, ProjectCharacterLink>(&query)
            .bind(library_character_id)
            .fetch_all(pool)
            .await
    }

    /// Update the linked fields on an existing link.
    pub async fn update_linked_fields(
        pool: &PgPool,
        link_id: DbId,
        linked_fields: &[String],
    ) -> Result<Option<ProjectCharacterLink>, sqlx::Error> {
        let fields_json = serde_json::to_value(linked_fields)
            .unwrap_or_else(|_| serde_json::Value::Array(vec![]));
        let query = format!(
            "UPDATE project_character_links SET linked_fields = $2 \
             WHERE id = $1 \
             RETURNING {PCL_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectCharacterLink>(&query)
            .bind(link_id)
            .bind(&fields_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete a link by ID. Returns `true` if a row was removed.
    pub async fn delete_link(pool: &PgPool, link_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_character_links WHERE id = $1")
            .bind(link_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get cross-project usage for a library character: which projects use it
    /// and which project characters are linked.
    pub async fn get_usage(
        pool: &PgPool,
        library_character_id: DbId,
    ) -> Result<Vec<LibraryUsageEntry>, sqlx::Error> {
        let query = "\
            SELECT \
                pcl.id AS link_id, \
                pcl.project_id, \
                p.name AS project_name, \
                pcl.project_character_id, \
                c.name AS character_name, \
                pcl.imported_at \
            FROM project_character_links pcl \
            JOIN projects p ON p.id = pcl.project_id \
            JOIN characters c ON c.id = pcl.project_character_id \
            WHERE pcl.library_character_id = $1 \
            ORDER BY pcl.imported_at DESC";
        sqlx::query_as::<_, LibraryUsageEntry>(query)
            .bind(library_character_id)
            .fetch_all(pool)
            .await
    }
}
