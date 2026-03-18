# PRD-136: Multilingual Speech & Deliverable System

## 1. Introduction / Overview

The platform has a working speech storage system (PRD-124) that stores character dialogue text by type with versioning, CRUD APIs, and a per-character speech tab. However, it has no concept of **language** — every speech entry is implicitly English-only. The platform also lacks a defined **deliverable format** for speech: a structured JSON file per character that downstream systems (TTS pipeline, runtime) consume.

This PRD closes these gaps by:
1. Adding a normalized **language infrastructure** to the database and API
2. Defining a **speech deliverable JSON format** with a "generate deliverable" action
3. Enhancing **import** to support multi-character, multi-language files (e.g., `greetings.json`)
4. Adding **speech completeness tracking** integrated into the existing readiness system
5. Adding **language indicators** (flag icons) to character cards and detail pages
6. Adding **approval workflow** for speech entries as a quality gate before deliverable generation
7. Making speech types **configurable per project** (which types are required)
8. Post-MVP: LLM-powered translation, TTS preview, and speech generation from character profiles

## 2. Related PRDs & Dependencies

**Depends on:**
- **PRD-124** — Speech & TTS Repository (existing speech tables, CRUD, import/export, speech tab)
- **PRD-112** — Project Hub & Management (character detail page, tabs)
- **PRD-128** — Character Readiness Indicators (readiness circles on character cards)

**Extends:**
- **PRD-124** — Adds language column, approval status, deliverable export, completeness tracking
- **PRD-128** — Enhances speech readiness from binary VoiceID check to completeness percentage
- **PRD-107** — Extends blocking deliverables hierarchy to include speech completeness

**Related:**
- **PRD-125** — LLM-Driven Metadata Refinement (pattern for LLM translation pipeline)
- **PRD-113** — Character Ingest Pipeline (bulk import patterns)
- **PRD-135** — Character Creator (future speech file import from folders)

## 3. Goals

1. Every speech entry is associated with a specific language; characters can have speech in multiple languages.
2. A well-defined deliverable JSON file can be generated per character containing all approved speech, grouped by type and language.
3. Bulk import supports the existing `greetings.json` format (character slug → type → language → text[]) at project level.
4. Speech completeness is tracked per character and visible on character cards (how many required types × languages are filled).
5. Language flags are shown on character cards and detail pages indicating which languages have speech.
6. Speech entries have an approval status; only approved entries are included in deliverables.
7. Projects can configure which speech types are required and which languages are expected.

## 4. User Stories

- **As a producer**, I want each speech entry tagged with a language so I can manage English and Spanish greetings separately for the same character.
- **As a producer**, I want to see flag icons on a character card showing which languages have speech, so I can quickly identify multilingual coverage.
- **As a producer**, I want to import a `greetings.json` file that contains speech for many characters across multiple languages, and have it automatically create/update speech entries for all of them.
- **As a producer**, I want to generate a deliverable JSON file for a character that contains all their approved speech, structured by type and language, ready for the TTS pipeline.
- **As a producer**, I want to see speech completeness on the character card (e.g., "8/12 speech slots filled") so I know which characters need more dialogue.
- **As a producer**, I want to approve or reject individual speech entries so only quality-checked dialogue makes it into the deliverable.
- **As a producer**, I want to bulk-approve all speech for a character when I'm satisfied with the content.
- **As a project admin**, I want to configure which speech types are required for my project (e.g., Greeting + Farewell + Flirty) and which languages are expected (e.g., English + Spanish), so completeness is measured against the right targets.
- **As a producer**, I want to reorder speech variants within a type/language group so the most important ones appear first in the deliverable.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Languages Lookup Table

**Description:** A new `languages` lookup table storing supported languages with their ISO 639-1 code, display name, and flag emoji. Seeded with common languages; user-extensible.

**Acceptance Criteria:**
- [ ] `languages` table created: `id SMALLSERIAL`, `code VARCHAR(10) UNIQUE` (e.g., `en`, `es`), `name TEXT` (e.g., `English`, `Spanish`), `flag_code VARCHAR(10)` (ISO 3166-1 alpha-2 for SVG flag lookup, e.g., `us`, `es`), `created_at`
- [ ] Seeded with: English (en), Spanish (es), French (fr), German (de), Portuguese (pt), Italian (it), Japanese (ja), Korean (ko), Chinese (zh), Russian (ru), Arabic (ar), Hindi (hi)
- [ ] GET `/api/v1/languages` returns all languages
- [ ] POST `/api/v1/languages` creates a new language (admin only)

