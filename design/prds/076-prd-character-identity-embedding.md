# PRD-076: Character Identity Embedding

## 1. Introduction/Overview
Multiple PRDs depend on "comparing a generated frame to the character's face" but none defined where that reference comes from. This PRD provides automatic extraction and storage of a face identity embedding from each character's source image, serving as the biometric reference for quality checks (PRD-49), likeness anchoring (PRD-26), and duplicate detection (PRD-79). Making extraction automatic on upload ensures the embedding is always available when downstream features need it.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-20 (Search for pgvector), PRD-22 (Source Image QA)
- **Depended on by:** PRD-49 (Quality Gates), PRD-79 (Duplicate Detection)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Automatically extract face identity embeddings from source images on upload.
- Handle multi-face images with user-guided primary face selection.
- Store embeddings as pgvector columns for efficient similarity queries.
- Serve as the shared biometric reference for all downstream quality and similarity features.

## 4. User Stories
- As a Creator, I want face embeddings extracted automatically when I upload a source image so that quality checks and duplicate detection are available immediately.
- As a Creator, I want to select the primary face when my source image contains multiple people so that the correct identity is used for comparison.
- As a Creator, I want a warning when face detection confidence is low so that I know to use a clearer source image.
- As an Admin, I want embeddings stored as pgvector columns so that visual similarity search is efficient.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Automatic Extraction
**Description:** Run face detection and embedding extraction on source image upload.
**Acceptance Criteria:**
- [ ] Face detection runs automatically when a source image is uploaded (PRD-21)
- [ ] Identity embedding extracted (e.g., via InsightFace/ArcFace)
- [ ] Embedding stored alongside the character record
- [ ] Extraction completes within 5 seconds per image

#### Requirement 1.2: Multi-Face Handling
**Description:** Handle source images with multiple detected faces.
**Acceptance Criteria:**
- [ ] If multiple faces detected, prompt user to select the primary face
- [ ] Show bounding boxes on all detected faces for selection
- [ ] Store selected face's bounding box and embedding
- [ ] Non-selected faces are ignored for downstream features

#### Requirement 1.3: Embedding Update
**Description:** Re-extract when source image is replaced.
**Acceptance Criteria:**
- [ ] When source image is replaced, embedding is re-extracted
- [ ] Existing quality scores that used the old embedding are flagged as potentially stale
- [ ] Previous embedding is retained for comparison
- [ ] Downstream features notified of embedding change

#### Requirement 1.4: Embedding Storage
**Description:** Store as pgvector column for efficient similarity queries.
**Acceptance Criteria:**
- [ ] Stored in a pgvector column on the character table
- [ ] Indexed for efficient nearest-neighbor queries (HNSW or IVFFlat)
- [ ] Accessible by PRD-20 visual search, PRD-49 quality gates, PRD-79 duplicate detection

#### Requirement 1.5: Quality Threshold Warning
**Description:** Warn when face detection confidence is low.
**Acceptance Criteria:**
- [ ] Warning if face detection confidence is below configurable threshold
- [ ] Message: "Face detection confidence is low (0.65) — this may cause unreliable quality checks"
- [ ] Suggest using a clearer source image
- [ ] Warning is non-blocking (user can proceed)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Multi-Embedding Support
**Description:** Store multiple embeddings per character for different angles/expressions.
**Acceptance Criteria:**
- [ ] Support multiple reference embeddings per character
- [ ] Quality checks use the closest matching embedding

## 6. Non-Goals (Out of Scope)
- Source image upload workflow (covered by PRD-21)
- Quality gate scoring logic (covered by PRD-49)
- Duplicate detection logic (covered by PRD-79)
- Visual search UI (covered by PRD-20)

## 7. Design Considerations
- Multi-face selection should be visual: show the image with colored bounding boxes, click to select.
- Quality warning should appear inline on the upload flow, not as a separate page.
- Embedding status should be indicated on the character card (green=good, yellow=low confidence).

## 8. Technical Considerations
- **Stack:** Python (InsightFace/ArcFace) via PRD-09 runtime, pgvector for storage, Rust for orchestration
- **Existing Code to Reuse:** PRD-09 Python runtime, PRD-20 pgvector infrastructure
- **New Infrastructure Needed:** Face detection service, embedding extraction pipeline, pgvector indexing
- **Database Changes:** Add `face_embedding vector(512)` column to characters table, `face_detection_confidence` column
- **API Changes:** POST /characters/:id/extract-embedding, GET /characters/:id/embedding-status

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Embedding extraction completes in <5 seconds per image
- Face detection correctly identifies the primary face in >95% of single-face images
- Embedding similarity correctly distinguishes same vs. different characters (>90% accuracy)
- All characters with source images have embeddings extracted (100% coverage)

## 11. Open Questions
- Which embedding model should be used (ArcFace, FaceNet, others)?
- What vector dimension should embeddings use (128, 256, 512)?
- Should embeddings be regenerated when the detection model is updated?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
