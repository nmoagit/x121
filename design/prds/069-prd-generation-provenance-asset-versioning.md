# PRD-069: Generation Provenance & Asset Versioning

## 1. Introduction/Overview
Without provenance tracking, updating a LoRA or re-generating a clothed variant creates invisible inconsistency: some scenes use the old version, some use the new, and nobody knows which is which. This PRD provides immutable generation receipts, asset version tracking, staleness detection, targeted re-generation, and reproducibility — turning asset updates from "re-generate everything to be safe" into "re-generate exactly the 12 affected segments."

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-17 (Asset Registry), PRD-21 (Source Image Management), PRD-24 (Generation Loop)
- **Depended on by:** PRD-71 (Smart Auto-Retry)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Record an immutable generation receipt for every segment capturing all inputs and parameters.
- Track asset versions so updates don't overwrite previous versions.
- Detect and flag segments generated with outdated asset versions.
- Enable targeted re-generation of only affected segments.

## 4. User Stories
- As a Creator, I want to see exactly which workflow, model, LoRA, and prompt were used to generate any segment so that I can reproduce or understand results.
- As a Creator, I want to be notified when segments are stale because I updated a LoRA so that I know which scenes need re-generation.
- As a Creator, I want to re-generate only the 12 affected segments instead of all 60 so that I save GPU time after an asset update.
- As an Admin, I want bidirectional provenance queries so that I can answer both "What was used for this segment?" and "Which segments used this LoRA version?"

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Generation Receipt
**Description:** Immutable record of all inputs for each generated segment.
**Acceptance Criteria:**
- [ ] Records: source image hash, variant image hash, workflow version, model version, LoRA version+weight, resolved prompt text, CFG, seed, resolution tier
- [ ] Receipt is write-once (immutable after generation)
- [ ] Receipt is attached to the segment entity
- [ ] Human-readable display in the segment detail view

#### Requirement 1.2: Asset Version Tracking
**Description:** Version numbering for all generative assets.
**Acceptance Criteria:**
- [ ] Source images, variants, workflows, models, and LoRAs are version-tracked
- [ ] New uploads create new versions; previous versions are retained
- [ ] Version history viewable per asset with timestamps and uploader
- [ ] Active version clearly distinguished from historical versions

#### Requirement 1.3: Staleness Detection
**Description:** Flag segments generated with outdated asset versions.
**Acceptance Criteria:**
- [ ] After an asset update, identify all segments generated with the old version
- [ ] Staleness report: "12 segments across 3 scenes used clothed_v1.png — you are on v2"
- [ ] Stale segments marked with a visual indicator in all views
- [ ] Notification via PRD-10 when staleness is detected

#### Requirement 1.4: Targeted Re-generation
**Description:** Re-generate only affected segments from the staleness report.
**Acceptance Criteria:**
- [ ] From the staleness report, select which scenes/segments to re-generate
- [ ] Re-generation uses the updated asset version
- [ ] Unaffected scenes remain untouched
- [ ] Re-generation creates new segments (old ones preserved for comparison)

#### Requirement 1.5: Provenance Queries
**Description:** Bidirectional lookup between segments and assets.
**Acceptance Criteria:**
- [ ] "What was used to generate this segment?" — full generation receipt
- [ ] "Which segments used this specific LoRA version?" — reverse lookup
- [ ] Both queries return results in <500ms
- [ ] Query results navigable (click to go to segment or asset)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Reproducibility
**Description:** Re-run a generation with identical inputs from a receipt.
**Acceptance Criteria:**
- [ ] Given a generation receipt, re-run with the same parameters
- [ ] Verify consistency between original and reproduced output

## 6. Non-Goals (Out of Scope)
- Asset registry management (covered by PRD-17)
- Workflow versioning (covered by PRD-75)
- Regression testing (covered by PRD-65)

## 7. Design Considerations
- Stale segments should have a distinctive visual marker (e.g., orange warning icon).
- The staleness report should be action-oriented: "Fix these" with bulk re-queue.
- Generation receipts should be expandable/collapsible in the segment detail view.

## 8. Technical Considerations
- **Stack:** Rust for receipt generation, PostgreSQL for immutable storage, content-addressable hashing
- **Existing Code to Reuse:** PRD-17 asset versioning, PRD-24 generation pipeline
- **New Infrastructure Needed:** Receipt generator, staleness detector, provenance query service
- **Database Changes:** `generation_receipts` table (segment_id, inputs_hash, parameters_json, created_at), version columns on asset tables
- **API Changes:** GET /segments/:id/provenance, GET /assets/:id/usage, GET /projects/:id/staleness-report

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of generated segments have complete generation receipts
- Staleness detection identifies all affected segments within 1 minute of an asset update
- Targeted re-generation correctly uses updated assets and preserves unaffected segments
- Provenance queries return results in <500ms

## 11. Open Questions
- How long should old asset versions be retained (indefinitely or with a policy)?
- Should provenance tracking include ComfyUI node execution metrics (time per node)?
- How should the system handle provenance for segments generated before this feature existed?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
