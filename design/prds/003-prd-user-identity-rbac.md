# PRD-003: User Identity & RBAC

## 1. Introduction/Overview
This PRD defines the authentication and role-based access control (RBAC) system that governs who can do what in the platform. It implements JWT-based authentication with three roles — Admin, Creator, and Reviewer — each with distinct permissions. The key design decision is that Creators have "Final Approval" rights, allowing them to maintain production speed while Reviewers focus on QA without being a bottleneck.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for user-entity relationships), PRD-02 (Backend Foundation for auth middleware)
- **Depended on by:** PRD-04, PRD-11, PRD-12, PRD-35, PRD-45, PRD-53, PRD-55, PRD-60
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Implement secure JWT-based authentication with token refresh and revocation.
- Define three distinct roles (Admin, Creator, Reviewer) with clear permission boundaries.
- Enforce RBAC at the API layer so that unauthorized actions are rejected before reaching business logic.
- Support the "Creator has final approval" workflow that prevents review bottlenecks.

## 4. User Stories
- As an Admin, I want to create user accounts and assign roles so that each team member has appropriate access.
- As a Creator, I want to approve my own scenes without waiting for a Reviewer so that production is not bottlenecked by the review queue.
- As a Reviewer, I want to flag issues and suggest rejections so that quality is maintained without needing final approval authority.
- As an Admin, I want to see failed login attempts so that I can detect potential security issues.
- As a Creator, I want my session to persist across browser refreshes so that I don't need to re-authenticate frequently.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: JWT Authentication
**Description:** Token-based authentication using JWT with access and refresh token pairs.
**Acceptance Criteria:**
- [ ] Login endpoint accepts credentials and returns JWT access token + refresh token
- [ ] Access tokens have a configurable short expiry (e.g., 15 minutes)
- [ ] Refresh tokens have a longer expiry (e.g., 7 days) and support rotation
- [ ] Token validation middleware rejects expired or malformed tokens with 401 status

#### Requirement 1.2: Role Definitions
**Description:** Three roles with distinct permission sets.
**Acceptance Criteria:**
- [ ] **Admin:** Full access — user management, system configuration, all Creator and Reviewer permissions
- [ ] **Creator:** Project and character management, generation submission, final approval/rejection, metadata editing
- [ ] **Reviewer:** View all content, flag issues, add review notes, suggest rejections (but not finalize)
- [ ] Roles are stored in a lookup table (per PRD-00)

#### Requirement 1.3: RBAC Middleware
**Description:** API-level access control that checks user role before allowing endpoint access.
**Acceptance Criteria:**
- [ ] Each API endpoint declares its required role(s)
- [ ] Unauthorized access returns 403 Forbidden with a clear message
- [ ] Role checks happen in middleware before the route handler executes
- [ ] Role changes take effect on the next request (no cached permissions)

#### Requirement 1.4: User Management (Admin)
**Description:** Admin interface for creating, editing, and deactivating user accounts.
**Acceptance Criteria:**
- [ ] Admins can create new users with a username, email, and assigned role
- [ ] Admins can change a user's role
- [ ] Admins can deactivate (soft-delete) user accounts without losing audit history
- [ ] Password reset flow is available for Admins to trigger

#### Requirement 1.5: Password Security
**Description:** Secure password storage and policy enforcement.
**Acceptance Criteria:**
- [ ] Passwords are hashed with Argon2id before storage
- [ ] Minimum password length enforced (configurable, default 12 characters)
- [ ] Password is never returned in any API response
- [ ] Failed login attempts are rate-limited (configurable threshold)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: OAuth/SSO Integration
**Description:** Support external identity providers for enterprise environments.
**Acceptance Criteria:**
- [ ] Support OIDC-based SSO with configurable identity providers
- [ ] External users are mapped to platform roles during provisioning

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Fine-Grained Permissions
**Description:** Per-project or per-entity permission overrides beyond role-level access.
**Acceptance Criteria:**
- [ ] A Creator can be restricted to specific projects
- [ ] Permission overrides are stored alongside role assignments

## 6. Non-Goals (Out of Scope)
- Session persistence and workspace state (covered by PRD-04)
- Audit logging of user actions (covered by PRD-45)
- API key authentication for service accounts (covered by PRD-12)
- Session management and active user monitoring (covered by PRD-98)

## 7. Design Considerations
- Login page should be clean and minimal with the platform branding.
- Role indicator should be visible in the UI header so users know their current permissions.
- Unauthorized action attempts should show a helpful message explaining why access was denied.

## 8. Technical Considerations
- **Stack:** Rust/Axum middleware, JWT (jsonwebtoken crate), Argon2id (argon2 crate), PostgreSQL
- **Existing Code to Reuse:** PRD-00 lookup tables for roles, PRD-02 middleware infrastructure
- **New Infrastructure Needed:** Users table, roles table, auth middleware, token generation/validation
- **Database Changes:** `users` table, `roles` lookup table, `user_sessions` table for refresh token tracking
- **API Changes:** POST /auth/login, POST /auth/refresh, POST /auth/logout, CRUD /admin/users

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Authentication flow completes in <200ms (login, token generation, response)
- Zero plaintext passwords stored or logged anywhere in the system
- 100% of protected endpoints enforce role-based access
- Failed login rate limiting activates correctly under brute-force simulation

## 11. Open Questions
- Should we support multi-role users (e.g., someone who is both Creator and Reviewer)?
- What is the token refresh strategy — silent refresh or explicit user action?
- Should deactivated users' existing sessions be immediately invalidated?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
