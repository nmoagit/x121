# Task List: Character Settings Dashboard

**PRD Reference:** `design/prds/108-prd-character-settings-dashboard.md`
**Scope:** Single-page per-character dashboard aggregating ALL settings (identity, images, variants, metadata, pipeline settings, scene assignments, generation history) with prominent missing items section and inline editing.

## Overview

Each character accumulates configuration across multiple domains scattered across different screens. This dashboard provides a unified "control panel" view for each character. The key innovation is the **missing items section** at the top -- it prominently shows what is not yet configured and provides direct action buttons to fix each item. The dashboard also supports inline editing of pipeline settings so creators can fix issues without navigating away.

### What Already Exists
- PRD-001: Character entity with metadata JSONB and settings JSONB
- PRD-013: Dual metadata system (character_metadata, video_metadata)
- PRD-021: Source image management and variant generation
- PRD-023: Scene type configuration
- PRD-029: Design system (shared components)
- PRD-060: Character library (cross-project)
- PRD-066: Character metadata editor (form view, completeness indicator)
- PRD-107: Character readiness & state view (readiness computation engine)

### What We're Building
1. Dashboard page with organized sections for all character configuration
2. Missing items section driven by PRD-107 readiness engine
3. Inline pipeline settings editor (JSONB settings from PRD-001)
4. Aggregated data API endpoint (single call for all dashboard data)
5. Dashboard sections: Identity, Images, Variants, Metadata, Settings, Scene Assignments, History

### Key Design Decisions
1. **Single API call** -- The dashboard aggregates data from multiple tables. A dedicated aggregation endpoint avoids N+1 round trips from the frontend.
2. **Reuse PRD-107 readiness engine** -- The missing items section reuses the readiness computation from PRD-107 rather than reimplementing.
3. **Inline editing for settings only** -- Settings are edited inline on the dashboard. Metadata and images link to their dedicated editors (PRD-066, PRD-021) to avoid duplicating complex UIs.
4. **Progressive loading** -- Identity and missing items load first; heavier sections (generation history, scene assignments) lazy-load.

---

## Phase 1: Backend Data Aggregation

### Task 1.1: Dashboard Aggregation Service
**File:** `src/services/character_dashboard_service.rs`

