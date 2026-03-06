# PRD-039: Scene Assembler & Delivery Packaging

## 1. Introduction/Overview
This is the bridge between "all scenes approved" and "deliverable output." The automated naming eliminates the manual rename step that currently requires scripts (rename_videos.py). This PRD provides concatenation of approved segments into final scene videos, automatic naming per convention, watermarked review cuts, output format profiles for multiple delivery targets, per-character packaging, project ZIP export, delivery validation, and incremental re-export.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for naming convention), PRD-24 (Recursive Video Generation for segment structure), PRD-35 (Review Interface for approval status)
- **Depended on by:** PRD-57 (Batch Orchestrator), PRD-72 (Project Lifecycle for delivery state), PRD-78 (Segment Trimming respects trim points), PRD-82 (Content Sensitivity for watermark distinction), PRD-84 (External Review Links for watermarked previews), PRD-102 (Video Compliance Checker)
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Concatenate approved segments into final scene videos with lossless processing where possible.
- Apply automatic naming per the PRD-01 convention (no manual renaming).
- Support configurable watermarking for review cuts vs. clean final delivery.
- Enable output format profiles for multiple delivery targets.
- Package per-character folders and project-wide ZIP exports.

## 4. User Stories
- As a Creator, I want automatic naming based on scene metadata so that I never have to rename files manually.
- As a Creator, I want review cuts with watermarks so that I can share work-in-progress safely before final delivery.
- As a Creator, I want output format profiles so that I can generate deliverables for multiple platforms (1080p H.264, 720p H.265, etc.) from a single source.
- As an Admin, I want delivery validation that checks for missing scenes before export so that incomplete packages are never shipped.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Segment Concatenation
**Description:** Combine approved segments into final scene videos.
**Acceptance Criteria:**
- [ ] Combine all approved segments for a scene into a single continuous video
- [ ] Lossless concatenation where codec/resolution match
- [ ] Re-encode only when necessary (codec/resolution mismatch)
- [ ] Segment ordering follows the generation sequence

#### Requirement 1.2: Automatic Naming
**Description:** Apply naming convention from scene metadata.
**Acceptance Criteria:**
- [ ] Derive `prefix_` from image variant (`topless_` or none)
- [ ] Derive `content` from scene type name
- [ ] Append `_clothes_off` for transition scenes
- [ ] Append `_index` when multiple scenes of the same type exist
- [ ] No manual renaming required

#### Requirement 1.3: Review Concatenation
**Description:** Watermarked review cuts for approval.
**Acceptance Criteria:**
- [ ] Generate a "review cut" for approval before final delivery
- [ ] Review cuts are watermarked to prevent premature distribution
- [ ] Final delivery versions are clean (no watermark)

#### Requirement 1.4: Watermarking
**Description:** Configurable watermark for review cuts.
**Acceptance Criteria:**
- [ ] Configurable: text or image overlay
- [ ] Position: center or corner
- [ ] Opacity: adjustable
- [ ] Optional timecode burn-in

#### Requirement 1.5: Output Format Profiles
**Description:** Reusable delivery specifications.
**Acceptance Criteria:**
- [ ] Define profiles specifying: resolution, codec, bitrate, container format
- [ ] Examples: "Platform A: 1080p H.264 8Mbps MP4", "Archive: 4K ProRes MOV"
- [ ] Scenes assembled once, then transcoded to each profile automatically
- [ ] CRUD for profiles

#### Requirement 1.6: Per-Character Packaging
**Description:** Character-level delivery folders.
**Acceptance Criteria:**
- [ ] Assemble all approved scene videos for a character
- [ ] Include `metadata.json`, `clothed.png`, and `topless.png` alongside videos
- [ ] Folder structure matches PRD-01 delivery specification

#### Requirement 1.7: Project ZIP Export
**Description:** Complete project packaging.
**Acceptance Criteria:**
- [ ] Package all character folders into a single ZIP
- [ ] One-click export for the entire project or selected characters
- [ ] Supports exporting per output format profile
- [ ] ZIP structure matches the downstream delivery contract

