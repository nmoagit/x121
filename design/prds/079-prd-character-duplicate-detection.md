# PRD-079: Character Duplicate Detection

## 1. Introduction/Overview
Duplicate characters waste variant generation time, create metadata inconsistencies, and confuse search results. In a library with 100+ characters, visual similarity between source images is the only reliable way to catch duplicates — name matching isn't sufficient when different photographers use different naming conventions. This PRD provides automated visual similarity checks at upload time using face embeddings from PRD-76.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-20 (Search for similarity queries), PRD-76 (Character Identity Embedding)
- **Depended on by:** PRD-21 (Source Image Management), PRD-67 (Bulk Onboarding)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Automatically check new source images against all existing characters on upload.
- Alert users when a potential duplicate is detected with actionable options.
- Support batch duplicate detection during bulk onboarding.
- Provide configurable similarity thresholds per project or studio.

## 4. User Stories
- As a Creator, I want automatic duplicate detection when I upload a new character so that I don't accidentally create a duplicate entry.
- As a Creator, I want to see the matching character's details when a duplicate is detected so that I can decide whether to link to the existing character or proceed as new.
- As an Admin, I want batch duplicate detection during bulk onboarding so that cross-duplicate pairs in the batch are caught before processing.
- As an Admin, I want configurable similarity thresholds so that I can adjust sensitivity based on our library's characteristics.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Upload-Time Check
**Description:** Automatic similarity check when a source image is uploaded.
**Acceptance Criteria:**
- [ ] Face embedding extracted and compared against all existing characters
- [ ] Check completes within 5 seconds for libraries up to 1000 characters
- [ ] Results sorted by similarity score (highest first)
- [ ] Check runs automatically — no manual trigger required

#### Requirement 1.2: Similarity Alert
**Description:** Alert when a match exceeds the threshold.
**Acceptance Criteria:**
- [ ] Alert shows: match percentage, matched character details, side-by-side comparison
- [ ] Options: Link to existing character, Create as new (with confirmation), Cancel
- [ ] Alert is dismissible (user explicitly acknowledges the match)
- [ ] Threshold is configurable (default: 90% similarity)

#### Requirement 1.3: Batch Detection
**Description:** Cross-duplicate detection during bulk onboarding.
**Acceptance Criteria:**
- [ ] All uploaded images compared against each other AND against existing library
- [ ] Duplicate pairs flagged before bulk processing proceeds
- [ ] Visual grid showing flagged pairs with similarity scores
- [ ] Batch resolution: merge, separate, or skip per pair

#### Requirement 1.4: Merge Suggestion
**Description:** Offer to merge confirmed duplicates.
**Acceptance Criteria:**
- [ ] If duplicate is confirmed, offer to merge with existing character
- [ ] Merge adopts existing character's variants and metadata
- [ ] Merge preserves the better-quality source image
- [ ] Merge action is logged in audit trail

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Periodic Library Scan
**Description:** Background scan to find duplicates that slipped through.
**Acceptance Criteria:**
- [ ] Scheduled comparison of all characters in the library
- [ ] Report of potential duplicates sorted by similarity

## 6. Non-Goals (Out of Scope)
- Face embedding extraction (covered by PRD-76)
- Visual similarity search infrastructure (covered by PRD-20)
- Source image management (covered by PRD-21)

## 7. Design Considerations
- The duplicate alert should be modal — it requires a decision before proceeding.
- Side-by-side comparison should show faces at the same scale for accurate visual assessment.
- Similarity percentage should be displayed prominently.

## 8. Technical Considerations
- **Stack:** pgvector for similarity queries, PRD-76 face embeddings, Rust comparison service
- **Existing Code to Reuse:** PRD-76 embedding extraction, PRD-20 similarity search
- **New Infrastructure Needed:** Duplicate detection service, batch comparison orchestrator
- **Database Changes:** `duplicate_checks` log table for audit purposes
- **API Changes:** POST /characters/check-duplicate, GET /characters/duplicates/batch

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Duplicate detection runs in <5 seconds for upload-time checks
- Detection rate >95% for actual duplicates at the default threshold
- False positive rate <5% (incorrectly flagging distinct characters)
- Batch detection scales linearly with N uploaded images

## 11. Open Questions
- Should the similarity threshold be adjustable per-upload, or only a global setting?
- How should the system handle characters who are genuinely similar (e.g., twins)?
- Should merge operations be reversible?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
