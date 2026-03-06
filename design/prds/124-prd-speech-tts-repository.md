# PRD-124: Speech & TTS Repository

**Document ID:** 124-prd-speech-tts-repository
**Status:** Draft
**Author:** Product Manager
**Created:** 2026-03-06
**Last Updated:** 2026-03-06

---

## 1. Introduction/Overview

Characters in the X121 pipeline need dialogue text for ElevenLabs text-to-speech (TTS) generation. Each character has multiple speech "types" (e.g., Greeting, Farewell, Flirty) and within each type, multiple versioned text strings that provide variation (e.g., `Greeting_1`: "Hey you... don't just stare.", `Greeting_2`: "Mmm, hi, baby... Video date just got real."). Currently there is no structured storage for this data -- speech lines live in external spreadsheets or notes with no connection to the platform.

This PRD introduces a normalized `character_speeches` table with a `speech_types` lookup table, a new "Speech" tab on the Character Detail page, full CRUD operations, bulk import/export (CSV and JSON), and read-only display of the character's ElevenLabs VoiceID from existing character settings. MVP is text-only storage and management; actual TTS audio generation via the ElevenLabs API is deferred to post-MVP.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-01:** Project, Character & Scene Data Model -- character entity, settings JSONB (stores `elevenlabs_voice`)
- **PRD-00:** Database Normalization & Strict Integrity -- lookup table patterns, FK constraints
- **PRD-29:** Design System & Shared Component Library -- form components, tabs, modals
- **PRD-112:** Project Hub & Management -- character detail page structure, CHARACTER_TABS

### Extends
- **PRD-108:** Character Settings Dashboard -- reads `elevenlabs_voice` from character settings JSONB
- **PRD-066:** Character Metadata Editor -- import/export patterns (CSV/JSON), form editing patterns

### Depended On By
- (Future) TTS Audio Generation PRD -- will consume speech text entries and call ElevenLabs API

## 3. Goals

### Primary Goals
1. Provide normalized, persistent storage for character dialogue/speech text organized by type and version.
2. Enable CRUD operations on speech entries through both API and UI.
3. Add a dedicated "Speech" tab to the Character Detail page.
4. Support bulk import and export of speech data in both CSV and JSON formats.
5. Display the character's ElevenLabs VoiceID (from character settings) as read-only context.

### Secondary Goals
1. Auto-increment version numbers within each speech type to prevent gaps and conflicts.
2. Seed the speech types lookup table with common types (Greeting, Farewell, Flirty, Angry, Sad, Excited, Neutral, Whisper) while allowing user-extensible values.
3. Lay groundwork for post-MVP TTS audio generation integration.

## 4. User Stories

- As a Creator, I want to add speech text entries for a character organized by type (Greeting, Farewell, etc.) so that I can manage all dialogue variations in one place.
- As a Creator, I want the system to auto-assign version numbers within each speech type so that I don't have to track numbering manually.
- As a Creator, I want to see which ElevenLabs voice is assigned to this character so that I know which voice will be used for TTS.
- As a Creator, I want to import speech data from a CSV or JSON file so that I can bulk-load dialogue from external sources.
- As a Creator, I want to export all speech entries for a character to CSV or JSON so that I can share or edit them externally.
- As a Creator, I want to edit or delete individual speech entries so that I can refine dialogue over time.
- As a Creator, I want to add new speech types beyond the defaults so that I can categorize dialogue for custom scenarios.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Speech Types Lookup Table
**Description:** A seeded lookup table for speech types with user-extensible values. Follows the existing status/lookup table pattern (SMALLINT PK, name TEXT).
**Acceptance Criteria:**
- [ ] `speech_types` table created with `id SMALLSERIAL PRIMARY KEY`, `name TEXT NOT NULL UNIQUE`, `created_at TIMESTAMPTZ`
- [ ] Seeded with at least 8 default types: Greeting, Farewell, Flirty, Angry, Sad, Excited, Neutral, Whisper
- [ ] API endpoint to list all speech types: `GET /api/v1/speech-types`
- [ ] API endpoint to create new speech types: `POST /api/v1/speech-types` (body: `{ name }`)
- [ ] Duplicate type names rejected with 409 Conflict

**Technical Notes:**
- Follows the same pattern as `character_statuses`, `project_statuses`, etc.
- SMALLSERIAL is sufficient since the domain is small.