#### Requirement 1.2: Language Column on character_speeches

**Description:** Add a `language_id` foreign key to the `character_speeches` table. All existing rows default to English. Update the unique constraint to include language.

**Acceptance Criteria:**
- [ ] Migration adds `language_id SMALLINT NOT NULL DEFAULT 1` (English) referencing `languages(id)` with `ON DELETE RESTRICT`
- [ ] Unique constraint updated to `(character_id, speech_type_id, language_id, version)` WHERE `deleted_at IS NULL`
- [ ] Index on `language_id` added
- [ ] All existing speech rows assigned `language_id = 1` (English)
- [ ] Backend model `CharacterSpeech` includes `language_id` field
- [ ] `CreateCharacterSpeech` DTO includes optional `language_id` (defaults to English)

#### Requirement 1.3: Speech Approval Status

**Description:** Add an approval status to speech entries. New entries default to "draft". Only "approved" entries are included in deliverables.

**Acceptance Criteria:**
- [ ] `speech_statuses` lookup table: `id SMALLSERIAL`, `name TEXT UNIQUE` — seeded with: `draft`, `approved`, `rejected`
- [ ] Migration adds `status_id SMALLINT NOT NULL DEFAULT 1` (draft) referencing `speech_statuses(id)` to `character_speeches`
- [ ] PUT `/api/v1/characters/:id/speeches/:speechId/status` updates status (accepts `{ status: "approved" | "rejected" | "draft" }`)
- [ ] POST `/api/v1/characters/:id/speeches/bulk-approve` approves all draft speeches for the character (optional `?language_id=N` and `?type_id=N` filters)
- [ ] Speech tab displays status badge per entry (draft = grey, approved = green, rejected = red)
- [ ] Bulk approve button in speech tab toolbar

#### Requirement 1.4: Speech Variant Ordering

**Description:** Add an explicit `sort_order` to speech entries so producers can control variant priority within a type/language group.

**Acceptance Criteria:**
- [ ] Migration adds `sort_order INT NOT NULL DEFAULT 0` to `character_speeches`
- [ ] New entries auto-assigned `sort_order` = MAX(sort_order) + 1 for the same (character, type, language) group
- [ ] PUT `/api/v1/characters/:id/speeches/reorder` accepts `{ speech_ids: number[] }` and reassigns `sort_order` sequentially
- [ ] Deliverable JSON orders variants by `sort_order` ascending
- [ ] Frontend supports drag-and-drop reorder within a type/language group (or up/down arrows)

#### Requirement 1.5: API Updates for Language Support

**Description:** All speech endpoints accept and return language information.

**Acceptance Criteria:**
- [ ] GET `/api/v1/characters/:id/speeches` returns `language_id` and expanded `language` object (code, name, flag) on each entry
- [ ] GET supports `?language_id=N` filter in addition to existing `?type_id=N`
- [ ] POST `/api/v1/characters/:id/speeches` accepts `language_id` (defaults to English)
- [ ] Export endpoint includes language in output
- [ ] List endpoint supports grouping: `?group_by=type,language` returning nested structure

#### Requirement 1.6: Project Speech Configuration

**Description:** Projects can configure which speech types are required and which languages are expected. This drives completeness tracking.

**Acceptance Criteria:**
- [ ] `project_speech_config` table: `id BIGSERIAL`, `project_id BIGINT FK`, `speech_type_id SMALLINT FK`, `language_id SMALLINT FK`, `min_variants INT DEFAULT 1`, `created_at`
- [ ] Unique constraint on `(project_id, speech_type_id, language_id)`
- [ ] GET `/api/v1/projects/:id/speech-config` returns configuration
- [ ] PUT `/api/v1/projects/:id/speech-config` accepts array of `{ speech_type_id, language_id, min_variants }` entries (replaces all)
- [ ] Default config when none set: all 8 speech types × English × 3 variants minimum
- [ ] Configuration UI in Project Config tab (matrix of types × languages with min_variants inputs)

#### Requirement 1.7: Speech Completeness Tracking

**Description:** Track how complete a character's speech is against the project's speech configuration. Integrate into the existing readiness system.

