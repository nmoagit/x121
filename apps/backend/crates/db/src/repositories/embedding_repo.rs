//! Repository for face-embedding operations (PRD-76).
//!
//! Manages character face embeddings, detected faces from multi-face images,
//! primary face selection, and embedding history (audit trail).
//!
//! The `face_embedding` column uses pgvector's `vector(512)` type. Because
//! we use runtime queries (no compile-time sqlx macros), embeddings are
//! passed as text (e.g. `'[0.1, 0.2, ...]'::vector`) and cast in SQL.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::embedding::{
    CreateDetectedFace, DetectedFace, EmbeddingHistory, EmbeddingStatusResponse,
};
use crate::models::status::StatusId;

/// Column list for `detected_faces` queries (excludes the `embedding` vector).
const DETECTED_FACE_COLUMNS: &str =
    "id, character_id, bounding_box, confidence, is_primary, created_at, updated_at";

/// Column list for `embedding_history` queries (excludes the `face_embedding` vector).
const EMBEDDING_HISTORY_COLUMNS: &str =
    "id, character_id, face_detection_confidence, face_bounding_box, \
     replaced_at, created_at, updated_at";

/// Provides face-embedding CRUD and management operations.
pub struct EmbeddingRepo;

impl EmbeddingRepo {
    // -----------------------------------------------------------------------
    // Embedding status management
    // -----------------------------------------------------------------------