#### Requirement 1.2: Character Speeches Table
**Description:** Normalized table storing individual speech text entries, linked to a character and a speech type, with auto-incrementing version numbers per (character, type) pair.
**Acceptance Criteria:**
- [ ] `character_speeches` table created with:
  - `id BIGSERIAL PRIMARY KEY`
  - `character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE`
  - `speech_type_id SMALLINT NOT NULL REFERENCES speech_types(id) ON DELETE RESTRICT`
  - `version INT NOT NULL` (auto-assigned, starts at 1)
  - `text TEXT NOT NULL` (the speech content)
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `deleted_at TIMESTAMPTZ` (soft delete)
- [ ] Unique constraint on `(character_id, speech_type_id, version)` WHERE `deleted_at IS NULL`
- [ ] `updated_at` trigger installed
- [ ] FK indexes on `character_id` and `speech_type_id`

**Technical Notes:**
- Version is computed server-side as `MAX(version) + 1` for the given (character_id, speech_type_id) pair, including soft-deleted rows to prevent version reuse.
- Soft delete via `deleted_at` column follows project convention (never `revoked_at`/`lifted_at`).

#### Requirement 1.3: Speech CRUD API
**Description:** RESTful API endpoints for managing speech entries for a character.
**Acceptance Criteria:**
- [ ] `GET /api/v1/characters/:id/speeches` -- list all active speech entries for a character, grouped by type
  - Response groups entries by speech type name, each with version and text
  - Supports `?type=Greeting` query param to filter by type name
  - Excludes soft-deleted entries by default; `?include_deleted=true` to include them
- [ ] `POST /api/v1/characters/:id/speeches` -- create a new speech entry
  - Body: `{ speech_type_id, text }`
  - Version auto-assigned (next available for that character + type)
  - Returns the created entry with assigned version
- [ ] `PUT /api/v1/characters/:id/speeches/:speechId` -- update speech text
  - Body: `{ text }`
  - Only text is editable (type and version are immutable after creation)
  - Returns updated entry
- [ ] `DELETE /api/v1/characters/:id/speeches/:speechId` -- soft delete a speech entry
  - Sets `deleted_at = now()`
  - Returns 204 No Content
- [ ] All endpoints validate character exists and return 404 if not
- [ ] All endpoints return standard envelope `{ data }` / `{ error }`

**Technical Notes:**
- Handler file: `apps/backend/crates/api/src/handlers/character_speech.rs`
- Route file: `apps/backend/crates/api/src/routes/character_speech.rs`
- Mounted under the existing character routes as a nested resource.

#### Requirement 1.4: Bulk Import API
**Description:** Import speech entries from CSV or JSON payload for a character.
**Acceptance Criteria:**
- [ ] `POST /api/v1/characters/:id/speeches/import` -- bulk import speech entries
  - Accepts `Content-Type: application/json` with body: `{ format: "csv" | "json", data: string }`
  - CSV format: `type,text` columns (version auto-assigned; type name resolved to speech_type_id)
  - JSON format: `[{ "type": "Greeting", "text": "Hey you..." }, ...]`
  - Unknown type names auto-create new speech_type rows (user-extensible)
  - Returns summary: `{ imported: number, created_types: string[], errors: string[] }`
  - Validation: reject empty text, reject rows with missing type
  - Transaction: all-or-nothing -- if any row fails validation, none are imported
- [ ] `POST /api/v1/characters/:id/speeches/export` -- export all speech entries
  - Body: `{ format: "csv" | "json" }`
  - CSV response: `type,version,text` columns, Content-Disposition header for download
  - JSON response: `[{ "type": "Greeting", "version": 1, "text": "..." }, ...]`

**Technical Notes:**
- CSV parsing: use the `csv` crate (already in workspace or add as dependency).
- Reuse import/export patterns from PRD-066 (Character Metadata Editor).

#### Requirement 1.5: Speech Tab in Character Detail Page
**Description:** A new "Speech" tab added to the Character Detail page showing all speech entries organized by type.
**Acceptance Criteria:**
- [ ] "Speech" tab added to `CHARACTER_TABS` array in `apps/frontend/src/features/projects/types.ts`
- [ ] New component `CharacterSpeechTab` at `apps/frontend/src/features/characters/tabs/CharacterSpeechTab.tsx`
- [ ] Tab content shows:
  - Read-only VoiceID badge at the top (from character settings `elevenlabs_voice`), with "Not configured" state if missing
  - Speech entries grouped by type, each group collapsible
  - Within each group, entries listed as `{Type}_{Version}: "{text}"` with edit/delete actions
  - "Add Speech" button that opens a form with speech type selector (dropdown of existing types + "Add new type" option) and text input
  - Empty state when no speech entries exist
- [ ] Inline editing: clicking edit on an entry allows text editing in-place with Save/Cancel
- [ ] Delete action shows confirmation before soft-deleting