**Acceptance Criteria:**
- [ ] Backend computes speech completeness: for each required (type, language) pair, count approved variants vs. `min_variants` from config
- [ ] GET `/api/v1/characters/:id/speech-completeness` returns `{ total_slots, filled_slots, completeness_pct, breakdown: [{ type, language, required, approved, status }] }`
- [ ] Character readiness indicator (PRD-128 speech circle) upgraded from binary VoiceID check to completeness percentage: not_started (0%), partial (1-99%), complete (100%)
- [ ] Tooltip on speech readiness circle shows "Speech: X/Y slots filled (Z%)"
- [ ] Speech completeness optionally added to blocking deliverables hierarchy (configurable per project)

#### Requirement 1.8: Speech Deliverable JSON Export

**Description:** Generate a well-defined deliverable JSON file per character containing all approved speech, structured by type and language.

**Acceptance Criteria:**
- [ ] POST `/api/v1/characters/:id/speeches/deliverable` generates the JSON
- [ ] Deliverable format:
  ```json
  {
    "character_id": 42,
    "character_slug": "alexis_texas",
    "character_name": "Alexis Texas",
    "voice_id": "abc123",
    "generated_at": "2026-03-18T12:00:00Z",
    "languages": ["en", "es"],
    "speech": {
      "greeting": {
        "en": [
          "Hey you... don't just stare.",
          "Mmm, hi, baby..."
        ],
        "es": [
          "Hola, cariño..."
        ]
      },
      "farewell": {
        "en": [
          "Bye for now, baby..."
        ]
      }
    }
  }
  ```
- [ ] Only includes entries with `status = approved`
- [ ] Variants ordered by `sort_order`
- [ ] Languages use ISO 639-1 codes
- [ ] Speech types use lowercase snake_case names
- [ ] Speech types ordered by `speech_types.sort_order` ascending (Greeting first, custom types at end)
- [ ] Returns 422 if no approved speech exists
- [ ] "Generate Deliverable" button in speech tab toolbar, downloads JSON file
- [ ] Bulk deliverable: POST `/api/v1/projects/:id/speech-deliverables` generates a zip of all character deliverables in the project

#### Requirement 1.9: Language Indicators on Character UI

**Description:** Show flag icons on character cards and the character detail page header indicating which languages have speech entries.

**Acceptance Criteria:**
- [ ] Backend: GET `/api/v1/characters/:id` response includes `speech_languages: [{ code, name, flag, speech_count }]`
- [ ] Character card displays flag emojis (e.g., 🇺🇸🇪🇸) next to the character name or below readiness indicators
- [ ] Character detail page header shows language flags with counts (e.g., 🇺🇸 24 🇪🇸 12)
- [ ] Clicking a flag on the detail page filters the speech tab to that language
- [ ] Characters with no speech show no flags

#### Requirement 1.10: Enhanced Speech Tab UI

**Description:** Update the CharacterSpeechTab to support language selection, approval workflow, ordering, and deliverable generation.

**Acceptance Criteria:**
- [ ] Language selector dropdown/tabs at top of speech tab (filter by language or show all)
- [ ] Each speech entry shows: text, language flag, status badge, sort order
- [ ] Inline approve/reject buttons per entry
- [ ] Bulk approve button (approve all draft in current filter)
- [ ] Drag-and-drop or arrow buttons for reordering within a group
- [ ] "Generate Deliverable" button in toolbar
- [ ] Add Speech modal updated with language selector (defaults to English)
- [ ] Grouped display: Type → Language → Variants (collapsible sections)

#### Requirement 1.11: Bulk Multi-Character Import

**Description:** Support importing speech from multi-character JSON files (like `greetings.json`) at the project level.

**Acceptance Criteria:**
- [ ] POST `/api/v1/projects/:id/speeches/import` accepts JSON body or file upload
- [ ] Supports the `greetings.json` format:
  ```json
  {
    "character_slug": {
      "speech_type": {
        "language_name": ["variant1", "variant2"]
      }
    }
  }
  ```
- [ ] Maps character slugs to character IDs via name matching (case-insensitive, underscore/space normalized)
- [ ] Maps language names to language IDs (case-insensitive: "english" → en, "spanish" → es)
- [ ] Maps speech type names to speech_type IDs (case-insensitive: "greeting" → Greeting); auto-creates missing types
- [ ] Returns import report: `{ imported, skipped, errors, characters_matched, characters_unmatched }`
- [ ] Unmatched characters listed in response for manual review
- [ ] New entries created as `draft` status by default
- [ ] Import UI accessible from Project Config tab or Speech Management page
- [ ] Drop zone + file picker + paste area (consistent with existing SpeechImportModal pattern)
- [ ] Preview showing matched/unmatched characters before confirming import
- [ ] Also supports CSV format: columns `character_slug, speech_type, language, text`

