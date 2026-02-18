# PRD-081: Backup & Disaster Recovery

## 1. Introduction/Overview
A platform managing hundreds of characters with thousands of approved video segments cannot afford data loss. Database-only backup is insufficient — configuration (workflows, templates, hooks) represents significant studio investment that's equally critical. This PRD provides automated backup scheduling, verification, point-in-time recovery, configuration backup, asset integrity checks, backup verification through automated test restores, recovery runbooks, and retention management.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database schema), PRD-44 (App Config Export for configuration backup), PRD-74 (Project Templates as critical configuration), PRD-77 (Pipeline Hooks as critical configuration), PRD-80 (System Health for backup status monitoring)
- **Depended on by:** None
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Automate database backups with configurable scheduling.
- Support point-in-time recovery using PostgreSQL WAL archiving.
- Backup all platform configuration alongside database data.
- Verify backups through automated test restores.
- Provide recovery runbooks accessible even during platform outage.

## 4. User Stories
- As an Admin, I want automated database backups on a schedule so that data loss risk is minimized.
- As an Admin, I want point-in-time recovery so that I can restore to the exact moment before a data corruption incident.
- As an Admin, I want configuration backups so that workflows, templates, and hooks are protected alongside the database.
- As an Admin, I want automated backup verification so that I know my backups are actually restorable before I need them.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database Backup Scheduling
**Description:** Automated pg_dump-based backups.
**Acceptance Criteria:**
- [ ] Configurable schedule (e.g., every 6 hours)
- [ ] Full and incremental backup support
- [ ] Backups written to configurable destination (local path, network mount, or S3-compatible storage)
- [ ] Backup completion notification via PRD-10

#### Requirement 1.2: Point-in-Time Recovery (PITR)
**Description:** Continuous backup via WAL archiving.
**Acceptance Criteria:**
- [ ] PostgreSQL WAL archiving for continuous backup
- [ ] Restore to any point within the retention window
- [ ] UI shows a timeline of available restore points with annotations (what was happening at that time)
- [ ] Restore preview: show what will change before executing

#### Requirement 1.3: Configuration Backup
**Description:** Platform configuration export as part of backup.
**Acceptance Criteria:**
- [ ] Automated export of: workflow JSONs, scene type definitions, hook scripts (PRD-77), project templates (PRD-74), notification preferences, RBAC settings
- [ ] Stored as a versioned portable archive (extends PRD-44 App Config Export)
- [ ] Configuration backup runs alongside database backup

#### Requirement 1.4: Asset Backup Verification
**Description:** Integrity check for critical assets.
**Acceptance Criteria:**
- [ ] Periodic integrity check of critical assets (source images, approved final videos)
- [ ] Compare checksums against database records
- [ ] Flag missing or corrupted files before they're needed

#### Requirement 1.5: Backup Verification
**Description:** Automated test restores.
**Acceptance Criteria:**
- [ ] Automated test restore on schedule (e.g., weekly)
- [ ] Restore latest backup to a temporary database
- [ ] Run validation queries to verify data integrity
- [ ] Report success/failure to Admins

#### Requirement 1.6: Recovery Runbook
**Description:** Step-by-step recovery guide.
**Acceptance Criteria:**
- [ ] In-platform recovery guide: which backup to use, how to restore, how to verify
- [ ] Static HTML export accessible even when the main platform is down
- [ ] Covers database, configuration, and asset recovery procedures

#### Requirement 1.7: Retention Management
**Description:** Configurable backup lifecycle.
**Acceptance Criteria:**
- [ ] Configurable retention: e.g., hourly for 24h, daily for 30d, weekly for 6 months
- [ ] Automatic cleanup of expired backups
- [ ] Disk space tracking for backup storage
- [ ] Alert when backup storage approaches capacity

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Cross-Region Backup
**Description:** Geo-redundant backup storage.
**Acceptance Criteria:**
- [ ] Replicate backups to a secondary geographic location
- [ ] Independent retention policies per region

## 6. Non-Goals (Out of Scope)
- App config export UI (covered by PRD-44)
- System health monitoring (covered by PRD-80)
- Disk reclamation (covered by PRD-15)

## 7. Design Considerations
- Backup status should be prominently displayed in the System Health page (PRD-80).
- Recovery runbook should use clear, numbered steps with copy-pasteable commands.
- PITR timeline should be interactive with zoom and annotation capabilities.

## 8. Technical Considerations
- **Stack:** pg_dump/pg_basebackup for PostgreSQL, WAL-G or pgBackRest for PITR, Rust for orchestration, S3 SDK for remote storage
- **Existing Code to Reuse:** PRD-44 config export, PRD-80 health monitoring for status display
- **New Infrastructure Needed:** Backup scheduler, PITR manager, test restore runner, retention enforcer, recovery runbook generator
- **Database Changes:** `backups` table (id, type, destination, size_bytes, started_at, completed_at, verified, verified_at), `backup_schedules` table (id, type, schedule, destination, retention_policy_json)
- **API Changes:** GET /admin/backups, POST /admin/backups/trigger, POST /admin/backups/:id/verify, POST /admin/backups/:id/restore, GET /admin/backups/recovery-runbook, CRUD /admin/backup-schedules

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Backups complete within configured windows without impacting platform performance
- Backup verification (test restore) succeeds >99% of the time
- PITR correctly restores to within 1 minute of the requested point
- Recovery runbook enables a qualified Admin to restore a full platform in <2 hours

## 11. Open Questions
- Should the backup system support encrypting backups at rest?
- What is the acceptable performance impact of WAL archiving on the production database?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
