# Task List: Pipeline-Scoped Imports and Storage

**PRD Reference:** `design/prds/141-prd-pipeline-scoped-imports-and-storage.md`
**Scope:** Pipeline-configurable import rules, pipeline-isolated avatar records, pipeline-scoped storage, naming engine pipeline integration.

## Overview

This implementation replaces all hardcoded import patterns with pipeline-configurable rules, adds pipeline isolation to avatar records and physical storage, and integrates the naming engine with a three-tier template hierarchy (platform → pipeline → project). The import rule matching engine uses the same token vocabulary as the naming engine for consistency.

### What Already Exists
- `pipelines` table with `seed_slots`, `naming_rules`, `delivery_config` JSONB (PRD-138)
- Naming engine (`naming_engine.rs`) with token substitution, 12 categories, NamingContext (PRD-116)
- `pipeline_video_filename()` in `naming.rs` using `PipelineNamingRules` (PRD-138)
- Avatar ingest with seed slot validation via `validate_seed_images()` (PRD-139)
- Frontend `suggestImageCategory()` already matches against pipeline seed slot names
- Delivery assembly already loads pipeline naming rules for video filename resolution
- `NamingContext.prefix_rules` already maps track slug → filename prefix

### What We're Building
1. `import_rules` JSONB on pipelines table with configurable file patterns
2. Import rule matching engine (core crate) — pattern parsing, filename classification
3. Pipeline-scoped storage paths (`{storage_root}/{pipeline_code}/...`)
4. Naming engine pipeline tier (platform → pipeline → project hierarchy)
5. Pipeline-isolated duplicate detection
6. Import rules admin UI
7. File migration for existing x121 data

### Key Design Decisions
1. Import rules use the same token vocabulary as the naming engine — `{avatar}`, `{scene_type}`, `{track}`, `{ext}`
2. Storage paths gain pipeline code prefix — backward compatible with path fallback for existing files
3. Naming engine templates stored per-pipeline in JSONB — no new tables needed
4. Duplicate detection scoped by pipeline_id on the project — avatars in different pipelines never conflict
5. x121 import rules seed data reproduces current hardcoded behavior exactly

---

## Phase 1: Database & Configuration

### Task 1.1: Add import_rules column to pipelines table
**File:** `apps/db/migrations/{timestamp}_add_import_rules_to_pipelines.sql`

Add `import_rules` JSONB column to the pipelines table.

```sql
ALTER TABLE pipelines ADD COLUMN import_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
```

**Acceptance Criteria:**
- [ ] `import_rules` column added with JSONB type and empty object default
- [ ] Migration runs without errors on existing data

### Task 1.2: Seed import rules for x121 and y122
**File:** `apps/db/migrations/{timestamp}_seed_pipeline_import_rules.sql`

Populate import rules matching current hardcoded x121 behavior and y122 single-seed behavior.

```sql
UPDATE pipelines SET import_rules = '{
  "seed_patterns": [
    {"slot": "clothed", "pattern": "{avatar}_clothed.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "clothed", "pattern": "clothed.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "topless", "pattern": "{avatar}_topless.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "topless", "pattern": "topless.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]}
  ],
  "video_patterns": [
    {"pattern": "{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "{track}_{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "topless_{scene_type}.{ext}", "extensions": ["mp4"]}
  ],
  "metadata_patterns": [
    {"type": "bio", "pattern": "bio.json"},
    {"type": "tov", "pattern": "tov.json"},
    {"type": "metadata", "pattern": "metadata.json"}
  ],
  "case_sensitive": false
}'::jsonb WHERE code = 'x121';

UPDATE pipelines SET import_rules = '{
  "seed_patterns": [
    {"slot": "reference", "pattern": "{avatar}.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "reference", "pattern": "reference.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]}
  ],
  "video_patterns": [
    {"pattern": "{scene_type}.{ext}", "extensions": ["mp4"]}
  ],
  "metadata_patterns": [
    {"type": "bio", "pattern": "bio.json"},
    {"type": "tov", "pattern": "tov.json"}
  ],
  "case_sensitive": false
}'::jsonb WHERE code = 'y122';
```

**Acceptance Criteria:**
- [ ] x121 rules match current hardcoded behavior (clothed/topless seed images, scene type videos)
- [ ] y122 rules match single "reference" seed image
- [ ] Both include metadata patterns for bio/tov JSON

