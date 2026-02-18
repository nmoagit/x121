# PRD-104: Model & LoRA Download Manager

## 1. Introduction/Overview
PRD-17 manages the asset registry after models exist on disk, but the actual process of getting models onto disk is entirely manual: browse CivitAI, download locally, transfer to server, move to the correct directory, register in the platform. This PRD provides in-platform download, verification, and registration of AI models and LoRAs from external sources, collapsing the multi-step process into "paste URL, confirm, done."

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-17 (Asset Registry for registration), PRD-46 (Worker Pool for distribution)
- **Depended on by:** PRD-75 (Workflow Import for model availability)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable direct download from CivitAI, HuggingFace, and arbitrary URLs.
- Verify file integrity via SHA-256 hash comparison after download.
- Auto-register downloaded files in the asset registry with metadata from the source.
- Distribute downloaded models to all workers in the pool.

## 4. User Stories
- As a Creator, I want to paste a CivitAI model page URL and have the model downloaded and registered automatically so that I skip the manual download-transfer-register process.
- As an Admin, I want hash verification after download so that I can trust file integrity.
- As an Admin, I want downloaded models to be automatically placed in the correct directory based on type so that file organization is consistent.
- As an Admin, I want models synced to all workers after download so that every GPU has access to new models.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Source Integrations
**Description:** Download from major model hosting platforms.
**Acceptance Criteria:**
- [ ] CivitAI: download by model page URL or API
- [ ] HuggingFace: download by repo URL or model ID
- [ ] Direct download: any URL returning a file
- [ ] Personal API tokens stored securely per user for authenticated access

#### Requirement 1.2: Download Queue
**Description:** Queue and manage multiple concurrent downloads.
**Acceptance Criteria:**
- [ ] Queue multiple downloads with progress bars and speed estimates
- [ ] Pause and resume individual downloads
- [ ] Downloads run in the background — navigate away and come back
- [ ] Download failures include clear error messages and retry option

#### Requirement 1.3: Hash Verification
**Description:** Verify file integrity after download.
**Acceptance Criteria:**
- [ ] SHA-256 hash verified against the published hash from CivitAI/HuggingFace
- [ ] Hash mismatch flagged as potentially corrupted or tampered
- [ ] Verification runs automatically after download completes
- [ ] Manual re-verification available

#### Requirement 1.4: Auto-Registration
**Description:** Register downloaded files in the asset registry with source metadata.
**Acceptance Criteria:**
- [ ] Metadata pulled from source: model name, base model compatibility, trigger words, description, preview images
- [ ] Registered in PRD-17 asset registry automatically
- [ ] Registration can be reviewed and edited before finalizing
- [ ] Type classification: checkpoint, LoRA, embeddings, etc.

#### Requirement 1.5: Placement Rules
**Description:** Configurable rules for where files are stored.
**Acceptance Criteria:**
- [ ] Rules based on model type: checkpoints -> `/models/checkpoints/`, LoRAs -> `/models/loras/`
- [ ] Support rules based on base model (e.g., SD 1.5 vs. SDXL)
- [ ] Custom path rules configurable by Admin
- [ ] Correct directory structure created automatically

#### Requirement 1.6: Duplicate Detection
**Description:** Check if a file already exists before downloading.
**Acceptance Criteria:**
- [ ] Hash-based check against existing registry before download
- [ ] If duplicate found: "This model is already registered as [name] — download anyway?"
- [ ] Option to skip, re-download (overwrite), or link to existing

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Worker Distribution
**Description:** Sync models to all workers after download.
**Acceptance Criteria:**
- [ ] After download to primary storage, sync to all workers (PRD-46)
- [ ] Per-worker sync status tracked
- [ ] Selective sync to specific tagged workers

## 6. Non-Goals (Out of Scope)
- Asset registry management (covered by PRD-17)
- Workflow validation against assets (covered by PRD-75)
- Asset dependency mapping (covered by PRD-17)

## 7. Design Considerations
- The download manager should feel like a native app download manager (progress bars, speed, ETA).
- Paste-and-go: pasting a URL into the download field should auto-detect the source and fill in metadata.
- Duplicate detection should be non-blocking — warning only, not preventing the download.

## 8. Technical Considerations
- **Stack:** Rust for download management (reqwest for HTTP), CivitAI/HuggingFace APIs, SHA-256 for hashing
- **Existing Code to Reuse:** PRD-17 asset registry for registration, PRD-46 worker pool for distribution
- **New Infrastructure Needed:** Download queue manager, source API integrations, hash verifier, placement rule engine
- **Database Changes:** `downloads` table (id, url, source, status, hash, file_path, created_at), `api_tokens` table for user credentials
- **API Changes:** POST /downloads, GET /downloads, POST /downloads/:id/pause, POST /downloads/:id/resume

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Download from CivitAI/HuggingFace completes at line-speed (no artificial throttling)
- Hash verification catches 100% of corrupted downloads
- Auto-registration correctly populates >90% of metadata fields from source
- Placement rules correctly route files to the right directory 100% of the time

## 11. Open Questions
- Should downloads be rate-limited to avoid overwhelming the network?
- How should the system handle API token expiry or revocation?
- Should the download manager support torrent or multi-source downloads?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
