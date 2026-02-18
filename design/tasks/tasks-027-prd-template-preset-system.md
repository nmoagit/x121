# Task List: Template & Preset System

**PRD Reference:** `design/prds/027-prd-template-preset-system.md`
**Scope:** Save reusable workflow templates and parameter presets with personal/project/studio scope levels, a marketplace for discovering shared presets, versioning, and override transparency.

## Overview

Once creators discover "known good" generation recipes, they need a structured way to save, share, and reuse them. This feature provides saved workflow templates (full ComfyUI configurations with named parameter slots), parameter presets (packaged LoRA weights, CFG, prompts, durations), scope levels (personal, project, studio), a marketplace for browsing and applying team members' presets, and usage statistics with quality ratings.

### What Already Exists
- PRD-023: Scene type configuration (the entity presets apply to)
- PRD-033: Workflow canvas (visual workflow editing)
- PRD-075: ComfyUI workflow parameter discovery

### What We're Building
1. `templates` and `presets` tables with scope and versioning
2. Preset application engine with override transparency
3. Marketplace service with ratings and usage tracking
4. Template/preset CRUD with scope management
5. Marketplace UI with browsing, filtering, and application

### Key Design Decisions
1. **Templates vs. presets** — Templates are full workflow configurations; presets are partial parameter bundles that can be applied to scene types. Both are first-class entities.
2. **Scope hierarchy** — Personal (user only) < Project (project members) < Studio (all users). Scope set at creation, changeable by owner.
3. **Versioning on edit** — Editing a template/preset creates a new version, preserving the old version for rollback.
4. **Override transparency** — When applying a preset, the UI shows which parameters will change from their current values.

---

## Phase 1: Database Schema

### Task 1.1: Templates Table
**File:** `migrations/YYYYMMDD_create_templates.sql`