### Task 1.3: Add import_rules to Pipeline model and DTOs
**Files:** `apps/backend/crates/db/src/models/pipeline.rs`, `apps/backend/crates/core/src/pipeline.rs`

Add `import_rules` field to Pipeline model and create typed structs for import rule parsing.

```rust
// In pipeline model
pub struct Pipeline {
    // ... existing fields
    pub import_rules: serde_json::Value,
}

// In core pipeline types
pub struct ImportRules {
    pub seed_patterns: Vec<SeedPattern>,
    pub video_patterns: Vec<VideoPattern>,
    pub metadata_patterns: Vec<MetadataPattern>,
    pub case_sensitive: bool,
}

pub struct SeedPattern {
    pub slot: String,
    pub pattern: String,
    pub extensions: Vec<String>,
}

pub struct VideoPattern {
    pub pattern: String,
    pub extensions: Vec<String>,
}

pub struct MetadataPattern {
    pub r#type: String,
    pub pattern: String,
}
```

**Acceptance Criteria:**
- [ ] `Pipeline` struct gains `import_rules: serde_json::Value`
- [ ] `ImportRules`, `SeedPattern`, `VideoPattern`, `MetadataPattern` types defined in core
- [ ] `parse_import_rules(json)` function with error handling
- [ ] `UpdatePipeline` DTO gains `import_rules: Option<serde_json::Value>`
- [ ] Pipeline API responses include `import_rules`

---

## Phase 2: Import Rule Matching Engine

### Task 2.1: Create import rule matching engine
**File:** `apps/backend/crates/core/src/import_rules.rs`

Create the pattern matching engine that classifies filenames against pipeline import rules.

```rust
pub enum FileClassification {
    SeedImage { slot: String },
    Video { scene_type: String, track: Option<String> },
    Metadata { metadata_type: String },
    Unrecognized,
}

pub fn classify_file(
    filename: &str,
    rules: &ImportRules,
    known_scene_types: &[String],
    known_tracks: &[String],
) -> FileClassification { ... }

pub fn match_pattern(
    filename: &str,
    pattern: &str,
    extensions: &[String],
    case_sensitive: bool,
) -> Option<HashMap<String, String>> { ... }
```

The pattern matcher supports tokens: `{avatar}`, `{scene_type}`, `{track}`, `{ext}`, `{slot_name}`.
Each token matches a word segment. `{ext}` matches against the allowed extensions list.

**Acceptance Criteria:**
- [ ] `classify_file()` returns correct classification for seed images, videos, metadata
- [ ] Pattern matching supports all naming engine tokens
- [ ] Case-insensitive matching when `case_sensitive: false`
- [ ] Unrecognized files return `FileClassification::Unrecognized`
- [ ] Unit tests: x121 patterns classify "clothed.png" → SeedImage{slot: "clothed"}
- [ ] Unit tests: x121 patterns classify "bj.mp4" → Video{scene_type: "bj"}
- [ ] Unit tests: y122 patterns classify "reference.png" → SeedImage{slot: "reference"}
- [ ] Registered in `core/src/lib.rs`

### Task 2.2: Update avatar ingest to use import rules
**File:** `apps/backend/crates/api/src/handlers/avatar_ingest.rs`

Replace any remaining hardcoded classification logic with pipeline import rules.

**Acceptance Criteria:**
- [ ] Ingest handler loads pipeline's `import_rules` from the project
- [ ] File classification uses `classify_file()` from the import rules engine
- [ ] Validation uses pipeline import rules for seed slot matching
- [ ] API response includes classification results with rule source

### Task 2.3: Pipeline-scoped duplicate detection
**Files:** `apps/backend/crates/db/src/repositories/avatar_repo.rs`, `apps/backend/crates/api/src/handlers/avatar_ingest.rs`

Scope avatar duplicate detection to the pipeline via the project's pipeline_id.

**Acceptance Criteria:**
- [ ] `AvatarRepo` duplicate check queries include pipeline_id filter (through project join)
- [ ] Same avatar name in x121 and y122 does NOT trigger duplicate warning
- [ ] Same avatar name within the same pipeline DOES trigger duplicate warning
- [ ] Frontend import wizard shows target pipeline name

