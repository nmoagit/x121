# Task List: Collaborative Review (Notes, Memos, Issues)

**PRD Reference:** `design/prds/038-prd-collaborative-review.md`
**Scope:** Build timestamped review notes, voice memo recording, structured failure tagging, and threaded review conversations for precise, contextual, and actionable review feedback.

## Overview

Review feedback needs to be precise, contextual, and actionable. This PRD provides: timestamped text notes attached to specific moments in a segment; voice memos for quick verbal feedback; structured failure tags (Face Melt, Jitter, etc.) for systematic defect categorization; and threaded conversations per segment with resolution status tracking. The review data creates a rich record usable for future model and audit-script training.

### What Already Exists
- PRD-010 Event Bus (real-time notification for @mentions)
- PRD-011 Real-time Collaboration (concurrent review)
- PRD-083 Video playback engine (timecode reference)
- PRD-029 design system components
- PRD-000 database infrastructure

### What We're Building
1. Timestamped text notes attached to video timecodes
2. Voice memo recording (hold-to-record) with optional transcription
3. Structured failure tag taxonomy
4. Threaded review conversations with resolution status
5. Database tables for notes, memos, and tags
6. Backend API for review note CRUD

### Key Design Decisions
1. **Notes anchored to timecodes** — Each note is linked to a specific frame/timecode, not just the segment.
2. **Failure tags are predefined + custom** — Common defect types are built-in; Admins can add custom tags.
3. **Voice memos are first-class** — Not just text attachments; they appear inline in the review thread.
4. **Resolution tracking** — Each note has a status (Open, Resolved, Won't Fix) for issue tracking.

---

## Phase 1: Database & API

### Task 1.1: Create Review Notes & Tags Tables
**File:** `migrations/YYYYMMDD_create_review_notes.sql`

```sql
-- Review failure tag taxonomy
CREATE TABLE review_tags (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#888888',
    category TEXT NOT NULL DEFAULT 'general',
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON review_tags
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_review_tags_created_by ON review_tags(created_by);

INSERT INTO review_tags (name, color, category) VALUES
    ('Face Melt', '#FF4444', 'face'),
    ('Jitter', '#FF8844', 'motion'),
    ('Boundary Pop', '#FFAA44', 'transition'),
    ('Hand Artifact', '#FF4488', 'body'),
    ('Lighting Mismatch', '#4488FF', 'lighting'),
    ('Motion Stutter', '#FF6644', 'motion'),
    ('Other', '#888888', 'general');

-- Review notes (text, voice memo, or both)
CREATE TABLE review_notes (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    parent_note_id BIGINT NULL REFERENCES review_notes(id) ON DELETE CASCADE,  -- For threading
    timecode TEXT,                 -- HH:MM:SS:FF or frame number
    frame_number INTEGER,
    text_content TEXT,
    voice_memo_path TEXT,
    voice_memo_transcript TEXT,
    status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'wont_fix'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_notes_segment_id ON review_notes(segment_id);
CREATE INDEX idx_review_notes_user_id ON review_notes(user_id);
CREATE INDEX idx_review_notes_parent_note_id ON review_notes(parent_note_id);
CREATE INDEX idx_review_notes_status ON review_notes(status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON review_notes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Note-tag junction table
CREATE TABLE review_note_tags (
    id BIGSERIAL PRIMARY KEY,
    note_id BIGINT NOT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES review_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_note_tags_note_id ON review_note_tags(note_id);
CREATE INDEX idx_review_note_tags_tag_id ON review_note_tags(tag_id);
CREATE UNIQUE INDEX uq_review_note_tags ON review_note_tags(note_id, tag_id);
```

**Acceptance Criteria:**
- [ ] `review_tags` with predefined failure tags and admin-creatable custom tags
- [ ] `review_notes` for text notes and voice memos with timecode anchoring
- [ ] `parent_note_id` enables threaded replies
- [ ] `review_note_tags` junction table for multiple tags per note
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Review Notes Model & Repository
**File:** `src/models/review_note.rs`, `src/repositories/review_note_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReviewNote {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub parent_note_id: Option<DbId>,
    pub timecode: Option<String>,
    pub frame_number: Option<i32>,
    pub text_content: Option<String>,
    pub voice_memo_path: Option<String>,
    pub voice_memo_transcript: Option<String>,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Models for notes, tags, and note-tag associations
- [ ] Repository: CRUD for notes, threaded queries, tag assignment
- [ ] Tag frequency statistics query (for pattern analysis)
- [ ] Unit tests for all repository operations

### Task 1.3: Review Notes API
**File:** `src/routes/review_notes.rs`

```rust
pub fn review_notes_routes() -> Router<AppState> {
    Router::new()
        .route("/segments/:id/notes", get(list_notes).post(create_note))
        .route("/segments/:id/notes/:note_id", put(update_note).delete(delete_note))
        .route("/segments/:id/notes/:note_id/memo", post(upload_memo))
        .route("/segments/:id/notes/:note_id/resolve", put(resolve_note))
        .route("/review-tags", get(list_tags).post(create_tag))
}
```

**Acceptance Criteria:**
- [ ] CRUD for review notes with timecode and tag associations
- [ ] `POST /segments/:id/notes/:note_id/memo` uploads voice memo audio file
- [ ] `PUT /segments/:id/notes/:note_id/resolve` updates resolution status
- [ ] `GET /review-tags` lists all failure tags with frequency statistics

---

## Phase 2: Timestamped Notes

### Task 2.1: Note Timeline Component
**File:** `frontend/src/features/review-notes/NoteTimeline.tsx`

**Acceptance Criteria:**
- [ ] Create notes attached to current playback timecode
- [ ] Notes visible in a scrollable timeline alongside the video scrubber
- [ ] Click a note to jump to its timestamp
- [ ] @mention other users (triggers PRD-010 notification)
- [ ] Notes timeline compact to avoid taking space from video player

---

## Phase 3: Voice Memos

### Task 3.1: Voice Memo Recorder
**File:** `frontend/src/features/review-notes/VoiceMemoRecorder.tsx`

```typescript
export const VoiceMemoRecorder: React.FC<{
  onRecordComplete: (blob: Blob) => void;
}> = ({ onRecordComplete }) => {
  // Hold-to-record via Web Audio API / MediaRecorder
  // Clear pulsing red dot indicator while recording
};
```

**Acceptance Criteria:**
- [ ] Hold-to-record voice memos attached to current timestamp
- [ ] Recording latency <200ms from button press
- [ ] Playback inline in the note timeline
- [ ] Voice memo appears alongside text notes in the review thread
- [ ] Clear visual indicator during recording (pulsing red dot)
- [ ] Auto-transcription (optional, best-effort) for searchability

---

## Phase 4: Failure Tags

### Task 4.1: Tag Selector Component
**File:** `frontend/src/features/review-notes/TagSelector.tsx`

**Acceptance Criteria:**
- [ ] Predefined failure tags: Face Melt, Jitter, Boundary Pop, Hand Artifact, Lighting Mismatch, Motion Stutter, Other
- [ ] Color-coded badges for quick visual identification
- [ ] Multiple tags per note
- [ ] Custom tags creatable by Admin
- [ ] Tag frequency visible for pattern analysis

---

## Phase 5: Review Thread

### Task 5.1: Threaded Conversation Component
**File:** `frontend/src/features/review-notes/ReviewThread.tsx`

**Acceptance Criteria:**
- [ ] All notes, memos, tags, and replies organized as a threaded conversation
- [ ] Sortable by timestamp or chronological order
- [ ] Resolution status per note: Open, Resolved, Won't Fix
- [ ] Notes persist across regeneration cycles for historical context
- [ ] Thread collapsible for space management

---

## Phase 6: Integration & Testing

### Task 6.1: Real-Time Collaboration
**File:** integration with PRD-010, PRD-011

**Acceptance Criteria:**
- [ ] @mentions trigger PRD-010 notifications in real-time
- [ ] Concurrent reviewers see each other's notes in real-time via PRD-011
- [ ] No conflicts when two reviewers add notes simultaneously

### Task 6.2: Comprehensive Tests
**File:** `tests/review_notes_test.rs`, `frontend/src/features/review-notes/__tests__/`

**Acceptance Criteria:**
- [ ] Notes attach to correct timecode with frame-level accuracy
- [ ] Voice memo recording latency <200ms
- [ ] Threaded replies correctly associate with parent notes
- [ ] Tag frequency statistics accurately count tag usage
- [ ] Resolution status updates correctly
- [ ] @mention notifications delivered via PRD-010

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_review_notes.sql` | Review notes and tags tables |
| `src/models/review_note.rs` | Rust model structs |
| `src/repositories/review_note_repo.rs` | Review notes repository |
| `src/routes/review_notes.rs` | Axum API endpoints |
| `frontend/src/features/review-notes/NoteTimeline.tsx` | Note timeline |
| `frontend/src/features/review-notes/VoiceMemoRecorder.tsx` | Voice recorder |
| `frontend/src/features/review-notes/TagSelector.tsx` | Failure tag selector |
| `frontend/src/features/review-notes/ReviewThread.tsx` | Threaded conversation |

## Dependencies
- PRD-010: Event Bus (@mention notifications)
- PRD-011: Real-time Collaboration (concurrent editing)
- PRD-083: Video playback engine (timecode reference)
- PRD-029: Design system

## Implementation Order
### MVP
1. Phase 1 (Database & API) — notes, tags, and memos storage
2. Phase 2 (Timestamped Notes) — note timeline with timecode anchoring
3. Phase 3 (Voice Memos) — hold-to-record with transcription
4. Phase 4 (Failure Tags) — structured defect categorization
5. Phase 5 (Review Thread) — threaded conversation with resolution

### Post-MVP Enhancements
- Review templates: admin-created checklists for structured review workflows

## Notes
- Review data is valuable training data — structured tags and timecoded notes feed PRD-064 failure tracking.
- Notes persist across regeneration cycles so historical context is maintained.
- Voice memos are especially useful on mobile (PRD-055 Director's View).

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
