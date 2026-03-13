//! Repository for the `character_metadata_versions` table.

use sqlx::PgPool;
use x121_core::metadata::{
    METADATA_APPROVAL_APPROVED, METADATA_APPROVAL_PENDING,
    METADATA_APPROVAL_REJECTED,
};
use x121_core::types::DbId;

use crate::models::character_metadata_version::{
    CharacterMetadataVersion, CreateCharacterMetadataVersion, UpdateCharacterMetadataVersion,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, version_number, metadata, source, \
    source_bio, source_tov, generation_report, is_active, notes, \
    rejection_reason, outdated_at, outdated_reason, \
    approval_status, approved_by, approved_at, approval_comment, \
    deleted_at, created_at, updated_at";

/// Provides CRUD and version-management operations for character metadata versions.
pub struct CharacterMetadataVersionRepo;

impl CharacterMetadataVersionRepo {
    // ── Standard CRUD ────────────────────────────────────────────────

    /// Insert a new character metadata version, auto-assigning the next version number.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCharacterMetadataVersion,
    ) -> Result<CharacterMetadataVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_metadata_versions
                (character_id, version_number, metadata, source, source_bio, source_tov,
                 generation_report, is_active, notes)
             VALUES (
                $1,
                (SELECT COALESCE(MAX(version_number), 0) + 1 FROM character_metadata_versions WHERE character_id = $1),
                $2, $3, $4, $5, $6, COALESCE($7, false), $8
             )
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(input.character_id)
            .bind(&input.metadata)
            .bind(&input.source)
            .bind(&input.source_bio)
            .bind(&input.source_tov)
            .bind(&input.generation_report)
            .bind(input.is_active)
            .bind(&input.notes)
            .fetch_one(pool)
            .await
    }

    /// Find a character metadata version by ID. Excludes soft-deleted rows.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_metadata_versions WHERE id = $1 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all versions for a character, ordered by version number descending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_metadata_versions
             WHERE character_id = $1 AND deleted_at IS NULL
             ORDER BY version_number DESC"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Update a character metadata version. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacterMetadataVersion,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "UPDATE character_metadata_versions SET
                notes = COALESCE($2, notes),
                rejection_reason = COALESCE($3, rejection_reason)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(id)
            .bind(&input.notes)
            .bind(&input.rejection_reason)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a character metadata version. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE character_metadata_versions SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Version-specific operations ──────────────────────────────────

    /// Find the currently active version for a character (if any).
    pub async fn find_active(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_metadata_versions \
             WHERE character_id = $1 AND is_active = true AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a version as active, un-marking any previously active version for
    /// the same character. Uses a transaction to ensure atomicity.
    ///
    /// Returns `None` if `version_id` does not exist for the given `character_id`.
    pub async fn set_active(
        pool: &PgPool,
        character_id: DbId,
        version_id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Unmark current active (if any)
        sqlx::query(
            "UPDATE character_metadata_versions SET is_active = false \
             WHERE character_id = $1 AND is_active = true AND deleted_at IS NULL",
        )
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

        // Mark the specified version as active, resetting approval to pending
        let query = format!(
            "UPDATE character_metadata_versions \
             SET is_active = true, approval_status = '{METADATA_APPROVAL_PENDING}', \
                 approved_by = NULL, approved_at = NULL, approval_comment = NULL \
             WHERE id = $1 AND character_id = $2 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        let result = sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(version_id)
            .bind(character_id)
            .fetch_optional(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(result)
    }

    /// Mark all active versions for a character as outdated.
    ///
    /// Only targets active, non-deleted versions that are not already outdated.
    /// Returns the number of rows affected.
    pub async fn mark_outdated_for_character(
        pool: &PgPool,
        character_id: DbId,
        reason: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE character_metadata_versions \
             SET outdated_at = NOW(), outdated_reason = $2 \
             WHERE character_id = $1 AND is_active = true AND outdated_at IS NULL AND deleted_at IS NULL",
        )
        .bind(character_id)
        .bind(reason)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clear the outdated marker on a version. Returns `true` if a row was updated.
    pub async fn clear_outdated(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE character_metadata_versions \
             SET outdated_at = NULL, outdated_reason = NULL \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Create a new version and automatically mark it as active, un-marking any
    /// previously active version in the same transaction.
    pub async fn create_as_active(
        pool: &PgPool,
        input: &CreateCharacterMetadataVersion,
    ) -> Result<CharacterMetadataVersion, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Get next version number
        let next_ver: (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_number), 0) + 1 \
             FROM character_metadata_versions WHERE character_id = $1",
        )
        .bind(input.character_id)
        .fetch_one(&mut *tx)
        .await?;

        // Unmark current active
        sqlx::query(
            "UPDATE character_metadata_versions SET is_active = false \
             WHERE character_id = $1 AND is_active = true AND deleted_at IS NULL",
        )
        .bind(input.character_id)
        .execute(&mut *tx)
        .await?;

        // Insert new version as active
        let query = format!(
            "INSERT INTO character_metadata_versions
                (character_id, version_number, metadata, source, source_bio, source_tov,
                 generation_report, is_active, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
             RETURNING {COLUMNS}"
        );
        let version = sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(input.character_id)
            .bind(next_ver.0)
            .bind(&input.metadata)
            .bind(&input.source)
            .bind(&input.source_bio)
            .bind(&input.source_tov)
            .bind(&input.generation_report)
            .bind(&input.notes)
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(version)
    }

    // ── Approval operations ──────────────────────────────────────────

    /// Find the currently approved version for a character (if any).
    pub async fn find_approved(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_metadata_versions \
             WHERE character_id = $1 AND approval_status = '{METADATA_APPROVAL_APPROVED}' AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    /// Approve a metadata version. Clears any previously approved version
    /// for the same character (sets it back to `'pending'`). Uses a transaction.
    ///
    /// Returns `None` if `version_id` does not exist for the given `character_id`.
    pub async fn approve(
        pool: &PgPool,
        character_id: DbId,
        version_id: DbId,
        user_id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Clear any previously approved version for this character
        sqlx::query(&format!(
            "UPDATE character_metadata_versions \
             SET approval_status = '{METADATA_APPROVAL_PENDING}', approved_by = NULL, \
                 approved_at = NULL, approval_comment = NULL \
             WHERE character_id = $1 AND approval_status = '{METADATA_APPROVAL_APPROVED}' AND deleted_at IS NULL"
        ))
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

        // Approve the target version
        let query = format!(
            "UPDATE character_metadata_versions \
             SET approval_status = '{METADATA_APPROVAL_APPROVED}', approved_by = $2, approved_at = NOW(), \
                 approval_comment = NULL \
             WHERE id = $1 AND character_id = $3 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        let result = sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(version_id)
            .bind(user_id)
            .bind(character_id)
            .fetch_optional(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(result)
    }

    /// Revert an approved (or rejected) metadata version back to pending.
    pub async fn unapprove(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "UPDATE character_metadata_versions \
             SET approval_status = '{METADATA_APPROVAL_PENDING}', approved_by = NULL, \
                 approved_at = NULL, approval_comment = NULL \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(version_id)
            .fetch_optional(pool)
            .await
    }

    /// Reject a metadata version's approval with an optional comment.
    pub async fn reject_approval(
        pool: &PgPool,
        version_id: DbId,
        comment: Option<&str>,
    ) -> Result<Option<CharacterMetadataVersion>, sqlx::Error> {
        let query = format!(
            "UPDATE character_metadata_versions \
             SET approval_status = '{METADATA_APPROVAL_REJECTED}', approval_comment = $2 \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterMetadataVersion>(&query)
            .bind(version_id)
            .bind(comment)
            .fetch_optional(pool)
            .await
    }
}