#### Requirement 1.8: Delivery Validation
**Description:** Pre-export completeness check.
**Acceptance Criteria:**
- [ ] Verify all expected scenes are present and approved
- [ ] Verify all required files exist (metadata, images, videos)
- [ ] Verify naming follows convention
- [ ] Warn on missing scenes before allowing export

#### Requirement 1.9: Incremental Re-export
**Description:** Partial re-export for updated scenes.
**Acceptance Criteria:**
- [ ] When a single scene is re-done and re-approved, re-export only that character's folder
- [ ] No need to rebuild the entire ZIP
- [ ] Updated character folder replaces the previous version in the archive

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Delivery History
**Description:** Track all exports for audit purposes.
**Acceptance Criteria:**
- [ ] Record: export date, format profile, included characters, exported by whom
- [ ] Diff between exports: what changed since the last delivery

## 6. Non-Goals (Out of Scope)
- Video compliance checking (covered by PRD-102)
- VFX sidecar export (covered by PRD-40)
- Production reporting (covered by PRD-73)

## 7. Design Considerations
- Export progress should show per-character and per-profile status.
- Delivery validation warnings should be clear and actionable (link to the missing scene for review).
- ZIP export should stream to avoid large memory allocation.

## 8. Technical Considerations
- **Stack:** Rust for concatenation/transcoding orchestration, FFmpeg for video processing, ZIP streaming library
- **Existing Code to Reuse:** PRD-01 naming convention rules, PRD-24 segment metadata, PRD-35 approval status
- **New Infrastructure Needed:** Concatenation engine, transcoding pipeline, packaging engine, validation checker, ZIP streamer
- **Database Changes:** `delivery_exports` table (project_id, format_profile_id, characters_json, status, exported_by, exported_at), `output_format_profiles` table (id, name, resolution, codec, bitrate, container)
- **API Changes:** POST /projects/:id/assemble, POST /projects/:id/export-zip, GET /projects/:id/delivery-validation, CRUD /output-format-profiles

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Concatenation completes in <10 seconds per scene (for typical segment counts)
- Naming convention applied correctly to 100% of exported files
- Delivery validation catches 100% of missing or unapproved scenes
- ZIP export streams without exceeding 2x the output size in memory

## 11. Open Questions
- Should re-export automatically include dependent changes (e.g., updated metadata.json)?
- What happens to existing delivery ZIP downloads when a new export is generated?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
- **v1.1** (2026-03-06): Amendment — Requirements gap fill (Reqs A.1-A.4).

---

## Amendment (2026-03-06): Requirements Gap Fill

The following requirements were identified during a stakeholder requirements review and address gaps in the original PRD. They do not modify any existing requirements.

### Requirement A.1: Google Drive Destination

**Description:** Support Google Drive as a delivery destination alongside S3. Destinations should be configurable at the Project Level, allowing different projects to sync to different client folders.

**Acceptance Criteria:**
- [ ] New `delivery_destinations` table (or extension of project settings) storing destination type and configuration per project
- [ ] Supported destination types: `local` (default/existing), `s3`, `google_drive`
- [ ] Google Drive configuration fields: OAuth credentials reference, target folder ID, shared drive ID (optional)
- [ ] S3 configuration fields: bucket name, prefix path, region, credentials reference
- [ ] Each project can have one or more configured delivery destinations
- [ ] The delivery packaging pipeline (Req 1.7) supports uploading the delivery package to the configured destination(s) after local assembly
- [ ] Upload progress is tracked and displayed in the Delivery tab
- [ ] Configuration UI on the Project Configuration tab (PRD-112 Req 1.8) allows adding/editing/removing delivery destinations
- [ ] Credentials are stored securely (encrypted at rest) and never exposed in API responses

**Technical Notes:**
- MVP: Implement local + Google Drive. S3 can follow as a post-MVP enhancement.
- Use the Google Drive API v3 with service account or OAuth2 refresh tokens
- Consider a `delivery_destination_types` lookup table for extensibility
- Database schema: `delivery_destinations` with `id BIGSERIAL`, `project_id BIGINT`, `destination_type TEXT`, `config JSONB`, `created_at`, `updated_at`

### Requirement A.2: Automated Delivery Triggers

