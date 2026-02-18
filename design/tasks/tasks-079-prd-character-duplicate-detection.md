# Task List: Character Duplicate Detection

**PRD Reference:** `design/prds/079-prd-character-duplicate-detection.md`
**Scope:** Build automated visual similarity checks at character upload time using face embeddings (PRD-076) and pgvector, with similarity alerts, batch detection during bulk onboarding, merge suggestions, and configurable thresholds.

## Overview

This PRD creates a duplicate detection pipeline that runs automatically when a new source image is uploaded. It extracts face embeddings (via PRD-076), compares them against all existing character embeddings using pgvector cosine similarity, and surfaces matches above a configurable threshold as actionable alerts. During bulk onboarding, cross-duplicate detection runs across all uploaded images before processing. Confirmed duplicates can be merged with the existing character.

### What Already Exists
- PRD-000: pgvector extension, database conventions
- PRD-001: Character and source image tables
- PRD-020: Visual similarity search via pgvector
- PRD-076: Face embedding extraction service (dependency — must exist)

### What We're Building
1. Upload-time duplicate check service
2. Similarity alert dialog with side-by-side comparison
3. Batch cross-duplicate detection for bulk onboarding
4. Character merge service
5. Duplicate check audit log
6. Configurable threshold settings

### Key Design Decisions
1. **Reuse PRD-076 embeddings** — No new embedding extraction. This PRD consumes embeddings produced by PRD-076.
2. **Reuse PRD-020 similarity search** — The vector search query is the same as PRD-020's visual similarity. This PRD wraps it with upload-time automation and a decision UI.
3. **Threshold is configurable** — Default 90% similarity. Admins can adjust per-project to handle different library characteristics.
4. **Merge is a soft operation** — Merging does not delete the duplicate; it links the duplicate's data to the existing character and marks the duplicate as merged. This preserves audit trail.

---

## Phase 1: Database Schema

### Task 1.1: Duplicate Check Log Table
**File:** `migrations/{timestamp}_create_duplicate_checks.sql`

Audit log for duplicate detection results.

