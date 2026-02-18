# PRD-044: Bug Reporting & App Config Export

## 1. Introduction/Overview
Debugging UI issues in a complex multi-panel application requires reproducible context, and backing up a studio's entire logic requires portable configuration export. This PRD provides one-click session recording for bug reports (capturing browser state, console logs, and user actions) and a portable app-config export that packages the studio's entire configuration for backup or migration.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for action logging)
- **Depended on by:** PRD-81 (Backup & Disaster Recovery uses config export)
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Enable one-click bug report capture with full session context.
- Export the studio's complete application configuration as a portable archive.
- Import configuration archives for backup restoration or migration.
- Streamline bug reproduction for development teams.

## 4. User Stories
- As a Creator, I want one-click bug reporting so that I can capture exactly what went wrong without manually describing steps.
- As an Admin, I want to export the studio's entire configuration so that I can back up our setup or migrate to a new instance.
- As an Admin, I want to import a configuration archive so that I can restore settings after a disaster or set up a new studio quickly.
- As a Creator, I want session recording attached to bug reports so that developers can see exactly what I was doing.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: One-Click Bug Report
**Description:** Capture browser state and context for bug reports.
**Acceptance Criteria:**
- [ ] Single button/shortcut to capture: current URL, visible panels, browser info, console errors
- [ ] Include last N user actions (from PRD-10 event log)
- [ ] Screenshot of current view (optional, user-confirmed)
- [ ] User can add a text description before submitting

#### Requirement 1.2: Session Recording
**Description:** Replay-ready session capture.
**Acceptance Criteria:**
- [ ] Record DOM events and network requests for a configurable window (last 5 minutes)
- [ ] Recording starts when "Report Bug" is activated — captures trailing buffer
- [ ] Exported as a replayable format for developers
- [ ] PII-aware: strip or mask sensitive data from recordings

#### Requirement 1.3: App Config Export
**Description:** Complete configuration backup.
**Acceptance Criteria:**
- [ ] Export includes: workflow JSONs, scene type definitions, QA profiles, templates, notification settings, RBAC configuration, theme settings
- [ ] Exported as a versioned, portable archive (JSON + related files in a ZIP)
- [ ] Export metadata: platform version, export date, exporter identity

#### Requirement 1.4: Config Import
**Description:** Restore or migrate configuration.
**Acceptance Criteria:**
- [ ] Import a configuration archive to restore or set up a new instance
- [ ] Validation before import: compatibility check against current platform version
- [ ] Selective import: choose which parts to import (workflows only, scene types only, everything)
- [ ] Preview of what will change before applying

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Config Diff
**Description:** Compare two configuration exports.
**Acceptance Criteria:**
- [ ] Side-by-side diff of two config archives
- [ ] Highlight added, removed, and modified settings

## 6. Non-Goals (Out of Scope)
- Database backup and point-in-time recovery (covered by PRD-81)
- Audit logging (covered by PRD-45)
- System health monitoring (covered by PRD-80)

## 7. Design Considerations
- Bug report button should be easily accessible but not obtrusive (e.g., in the help menu or floating action button).
- Session recording indicator should be visible so users know when recording is active.
- Config export/import should be accessible only to Admins.

## 8. Technical Considerations
- **Stack:** Browser APIs for DOM recording (e.g., rrweb), React for bug report UI, ZIP packaging for config export
- **Existing Code to Reuse:** PRD-10 event log for action history
- **New Infrastructure Needed:** Session recorder, bug report packager, config serializer/deserializer, config import validator
- **Database Changes:** `bug_reports` table (id, user_id, description, context_json, recording_path, created_at)
- **API Changes:** POST /bug-reports, GET /bug-reports/:id, POST /admin/config/export, POST /admin/config/import, POST /admin/config/validate

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Bug report capture completes in <5 seconds from button press
- Config export includes 100% of configurable settings
- Config import correctly restores all settings with zero data loss
- Session recordings are replayable by developers for bug reproduction

## 11. Open Questions
- What is the maximum session recording buffer size before it impacts performance?
- Should bug reports be stored locally or sent to an external issue tracker (e.g., Jira)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