```sql
CREATE TABLE templates (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scope TEXT NOT NULL DEFAULT 'personal',  -- 'personal', 'project', 'studio'
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    workflow_config JSONB NOT NULL,
    parameter_slots JSONB,  -- Named configurable parameters
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_owner_id ON templates(owner_id);
CREATE INDEX idx_templates_project_id ON templates(project_id);
CREATE INDEX idx_templates_scope ON templates(scope);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Templates store full workflow configurations
- [ ] Scope levels: personal, project, studio
- [ ] Versioned: editing creates a new version
- [ ] Owner tracking for marketplace attribution

### Task 1.2: Presets Table
**File:** `migrations/YYYYMMDD_create_presets.sql`

```sql
CREATE TABLE presets (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scope TEXT NOT NULL DEFAULT 'personal',
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    parameters JSONB NOT NULL,  -- {lora_weights: [...], cfg_scale: 7.5, prompt: "...", duration: 30, ...}
    version INTEGER NOT NULL DEFAULT 1,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_presets_owner_id ON presets(owner_id);
CREATE INDEX idx_presets_project_id ON presets(project_id);
CREATE INDEX idx_presets_scope ON presets(scope);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON presets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Presets store partial parameter bundles
- [ ] Same scope model as templates
- [ ] Usage count tracked for marketplace ranking

### Task 1.3: Preset Ratings Table
**File:** `migrations/YYYYMMDD_create_preset_ratings.sql`

```sql
CREATE TABLE preset_ratings (
    id BIGSERIAL PRIMARY KEY,
    preset_id BIGINT NOT NULL REFERENCES presets(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_preset_ratings_preset_id ON preset_ratings(preset_id);
CREATE INDEX idx_preset_ratings_user_id ON preset_ratings(user_id);
CREATE UNIQUE INDEX uq_preset_ratings_user_preset ON preset_ratings(preset_id, user_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON preset_ratings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] 1-5 star rating per user per preset
- [ ] One rating per user per preset (upsert on re-rate)
- [ ] Optional comment

---

## Phase 2: Template & Preset Services

### Task 2.1: Template Service
**File:** `src/services/template_service.rs`

```rust
pub async fn create_template(pool: &sqlx::PgPool, input: CreateTemplateInput) -> Result<DbId, anyhow::Error> { todo!() }
pub async fn update_template(pool: &sqlx::PgPool, id: DbId, input: UpdateTemplateInput) -> Result<DbId, anyhow::Error> {
    // Creates new version, preserves old
    todo!()
}
pub async fn list_templates(pool: &sqlx::PgPool, user_id: DbId, project_id: Option<DbId>) -> Result<Vec<Template>, sqlx::Error> {
    // Return: user's personal + project-level + studio-level templates
    todo!()
}
```

**Acceptance Criteria:**
- [ ] CRUD with versioning (edit creates new version)
- [ ] Scope-aware listing (personal + project + studio)
- [ ] Apply template to scene type configuration

### Task 2.2: Preset Application Engine
**File:** `src/services/preset_application_service.rs`

```rust
pub struct OverrideDiff {
    pub field: String,
    pub current_value: serde_json::Value,
    pub preset_value: serde_json::Value,
}

pub async fn preview_preset_application(
    pool: &sqlx::PgPool,
    scene_type_id: DbId,
    preset_id: DbId,
) -> Result<Vec<OverrideDiff>, anyhow::Error> {
    // Compare current scene type values with preset values
    // Return list of what would change
    todo!()
}

pub async fn apply_preset(
    pool: &sqlx::PgPool,
    scene_type_id: DbId,
    preset_id: DbId,
) -> Result<(), anyhow::Error> {
    // Apply preset parameters to scene type
    // Increment usage_count
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Preview shows which values will change (before/after)
- [ ] Apply updates scene type with preset values
- [ ] Usage count incremented on application
- [ ] One-click application from marketplace

---

## Phase 3: Marketplace Service

### Task 3.1: Marketplace API
**File:** `src/routes/marketplace_routes.rs`

```rust
/// GET /api/presets/marketplace — Browse shared presets
/// POST /api/presets/:id/rate — Rate a preset (1-5 stars)
/// POST /api/presets/:id/apply/:scene_type_id — Apply preset to scene type
/// GET /api/presets/:id/diff/:scene_type_id — Preview what would change
```

**Acceptance Criteria:**
- [ ] Browse all shared presets (project + studio scope)
- [ ] Sort by popularity (usage_count), rating, or recency
- [ ] Rate presets with 1-5 stars
- [ ] Apply directly from marketplace

---

## Phase 4: Frontend Components

### Task 4.1: Preset Marketplace Page
**File:** `frontend/src/components/presets/PresetMarketplace.tsx`

**Acceptance Criteria:**
- [ ] Card-based catalog layout with name, author, description, rating, usage count
- [ ] Sort/filter by popularity, rating, recency, author
- [ ] One-click apply with diff preview
- [ ] Personal vs. shared presets distinguished

### Task 4.2: Override Transparency Dialog
**File:** `frontend/src/components/presets/OverridePreviewDialog.tsx`

**Acceptance Criteria:**
- [ ] Side-by-side: current values vs. preset values
- [ ] Changed fields highlighted
- [ ] Confirm or cancel application

### Task 4.3: Template/Preset Editor
**File:** `frontend/src/components/presets/PresetEditor.tsx`

**Acceptance Criteria:**
- [ ] Create/edit presets with all parameter fields
- [ ] Scope selection: personal, project, studio
- [ ] Version history sidebar

---

## Phase 5: Testing

### Task 5.1: Preset Application Tests
**File:** `tests/preset_application_test.rs`

**Acceptance Criteria:**
- [ ] Preview correctly identifies changed fields
- [ ] Apply updates scene type values
- [ ] Usage count incremented
- [ ] Scope visibility correct (personal not visible to others)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_templates.sql` | Templates table |
| `migrations/YYYYMMDD_create_presets.sql` | Presets table |
| `migrations/YYYYMMDD_create_preset_ratings.sql` | Ratings table |
| `src/services/template_service.rs` | Template CRUD |
| `src/services/preset_application_service.rs` | Preset application with diff |
| `src/routes/marketplace_routes.rs` | Marketplace API |
| `frontend/src/components/presets/PresetMarketplace.tsx` | Marketplace UI |
| `frontend/src/components/presets/OverridePreviewDialog.tsx` | Diff preview |
| `frontend/src/components/presets/PresetEditor.tsx` | Editor |

## Dependencies

### Existing Components to Reuse
- PRD-023: Scene type configuration (target for preset application)
- PRD-075: Workflow parameter discovery

## Implementation Order

### MVP
1. Phase 1: Database Schema — Tasks 1.1-1.2
2. Phase 2: Services — Tasks 2.1-2.2
3. Phase 3: API — Task 3.1
4. Phase 4: Frontend — Tasks 4.1-4.2

### Post-MVP Enhancements
1. Phase 1: Task 1.3 (Ratings)
2. Phase 4: Task 4.3 (Editor)
3. Phase 5: Testing
4. Template inheritance (child presets override parent)

## Notes

1. **Presets vs. project config templates (PRD-074):** Presets are generation parameter bundles applied to individual scene types. Project config templates (PRD-074) are full project scaffolds including all scene types. Different scope and granularity.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-027 v1.0