**Technical Notes:**
- Use existing design system components: `Select`, `Input`, `Button`, `Modal`, `Tabs` from `@/components/`.
- TanStack Query hooks for data fetching in a new hook file: `apps/frontend/src/features/characters/hooks/use-character-speeches.ts`

#### Requirement 1.6: Import/Export UI
**Description:** Import and export controls within the Speech tab.
**Acceptance Criteria:**
- [ ] "Import" button opens a modal with:
  - File upload accepting `.csv` or `.json` files
  - Text area for pasting CSV or JSON data directly
  - Format auto-detection based on file extension or content
  - Preview of parsed entries before confirming import
  - Error display for invalid rows
- [ ] "Export" button with dropdown: "Export as CSV" / "Export as JSON"
  - Triggers download of the selected format
- [ ] After successful import, the speech list refreshes to show new entries

**Technical Notes:**
- Reuse `FileDropZone` from `@/components/domain/` for file upload.
- Use `useMutation` from TanStack Query for import/export operations.

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: TTS Audio Generation
**Description:** Generate audio files from speech text using the ElevenLabs API.
**Acceptance Criteria:**
- [ ] "Generate Audio" button per speech entry that calls ElevenLabs TTS API
- [ ] Uses the character's `elevenlabs_voice` VoiceID from settings
- [ ] Generated audio stored via StorageProvider (local filesystem for MVP, S3 post-MVP)
- [ ] Audio playback controls inline with each speech entry
- [ ] Batch generation: generate audio for all entries in a type or all types

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Speech Template System
**Description:** Define speech templates at the project level that can be applied to multiple characters.
**Acceptance Criteria:**
- [ ] Create named speech templates with type/text pairs
- [ ] Apply a template to a character (creates speech entries from template)
- [ ] Template shows which entries will be created before confirmation

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Delivery Integration
**Description:** Include speech text and generated audio in the character delivery package.
**Acceptance Criteria:**
- [ ] `speeches.json` included in delivery ZIP alongside `metadata.json`
- [ ] Generated audio files included in a `speech_audio/` subfolder
- [ ] Delivery validation checks speech completeness

## 6. Non-Functional Requirements

### Performance
- Speech list for a character loads in < 500ms for up to 200 entries.
- Bulk import of 500 entries completes in < 5 seconds.
- Export generation completes in < 2 seconds for 500 entries.

### Security
- All endpoints require authentication (JWT).
- Character access is scoped to the character's project (no cross-project leakage).

## 7. Non-Goals (Out of Scope)

- Actual TTS audio generation via ElevenLabs API (post-MVP, Requirement 2.1).
- Audio file storage and playback (post-MVP).
- Speech template sharing across projects (post-MVP).
- Real-time collaborative editing of speech entries (covered by PRD-11 patterns if needed later).
- ElevenLabs voice configuration or selection (managed through character settings, PRD-108).
- Speech analytics or sentiment analysis.

## 8. Design Considerations

- The Speech tab should feel consistent with the Metadata tab -- grouped entries with inline editing.
- Speech types should be displayed as collapsible sections, similar to metadata field groups.
- The VoiceID badge at the top provides context without requiring navigation to the Settings tab.
- Import/export modal should follow the same patterns established in PRD-066.
- Empty state should guide the user to either add entries manually or import from file.

## 9. Technical Considerations

### Existing Code to Reuse
- **Character Detail Page:** `CharacterDetailPage.tsx` -- add new tab entry to `CHARACTER_TABS`
- **Design System:** `Select`, `Input`, `Button`, `Modal`, `Badge`, `EmptyState` from `@/components/`
- **FileDropZone:** `@/components/domain/FileDropZone.tsx` for file upload in import modal
- **TanStack Query patterns:** Follow existing hook patterns in `use-character-detail.ts`, `use-metadata-versions.ts`
- **Backend handler patterns:** Follow `character_metadata.rs` handler structure
- **Soft delete infrastructure:** Reuse existing `deleted_at` patterns from PRD-109

### Database Changes

#### New Tables

```sql
-- Speech types lookup table (seeded, user-extensible)
CREATE TABLE speech_types (
    id         SMALLSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default types
INSERT INTO speech_types (name) VALUES
    ('Greeting'), ('Farewell'), ('Flirty'), ('Angry'),
    ('Sad'), ('Excited'), ('Neutral'), ('Whisper');

-- Character speech entries
CREATE TABLE character_speeches (
    id             BIGSERIAL   PRIMARY KEY,
    character_id   BIGINT      NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    speech_type_id SMALLINT    NOT NULL REFERENCES speech_types(id) ON DELETE RESTRICT,
    version        INT         NOT NULL,
    text           TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

-- Unique: one version per (character, type) pair, excluding soft-deleted
CREATE UNIQUE INDEX uq_character_speeches_char_type_version
    ON character_speeches (character_id, speech_type_id, version)
    WHERE deleted_at IS NULL;

-- FK indexes
CREATE INDEX idx_character_speeches_character_id   ON character_speeches(character_id);
CREATE INDEX idx_character_speeches_speech_type_id ON character_speeches(speech_type_id);

-- Updated_at trigger
CREATE TRIGGER trg_character_speeches_updated_at
    BEFORE UPDATE ON character_speeches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### API Changes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/speech-types` | List all speech types |
