//! Repository for the `segment_approvals` and `rejection_categories` tables (PRD-35).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::approval::{
    CreateApproval, RejectionCategory, ReviewQueueItem, SegmentApproval,
};

/// Column list for segment_approvals queries.
const APPROVAL_COLUMNS: &str = "id, segment_id, user_id, decision, reason_category_id, \
    comment, segment_version, decided_at, created_at, updated_at";

/// Column list for rejection_categories queries.
const CATEGORY_COLUMNS: &str = "id, name, description, created_at, updated_at";

/// Provides CRUD operations for segment approvals.
pub struct ApprovalRepo;

impl ApprovalRepo {
    /// Insert a new approval decision, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateApproval,
    ) -> Result<SegmentApproval, sqlx::Error> {
        let query = format!(
            "INSERT INTO segment_approvals
                (segment_id, user_id, decision, reason_category_id, comment, segment_version)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {APPROVAL_COLUMNS}"
        );
        sqlx::query_as::<_, SegmentApproval>(&query)
            .bind(input.segment_id)
            .bind(input.user_id)
            .bind(&input.decision)
            .bind(input.reason_category_id)
            .bind(&input.comment)
            .bind(input.segment_version)
            .fetch_one(pool)
            .await
    }

    /// List all approval decisions for a given segment, ordered by decided_at descending.
    pub async fn list_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<SegmentApproval>, sqlx::Error> {
        let query = format!(
            "SELECT {APPROVAL_COLUMNS} FROM segment_approvals
             WHERE segment_id = $1
             ORDER BY decided_at DESC"
        );
        sqlx::query_as::<_, SegmentApproval>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Get the review queue: segments that have no approval decisions yet.
    ///
    /// Returns unreviewed segments ordered by creation date ascending (oldest first).
    /// Only includes segments that are not soft-deleted.
    pub async fn get_review_queue(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<ReviewQueueItem>, sqlx::Error> {
        sqlx::query_as::<_, ReviewQueueItem>(
            "SELECT
                s.id AS segment_id,
                s.scene_id,
                s.sequence_index,
                s.status_id,
                EXISTS(
                    SELECT 1 FROM segment_approvals sa WHERE sa.segment_id = s.id
                ) AS has_approval
             FROM segments s
             WHERE s.scene_id = $1
               AND s.deleted_at IS NULL
             ORDER BY s.sequence_index ASC",
        )
        .bind(scene_id)
        .fetch_all(pool)
        .await
    }

    /// Find an approval decision by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SegmentApproval>, sqlx::Error> {
        let query = format!(
            "SELECT {APPROVAL_COLUMNS} FROM segment_approvals WHERE id = $1"
        );
        sqlx::query_as::<_, SegmentApproval>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}

/// Provides read operations for rejection categories.
pub struct RejectionCategoryRepo;

impl RejectionCategoryRepo {
    /// List all rejection categories, ordered by name ascending.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<RejectionCategory>, sqlx::Error> {
        let query = format!(
            "SELECT {CATEGORY_COLUMNS} FROM rejection_categories ORDER BY name ASC"
        );
        sqlx::query_as::<_, RejectionCategory>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a rejection category by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<RejectionCategory>, sqlx::Error> {
        let query = format!(
            "SELECT {CATEGORY_COLUMNS} FROM rejection_categories WHERE id = $1"
        );
        sqlx::query_as::<_, RejectionCategory>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}
