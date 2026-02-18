# Task List: Project Configuration Templates

**PRD Reference:** `design/prds/074-prd-project-configuration-templates.md`
**Scope:** Export and import complete project configurations (scene types, workflows, LoRA assignments, prompts, durations) as reusable JSON scaffolds, with a studio-level config library, selective import, and config diff.

## Overview

When studios create new projects with the same scene types and settings as previous ones, they should not reconfigure from scratch. This feature enables exporting a project's full configuration as a portable JSON file, importing it when creating new projects, selective import of specific scene types, and a config diff showing what will change when importing into an existing project. A studio-level library stores versioned configurations.

### What Already Exists
- PRD-023: Scene types, PRD-027: Templates

### What We're Building
1. `project_configs` table for configuration library
2. Config serializer/deserializer (project -> JSON -> project)
3. Selective import with dependency resolution
4. Config diff engine
5. Config library UI

### Key Design Decisions
1. **JSON format** — Configurations exported as self-contained JSON including all scene types and their dependencies.
2. **Validation on import** — Referenced workflows/LoRAs validated to exist in the target environment.
3. **Diff before apply** — Importing into an existing project shows a before/after diff for review.

---

## Phase 1: Database Schema

### Task 1.1: Project Configs Table
**File:** `migrations/YYYYMMDD_create_project_configs.sql`

```sql
CREATE TABLE project_configs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    config_json JSONB NOT NULL,
    source_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_recommended BOOLEAN NOT NULL DEFAULT false,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_configs_created_by_id ON project_configs(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Export/Import Services

### Task 2.1: Config Export Service
**File:** `src/services/project_config_service.rs`

```rust
pub async fn export_config(pool: &sqlx::PgPool, project_id: DbId) -> Result<serde_json::Value, anyhow::Error> {
    // Export: scene types, workflow assignments, prompt templates,
    // duration settings, variant applicability, retry policies
    todo!()
}
```

### Task 2.2: Config Import Service
**File:** `src/services/project_config_service.rs`

```rust
pub async fn import_config(pool: &sqlx::PgPool, project_id: DbId, config: &serde_json::Value, selected_scene_types: Option<&[String]>) -> Result<ImportResult, anyhow::Error> {
    // 1. Validate referenced workflows/LoRAs exist
    // 2. If selective: import only selected scene types
    // 3. Resolve dependencies (workflow included if scene type needs it)
    // 4. Create scene types in target project
    todo!()
}
```

### Task 2.3: Config Diff Service
**File:** `src/services/project_config_diff_service.rs`

**Acceptance Criteria:**
- [ ] Side-by-side: added, changed, unchanged scene types
- [ ] Returns structured diff for UI rendering

---

## Phase 3: API & Frontend

### Task 3.1: Config API
**File:** `src/routes/project_config_routes.rs`

```rust
/// POST /api/projects/:id/export-config
/// POST /api/projects/import-config
/// CRUD /api/project-configs — Library management
/// POST /api/project-configs/:id/diff/:project_id — Diff against project
```

### Task 3.2: Config Library Browser
**File:** `frontend/src/components/config/ConfigLibrary.tsx`

**Acceptance Criteria:**
- [ ] Catalog with preview cards
- [ ] Admin can mark as recommended
- [ ] One-click import during new project creation

### Task 3.3: Config Diff View
**File:** `frontend/src/components/config/ConfigDiffView.tsx`

**Acceptance Criteria:**
- [ ] Shows what will be added, changed, remain untouched
- [ ] Accept or cancel after review

### Task 3.4: Selective Import UI
**File:** `frontend/src/components/config/SelectiveImport.tsx`

**Acceptance Criteria:**
- [ ] Checkbox per scene type
- [ ] Dependencies auto-included

---

## Phase 4: Testing

### Task 4.1: Config Tests
**File:** `tests/project_config_test.rs`

**Acceptance Criteria:**
- [ ] Export captures all scene types
- [ ] Import creates scene types correctly
- [ ] Missing dependencies flagged
- [ ] Selective import resolves dependencies

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_project_configs.sql` | Config library |
| `src/services/project_config_service.rs` | Export/import |
| `src/services/project_config_diff_service.rs` | Diff engine |
| `src/routes/project_config_routes.rs` | Config API |
| `frontend/src/components/config/ConfigLibrary.tsx` | Library browser |
| `frontend/src/components/config/ConfigDiffView.tsx` | Diff view |
| `frontend/src/components/config/SelectiveImport.tsx` | Selective import |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.2
3. Phase 3 — Tasks 3.1-3.2

### Post-MVP
1. Phase 2 — Task 2.3 (Diff)
2. Phase 3 — Tasks 3.3-3.4
3. Config auto-sync (subscribe to master config)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-074 v1.0