#### Requirement 1.12: Per-Character Speech Import Enhancement

**Description:** Update the existing per-character import (PRD-124) to support language.

**Acceptance Criteria:**
- [ ] Import JSON format extended: `{ "type": "greeting", "language": "en", "text": "Hello..." }` (language optional, defaults to "en")
- [ ] Import CSV format extended: `type,language,text` header (language column optional)
- [ ] SpeechImportModal updated with language selector for imports without per-row language
- [ ] Backward-compatible: files without language field still import as English

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: LLM-Powered Translation

**[OPTIONAL — Post-MVP]** Automatically translate speech entries from one language to others using an LLM.

**Acceptance Criteria:**
- [ ] "Translate" button per speech type group: translate all variants from source language to target language
- [ ] "Translate All" button: translate all speech for a character from English to configured project languages
- [ ] LLM translation uses character bio/personality/tone-of-voice as context for style matching
- [ ] Translated entries created as `draft` status for human review
- [ ] Translation diff view: side-by-side source and translated text before approval

#### Requirement 2.2: LLM Speech Generation from Character Profile

**[OPTIONAL — Post-MVP]** Generate speech text suggestions from character bio, personality, and tone-of-voice.

**Acceptance Criteria:**
- [ ] "Generate Suggestions" button per speech type: creates 3 variant suggestions
- [ ] LLM uses character metadata (bio, personality, tone) as context
- [ ] Generated entries created as `draft` for review
- [ ] Works for any language if character profile data exists

#### Requirement 2.3: TTS Preview (ElevenLabs)

**[OPTIONAL — Post-MVP]** Preview speech with the character's configured ElevenLabs voice.

**Acceptance Criteria:**
- [ ] Play button per speech entry sends text to ElevenLabs API and streams audio
- [ ] Uses character's `elevenlabs_voice` ID
- [ ] Caches generated audio to avoid repeated API calls
- [ ] Disabled when no VoiceID is configured

#### Requirement 2.4: Multilingual Metadata Translation

**[OPTIONAL — Post-MVP]** Translate character metadata values into multiple languages while keeping keys in English.

**Acceptance Criteria:**
- [ ] `character_metadata_translations` table: `id`, `character_id`, `language_id`, `metadata_json` (translated values)
- [ ] LLM translation pipeline triggered per character per target language
- [ ] Translation uses English metadata as source
- [ ] Review/approval workflow for translated metadata
- [ ] Deliverable export can include translated metadata

## 6. Non-Goals (Out of Scope)

- **UI internationalization (i18n)** — The application UI remains English-only; this PRD only addresses content multilingualism.
- **Audio file storage** — TTS audio generation and storage is deferred (except post-MVP preview).
- **Real-time translation** — All translation is batch/on-demand, not live.
- **Translation memory / TM tools** — No integration with professional translation management systems.
- **Language detection** — Users explicitly tag language; no auto-detection.
- **Right-to-left (RTL) rendering** — Speech text display does not handle RTL layout (Arabic, Hebrew). Text is stored correctly; rendering is a future concern.

## 7. Design Considerations

### Speech Tab Layout
- Language tabs or dropdown at top with SVG flag icons (🏴 English | 🏴 Spanish | All)
- Below: collapsible sections per speech type
- Within each section: variants listed with status badges, sort handles, inline edit, approve/reject buttons
- Toolbar: Add | Import | Export | Generate Deliverable | Bulk Approve

### Character Card Language Flags
- SVG flag icons from `circle-flags` (or similar) library — consistent rendering across all platforms (emoji flags render as two-letter codes on Windows/some Linux)
- `flag_code` column on `languages` table maps to SVG filenames (e.g., `us.svg`, `es.svg`)
- Small circular flags displayed in a row below the readiness indicators
- Maximum 5 flags visible; "+N more" overflow for characters with many languages

### Project Speech Config
- Matrix/grid in Project Config tab: rows = speech types, columns = languages
- Checkboxes to enable/disable, number input for min_variants
- "Apply defaults" button to set common configuration

### Import Preview
- Two-column layout: left = matched characters with green checkmarks, right = unmatched slugs with warning icons
- Expandable per-character preview showing what will be imported
- "Import Matched" / "Skip Unmatched" action buttons

## 8. Technical Considerations