**Description:** Add an option to "Auto-Deliver on Final Approval." Once the QA checklist is completed and the character is marked "Final," the system automatically initiates the transfer to the configured destination.

**Acceptance Criteria:**
- [ ] Project-level setting: `auto_deliver_on_final BOOLEAN DEFAULT false` (stored in project settings or `delivery_destinations` config)
- [ ] When enabled and a character's status changes to "Final/Approved":
  1. The system checks if all enabled scenes for that character have approved final versions
  2. If complete, the system automatically triggers delivery packaging for that character
  3. The packaged output is uploaded to the project's configured delivery destination(s)
- [ ] Auto-delivery is per-character (not waiting for the entire project to be complete)
- [ ] Auto-delivery creates a `delivery_exports` record with a source indicator of "auto" (vs. "manual")
- [ ] A notification or activity log entry is created when auto-delivery triggers (e.g., "Auto-delivered Character X to Google Drive")
- [ ] Auto-delivery failures are logged and surfaced in the Delivery tab error log (Req A.3)
- [ ] The setting can be toggled on/off from the Project Configuration tab or Delivery tab

**Technical Notes:**
- Implement as an event handler that listens for character status changes
- Should be async/background — the status change API response should not wait for delivery to complete
- Reuses the existing assembly and packaging pipeline from Reqs 1.1-1.7

### Requirement A.3: Delivery Error Logs

**Description:** Provide a clear, dedicated error log for delivery operations (e.g., "Google Drive: Permission Denied", "S3: Bucket Not Found"). Errors should be viewable from the Project Hub delivery tab.

**Acceptance Criteria:**
- [ ] New `delivery_logs` table recording all delivery operation events (successes and failures)
  - Columns: `id BIGSERIAL`, `delivery_export_id BIGINT` (FK), `project_id BIGINT` (FK), `log_level TEXT` (info, warning, error), `message TEXT`, `details JSONB`, `created_at TIMESTAMPTZ`
- [ ] Every delivery operation (upload, validation, packaging) logs its outcome to this table
- [ ] Error entries include actionable details: destination type, error code, error message from the remote service, affected file/character
- [ ] The Delivery tab (PRD-112 Req 1.7) includes a "Delivery Log" section or sub-tab showing recent log entries
- [ ] Log entries are filterable by level (all, errors only, warnings only) and by date range
- [ ] Error entries are visually distinct (red/error styling) from informational entries
- [ ] API endpoint: `GET /api/v1/projects/{id}/delivery-logs?level={level}&limit={limit}`
- [ ] Log entries older than a configurable retention period (default 90 days) are automatically purged

**Technical Notes:**
- This is separate from the general application log — it is a user-facing, structured delivery audit trail
- The `details` JSONB field can store the full error response from external services for debugging

### Requirement A.4: Delivery Status Tracking

**Description:** Add a "Delivered" column/badge to the Project Overview to track which characters have successfully reached the final destination.

**Acceptance Criteria:**
- [ ] The Project Overview tab (PRD-112 Req 1.3) progress summary includes a "Delivered" count: "X of Y characters delivered"
- [ ] The Characters tab (PRD-112 Req 1.4) character cards show a "Delivered" badge when the character has been successfully delivered to at least one configured destination
- [ ] The Production tab matrix (PRD-112 Req 1.6) includes delivery status per character as an additional summary column
- [ ] Delivery status per character is derived from `delivery_exports` records — a character is "delivered" if a successful export containing that character exists
- [ ] The "Delivered" badge is distinct from "Approved" — a character can be approved but not yet delivered
- [ ] If a character is re-generated or re-approved after delivery, the "Delivered" badge changes to "Needs Re-delivery" to indicate the delivered version is stale
- [ ] API endpoint: `GET /api/v1/projects/{id}/delivery-status` returns per-character delivery state

**Technical Notes:**
- Delivery status is computed from `delivery_exports` joined with `delivery_logs` (for success confirmation)
- "Needs Re-delivery" is determined by comparing the character's `updated_at` (or latest version `created_at`) against the last successful delivery timestamp
- This is a read-only/computed status, not a stored field on the character