---

## Phase 3: Naming Engine Integration

### Task 3.1: Add pipeline tier to naming engine template hierarchy
**Files:** `apps/backend/crates/core/src/naming_engine.rs`, `apps/backend/crates/core/src/pipeline.rs`

Extend the naming engine to resolve templates through platform → pipeline → project hierarchy.

```rust
pub fn resolve_template_with_hierarchy(
    category: &str,
    pipeline_templates: Option<&HashMap<String, String>>,
    project_templates: Option<&HashMap<String, String>>,
    platform_defaults: &HashMap<String, String>,
    ctx: &NamingContext,
) -> Result<ResolvedName, NamingError> {
    // 1. Try project override
    // 2. Try pipeline override
    // 3. Fall back to platform default
}
```

**Acceptance Criteria:**
- [ ] Template resolution checks project first, then pipeline, then platform
- [ ] Pipeline templates stored in `pipelines.naming_rules` JSONB as `{"templates": {"scene_video": "...", "delivery_image": "..."}}`
- [ ] Token `{pipeline}` and `{pipeline_code}` available in all templates
- [ ] Existing naming behavior unchanged when no pipeline templates are configured
- [ ] Unit tests for hierarchy fallback

### Task 3.2: Migrate pipeline naming_rules structure
**File:** `apps/db/migrations/{timestamp}_extend_pipeline_naming_rules.sql`

Extend the `naming_rules` JSONB to include naming engine category templates alongside the existing `prefix_rules` and `video_template`.

**Acceptance Criteria:**
- [ ] `naming_rules` structure supports both legacy format (`prefix_rules`, `video_template`) and new format (`templates` map keyed by category)
- [ ] Migration adds `templates` key to existing pipeline naming_rules
- [ ] Backward compatible — old format still works during transition
- [ ] x121 naming_rules includes templates matching current defaults

### Task 3.3: Update delivery assembly for unified hierarchy
**File:** `apps/backend/crates/api/src/background/delivery_assembly.rs`

Update delivery assembly to resolve naming through the three-tier hierarchy.

**Acceptance Criteria:**
- [ ] Delivery loads pipeline templates from `naming_rules.templates`
- [ ] Template resolution uses `resolve_template_with_hierarchy()`
- [ ] Falls back to platform defaults when pipeline has no override
- [ ] x121 delivery output unchanged (backward compatible)

---

## Phase 4: Storage Scoping

### Task 4.1: Add pipeline code to storage path builder
**Files:** `apps/backend/crates/api/src/state.rs`, relevant handlers

Update file path construction to include pipeline code as a prefix directory.

```
Old: {storage_root}/projects/{project_slug}/avatars/{avatar_slug}/seed/clothed.png
New: {storage_root}/{pipeline_code}/projects/{project_slug}/avatars/{avatar_slug}/seed/clothed.png
```

**Acceptance Criteria:**
- [ ] New files are stored under `{storage_root}/{pipeline_code}/...`
- [ ] Path builder function accepts pipeline_code parameter
- [ ] Handlers that create files pass pipeline_code from the project's pipeline
- [ ] Database stores full relative path (including pipeline prefix)

### Task 4.2: Backward-compatible file resolution
**Files:** `apps/backend/crates/api/src/` (image serving, video streaming, download handlers)

Support both old paths (no pipeline prefix) and new paths (with pipeline prefix).

**Acceptance Criteria:**
- [ ] File resolution tries pipeline-prefixed path first
- [ ] Falls back to legacy path (no prefix) for pre-migration files
- [ ] Thumbnails, downloads, streaming all handle both formats
- [ ] No broken image/video references for existing data

### Task 4.3: Storage migration script for existing x121 files
**File:** `scripts/migrate_storage_to_pipeline.sh` or `scripts/python/migrate_storage.py`

Script to move existing files under the `x121/` pipeline prefix.

**Acceptance Criteria:**
- [ ] Script moves files from `{storage_root}/projects/...` to `{storage_root}/x121/projects/...`
- [ ] Updates file_path columns in database to include `x121/` prefix
- [ ] Dry-run mode shows what would be moved without executing
- [ ] Handles symlinks, preserves timestamps
- [ ] Idempotent — safe to run multiple times