| POST | `/api/v1/speech-types` | Create a new speech type |
| GET | `/api/v1/characters/:id/speeches` | List speech entries (grouped by type) |
| POST | `/api/v1/characters/:id/speeches` | Create a speech entry |
| PUT | `/api/v1/characters/:id/speeches/:speechId` | Update speech text |
| DELETE | `/api/v1/characters/:id/speeches/:speechId` | Soft-delete a speech entry |
| POST | `/api/v1/characters/:id/speeches/import` | Bulk import (CSV/JSON) |
| POST | `/api/v1/characters/:id/speeches/export` | Bulk export (CSV/JSON) |

### New Files

**Backend:**
- `apps/backend/crates/db/src/models/character_speech.rs` -- model structs
- `apps/backend/crates/db/src/repositories/character_speech_repo.rs` -- repository
- `apps/backend/crates/db/src/repositories/speech_type_repo.rs` -- lookup repository
- `apps/backend/crates/api/src/handlers/character_speech.rs` -- API handlers
- `apps/backend/crates/api/src/routes/character_speech.rs` -- route definitions
- `apps/backend/crates/core/src/speech.rs` -- validation, import parsing

**Frontend:**
- `apps/frontend/src/features/characters/tabs/CharacterSpeechTab.tsx` -- tab component
- `apps/frontend/src/features/characters/hooks/use-character-speeches.ts` -- TanStack Query hooks
- `apps/frontend/src/features/characters/types.ts` -- speech type definitions (extend existing file)

**Migration:**
- `apps/db/migrations/YYYYMMDDHHMMSS_create_speech_tables.sql`

## 10. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Import CSV with unknown speech type name | Auto-create the speech type, report in `created_types` response field |
| Import with empty text field | Reject the row, include in `errors` response field |
| Import with duplicate (type, version) for character | Skip if text matches; error if text differs (version collision) |
| Delete a speech type that has entries | RESTRICT -- return 409 Conflict with message explaining entries exist |
| Character has no `elevenlabs_voice` setting | Show "Voice not configured" badge with link to Settings tab |
| Import file too large | Limit import to 1000 entries per request; return 413 if exceeded |
| Concurrent version assignment | Use `SELECT MAX(version) ... FOR UPDATE` within a transaction to prevent race conditions |
| Soft-deleted entry re-creation | Version counter includes soft-deleted rows, so new entries get the next version (no reuse) |

## 11. Success Metrics

- Speech entries load in < 500ms for characters with up to 200 entries.
- Bulk import of 500 entries completes in < 5 seconds.
- CSV/JSON round-trip (export, edit externally, re-import) preserves all data correctly.
- Zero version collisions under concurrent usage.
- Speech tab renders correctly on all supported viewport sizes (responsive).

## 12. Testing Requirements

### Backend Tests
- Unit tests for version auto-increment logic (including with soft-deleted rows).
- Unit tests for CSV and JSON import parsing (valid, invalid, edge cases).
- Integration tests for all 8 API endpoints.
- Test soft delete does not violate unique constraint on re-insert.
- Test concurrent version assignment (two simultaneous creates for same type).

### Frontend Tests
- Render test: Speech tab shows grouped entries.
- Interaction test: Add speech entry form submits correctly.
- Interaction test: Inline edit saves changes.
- Interaction test: Delete shows confirmation and removes entry.
- Import modal: file upload and paste both work.
- Export: CSV and JSON downloads trigger correctly.
- Empty state renders when no speeches exist.
- VoiceID badge shows correct state (configured vs. not configured).

## 13. Open Questions

- Should speech entries support a "notes" or "context" field to describe when/how the line should be delivered?
- Should there be a character-level "speech completeness" indicator (e.g., "5 types with at least 2 versions each")?
- Should bulk import support an "overwrite" mode that replaces all existing entries for a character?
- Should speech types support ordering/display_order for consistent UI presentation?

## 14. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** -- no PR should be merged without a DRY-GUY audit of the changed files.

## 15. Version History

- **v1.0** (2026-03-06): Initial PRD creation -- speech text storage, CRUD API, Speech tab, bulk import/export (CSV + JSON), read-only VoiceID display.
