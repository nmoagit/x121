# PRD-017: Asset Registry & Dependency Mapping

## 1. Introduction/Overview
Studios accumulate models, LoRAs, and custom nodes that are shared across scene types and projects. Without a registry, compatibility knowledge is tribal — one creator discovers a bad combination, but nothing prevents the next creator from hitting the same issue. This PRD provides versioned asset tracking, a "Where is this used?" dependency graph, compatibility notes, quality ratings, and dependency-aware update notifications that chain into regression testing (PRD-65) and staleness detection (PRD-69).

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model)
- **Depended on by:** PRD-23, PRD-64, PRD-69
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Maintain a complete inventory of all registered models, LoRAs, and custom nodes.
- Provide reverse-lookup dependency graphs ("Where is this asset used?").
- Capture compatibility notes and quality ratings per asset.
- Automate impact analysis when assets are updated.

## 4. User Stories
- As a Creator, I want to see which scene types use a specific LoRA so that I understand the impact before updating it.
- As a Creator, I want to record compatibility notes on model/LoRA combinations so that my teammates avoid known bad configurations.
- As an Admin, I want dependency-aware update notifications so that when a model is updated, I know exactly which scenes need attention.
- As a Creator, I want quality ratings on assets so that I can quickly identify proven vs. experimental models and LoRAs.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Asset Inventory
**Description:** Registry of all models, LoRAs, and custom nodes.
**Acceptance Criteria:**
- [ ] Each asset registered with: name, version, file path, file size, type (model/LoRA/custom node)
- [ ] Assets are discoverable by name, type, and version
- [ ] File integrity verification (checksum) on registration
- [ ] Asset status tracking (active, deprecated, removed)

#### Requirement 1.2: Dependency Graph
**Description:** Reverse lookup showing which entities reference a given asset.
**Acceptance Criteria:**
- [ ] "Where is this used?" shows all scene types, templates, and active jobs referencing the asset
- [ ] Dependency count visible in the asset list view
- [ ] Delete protection: assets with active dependencies cannot be deleted without confirmation
- [ ] Graph visualization of dependencies (optional)

#### Requirement 1.3: Compatibility Notes
**Description:** Per model/LoRA pair, creators can record observations.
**Acceptance Criteria:**
- [ ] Notes attachable to any asset or asset pair combination
- [ ] Notes are searchable and surfaced as warnings when configuring scene types
- [ ] Example notes: "Causes face-melt with model X after segment 5", "Needs CFG below 7"
- [ ] Notes are attributed to the creator who wrote them

#### Requirement 1.4: Quality Ratings
**Description:** Optional star rating per asset.
**Acceptance Criteria:**
- [ ] 1-5 star rating per asset based on production experience
- [ ] Average rating visible in asset list and search results
- [ ] Rating count shown alongside average
- [ ] Sortable by rating in the asset browser

#### Requirement 1.5: Dependency-Aware Updates
**Description:** Automated impact analysis when assets are updated.
**Acceptance Criteria:**
- [ ] When a model or LoRA is updated, identify all downstream impacts
- [ ] Show: affected scene types, active scenes using old version, stale segment count
- [ ] Actionable options: "Run regression tests", "View affected scenes", "Dismiss"
- [ ] Connects to PRD-65 (regression testing) and PRD-69 (staleness detection)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Asset Recommendations
**Description:** Suggest compatible assets based on usage patterns.
**Acceptance Criteria:**
- [ ] "Frequently used together" suggestions for models and LoRAs
- [ ] Recommendations based on successful generation history

## 6. Non-Goals (Out of Scope)
- Model/LoRA downloading (covered by PRD-104)
- Workflow validation against assets (covered by PRD-75)
- Generation provenance tracking (covered by PRD-69)

## 7. Design Considerations
- Asset browser should have a card view with preview images where available.
- Dependency graph should be interactive (click to navigate to the dependent entity).
- Compatibility warnings should appear prominently in scene type configuration.

## 8. Technical Considerations
- **Stack:** Rust for registry service, PostgreSQL for storage, React for browser UI
- **Existing Code to Reuse:** PRD-01 entity relationships
- **New Infrastructure Needed:** Asset registry table, dependency tracker, compatibility notes table
- **Database Changes:** `assets` table, `asset_dependencies` table, `asset_notes` table, `asset_ratings` table
- **API Changes:** CRUD /assets, GET /assets/:id/dependencies, POST /assets/:id/notes, PUT /assets/:id/rating

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of models and LoRAs in use are registered in the asset registry
- Dependency lookup returns complete results in <500ms
- Compatibility warnings surface for all flagged combinations
- Update impact analysis correctly identifies all affected entities

## 11. Open Questions
- Should the registry support custom asset types beyond models, LoRAs, and custom nodes?
- How should version numbering work for assets without explicit version metadata?
- Should compatibility notes be editable by all creators or only the original author?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