---

## Phase 5: Frontend

### Task 5.1: Import rules admin page
**File:** `apps/frontend/src/features/pipelines/components/ImportRulesEditor.tsx`

Admin UI for editing pipeline import rules within the pipeline settings page.

**Acceptance Criteria:**
- [ ] Shows current import rules (seed patterns, video patterns, metadata patterns)
- [ ] Add/remove/edit seed patterns with slot name, pattern, extensions
- [ ] Add/remove/edit video patterns with pattern and extensions
- [ ] Add/remove/edit metadata patterns with type and pattern
- [ ] Toggle case sensitivity
- [ ] Save via pipeline update API
- [ ] Integrated into pipeline settings page

### Task 5.2: Update frontend file classification to use API rules
**Files:** `apps/frontend/src/features/avatars/hooks/useAvatarImportBase.ts`, `apps/frontend/src/features/avatars/components/AvatarSeedDataModal.tsx`

Frontend file classification should load import rules from the pipeline and use them for matching.

**Acceptance Criteria:**
- [ ] `suggestImageCategory()` uses pipeline's `import_rules.seed_patterns` from API
- [ ] `AvatarSeedDataModal` uses pipeline seed slot names instead of hardcoded pattern
- [ ] `FileAssignmentModal` shows slot names from pipeline import rules
- [ ] Video file matching uses pipeline's `import_rules.video_patterns`

### Task 5.3: Remove remaining hardcoded patterns
**Files:** Multiple frontend files

Clean up all remaining hardcoded "clothed"/"topless" patterns in import-related code.

**Acceptance Criteria:**
- [ ] `AvatarSeedDataModal.tsx` — remove `/^(bio|tov|metadata|clothed|topless)\./i` regex
- [ ] `matchDroppedVideos.ts` — replace `NON_CHARACTER_HINTS` set with pipeline track slugs
- [ ] Delivery manifest types — replace `clothed_image`/`topless_image` with dynamic variant map
- [ ] No remaining hardcoded seed slot names in import flow

### Task 5.4: Update naming rules admin for pipeline template hierarchy
**Files:** `apps/frontend/src/features/naming-rules/NamingRulesPage.tsx`, `apps/frontend/src/features/naming-rules/PipelineNamingRulesEditor.tsx`

Update the naming rules admin to show the three-tier hierarchy.

**Acceptance Criteria:**
- [ ] Pipeline workspace naming page shows: platform defaults (read-only) + pipeline overrides (editable)
- [ ] Pipeline can override any naming category template
- [ ] Shows effective template (resolved through hierarchy) with live preview
- [ ] Global admin page shows platform defaults only
- [ ] Token `{pipeline}` / `{pipeline_code}` available in token picker

---

## Phase 6: Testing & Verification

### Task 6.1: Import rule matching engine tests
**File:** `apps/backend/crates/core/src/import_rules.rs` (test module)

**Acceptance Criteria:**
- [ ] Test x121 seed patterns: "clothed.png" → SeedImage{slot: "clothed"}
- [ ] Test x121 seed patterns: "jane_topless.jpg" → SeedImage{slot: "topless"}
- [ ] Test x121 video patterns: "bj.mp4" → Video{scene_type: "bj"}
- [ ] Test x121 video patterns: "topless_dance.mp4" → Video{scene_type: "dance", track: "topless"}
- [ ] Test y122 seed patterns: "reference.png" → SeedImage{slot: "reference"}
- [ ] Test metadata patterns: "bio.json" → Metadata{type: "bio"}
- [ ] Test unrecognized: "random.txt" → Unrecognized
- [ ] Test case insensitivity

### Task 6.2: Pipeline-isolated import tests
**File:** `apps/backend/crates/api/tests/` (test module)

**Acceptance Criteria:**
- [ ] Test same avatar name in x121 and y122 creates separate records
- [ ] Test duplicate detection within same pipeline works
- [ ] Test import rules are loaded from correct pipeline

### Task 6.3: Storage path tests
**Acceptance Criteria:**
- [ ] Test new files get pipeline-prefixed paths
- [ ] Test legacy files without prefix are still resolved
- [ ] Test file serving works for both path formats

