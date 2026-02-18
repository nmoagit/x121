# PRD-048: External & Tiered Storage

## 1. Introduction/Overview
Studios generating terabytes of video segments need a middle ground between permanent local storage and deletion. This PRD extends PRD-15 (Disk Reclamation) from "delete or keep" to "delete, keep hot, or move cold" by providing support for external storage backends (S3, NAS/SMB) and policy-driven tiering between hot and cold storage. Cold storage preserves the option to revisit old work without consuming expensive local SSD space.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-15 (Disk Reclamation for tiering policies)
- **Depended on by:** PRD-72 (Project Lifecycle for archival)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Support pluggable storage backends: local disk, S3-compatible, and NFS/SMB.
- Implement policy-driven automatic tiering based on age, status, and access frequency.
- Ensure transparent user access regardless of storage tier.
- Keep metadata always on fast local storage for unimpeded search and browsing.

## 4. User Stories
- As an Admin, I want to configure S3 as a cold storage backend so that completed project assets are preserved without consuming local SSD space.
- As a Creator, I want to access cold-stored assets transparently so that I see a "Retrieving..." indicator rather than a broken link.
- As an Admin, I want automatic tiering rules so that assets move to cold storage based on age and approval status without manual intervention.
- As an Admin, I want to migrate existing assets between backends with integrity verification so that I can reorganize storage without data loss.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Storage Backend Configuration
**Description:** Pluggable adapters for multiple storage types.
**Acceptance Criteria:**
- [ ] Local disk adapter (default, always available)
- [ ] S3-compatible object storage adapter (AWS S3, MinIO, etc.)
- [ ] NFS/SMB network-attached storage adapter
- [ ] Backend configurable per-project or globally

#### Requirement 1.2: Tiered Storage Policies
**Description:** Rules that automatically move assets between tiers.
**Acceptance Criteria:**
- [ ] Rules based on: age, approval status, access frequency
- [ ] Example: "Move supporting files to cold storage 30 days after approval"
- [ ] Policies configurable at studio and project level
- [ ] Policy simulation: "If applied, N files (X GB) would move"

#### Requirement 1.3: Transparent Access
**Description:** Users interact with assets the same way regardless of tier.
**Acceptance Criteria:**
- [ ] Cold assets show a "Retrieving..." indicator with estimated time
- [ ] Retrieval happens automatically when a cold asset is accessed
- [ ] Retrieved assets are temporarily cached on hot storage
- [ ] No UI changes needed for asset access patterns

#### Requirement 1.4: Metadata Always Hot
**Description:** Database records and JSON metadata stay on fast local storage.
**Acceptance Criteria:**
- [ ] Only binary assets (videos, images) are eligible for tiering
- [ ] Database records, JSON metadata, and thumbnails always remain on local storage
- [ ] Search and browsing are never slowed by cold storage

#### Requirement 1.5: Migration Tools
**Description:** Bulk move assets between storage backends.
**Acceptance Criteria:**
- [ ] Select assets to migrate by project, date range, or entity type
- [ ] Integrity verification via checksum comparison after migration
- [ ] Progress tracking during migration
- [ ] Rollback if migration fails mid-way

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Multi-Backend Redundancy
**Description:** Store critical assets on multiple backends simultaneously.
**Acceptance Criteria:**
- [ ] Configure redundancy rules for approved final deliverables
- [ ] Automatic synchronization between backends

## 6. Non-Goals (Out of Scope)
- Disk reclamation logic (covered by PRD-15)
- Backup and disaster recovery (covered by PRD-81)
- Disk space visualization (covered by PRD-19)

## 7. Design Considerations
- Storage tier indicators should be subtle but present (icon showing local vs. cloud vs. NAS).
- The "Retrieving..." state should show estimated time and allow cancellation.
- Migration progress should be visible in the admin dashboard.

## 8. Technical Considerations
- **Stack:** Rust storage abstraction layer, AWS SDK for S3, platform-native for NFS/SMB
- **Existing Code to Reuse:** PRD-15 reclamation policies as foundation
- **New Infrastructure Needed:** Storage abstraction layer, tier policy engine, migration service
- **Database Changes:** `storage_backends` config table, add `storage_tier` and `storage_path` to asset records
- **API Changes:** GET /admin/storage/backends, POST /admin/storage/migrate, GET /admin/storage/policies

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Cold storage retrieval begins within 5 seconds of user access
- Migration integrity: 100% checksum match after moving assets
- Tiering policies correctly identify eligible assets within 1 hour of meeting criteria
- Zero impact on search/browse performance from cold-stored assets

## 11. Open Questions
- Should the retrieval cache have a size limit or time-based eviction?
- How should the system handle S3 API rate limiting during large migrations?
- Should cold storage retrieval be charged back to the project budget (PRD-93)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
