# Task List: External Review / Shareable Preview Links

**PRD Reference:** `design/prds/084-prd-external-review-shareable-preview-links.md`
**Scope:** Build a shareable preview link system that generates time-limited, token-authenticated URLs for external reviewers to view watermarked content and submit feedback without platform accounts.

## Overview

Studios frequently need feedback from external parties (clients, directors, compliance reviewers) who should not need platform accounts. This feature generates cryptographic token URLs scoped to specific content (segment, scene, character, or project) with configurable expiry, view limits, and optional password protection. External viewers see a clean, branded review page with watermarked video playback and can submit approve/reject feedback that flows into the internal review thread. A management dashboard lets creators track link activity and revoke access instantly.

### What Already Exists
- PRD-38 Collaborative Review for feedback integration
- PRD-39 Scene Assembler for watermark settings
- PRD-83 Video Playback Engine for player component

### What We're Building
1. Database tables for shared links and access logs
2. Cryptographic token generation and validation service
3. External review page (lightweight React bundle, no platform chrome)
4. Feedback collection endpoint linked to review threads
5. Link management dashboard for creators
6. Activity tracking with IP and view count logging
7. API endpoints for link creation, validation, and revocation

### Key Design Decisions
1. **Token is a random string, hash stored in DB** -- The URL contains the plain token; the database stores only the hash. Token compromise is detectable.
2. **External page is a separate lightweight bundle** -- No navigation, no platform state, minimal JS. Loads fast and looks professional.
3. **Feedback attributed to token, not user** -- External reviewers have no user record. Feedback is attributed to the link token and optionally a viewer name.
4. **Watermark includes token identifier** -- The watermark embeds enough information to trace a leak back to the specific link.

---

## Phase 1: Database Schema

### Task 1.1: Shared Links Table
**File:** `migrations/YYYYMMDDHHMMSS_create_shared_links.sql`

