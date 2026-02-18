# PRD-045: Audit Logging & Compliance

## 1. Introduction/Overview
Multi-user studio environments need operational accountability: who did what and when. This PRD provides a comprehensive, immutable operational audit trail for all user and system actions — distinct from PRD-13 metadata timeline (which tracks field-level content changes) — covering login/logout, job submissions, approvals, configuration changes, service restarts, and failed authentication attempts with queryable structured logs and configurable retention.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for entity references), PRD-03 (RBAC for user identity)
- **Depended on by:** PRD-72 (Project Lifecycle transition tracking), PRD-97 (Trigger audit trail), PRD-98 (Session Management), PRD-106 (API Observability)
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Log all user actions (login, job submissions, approvals, configuration changes).
- Log all system actions (service restarts, reclamation runs, auto-healing events).
- Provide queryable, structured log storage with filtering by user, action, entity, and time.
- Support configurable retention policies with automatic archival.

## 4. User Stories
- As an Admin, I want a complete audit trail so that I can answer "Who deleted that scene?" during dispute resolution.
- As an Admin, I want structured, queryable logs so that I can filter by user, action type, and time range for security auditing.
- As an Admin, I want immutable logs so that audit records cannot be tampered with after the fact.
- As an Admin, I want configurable retention policies so that log storage is manageable over time.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: User Action Logging
**Description:** Log all user-initiated actions.
**Acceptance Criteria:**
- [ ] Login/logout events with IP address and device info
- [ ] Job submissions (what was submitted, parameters, target worker)
- [ ] Approvals/rejections (segment, decision, reason)
- [ ] Metadata edits (entity, field, old value, new value)
- [ ] Configuration changes (setting, old value, new value)

#### Requirement 1.2: System Action Logging
**Description:** Log all system-initiated events.
**Acceptance Criteria:**
- [ ] Service restarts and crashes
- [ ] Disk reclamation runs (PRD-15) — what was reclaimed
- [ ] Auto-healing events (PRD-71 auto-retry actions)
- [ ] Failed authentication attempts
- [ ] Scheduled task executions

#### Requirement 1.3: Queryable Log Store
**Description:** Structured, searchable log storage.
**Acceptance Criteria:**
- [ ] Structured logs (not just text files) with defined schema
- [ ] Filter by: user, action type, entity type, entity ID, time range
- [ ] Full-text search within log messages
- [ ] Pagination for large result sets

#### Requirement 1.4: Immutability
**Description:** Tamper-resistant log records.
**Acceptance Criteria:**
- [ ] Audit records are append-only — no update or delete operations
- [ ] Log integrity verification (detect if logs have been tampered with)
- [ ] Admin cannot delete or modify audit entries

#### Requirement 1.5: Retention Policies
**Description:** Configurable log lifecycle management.
**Acceptance Criteria:**
- [ ] Configurable retention period (e.g., 90 days active, 1 year archived)
- [ ] Automatic archival of older entries to cold storage
- [ ] Archived logs remain queryable (with slower response time)
- [ ] Retention policy configurable per log category

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Compliance Reports
**Description:** Pre-built compliance report templates.
**Acceptance Criteria:**
- [ ] Access audit report: who accessed what entities in a given period
- [ ] Change audit report: all configuration changes in a given period
- [ ] Exportable as PDF for compliance documentation

## 6. Non-Goals (Out of Scope)
- Field-level metadata change tracking (covered by PRD-13)
- Session management and active user monitoring (covered by PRD-98)
- Performance metrics and benchmarking (covered by PRD-41)

## 7. Design Considerations
- Audit log viewer should be accessible only to Admins.
- Log entries should be human-readable with enough context to understand the action without additional lookup.
- Time display should support timezone conversion for distributed teams.

## 8. Technical Considerations
- **Stack:** Rust for log ingestion, PostgreSQL with append-only constraints (or dedicated log store), React for log viewer
- **Existing Code to Reuse:** PRD-01 entity model for references, PRD-03 RBAC for user identity
- **New Infrastructure Needed:** Audit log ingestion service, structured log store, query engine, retention manager, integrity checker
- **Database Changes:** `audit_logs` table (id, timestamp, user_id, action_type, entity_type, entity_id, details_json, ip_address, session_id) — append-only, no UPDATE/DELETE grants
- **API Changes:** GET /admin/audit-logs?user=X&action=Y&from=Z&to=W, GET /admin/audit-logs/export, GET /admin/audit-logs/integrity-check

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- All auditable actions are logged with <100ms overhead
- Log queries return results in <2 seconds for 30-day ranges
- Log integrity verification detects 100% of tampering attempts
- Retention policies correctly archive and purge logs on schedule

## 11. Open Questions
- Should the audit log support real-time streaming (e.g., to a SIEM system)?
- What is the expected log volume and what storage provisioning is needed?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
