# PRD-084: External Review / Shareable Preview Links

## 1. Introduction/Overview
Studios frequently need feedback from people outside the platform: clients, external directors, compliance reviewers, or business partners. Creating accounts for every external reviewer adds friction, RBAC complexity, and security surface area. This PRD provides time-limited, token-authenticated URLs for sharing specific scenes or characters with people who don't have platform accounts — with watermarking, expiry, feedback collection, and audit trails built in.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-38 (Collaborative Review for feedback integration), PRD-39 (Scene Assembler for watermark settings), PRD-83 (Video Playback Engine)
- **Depended on by:** None
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Generate shareable preview URLs with cryptographic token authentication.
- Control scope (segment, scene, character, project), expiry, and view limits.
- Apply automatic watermarking with traceability.
- Collect viewer feedback integrated with the review system.

## 4. User Stories
- As a Creator, I want to generate a shareable link for a scene so that I can get client feedback without creating platform accounts.
- As a Creator, I want expiry and view limits on shared links so that content access is time-bounded and controlled.
- As an Admin, I want watermarked external previews so that I can trace any leaked content back to its source.
- As a Creator, I want external viewers to submit approve/reject feedback so that their input flows into the review thread.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Link Generation
**Description:** Create shareable preview URLs.
**Acceptance Criteria:**
- [ ] Generate from any scene, character, or project view
- [ ] Cryptographic token grants read-only access to specified content only
- [ ] No platform login required for viewers

#### Requirement 1.2: Scope Control
**Description:** Define what the link grants access to.
**Acceptance Criteria:**
- [ ] Scopes: single segment, full scene (all segments), all scenes for a character, entire project
- [ ] Viewer sees only the scoped content — no navigation to other platform parts
- [ ] Scope clearly indicated in the link management view

#### Requirement 1.3: Expiry & Limits
**Description:** Time and access controls.
**Acceptance Criteria:**
- [ ] Configurable expiry: 24 hours, 7 days, custom duration
- [ ] Optional view-count limit (e.g., "valid for 10 views")
- [ ] Optional password protection for additional access barrier
- [ ] Expired/exhausted links show a clear "access expired" message

#### Requirement 1.4: Watermarked Playback
**Description:** Traceable external previews.
**Acceptance Criteria:**
- [ ] External previews automatically watermarked (PRD-39 settings or dedicated "external review" watermark)
- [ ] Viewer's IP or link token embedded in the watermark for traceability
- [ ] Watermark does not obscure critical review areas

#### Requirement 1.5: Viewer Feedback
**Description:** External feedback collection.
**Acceptance Criteria:**
- [ ] Optional feedback form: approve/reject buttons and text comment field
- [ ] Feedback captured and attached to the scene's review thread (PRD-38)
- [ ] Attribution to the link token (not a platform user)

#### Requirement 1.6: Activity Tracking
**Description:** Link access monitoring.
**Acceptance Criteria:**
- [ ] Track: when accessed, from which IP, how many times, whether feedback was submitted
- [ ] Visible to link creator in a "Shared Links" management panel

#### Requirement 1.7: Link Management
**Description:** Dashboard of all shared links.
**Acceptance Criteria:**
- [ ] All active shared links: who created them, what they link to, expiry status, view count, feedback received
- [ ] Revoke any link instantly
- [ ] Bulk revoke for emergency response

#### Requirement 1.8: Branding
**Description:** Clean external review page.
**Acceptance Criteria:**
- [ ] Minimal, clean layout with optional studio logo and name
- [ ] No platform chrome, no navigation — just content and feedback controls
- [ ] Mobile-responsive for viewing on any device

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Commenting with Timestamps
**Description:** External viewers can leave timestamped comments.
**Acceptance Criteria:**
- [ ] Viewers can attach comments to specific timecodes in the video
- [ ] Timestamped comments flow into the PRD-38 review thread

## 6. Non-Goals (Out of Scope)
- Director's View for platform users (covered by PRD-55)
- Delivery packaging for final output (covered by PRD-39)
- Review workflow for platform users (covered by PRD-35)

## 7. Design Considerations
- External review page should load fast and look professional — it represents the studio's brand.
- Feedback form should be simple and quick (not a full review interface).
- Watermark placement should balance traceability with viewing experience.

## 8. Technical Considerations
- **Stack:** React for external review page (separate lightweight bundle), Rust for token generation and validation
- **Existing Code to Reuse:** PRD-39 watermarking, PRD-83 video player (embedded), PRD-38 review notes storage
- **New Infrastructure Needed:** Token generator, external review page, feedback collector, link management dashboard, access tracker
- **Database Changes:** `shared_links` table (id, token_hash, scope_type, scope_id, created_by, expires_at, max_views, password_hash, settings_json), `link_access_log` table (link_id, accessed_at, ip_address, feedback_text, decision)
- **API Changes:** POST /shared-links, GET /shared-links (management), DELETE /shared-links/:id, GET /review/:token (public), POST /review/:token/feedback (public)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Shared link loads external review page in <3 seconds
- Token authentication prevents 100% of unauthorized access attempts
- Expired/revoked links return clear error messages without leaking content
- Viewer feedback successfully flows into the review thread

## 11. Open Questions
- Should shared links support multi-language external review pages?
- How should the system handle link tokens if the underlying content is regenerated?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
