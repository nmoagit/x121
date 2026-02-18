# PRD-102: Video Compliance Checker

## 1. Introduction/Overview
PRD-39's delivery validation checks that files exist and are approved. This PRD goes deeper into technical correctness — a file can exist and be approved but have the wrong bitrate, be slightly corrupted, or fail to match the output format profile. These issues are invisible in the UI but cause problems downstream: rejected by platform ingestion, quality complaints from re-encoding artifacts, or duration mismatches. This PRD provides automated pre-delivery verification that all video files meet target specifications.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for naming convention), PRD-23 (Scene Types for duration targets), PRD-39 (Scene Assembler for output format profiles), PRD-59 (Multi-Resolution Pipeline for resolution specs)
- **Depended on by:** PRD-72 (Project Lifecycle as pre-delivery gate)
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Verify every video matches its target output format profile specifications.
- Detect truncated, corrupted, or incomplete video files.
- Validate naming convention compliance.
- Provide a pass/fail compliance report with actionable fix suggestions.

## 4. User Stories
- As a Creator, I want automated spec validation before export so that I catch technical issues before they reach the client.
- As an Admin, I want a compliance report showing pass/fail per file so that I can identify and fix problems before delivery.
- As a Creator, I want file integrity checks so that truncated or corrupted files are caught before they're packaged.
- As an Admin, I want an optional pre-export gate so that non-compliant deliverables cannot be exported.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Spec Validation per Profile
**Description:** Verify videos match output format profile specifications.
**Acceptance Criteria:**
- [ ] Verify: target resolution (exact or within tolerance), correct codec and container format, bitrate within acceptable range, correct pixel format/color depth
- [ ] Check each video against its assigned output format profile (PRD-39)
- [ ] Report deviations with specific values (e.g., "bitrate 12.1Mbps exceeds target 8Mbps")

#### Requirement 1.2: Duration Compliance
**Description:** Verify scene durations match targets.
**Acceptance Criteria:**
- [ ] Verify videos fall within the target duration range configured in scene type (PRD-23)
- [ ] Flag videos shorter than minimum (missing segments?) or longer than maximum (extra segments?)
- [ ] Tolerance configurable per scene type

#### Requirement 1.3: File Integrity
**Description:** Detect corrupted or incomplete files.
**Acceptance Criteria:**
- [ ] Verify every video is playable to its last frame
- [ ] Detect truncated files (common after interrupted generation)
- [ ] Detect corrupted headers
- [ ] Detect files claiming a duration longer than actual content

#### Requirement 1.4: Audio Compliance
**Description:** Audio track validation.
**Acceptance Criteria:**
- [ ] Verify audio track presence matches expectation
- [ ] If audio expected: check sample rate and channel count
- [ ] If audio should be absent: flag unexpected audio tracks

#### Requirement 1.5: Naming Convention
**Description:** Filename compliance check.
**Acceptance Criteria:**
- [ ] Verify all filenames follow PRD-01 naming convention
- [ ] Flag misnamed files with suggested corrections
- [ ] Check for missing prefix, incorrect scene type names, wrong index numbers

#### Requirement 1.6: Completeness Check
**Description:** Cross-reference delivery manifest against actual files.
**Acceptance Criteria:**
- [ ] Are all expected scenes present for each character?
- [ ] Are all required files present (metadata.json, clothed.png, topless.png)?
- [ ] Report missing files with expected paths

#### Requirement 1.7: Compliance Report
**Description:** Detailed pass/fail report.
**Acceptance Criteria:**
- [ ] Pass/fail per character and per file
- [ ] Summary: "42 of 44 files pass. 2 issues: [specific problems]"
- [ ] One-click action to fix where possible (re-transcode) or flag for re-generation
- [ ] Exportable as PDF/JSON

#### Requirement 1.8: Pre-Export Gate
**Description:** Optional export blocking on compliance failure.
**Acceptance Criteria:**
- [ ] Optionally block ZIP export (PRD-39) until all checks pass
- [ ] Configurable: strict (block on any failure) or lenient (warn but allow)
- [ ] Admin override with audit log entry

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Auto-Fix
**Description:** Automated remediation of fixable issues.
**Acceptance Criteria:**
- [ ] Auto-transcode videos that fail bitrate or codec checks
- [ ] Auto-rename files that fail naming convention checks
- [ ] Manual approval required before applying auto-fixes

## 6. Non-Goals (Out of Scope)
- Scene assembly and concatenation (covered by PRD-39)
- Quality assessment of video content (covered by PRD-49)
- VFX metadata export (covered by PRD-40)

## 7. Design Considerations
- Compliance report should be scannable: green/red indicators with expandable details.
- Pre-export gate should show the specific blocking issues prominently.
- Fix suggestions should be actionable (button to re-transcode, link to the affected scene).

## 8. Technical Considerations
- **Stack:** Rust/FFmpeg for video file analysis, React for compliance report UI
- **Existing Code to Reuse:** PRD-39 output format profiles, PRD-01 naming convention rules, PRD-23 scene type duration targets
- **New Infrastructure Needed:** Video file analyzer, compliance rule engine, report generator, auto-fix pipeline
- **Database Changes:** `compliance_checks` table (project_id, results_json, passed, checked_at), `compliance_rules` table (profile_id, rule_type, expected_value, tolerance)
- **API Changes:** POST /projects/:id/compliance-check, GET /projects/:id/compliance-report, POST /projects/:id/compliance-fix/:file_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Compliance check completes in <60 seconds for a full project (50+ files)
- File integrity check correctly detects 100% of truncated/corrupted files
- Zero downstream rejections for technical spec violations after compliance check passes

## 11. Open Questions
- Should compliance checks run automatically after every scene assembly, or only on demand?
- How should the system handle videos that pass compliance but have borderline metrics (e.g., bitrate at 99% of maximum)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