```rust
pub struct CharacterDashboardData {
    // Identity
    pub character: Character,  // includes settings JSONB
    pub project_name: String,

    // Images
    pub source_images: Vec<SourceImage>,
    pub approved_variants: Vec<ImageVariant>,
    pub pending_variants: Vec<ImageVariant>,

    // Metadata
    pub metadata_completeness: MetadataCompleteness,  // from PRD-066
    pub metadata_preview_json: Option<serde_json::Value>,  // from PRD-013

    // Readiness
    pub readiness: ReadinessResult,  // from PRD-107
    pub missing_items: Vec<MissingItem>,

    // Scene assignments
    pub scene_assignments: Vec<SceneAssignment>,

    // Generation history summary
    pub generation_summary: GenerationSummary,
}

pub struct MissingItem {
    pub key: String,            // e.g., "elevenlabs_voice"
    pub label: String,          // e.g., "ElevenLabs Voice"
    pub category: String,       // e.g., "Pipeline Settings"
    pub action_url: String,     // e.g., "/characters/42/settings"
    pub action_label: String,   // e.g., "Configure Voice"
}

pub struct SceneAssignment {
    pub scene_type_name: String,
    pub variant_label: String,
    pub status: String,
    pub scene_id: Option<DbId>,
}

pub struct GenerationSummary {
    pub total_segments: i32,
    pub approved_segments: i32,
    pub rejected_segments: i32,
    pub pending_segments: i32,
    pub last_generation_at: Option<DateTime<Utc>>,
    pub avg_quality_score: Option<f64>,
}

pub async fn get_character_dashboard(
    pool: &sqlx::PgPool,
    character_id: DbId,
) -> Result<CharacterDashboardData, anyhow::Error> {
    // 1. Load character (with settings)
    // 2. Load source images and variants
    // 3. Get metadata completeness from PRD-066 service
    // 4. Get readiness from PRD-107 service
    // 5. Build missing items list with actionable URLs
    // 6. Load scene assignments with status
    // 7. Compute generation summary from segments table
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Single service call aggregates all dashboard data
- [ ] Reuses PRD-107 readiness engine for missing items
- [ ] Reuses PRD-066 completeness logic for metadata status
- [ ] Includes scene assignment status from scenes table
- [ ] Includes generation summary (counts, dates, quality scores)
- [ ] Missing items include actionable labels and URLs
- [ ] Completes in <3 seconds for a fully populated character

### Task 1.2: Dashboard API Endpoint
**File:** `src/routes/character_dashboard_routes.rs`

```rust
/// GET /api/characters/:id/dashboard — Aggregated dashboard data
pub async fn get_dashboard_handler(
    State(pool): State<PgPool>,
    Path(character_id): Path<DbId>,
) -> Result<Json<CharacterDashboardData>, ApiError> {
    let data = get_character_dashboard(&pool, character_id).await?;
    Ok(Json(data))
}
```

**Acceptance Criteria:**
- [ ] Returns all dashboard sections in a single response
- [ ] 404 if character not found
- [ ] Response includes readiness state, missing items, all sections
- [ ] Response is JSON-serializable with proper date formatting

---

## Phase 2: Settings Inline Editor

### Task 2.1: Settings PATCH Endpoint
**File:** `src/routes/character_settings_routes.rs`

```rust
/// PATCH /api/characters/:id/settings — Partial update of settings JSONB
pub async fn patch_settings_handler(
    State(pool): State<PgPool>,
    Path(character_id): Path<DbId>,
    Json(updates): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Merge updates into existing settings JSONB using PostgreSQL || operator
    // UPDATE characters SET settings = settings || $1 WHERE id = $2 RETURNING settings
    // Invalidate readiness cache after update
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Merges partial updates into existing settings (does not replace entire object)
- [ ] Returns updated settings after merge
- [ ] Invalidates PRD-107 readiness cache after settings change
- [ ] Validates that updates is a valid JSON object
- [ ] Supports adding new arbitrary keys

---

## Phase 3: Frontend Components

### Task 3.1: Dashboard Page
**File:** `frontend/src/pages/CharacterDashboard.tsx`

```typescript
export function CharacterDashboard({ characterId }: { characterId: number }) {
  // Fetch dashboard data via GET /api/characters/:id/dashboard
  // Render sections:
  //   1. Missing Items Banner (top, collapsible)
  //   2. Identity & Images
  //   3. Pipeline Settings (inline editable)
  //   4. Metadata Summary
  //   5. Scene Assignments
  //   6. Generation History
  // Progressive loading: identity + missing items first, rest lazy
}
```

**Acceptance Criteria:**
- [ ] Single-page layout with organized sections
- [ ] Breadcrumb navigation: Library > Character Name > Dashboard
- [ ] Accessible from character library, character detail, or direct URL
- [ ] Responsive: sections stack on narrow screens, side-by-side on wide
- [ ] Progressive loading: identity + missing items load first

### Task 3.2: Missing Items Banner
**File:** `frontend/src/components/dashboard/MissingItemsBanner.tsx`

```typescript
interface MissingItemsBannerProps {
  missingItems: MissingItem[];
  readinessState: 'ready' | 'partially_ready' | 'not_started';
}

export function MissingItemsBanner({ missingItems, readinessState }: MissingItemsBannerProps) {
  // Prominent banner at top of dashboard
  // When items are missing: checklist with action buttons
  // When all complete: green "All settings configured" message
  // Collapsible after all items are resolved
}
```

**Acceptance Criteria:**
- [ ] Checklist of missing items with action buttons
- [ ] Each item shows: what is missing, why it matters, action button
- [ ] Action buttons navigate to the relevant setup screen
- [ ] Green "All settings configured" when nothing is missing
- [ ] Collapsible when all items are resolved
- [ ] Warning-style banner styling (yellow/orange for partially ready, red for not started)

### Task 3.3: Pipeline Settings Editor
**File:** `frontend/src/components/dashboard/PipelineSettingsEditor.tsx`

```typescript
interface PipelineSettingsEditorProps {
  settings: Record<string, any>;
  onSave: (updates: Record<string, any>) => Promise<void>;
}

export function PipelineSettingsEditor({ settings, onSave }: PipelineSettingsEditorProps) {
  // Display all configured settings with edit capability
  // Known fields: a2c4_model (text), elevenlabs_voice (text), avatar_json (file upload)
  // Unknown/custom fields: generic key-value editor
  // "Add Setting" button for new arbitrary keys
  // Save sends PATCH /api/characters/:id/settings
}
```

**Acceptance Criteria:**
- [ ] Displays all settings from character's settings JSONB
- [ ] Known fields have appropriate input types (text, file upload, dropdown)
- [ ] Custom fields use generic key-value editor
- [ ] "Add Setting" button adds new key-value pair
- [ ] Inline save via PATCH endpoint
- [ ] Visual distinction: configured (filled) vs. missing (empty/placeholder)
- [ ] Save triggers readiness recalculation (visible in missing items banner)

### Task 3.4: Metadata Summary Section
**File:** `frontend/src/components/dashboard/MetadataSummarySection.tsx`

```typescript
export function MetadataSummarySection({ completeness, previewJson }: MetadataSectionProps) {
  // Progress bar showing required fields filled vs. total
  // List of required fields with filled/missing status
  // "Open in Metadata Editor" button linking to PRD-066
  // Preview of generated metadata.json (collapsible)
}
```

**Acceptance Criteria:**
- [ ] Progress bar reuses PRD-066 completeness indicator
- [ ] List of required fields with status (filled/missing)
- [ ] "Open in Metadata Editor" button navigates to PRD-066
- [ ] Collapsible metadata.json preview panel
- [ ] Simple fields editable inline; complex editing deferred to PRD-066

### Task 3.5: Scene Assignments Section
**File:** `frontend/src/components/dashboard/SceneAssignmentsSection.tsx`

```typescript
export function SceneAssignmentsSection({ assignments }: { assignments: SceneAssignment[] }) {
  // Table of assigned scene types with status per variant
  // Columns: scene type, variant, status (badge), prompt override indicator
  // Links to scene type config (PRD-23) and batch orchestrator (PRD-57)
}
```

**Acceptance Criteria:**
- [ ] Table showing scene type, variant, and status per assignment
- [ ] Color-coded status badges (not started, generating, approved, etc.)
- [ ] Link to scene type configuration (PRD-23)
- [ ] Link to batch orchestrator view for this character (PRD-57)

### Task 3.6: Generation History Section
**File:** `frontend/src/components/dashboard/GenerationHistorySection.tsx`

```typescript
export function GenerationHistorySection({ summary }: { summary: GenerationSummary }) {
  // Summary stats: total segments, approved, rejected, pending
  // Last generation date
  // Average quality score (if available from PRD-94)
  // "View Full History" link
}
```

**Acceptance Criteria:**
- [ ] Segment counts: total, approved, rejected, pending
- [ ] Last generation date and duration
- [ ] Average quality score if available
- [ ] "View Full History" link to detailed view

---

## Phase 4: Testing

### Task 4.1: Dashboard Aggregation Tests
**File:** `tests/character_dashboard_test.rs`

**Acceptance Criteria:**
- [ ] Dashboard returns all sections populated for a fully configured character
- [ ] Missing items correctly identify each missing criterion
- [ ] Dashboard returns empty/default sections for a new character
- [ ] Settings PATCH correctly merges partial updates
- [ ] Settings PATCH invalidates readiness cache
- [ ] Dashboard loads in <3 seconds for a character with 50+ segments

### Task 4.2: Frontend Component Tests
**File:** `frontend/tests/CharacterDashboard.test.tsx`

**Acceptance Criteria:**
- [ ] Missing items banner renders correctly for each state
- [ ] Settings editor saves and updates inline
- [ ] All sections render without errors for various data states
- [ ] Navigation links work correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/services/character_dashboard_service.rs` | Dashboard data aggregation service |
| `src/routes/character_dashboard_routes.rs` | Dashboard API endpoint |
| `src/routes/character_settings_routes.rs` | Settings PATCH endpoint |
| `frontend/src/pages/CharacterDashboard.tsx` | Dashboard page |
| `frontend/src/components/dashboard/MissingItemsBanner.tsx` | Missing items banner |
| `frontend/src/components/dashboard/PipelineSettingsEditor.tsx` | Settings inline editor |
| `frontend/src/components/dashboard/MetadataSummarySection.tsx` | Metadata summary |
| `frontend/src/components/dashboard/SceneAssignmentsSection.tsx` | Scene assignments |
| `frontend/src/components/dashboard/GenerationHistorySection.tsx` | Generation history |

## Dependencies

### Existing Components to Reuse
- PRD-001: Character entity with settings JSONB
- PRD-029: Design system components
- PRD-060: Character library navigation
- PRD-066: Metadata completeness indicator
- PRD-107: Readiness computation engine and cache

### New Infrastructure Needed
- Dashboard data aggregation service
- Settings inline editor component
- Settings PATCH endpoint with JSONB merge

## Implementation Order

### MVP
1. Phase 1: Backend -- Tasks 1.1-1.2
2. Phase 2: Settings Editor -- Task 2.1
3. Phase 3: Frontend -- Tasks 3.1-3.3

**MVP Success Criteria:**
- Dashboard loads all sections for any character
- Missing items correctly identify incomplete configuration
- Settings can be edited inline and saved
- Missing items banner updates after settings change

### Post-MVP Enhancements
1. Phase 3: Tasks 3.4-3.6 (remaining sections)
2. Phase 4: Testing
3. Settings comparison between characters (PRD-108 Req 2.1)
4. Settings templates (PRD-108 Req 2.2)

## Notes

1. **No database changes needed** -- This dashboard reads from existing tables. The only new endpoint is the aggregation endpoint and settings PATCH. The readiness tables are created by PRD-107.
2. **Settings JSONB merge** -- PostgreSQL supports `settings || $1` for JSONB merge. This allows partial updates without replacing the entire settings object.
3. **Progressive loading** -- The dashboard should use React Suspense or similar to load identity + missing items first, then lazy-load heavier sections. This ensures the most important information (what's missing) appears immediately.
4. **PRD-107 dependency** -- The missing items section depends on PRD-107's readiness computation engine. If PRD-107 is not yet implemented, a simplified version can be built inline and later refactored.

---

## Version History

- **v1.0** (2026-02-19): Initial task list creation from PRD-108 v1.0