```sql
CREATE TABLE duplicate_check_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON duplicate_check_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO duplicate_check_statuses (name, description) VALUES
    ('no_match', 'No duplicates found above threshold'),
    ('match_found', 'Potential duplicate found'),
    ('confirmed_duplicate', 'User confirmed as duplicate'),
    ('dismissed', 'User dismissed the match as not a duplicate'),
    ('merged', 'Duplicate was merged with existing character');

CREATE TABLE duplicate_checks (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES duplicate_check_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_character_id BIGINT NOT NULL,   -- the new/uploaded character
    matched_character_id BIGINT,           -- the existing character matched against
    similarity_score FLOAT,
    threshold_used FLOAT NOT NULL,
    check_type TEXT NOT NULL,              -- 'upload', 'batch', 'periodic'
    embedding_vector_id BIGINT,            -- reference to the embedding used
    resolution TEXT,                        -- 'create_new', 'merge', 'dismiss', 'skip'
    resolved_by BIGINT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_duplicate_checks_status_id ON duplicate_checks(status_id);
CREATE INDEX idx_duplicate_checks_source ON duplicate_checks(source_character_id);
CREATE INDEX idx_duplicate_checks_matched ON duplicate_checks(matched_character_id);
CREATE INDEX idx_duplicate_checks_created_at ON duplicate_checks(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON duplicate_checks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Audit log captures every duplicate check with result
- [ ] Tracks threshold used, similarity score, resolution action
- [ ] Links source (new) and matched (existing) characters
- [ ] Statuses cover the full lifecycle: no_match through merged
- [ ] Migration applies cleanly

### Task 1.2: Duplicate Detection Settings
**File:** `migrations/{timestamp}_create_duplicate_settings.sql`

```sql
CREATE TABLE duplicate_detection_settings (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NULL,              -- NULL = studio default
    similarity_threshold FLOAT NOT NULL DEFAULT 0.90,
    auto_check_on_upload BOOLEAN NOT NULL DEFAULT true,
    auto_check_on_batch BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_duplicate_settings_project ON duplicate_detection_settings(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON duplicate_detection_settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Insert studio default
INSERT INTO duplicate_detection_settings (similarity_threshold) VALUES (0.90);
```

**Acceptance Criteria:**
- [ ] Default threshold: 90% similarity
- [ ] Configurable per-project (NULL = studio default)
- [ ] Toggle for auto-check on upload and batch
- [ ] Migration applies cleanly

---

## Phase 2: Duplicate Detection Service

### Task 2.1: Upload-Time Checker
**File:** `src/duplicates/checker.rs`

Automatic similarity check when a source image is uploaded.

```rust
use sqlx::PgPool;
use crate::types::DbId;

#[derive(Debug, Serialize)]
pub struct DuplicateMatch {
    pub matched_character_id: DbId,
    pub matched_character_name: String,
    pub similarity_score: f64,
    pub matched_image_path: String,
}

pub async fn check_for_duplicates(
    pool: &PgPool,
    character_id: DbId,
    embedding: &[f32],
    project_id: Option<DbId>,
) -> Result<Vec<DuplicateMatch>, DuplicateError> {
    let settings = get_settings(pool, project_id).await?;

    // Query pgvector for similar embeddings
    let matches = sqlx::query_as!(
        DuplicateMatchRow,
        r#"
        SELECT ie.entity_id as character_id, c.name as character_name,
               1 - (ie.embedding <=> $1::vector) as similarity_score,
               si.file_path as image_path
        FROM image_embeddings ie
        JOIN characters c ON c.id = ie.entity_id
        JOIN source_images si ON si.character_id = c.id
        WHERE ie.entity_type = 'character'
          AND ie.entity_id != $2
          AND 1 - (ie.embedding <=> $1::vector) >= $3
        ORDER BY ie.embedding <=> $1::vector
        LIMIT 10
        "#,
        embedding as &[f32],
        character_id,
        settings.similarity_threshold
    )
    .fetch_all(pool)
    .await?;

    // Log check result
    for m in &matches {
        log_duplicate_check(pool, character_id, Some(m.character_id),
            Some(m.similarity_score), settings.similarity_threshold, "upload", "match_found").await?;
    }

    if matches.is_empty() {
        log_duplicate_check(pool, character_id, None, None,
            settings.similarity_threshold, "upload", "no_match").await?;
    }

    Ok(matches.into_iter().map(|m| m.into()).collect())
}
```

**Acceptance Criteria:**
- [ ] Compares upload embedding against all existing character embeddings
- [ ] Excludes the character's own embedding from results
- [ ] Respects configurable threshold (default 90%)
- [ ] Returns matches sorted by similarity (highest first)
- [ ] Completes in <5 seconds for libraries up to 1000 characters (per success metric)
- [ ] Logs every check in the audit table

### Task 2.2: Batch Cross-Duplicate Detector
**File:** `src/duplicates/batch.rs`

Cross-check all images in a batch against each other and existing library.

```rust
pub async fn batch_duplicate_check(
    pool: &PgPool,
    batch_embeddings: &[(DbId, Vec<f32>)], // (temp_character_id, embedding)
    project_id: Option<DbId>,
) -> Result<BatchDuplicateReport, DuplicateError> {
    let settings = get_settings(pool, project_id).await?;
    let mut report = BatchDuplicateReport::default();

    // Check each against existing library
    for (char_id, embedding) in batch_embeddings {
        let matches = check_for_duplicates(pool, *char_id, embedding, project_id).await?;
        if !matches.is_empty() {
            report.library_matches.push((*char_id, matches));
        }
    }

    // Check each against others in the batch
    for i in 0..batch_embeddings.len() {
        for j in (i + 1)..batch_embeddings.len() {
            let similarity = cosine_similarity(&batch_embeddings[i].1, &batch_embeddings[j].1);
            if similarity >= settings.similarity_threshold {
                report.cross_matches.push(CrossMatch {
                    character_a_id: batch_embeddings[i].0,
                    character_b_id: batch_embeddings[j].0,
                    similarity_score: similarity,
                });
            }
        }
    }

    Ok(report)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    (dot / (norm_a * norm_b)) as f64
}
```

**Acceptance Criteria:**
- [ ] Checks each upload against existing library
- [ ] Checks each upload against every other upload in the batch
- [ ] Returns library matches and cross-batch matches separately
- [ ] Scales linearly with batch size (per success metric)
- [ ] All matches above threshold are reported

### Task 2.3: Character Merge Service
**File:** `src/duplicates/merge.rs`

Merge a duplicate character into an existing one.

```rust
pub async fn merge_characters(
    pool: &PgPool,
    duplicate_id: DbId,
    target_id: DbId,
    keep_better_image: bool,
) -> Result<MergeResult, DuplicateError> {
    let mut tx = pool.begin().await?;

    // Transfer variants from duplicate to target
    sqlx::query!(
        "UPDATE image_variants SET character_id = $2 WHERE character_id = $1",
        duplicate_id, target_id
    )
    .execute(&mut *tx)
    .await?;

    // Transfer scenes from duplicate to target
    sqlx::query!(
        "UPDATE scenes SET character_id = $2 WHERE character_id = $1",
        duplicate_id, target_id
    )
    .execute(&mut *tx)
    .await?;

    // Optionally update source image if duplicate's is better quality
    if keep_better_image {
        // Compare image quality and swap if duplicate is better
    }

    // Mark duplicate as merged (soft delete)
    sqlx::query!(
        "UPDATE characters SET name = name || ' [MERGED into ' || $2 || ']' WHERE id = $1",
        duplicate_id, target_id
    )
    .execute(&mut *tx)
    .await?;

    // Update duplicate check record
    update_check_status(&mut tx, duplicate_id, target_id, "merged").await?;

    tx.commit().await?;

    Ok(MergeResult {
        target_id,
        merged_variants: 0, // count from above
        merged_scenes: 0,   // count from above
    })
}
```

**Acceptance Criteria:**
- [ ] Transfers variants, scenes, and metadata from duplicate to target
- [ ] Optionally keeps the better-quality source image
- [ ] Marks duplicate character as merged (not deleted, for audit)
- [ ] All operations in a single transaction
- [ ] Logged in audit trail

---

## Phase 3: API Endpoints

### Task 3.1: Duplicate Check Endpoint
**File:** `src/routes/duplicates.rs`

```rust
pub async fn check_duplicate(
    State(pool): State<PgPool>,
    Json(body): Json<CheckDuplicateRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Extract embedding (or receive pre-computed)
    let matches = crate::duplicates::checker::check_for_duplicates(
        &pool, body.character_id, &body.embedding, body.project_id,
    ).await?;
    Ok(Json(matches))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/characters/check-duplicate` runs duplicate check
- [ ] Returns matches with similarity scores
- [ ] Accepts pre-computed embedding or character ID

### Task 3.2: Batch Detection Endpoint
**File:** `src/routes/duplicates.rs`

**Acceptance Criteria:**
- [ ] `POST /api/characters/duplicates/batch` runs batch detection
- [ ] Returns library matches and cross-batch matches
- [ ] Accepts array of character IDs or embeddings

### Task 3.3: Resolution Endpoints
**File:** `src/routes/duplicates.rs`

**Acceptance Criteria:**
- [ ] `POST /api/characters/duplicates/:id/merge` merges duplicate into target
- [ ] `POST /api/characters/duplicates/:id/dismiss` dismisses the match
- [ ] `GET /api/characters/duplicates/history` lists past checks

### Task 3.4: Settings Endpoint
**File:** `src/routes/duplicates.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/duplicates/settings` returns current settings
- [ ] `PUT /api/admin/duplicates/settings` updates threshold and toggles

### Task 3.5: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All duplicate detection endpoints registered

---

## Phase 4: Frontend

### Task 4.1: Similarity Alert Dialog
**File:** `frontend/src/components/duplicates/SimilarityAlert.tsx`

Modal dialog shown when a duplicate is detected during upload.

```typescript
interface SimilarityAlertProps {
  uploadedCharacter: CharacterInfo;
  match: DuplicateMatch;
  onLinkExisting: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export const SimilarityAlert: React.FC<SimilarityAlertProps> = ({
  uploadedCharacter, match, onLinkExisting, onCreateNew, onCancel,
}) => (
  <div className="similarity-alert modal">
    <h3>Potential Duplicate Detected</h3>
    <div className="comparison">
      <div className="uploaded">
        <img src={uploadedCharacter.imagePath} alt="Uploaded" />
        <span>{uploadedCharacter.name}</span>
      </div>
      <div className="similarity-score">{(match.similarity_score * 100).toFixed(1)}%</div>
      <div className="existing">
        <img src={match.matched_image_path} alt="Existing" />
        <span>{match.matched_character_name}</span>
      </div>
    </div>
    <div className="actions">
      <button onClick={onLinkExisting}>Link to Existing Character</button>
      <button onClick={onCreateNew}>Create as New Character</button>
      <button onClick={onCancel}>Cancel Upload</button>
    </div>
  </div>
);
```

**Acceptance Criteria:**
- [ ] Modal blocks upload flow until resolved
- [ ] Side-by-side image comparison at same scale
- [ ] Similarity percentage prominently displayed
- [ ] Three options: link to existing, create new, cancel
- [ ] Shows matched character details (name, project, etc.)

### Task 4.2: Batch Duplicate Grid
**File:** `frontend/src/components/duplicates/BatchDuplicateGrid.tsx`

Visual grid showing flagged pairs during bulk onboarding.

**Acceptance Criteria:**
- [ ] Grid of flagged pairs with similarity scores
- [ ] Side-by-side thumbnails per pair
- [ ] Per-pair resolution: merge, separate, skip
- [ ] All pairs must be resolved before proceeding

### Task 4.3: Threshold Settings Panel
**File:** `frontend/src/components/duplicates/ThresholdSettings.tsx`

**Acceptance Criteria:**
- [ ] Slider for similarity threshold (50%-100%)
- [ ] Toggle for auto-check on upload
- [ ] Toggle for auto-check on batch
- [ ] Per-project override option

---

## Phase 5: Testing

### Task 5.1: Checker Tests
**File:** `tests/duplicate_checker_tests.rs`

**Acceptance Criteria:**
- [ ] Identical embeddings return 100% similarity
- [ ] Dissimilar embeddings return below threshold
- [ ] Threshold filtering works correctly
- [ ] Self-match is excluded
- [ ] Check completes in <5 seconds for 1000 characters

### Task 5.2: Batch Tests
**File:** `tests/duplicate_batch_tests.rs`

**Acceptance Criteria:**
- [ ] Cross-batch duplicates detected
- [ ] Library matches detected separately
- [ ] All pairs above threshold reported

### Task 5.3: Merge Tests
**File:** `tests/duplicate_merge_tests.rs`

**Acceptance Criteria:**
- [ ] Variants transferred to target character
- [ ] Scenes transferred to target character
- [ ] Duplicate marked as merged, not deleted
- [ ] Audit log updated correctly
- [ ] Transaction rolls back on failure

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_duplicate_checks.sql` | Audit log table |
| `migrations/{timestamp}_create_duplicate_settings.sql` | Threshold settings |
| `src/duplicates/mod.rs` | Module root |
| `src/duplicates/checker.rs` | Upload-time duplicate check |
| `src/duplicates/batch.rs` | Batch cross-duplicate detection |
| `src/duplicates/merge.rs` | Character merge service |
| `src/routes/duplicates.rs` | API endpoints |
| `frontend/src/components/duplicates/SimilarityAlert.tsx` | Upload alert modal |
| `frontend/src/components/duplicates/BatchDuplicateGrid.tsx` | Batch detection grid |
| `frontend/src/components/duplicates/ThresholdSettings.tsx` | Settings panel |

## Dependencies

### Existing Components to Reuse
- PRD-000: pgvector, `DbId`, migration framework
- PRD-001: Character and source image tables
- PRD-020: `search_similar_images` for vector similarity queries
- PRD-076: Face embedding extraction (consumed, not built here)

### New Infrastructure Needed
- None beyond pgvector (already installed)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Detection Service (Tasks 2.1-2.3)
3. Phase 3: API Endpoints (Tasks 3.1-3.5)

**MVP Success Criteria:**
- Detection in <5 seconds for upload-time checks
- >95% detection rate for actual duplicates
- <5% false positive rate
- Batch detection scales linearly

### Post-MVP Enhancements
1. Phase 4: Frontend (Tasks 4.1-4.3)
2. Phase 5: Testing (Tasks 5.1-5.3)
3. Periodic library scan (PRD Phase 2)

---

## Notes

1. **Embedding dependency:** This PRD is entirely dependent on PRD-076 face embeddings being available. If embeddings are not generated for a character, duplicate detection cannot run. The system should gracefully skip the check and log a warning.
2. **Threshold tuning:** The default 90% threshold may need adjustment based on the studio's image characteristics. Studios with very similar-looking characters (e.g., same ethnicity, similar features) may need a higher threshold to reduce false positives.
3. **Merge reversibility:** The merge operation is designed to be "soft" — the duplicate character is marked as merged but not deleted. A future enhancement could implement merge undo by restoring the original character and reassigning transferred entities.
4. **Performance at scale:** For libraries >10,000 characters, consider using HNSW indexes on the pgvector column for approximate nearest neighbor search.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