### Existing Code to Reuse
- `speech_types` table and `SpeechTypeRepo` — extend, don't replace
- `character_speeches` table and `CharacterSpeechRepo` — add columns, update queries
- `CharacterSpeechTab`, `AddSpeechModal`, `SpeechImportModal` — enhance in-place
- `use-character-speeches.ts` hooks — add language params and new hooks
- Character readiness computation (PRD-128) — extend speech section logic
- Import/export handler patterns from `character_speech.rs`
- `BlockingDeliverablesEditor` shared component — add speech option

### New Infrastructure Needed
- `languages` table + `LanguageRepo` + handler + route
- `speech_statuses` table + seeding
- `project_speech_config` table + `ProjectSpeechConfigRepo` + handler + route
- Deliverable JSON generation logic
- Bulk multi-character import endpoint
- Speech completeness computation query
- Language aggregation query for character cards

### Database Changes
- New tables: `languages`, `speech_statuses`, `project_speech_config`
- Altered table: `character_speeches` — add `language_id`, `status_id`, `sort_order` columns
- Altered table: `speech_types` — add `sort_order INT NOT NULL DEFAULT 0`, backfill seeded types: Greeting=1, Farewell=2, Flirty=3, Excited=4, Neutral=5, Whisper=6, Angry=7, Sad=8
- Updated constraints: unique constraint includes `language_id`
- New indexes: `language_id`, `status_id` on `character_speeches`

### API Changes

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/v1/languages` | **New** — list languages |
| POST | `/api/v1/languages` | **New** — create language |
| GET | `/api/v1/characters/:id/speeches` | **Modified** — returns language, status; accepts `?language_id`, `?group_by` |
| POST | `/api/v1/characters/:id/speeches` | **Modified** — accepts `language_id` |
| PUT | `/api/v1/characters/:id/speeches/:speechId/status` | **New** — update approval status |
| POST | `/api/v1/characters/:id/speeches/bulk-approve` | **New** — bulk approve |
| PUT | `/api/v1/characters/:id/speeches/reorder` | **New** — reorder variants |
| POST | `/api/v1/characters/:id/speeches/deliverable` | **New** — generate deliverable JSON |
| GET | `/api/v1/characters/:id/speech-completeness` | **New** — completeness stats |
| GET | `/api/v1/projects/:id/speech-config` | **New** — get speech config |
| PUT | `/api/v1/projects/:id/speech-config` | **New** — set speech config |
| POST | `/api/v1/projects/:id/speeches/import` | **New** — bulk multi-character import |
| POST | `/api/v1/projects/:id/speech-deliverables` | **New** — bulk deliverable zip |

### Migration Strategy
- `languages` table created and seeded first (English = id 1)
- `speech_statuses` table created and seeded (draft = id 1, approved = id 2, rejected = id 3)
- `character_speeches` altered: `language_id DEFAULT 1`, `status_id DEFAULT 1`, `sort_order DEFAULT 0`
- Existing rows backfilled: `language_id = 1` (English), `status_id = 1` (draft), `sort_order` assigned sequentially per (character, type) group
- Old unique constraint dropped, new one created including `language_id`
- All changes in a single migration file for atomicity

## 9. Success Metrics

- All existing speech data migrated with English language assignment — zero data loss
- Deliverable JSON passes schema validation for every character with approved speech
- Import of `greetings.json` correctly maps all 66 characters and creates entries in ≤5 seconds
- Speech completeness accurately reflects configured requirements per project
- Language flags visible on character cards within 1 render cycle of data load

## 10. Resolved Decisions

1. **Flag rendering** — **SVG icons** (e.g., `circle-flags` library). Emoji flags render inconsistently across platforms (Windows shows two-letter codes). SVGs give pixel-perfect circular flags everywhere.
2. **Default languages per project** — **English-only** by default. Additional languages added per project config.
3. **Deliverable filename convention** — **`{character_slug}_speech.json`** (slug-based, human-readable).
4. **Approval granularity** — **Per-entry**. Individual speech entries are approved/rejected. Bulk approve is a convenience action that approves all draft entries matching a filter.
5. **Speech type ordering** — **Explicit `sort_order`** column on `speech_types`. Seeded order: Greeting(1), Farewell(2), Flirty(3), Excited(4), Neutral(5), Whisper(6), Angry(7), Sad(8). Custom types appended at end. Deliverable JSON and UI both respect this order.

## 11. Open Questions

(None — all resolved)

## 12. Version History

- **v1.0** (2026-03-18): Initial PRD creation
- **v1.1** (2026-03-18): Resolved open questions — SVG flags, English default, slug filenames, per-entry approval, explicit speech type sort order