### Task 6.4: Backward compatibility verification
**Acceptance Criteria:**
- [ ] x121 imports work identically to before (same file matching)
- [ ] x121 delivery produces identical filenames
- [ ] Existing x121 files accessible (pre-migration and post-migration)
- [ ] x121 naming engine output unchanged

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/{ts}_add_import_rules.sql` | Add import_rules column |
| `apps/db/migrations/{ts}_seed_import_rules.sql` | Seed x121/y122 rules |
| `apps/backend/crates/core/src/import_rules.rs` | Import rule matching engine |
| `apps/backend/crates/core/src/pipeline.rs` | ImportRules types + parsing |
| `apps/backend/crates/core/src/naming_engine.rs` | Pipeline tier in hierarchy |
| `apps/backend/crates/db/src/models/pipeline.rs` | import_rules field |
| `apps/backend/crates/api/src/handlers/avatar_ingest.rs` | Use import rules |
| `apps/backend/crates/db/src/repositories/avatar_repo.rs` | Pipeline-scoped dupes |
| `apps/backend/crates/api/src/background/delivery_assembly.rs` | Unified hierarchy |
| `apps/backend/crates/api/src/state.rs` | Storage path builder |
| `apps/frontend/src/features/pipelines/components/ImportRulesEditor.tsx` | Import rules admin |
| `apps/frontend/src/features/avatars/hooks/useAvatarImportBase.ts` | Frontend classification |
| `apps/frontend/src/features/avatars/components/AvatarSeedDataModal.tsx` | Remove hardcoded patterns |
| `apps/frontend/src/features/avatars/tabs/matchDroppedVideos.ts` | Dynamic track hints |
| `apps/frontend/src/features/naming-rules/PipelineNamingRulesEditor.tsx` | Hierarchy UI |
| `scripts/migrate_storage_to_pipeline.py` | File migration script |

---

## Dependencies

### Existing Components to Reuse
- `naming_engine::resolve_template()` — Token substitution and template resolution
- `NamingContext` — Already has `prefix_rules` for track-to-prefix mapping
- `pipeline::parse_seed_slots()` — Existing seed slot parser
- `validate_seed_images()` — Existing seed validation
- `suggestImageCategory()` — Frontend filename matching (needs pipeline rules input)
- `PipelineNamingRulesEditor` — Existing pipeline naming rules UI (extend for import rules)

### New Infrastructure Needed
- `import_rules.rs` — Pattern matching engine in core crate
- `ImportRules` types — Structured import rule definitions
- `ImportRulesEditor.tsx` — Frontend admin component
- Storage path migration script
- Backward-compatible file resolution

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database & Configuration (Tasks 1.1-1.3)
2. Phase 2: Import Rule Matching Engine (Tasks 2.1-2.3)
3. Phase 3: Naming Engine Integration (Tasks 3.1-3.3)
4. Phase 4: Storage Scoping (Tasks 4.1-4.3)
5. Phase 5: Frontend (Tasks 5.1-5.4)
6. Phase 6: Testing (Tasks 6.1-6.4)

**MVP Success Criteria:**
- y122 imports work with "reference" seed pattern
- x121 imports work identically to current behavior
- Same avatar name in both pipelines creates isolated records
- Files stored under pipeline-scoped directories
- Naming engine resolves templates through platform → pipeline → project hierarchy

### Post-MVP Enhancements
- Import rule testing/preview UI (dry-run classification)
- Cross-pipeline avatar linking metadata

---

## Notes

1. **Migration order matters** — DB migration first, then backend engine, then storage paths, then frontend. Each phase must be backward-compatible.
2. **Storage migration is the riskiest** — Task 4.3 moves physical files. Must have dry-run mode and be idempotent. Consider doing this as a separate deployment step.
3. **Backward compatibility is critical** — Every change must handle both old-format and new-format data until all files are migrated. The path fallback in Task 4.2 ensures this.
4. **Import rules vs naming engine** — Import rules match INcoming filenames to entities. Naming engine generates OUTgoing filenames from entities. They're complementary, not duplicative. Both use the same token vocabulary for consistency.
5. **x121 seed data validation** — Task 1.2 import rules must be tested against all current x121 import scenarios to ensure zero regression before rolling out.

---

## Version History

- **v1.0** (2026-03-23): Initial task list creation from PRD-141