```sql
CREATE TABLE shared_links (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hash of the URL token
    scope_type TEXT NOT NULL CHECK (scope_type IN ('segment', 'scene', 'character', 'project')),
    scope_id BIGINT NOT NULL,          -- FK to the scoped entity
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_views INTEGER,                 -- NULL = unlimited
    current_views INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,                -- NULL = no password
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    settings_json JSONB,              -- watermark overrides, branding, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_links_token_hash ON shared_links(token_hash);
CREATE INDEX idx_shared_links_created_by ON shared_links(created_by);
CREATE INDEX idx_shared_links_scope ON shared_links(scope_type, scope_id);
CREATE INDEX idx_shared_links_expires_at ON shared_links(expires_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON shared_links
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Token hash is unique and indexed for fast lookup
- [ ] Scope type constrained to valid entity types
- [ ] `max_views` nullable (NULL = unlimited)
- [ ] `password_hash` nullable (NULL = no password)
- [ ] `expires_at` indexed for cleanup queries

### Task 1.2: Link Access Log Table
**File:** `migrations/YYYYMMDDHHMMSS_create_link_access_log.sql`

```sql
CREATE TABLE link_access_log (
    id BIGSERIAL PRIMARY KEY,
    link_id BIGINT NOT NULL REFERENCES shared_links(id) ON DELETE CASCADE ON UPDATE CASCADE,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    feedback_text TEXT,
    decision TEXT CHECK (decision IN ('approved', 'rejected', NULL)),
    viewer_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_link_access_log_link_id ON link_access_log(link_id);
CREATE INDEX idx_link_access_log_accessed_at ON link_access_log(accessed_at);
```

**Acceptance Criteria:**
- [ ] Tracks every access with timestamp, IP, and user agent
- [ ] Optional feedback text and approve/reject decision
- [ ] Optional viewer name for attribution
- [ ] No `updated_at` -- access logs are immutable

---

## Phase 2: Rust Backend -- Token & Validation

### Task 2.1: Token Generation Service
**File:** `src/services/shared_link_token.rs`

```rust
use rand::Rng;
use sha2::{Sha256, Digest};

pub struct TokenService;

impl TokenService {
    /// Generates a cryptographically random token and returns (plain_token, hash).
    /// The plain token goes in the URL; the hash is stored in the database.
    pub fn generate_token() -> (String, String) {
        let mut rng = rand::thread_rng();
        let bytes: [u8; 32] = rng.gen();
        let plain = base64_url::encode(&bytes);
        let hash = hex::encode(Sha256::digest(plain.as_bytes()));
        (plain, hash)
    }

    /// Validates a token by hashing it and looking up the hash in the database.
    pub fn hash_token(plain_token: &str) -> String {
        hex::encode(Sha256::digest(plain_token.as_bytes()))
    }
}
```

**Acceptance Criteria:**
- [ ] Tokens are 32 bytes of cryptographic randomness, base64url-encoded
- [ ] Only the SHA-256 hash is stored in the database
- [ ] Token validation is O(1) via hash index lookup
- [ ] Unit tests verify hash consistency

### Task 2.2: Link Validation Service
**File:** `src/services/shared_link_validator.rs`

```rust
pub enum LinkValidationError {
    NotFound,
    Expired,
    ViewLimitReached,
    Revoked,
    PasswordRequired,
    PasswordIncorrect,
}
```

**Acceptance Criteria:**
- [ ] Validates: token exists, not expired, not revoked, view count under limit
- [ ] If password-protected, requires password check
- [ ] Increments `current_views` on successful validation
- [ ] Records access in `link_access_log`
- [ ] Returns the scoped content reference on success

### Task 2.3: Shared Link Model & CRUD
**File:** `src/models/shared_link.rs`

**Acceptance Criteria:**
- [ ] Create: generates token, stores hash, returns plain token in URL
- [ ] List: by creator (management view), by scope (content view)
- [ ] Revoke: sets `is_revoked = true`
- [ ] Bulk revoke: revoke all links for emergency response
- [ ] Delete: hard delete with cascade to access logs

### Task 2.4: Feedback Collection Service
**File:** `src/services/shared_link_feedback.rs`

Process feedback from external viewers and attach to review threads.

**Acceptance Criteria:**
- [ ] Stores feedback in `link_access_log`
- [ ] Creates a review note in PRD-38 review thread attributed to the link token
- [ ] Feedback includes: viewer name (optional), decision (approve/reject), text comment
- [ ] Feedback timestamp recorded

---

## Phase 3: API Endpoints

### Task 3.1: Link Management Routes (Authenticated)
**File:** `src/routes/shared_links.rs`

```
POST   /shared-links                   -- Create a new shareable link
GET    /shared-links                   -- List links created by current user
GET    /shared-links/:id               -- Get link details with access stats
DELETE /shared-links/:id               -- Revoke a link
POST   /shared-links/bulk-revoke       -- Revoke multiple links
```

**Acceptance Criteria:**
- [ ] Create accepts: scope_type, scope_id, expires_in, max_views, password
- [ ] Returns the full shareable URL with plain token
- [ ] List includes access count, feedback count, expiry status
- [ ] Revoke is immediate and logged in audit trail

### Task 3.2: External Review Routes (Public, Token-Authenticated)
**File:** `src/routes/external_review.rs`

```
GET  /review/:token                    -- Load external review page data
POST /review/:token/feedback           -- Submit feedback
POST /review/:token/verify-password    -- Verify password for protected links
```

**Acceptance Criteria:**
- [ ] GET validates token and returns scoped content metadata + video URLs
- [ ] Video URLs are watermarked versions (PRD-39 watermark settings)
- [ ] POST feedback accepts: viewer_name, decision, feedback_text
- [ ] All routes log access in `link_access_log`
- [ ] Expired/revoked tokens return clear error messages without content

---

## Phase 4: React Frontend -- External Review Page

### Task 4.1: External Review Page
**File:** `frontend/src/pages/ExternalReview.tsx`

Lightweight, standalone page for external viewers. Separate bundle from main app.

**Acceptance Criteria:**
- [ ] Minimal, clean layout with optional studio logo/name
- [ ] No platform chrome, no navigation -- just content and feedback controls
- [ ] Mobile-responsive for viewing on any device
- [ ] Fast load (<3 seconds)

### Task 4.2: Video Player Integration
**File:** `frontend/src/components/external/ExternalVideoPlayer.tsx`

Embedded video player for external review.

**Acceptance Criteria:**
- [ ] Uses PRD-83 video playback engine (embedded, lightweight mode)
- [ ] Watermarked video playback
- [ ] Standard playback controls (play/pause, seek, volume)
- [ ] No download button

### Task 4.3: Feedback Form
**File:** `frontend/src/components/external/FeedbackForm.tsx`

**Acceptance Criteria:**
- [ ] Optional viewer name input
- [ ] Approve/Reject buttons
- [ ] Text comment field
- [ ] Submit confirmation with "Thank you" message
- [ ] Form disables after submission (prevent duplicates)

### Task 4.4: Password Gate
**File:** `frontend/src/components/external/PasswordGate.tsx`

**Acceptance Criteria:**
- [ ] Password input shown before content for protected links
- [ ] Clear error on incorrect password
- [ ] Session-based: verified once per browser session

### Task 4.5: Expired/Error States
**File:** `frontend/src/components/external/LinkError.tsx`

**Acceptance Criteria:**
- [ ] "This link has expired" message with expiry date
- [ ] "View limit reached" message
- [ ] "This link has been revoked" message
- [ ] Professional appearance -- no technical error codes

---

## Phase 5: Link Management Dashboard

### Task 5.1: Shared Links Management Panel
**File:** `frontend/src/pages/SharedLinks.tsx`

**Acceptance Criteria:**
- [ ] List all active shared links with: scope, created date, expiry, view count, feedback count
- [ ] Status indicators: active (green), expiring soon (yellow), expired (grey), revoked (red)
- [ ] Revoke button per link with confirmation
- [ ] Bulk revoke action for emergency response
- [ ] Copy link URL button

### Task 5.2: Link Creation Dialog
**File:** `frontend/src/components/shared-links/CreateLinkDialog.tsx`

**Acceptance Criteria:**
- [ ] Scope selector: current segment, scene, character, or project
- [ ] Expiry selector: 24h, 7d, 30d, custom
- [ ] Optional view limit input
- [ ] Optional password input
- [ ] Generated URL displayed with copy button

### Task 5.3: Link Activity View
**File:** `frontend/src/components/shared-links/LinkActivity.tsx`

**Acceptance Criteria:**
- [ ] Timeline of access events for a specific link
- [ ] Each event shows: timestamp, IP, device, feedback (if any)
- [ ] Summary: total views, unique IPs, feedback submitted

---

## Phase 6: Testing

### Task 6.1: Token Security Tests
**File:** `tests/shared_link_token_test.rs`

**Acceptance Criteria:**
- [ ] Test token generation produces unique tokens
- [ ] Test hash consistency (same input produces same hash)
- [ ] Test token validation succeeds for valid token
- [ ] Test expired tokens are rejected
- [ ] Test revoked tokens are rejected
- [ ] Test view limit enforcement

### Task 6.2: Feedback Integration Tests
**File:** `tests/shared_link_feedback_test.rs`

**Acceptance Criteria:**
- [ ] Test feedback is stored in access log
- [ ] Test feedback flows to PRD-38 review thread
- [ ] Test feedback attributed to link token

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_shared_links.sql` | Shared links table |
| `migrations/YYYYMMDDHHMMSS_create_link_access_log.sql` | Access tracking table |
| `src/services/shared_link_token.rs` | Token generation and hashing |
| `src/services/shared_link_validator.rs` | Token validation logic |
| `src/models/shared_link.rs` | Link model and CRUD |
| `src/services/shared_link_feedback.rs` | Feedback processing |
| `src/routes/shared_links.rs` | Link management API |
| `src/routes/external_review.rs` | Public review endpoints |
| `frontend/src/pages/ExternalReview.tsx` | External review page |
| `frontend/src/components/external/ExternalVideoPlayer.tsx` | Embedded player |
| `frontend/src/components/external/FeedbackForm.tsx` | Feedback form |
| `frontend/src/components/external/PasswordGate.tsx` | Password verification |
| `frontend/src/pages/SharedLinks.tsx` | Link management dashboard |
| `frontend/src/components/shared-links/CreateLinkDialog.tsx` | Link creation UI |
| `frontend/src/components/shared-links/LinkActivity.tsx` | Access history view |

## Dependencies

### Upstream PRDs
- PRD-38: Collaborative Review for feedback integration
- PRD-39: Scene Assembler for watermark settings
- PRD-83: Video Playback Engine for player component

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)
4. Phase 4: External Review Page (Tasks 4.1-4.5)

**MVP Success Criteria:**
- Shared links load external review page in <3 seconds
- Token authentication prevents 100% of unauthorized access
- Expired/revoked links return clear error messages
- Viewer feedback flows into the review thread

### Post-MVP Enhancements
1. Phase 5: Link Management Dashboard (Tasks 5.1-5.3)
2. Phase 6: Testing (Tasks 6.1-6.2)
3. Timestamped commenting (PRD Requirement 2.1)

## Notes

1. **Token URL format** -- `https://studio.example.com/review/{token}`. The token is base64url-encoded (URL-safe, no padding).
2. **External bundle** -- The external review page should be a separate webpack entry point, not importing the full platform app. Keep the JS bundle under 200KB.
3. **Watermark traceability** -- The watermark should embed a truncated token identifier or link ID so leaked content can be traced to the specific shared link.
4. **CORS considerations** -- External review routes must allow access from any origin since they are public-facing.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-084