    /// Update the embedding status of a character without touching the embedding itself.
    pub async fn update_character_embedding_status(
        pool: &PgPool,
        character_id: DbId,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE characters SET embedding_status_id = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(character_id)
        .bind(status_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update a character's embedding metadata (confidence, bounding box, status)
    /// and set the extraction timestamp to now.
    pub async fn update_character_embedding(
        pool: &PgPool,
        character_id: DbId,
        confidence: f64,
        bounding_box: &serde_json::Value,
        status_id: StatusId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE characters SET \
                face_detection_confidence = $2, \
                face_bounding_box = $3, \
                embedding_status_id = $4, \
                embedding_extracted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(character_id)
        .bind(confidence)
        .bind(bounding_box)
        .bind(status_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Detected faces
    // -----------------------------------------------------------------------

    /// Store detected faces for a character (batch insert).
    ///
    /// Each face's embedding is converted to a pgvector literal and cast in SQL.
    pub async fn store_detected_faces(
        pool: &PgPool,
        character_id: DbId,
        faces: &[CreateDetectedFace],
    ) -> Result<Vec<DetectedFace>, sqlx::Error> {
        let mut results = Vec::with_capacity(faces.len());

        for face in faces {
            let embedding_str = format!(
                "[{}]",
                face.embedding
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(",")
            );

            let query = format!(
                "INSERT INTO detected_faces (character_id, bounding_box, confidence, embedding, is_primary) \
                 VALUES ($1, $2, $3, $4::vector, $5) \
                 RETURNING {DETECTED_FACE_COLUMNS}"
            );
            let row = sqlx::query_as::<_, DetectedFace>(&query)
                .bind(character_id)
                .bind(&face.bounding_box)
                .bind(face.confidence)
                .bind(&embedding_str)
                .bind(face.is_primary)
                .fetch_one(pool)
                .await?;
            results.push(row);
        }

        Ok(results)
    }

    /// List all detected faces for a character, ordered by confidence descending.
    pub async fn list_detected_faces(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<DetectedFace>, sqlx::Error> {
        let query = format!(
            "SELECT {DETECTED_FACE_COLUMNS} FROM detected_faces \
             WHERE character_id = $1 \
             ORDER BY confidence DESC"
        );
        sqlx::query_as::<_, DetectedFace>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Select a face as the primary face for a character.
    ///
    /// This runs in a transaction:
    /// 1. Clear the old primary flag on all faces for this character.
    /// 2. Set the new face as primary.
    /// 3. Copy the selected face's embedding and metadata to the character row.
    pub async fn select_primary_face(
        pool: &PgPool,
        character_id: DbId,
        face_id: DbId,
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Clear existing primary flag.
        sqlx::query(
            "UPDATE detected_faces SET is_primary = false \
             WHERE character_id = $1 AND is_primary = true",
        )
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

        // Set new primary.
        sqlx::query(
            "UPDATE detected_faces SET is_primary = true \
             WHERE id = $1 AND character_id = $2",
        )
        .bind(face_id)
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

        // Copy face embedding data to the character row.
        sqlx::query(
            "UPDATE characters SET \
                face_embedding = df.embedding, \
                face_detection_confidence = df.confidence, \
                face_bounding_box = df.bounding_box, \
                embedding_status_id = $3, \
                embedding_extracted_at = NOW() \
             FROM detected_faces df \
             WHERE characters.id = $1 AND df.id = $2 AND df.character_id = $1",
        )
        .bind(character_id)
        .bind(face_id)
        .bind(trulience_core::embedding::EmbeddingStatus::Completed.id())
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Clear all detected faces for a character.
    pub async fn clear_detected_faces(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM detected_faces WHERE character_id = $1")
            .bind(character_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Embedding status query
    // -----------------------------------------------------------------------

    /// Get the current embedding status for a character.
    pub async fn get_embedding_status(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<EmbeddingStatusResponse, sqlx::Error> {
        let row = sqlx::query_as::<_, EmbeddingStatusRow>(
            "SELECT \
                c.id AS character_id, \
                c.embedding_status_id, \
                es.label AS embedding_status_label, \
                c.face_detection_confidence, \
                c.face_bounding_box, \
                c.embedding_extracted_at, \
                (c.face_embedding IS NOT NULL) AS has_embedding \
             FROM characters c \
             JOIN embedding_statuses es ON es.id = c.embedding_status_id \
             WHERE c.id = $1 AND c.deleted_at IS NULL",
        )
        .bind(character_id)
        .fetch_one(pool)
        .await?;

        Ok(EmbeddingStatusResponse {
            character_id: row.character_id,
            embedding_status_id: row.embedding_status_id,
            embedding_status_label: row.embedding_status_label,
            face_detection_confidence: row.face_detection_confidence,
            face_bounding_box: row.face_bounding_box,
            embedding_extracted_at: row.embedding_extracted_at,
            has_embedding: row.has_embedding,
        })
    }

    // -----------------------------------------------------------------------
    // Embedding history / archive
    // -----------------------------------------------------------------------

    /// Archive the current character embedding into the history table.
    ///
    /// Only archives if the character has an existing embedding.
    pub async fn archive_embedding(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO embedding_history \
                (character_id, face_embedding, face_detection_confidence, face_bounding_box) \
             SELECT id, face_embedding, face_detection_confidence, face_bounding_box \
             FROM characters \
             WHERE id = $1 AND face_embedding IS NOT NULL AND deleted_at IS NULL",
        )
        .bind(character_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get the embedding history for a character, ordered newest first.
    pub async fn get_embedding_history(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<EmbeddingHistory>, sqlx::Error> {
        let query = format!(
            "SELECT {EMBEDDING_HISTORY_COLUMNS} FROM embedding_history \
             WHERE character_id = $1 \
             ORDER BY replaced_at DESC"
        );
        sqlx::query_as::<_, EmbeddingHistory>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }
}

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

/// Internal query result for `get_embedding_status`.
#[derive(Debug, sqlx::FromRow)]
struct EmbeddingStatusRow {
    character_id: DbId,
    embedding_status_id: StatusId,
    embedding_status_label: String,
    face_detection_confidence: Option<f64>,
    face_bounding_box: Option<serde_json::Value>,
    embedding_extracted_at: Option<trulience_core::types::Timestamp>,
    has_embedding: bool,
}
