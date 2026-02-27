# PRD-116: Dynamic File & Entity Naming Engine

## 1. Introduction/Overview

Every file the platform generates — scene videos, image variants, thumbnails, delivery ZIPs, metadata exports, test shots, chunk artifacts — is named using patterns hardcoded directly in Rust handler functions and core modules. There are currently **7+ distinct naming patterns** scattered across `naming.rs`, `image_variant.rs`, `scene_video_version.rs`, `video.rs`, `metadata.rs`, and `delivery.rs`, none of which are configurable.

This creates several problems:
- **Client-specific delivery requirements** can't be met without code changes (e.g., one client wants `{character_name}/{scene_name}.mp4`, another wants `{batch}_{character}_{scene}_{date}.mp4`)
- **Naming convention changes** require developer intervention, a code deploy, and only affect new files
- **No consistency enforcement** — each module invents its own pattern independently
- **No visibility** — admins can't see or understand the naming rules without reading source code

This PRD introduces a **Dynamic Naming Engine** — a centralized, configurable system where naming templates are defined per file category, stored in the database, editable via an admin UI, and enforced automatically across the entire platform. Templates use token substitution (`{character_name}`, `{scene_type}`, `{date}`, etc.) with live preview. Rules are global by default with per-project overrides for client-specific delivery specs.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-01 (Data Model — entity metadata used as naming tokens)
  - PRD-02 (Backend Foundation — API layer)
  - PRD-29 (Design System — admin UI components)
- **Extends:**
  - PRD-01 — replaces `naming.rs` hardcoded function with configurable engine
  - PRD-39 (Delivery Packaging) — delivery ZIP file/folder names driven by naming rules
  - PRD-24 (Generation Loop) — segment output filenames use naming engine
  - PRD-21 (Image Management) — variant filenames use naming engine
- **Integrates with:**
  - PRD-17 (Asset Registry) — assets reference their naming rule for provenance
  - PRD-112 (Project Hub) — project-level naming overrides configured in project settings
  - PRD-113 (Character Ingest) — imported files renamed according to rules
  - PRD-57 (Batch Orchestrator) — batch outputs named consistently
  - PRD-109 (Scene Video Versioning) — versioned video filenames follow naming rules

## 3. Goals

- Replace all hardcoded file naming patterns with a single, centralized naming engine backed by database-stored templates.
- Allow admins to view, edit, and preview naming rules for every file category without code changes.
- Support per-project naming overrides so different clients/projects can have different delivery naming conventions.
- Provide a live preview showing exactly what a filename will look like given sample data before saving a rule.
- Ensure every file created by the platform is named by the engine — no manual naming, no hardcoded paths.

## 4. User Stories

- **As an admin**, I want to define naming templates for each file type (videos, images, delivery packages) so all files follow a consistent convention.
- **As an admin**, I want to preview what a filename will look like with real data before saving a rule, so I can verify the pattern is correct.
- **As an admin**, I want to set project-specific naming overrides for delivery files, so I can meet each client's delivery specification.
- **As a creator**, I want all generated files to be auto-named consistently, so I never have to manually name or rename output files.
- **As an admin**, I want to see which naming rule produced a given filename, so I can trace naming decisions for auditing.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Naming Rule Registry

**Description:** The system must store naming templates in a database table, organized by file category. Each category has exactly one active global rule. Projects can override any category with a project-specific rule. The engine ships with sensible defaults matching the current hardcoded patterns.

**Database Schema:**

```sql
CREATE TABLE naming_categories (
    id SMALLINT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    example_output TEXT                        -- Example: "topless_dance_clothes_off_1.mp4"
);

INSERT INTO naming_categories (id, name, description, example_output) VALUES
    (1, 'scene_video', 'Generated scene video files', 'topless_dance_clothes_off_1.mp4'),
    (2, 'image_variant', 'Source image variants (clothed, topless, etc.)', 'variant_chloe_clothed_v2.png'),
    (3, 'scene_video_import', 'Externally imported scene videos', 'scene_chloe_dance_20260224.mp4'),
    (4, 'thumbnail', 'Video frame thumbnails', 'frame_000042.jpg'),
    (5, 'metadata_export', 'Character/scene metadata JSON files', 'chloe_character_metadata.json'),
    (6, 'delivery_video', 'Video files inside delivery ZIP', 'dance.mp4'),
    (7, 'delivery_image', 'Reference images inside delivery ZIP', 'clothed.png'),
    (8, 'delivery_metadata', 'Metadata files inside delivery ZIP', 'metadata.json'),
    (9, 'delivery_folder', 'Folder structure inside delivery ZIP', 'project_name/character_name'),
    (10, 'test_shot', 'Quick test shot outputs', 'test_chloe_dance_001.mp4'),
    (11, 'chunk_artifact', 'Intermediate workflow chunk video files', 'chunk_001_chloe_dance.mp4'),
    (12, 'delivery_zip', 'The delivery ZIP file itself', 'project_alpha_delivery_20260224.zip'),
    (13, 'pipeline_intermediate_image', 'Intermediate images generated during ComfyUI pipeline (previews, step outputs, frame extractions)', 'inter_001_chloe_dance.png'),
    (14, 'pipeline_intermediate_video', 'Intermediate videos generated during ComfyUI pipeline (segment passes, pre-interpolation, pre-upscale)', 'inter_001_chloe_dance_pass1.mp4');

CREATE TABLE naming_rules (
    id BIGSERIAL PRIMARY KEY,
    category_id SMALLINT NOT NULL REFERENCES naming_categories(id),
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = global default
    template TEXT NOT NULL,                   -- e.g., "{variant_label}_{scene_type}{_clothes_off}{_index}.mp4"
    description TEXT,                         -- Admin notes about this rule
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, project_id)          -- One active rule per category per project (NULL project = global)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON naming_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed with current hardcoded patterns as defaults
INSERT INTO naming_rules (category_id, project_id, template, description) VALUES
    (1, NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4', 'Default scene video naming (matches PRD-01 convention)'),
    (2, NULL, 'variant_{character_slug}_{variant_label}_v{version}.{ext}', 'Default image variant naming'),
    (3, NULL, 'scene_{character_slug}_{scene_type_slug}_{date_compact}.{ext}', 'Default imported video naming'),
    (4, NULL, 'frame_{frame_number:06}.jpg', 'Default thumbnail naming'),
    (5, NULL, '{character_slug}_{metadata_type}.json', 'Default metadata export naming'),
    (6, NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4', 'Default delivery video naming'),
    (7, NULL, '{variant_label}.{ext}', 'Default delivery image naming'),
    (8, NULL, 'metadata.json', 'Default delivery metadata naming'),
    (9, NULL, '{project_slug}/{character_slug}', 'Default delivery folder structure'),
    (10, NULL, 'test_{character_slug}_{scene_type_slug}_{sequence:03}.mp4', 'Default test shot naming'),
    (11, NULL, 'chunk_{sequence:03}_{character_slug}_{scene_type_slug}.mp4', 'Default chunk artifact naming'),
    (12, NULL, '{project_slug}_delivery_{date_compact}.zip', 'Default delivery ZIP naming'),
    (13, NULL, 'inter_{sequence:03}_{character_slug}_{scene_type_slug}.png', 'Default pipeline intermediate image naming'),
    (14, NULL, 'inter_{sequence:03}_{character_slug}_{scene_type_slug}_pass{pass_number}.mp4', 'Default pipeline intermediate video naming');
```

**Acceptance Criteria:**
- [ ] 14 naming categories defined covering all file types in the platform
- [ ] Each category has exactly one global default rule (seeded on migration)
- [ ] Global defaults match current hardcoded patterns (backward compatible)
- [ ] Projects can override any category with a project-specific rule
- [ ] Only one active rule per category per project (enforced by unique constraint)
- [ ] Rules store the template string, not the resolved output

---

#### Requirement 1.2: Token System

**Description:** Naming templates use `{token}` placeholders that are resolved at file creation time from entity context. The engine defines a fixed set of available tokens per category, validates templates against available tokens, and rejects templates with unknown tokens.

**Available Tokens:**

| Token | Type | Description | Example Value |
|-------|------|-------------|---------------|
| `{project_name}` | String | Project display name | `Alpha Project` |
| `{project_slug}` | String | Project name, slugified | `alpha_project` |
| `{character_name}` | String | Character display name | `Chloe Riley` |
| `{character_slug}` | String | Character name, slugified | `chloe_riley` |
| `{scene_type}` | String | Scene type display name | `Slow Dance` |
| `{scene_type_slug}` | String | Scene type name, slugified | `slow_dance` |
| `{variant_label}` | String | Variant label (clothed/topless) | `topless` |
| `{variant_prefix}` | String | Prefix with trailing underscore if not "clothed" | `topless_` or `` |
| `{batch_name}` | String | Character group/batch name | `Batch 1` |
| `{batch_slug}` | String | Batch name, slugified | `batch_1` |
| `{date}` | String | ISO date (YYYY-MM-DD) | `2026-02-24` |
| `{date_compact}` | String | Compact date (YYYYMMDD) | `20260224` |
| `{datetime}` | String | ISO datetime | `2026-02-24T14:30:00` |
| `{timestamp}` | Integer | Unix epoch seconds | `1740403800` |
| `{version}` | Integer | Version number | `2` |
| `{sequence}` | Integer | Sequence index (0-based) | `0` |
| `{index_suffix}` | String | `_N` if index > 0, else empty | `_2` or `` |
| `{frame_number}` | Integer | Frame number for thumbnails | `42` |
| `{ext}` | String | File extension (no dot) | `mp4` |
| `{resolution}` | String | Resolution label | `1080p` |
| `{resolution_width}` | Integer | Pixel width | `1920` |
| `{resolution_height}` | Integer | Pixel height | `1080` |
| `{clothes_off_suffix}` | String | `_clothes_off` if transition, else empty | `_clothes_off` |
| `{metadata_type}` | String | Metadata type label | `character_metadata` |
| `{id}` | Integer | Entity database ID | `42` |
| `{uuid}` | String | Short UUID (8 chars) | `a3f7c2b1` |
| `{pass_number}` | Integer | Pipeline pass/step number (e.g., 1=base gen, 2=interpolation, 3=upscale) | `1` |

**Format Specifiers:**

Tokens support format specifiers for padding:
- `{sequence:03}` → `001` (zero-padded to 3 digits)
- `{frame_number:06}` → `000042` (zero-padded to 6 digits)
- `{id:05}` → `00042` (zero-padded to 5 digits)

**Slug Rules:**
- Lowercase
- Spaces → underscores
- Remove non-alphanumeric characters (except underscore, hyphen)
- Collapse multiple underscores/hyphens

**Token Availability Per Category:**

Not all tokens make sense for every category. The engine defines which tokens are available per category:

| Category | Available Tokens |
|----------|-----------------|
| `scene_video` | project, character, scene_type, variant, clothes_off, index, date, resolution, id |
| `image_variant` | project, character, variant, version, date, ext, id |
| `scene_video_import` | project, character, scene_type, date, ext, id |
| `thumbnail` | frame_number, character, scene_type, id |
| `metadata_export` | project, character, metadata_type, date |
| `delivery_video` | project, character, scene_type, variant, clothes_off, index, batch, resolution |
| `delivery_image` | project, character, variant, ext |
| `delivery_metadata` | project, character |
| `delivery_folder` | project, character, batch, date |
| `test_shot` | project, character, scene_type, sequence, date, id |
| `chunk_artifact` | project, character, scene_type, sequence, date, id |
| `delivery_zip` | project, batch, date, id |
| `pipeline_intermediate_image` | project, character, scene_type, sequence, date, id, ext |
| `pipeline_intermediate_video` | project, character, scene_type, sequence, pass_number, date, id |

**Acceptance Criteria:**
- [ ] 25+ tokens defined covering all entity attributes
- [ ] Templates validated against available tokens for their category
- [ ] Unknown tokens rejected with error message listing available tokens
- [ ] Format specifiers (`{token:N}`) supported for zero-padding integers
- [ ] Slug generation is deterministic (same input always produces same slug)
- [ ] Token availability enforced per category (e.g., `{frame_number}` only for thumbnails)
- [ ] Empty/null token values produce empty string (no `{null}` in output)

---

#### Requirement 1.3: Naming Engine (Core Resolution)

**Description:** A centralized `resolve_filename()` function in `crates/core` that takes a naming category, optional project ID, and a token context map, and returns the resolved filename. This function replaces ALL hardcoded naming functions across the platform.

**Engine Interface:**

```rust
/// Context map providing token values for resolution
pub struct NamingContext {
    pub project_name: Option<String>,
    pub character_name: Option<String>,
    pub scene_type_name: Option<String>,
    pub variant_label: Option<String>,
    pub is_clothes_off: bool,
    pub index: Option<u32>,
    pub version: Option<u32>,
    pub sequence: Option<u32>,
    pub frame_number: Option<u32>,
    pub extension: Option<String>,
    pub resolution: Option<String>,
    pub resolution_width: Option<u32>,
    pub resolution_height: Option<u32>,
    pub metadata_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub batch_name: Option<String>,
    pub timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

/// Resolve a filename from a template and context
pub fn resolve_template(template: &str, ctx: &NamingContext) -> Result<String, NamingError> {
    // 1. Parse template for {token} and {token:N} patterns
    // 2. Look up each token in context
    // 3. Apply slug rules where applicable
    // 4. Apply format specifiers (zero-padding)
    // 5. Handle conditional tokens (variant_prefix, clothes_off_suffix, index_suffix)
    // 6. Sanitize: remove double underscores, trim separators, ensure valid filename chars
    // 7. Return resolved string
}

/// Resolve a filename for a given category, falling back from project → global
pub async fn resolve_filename(
    pool: &PgPool,
    category: &str,
    project_id: Option<DbId>,
    ctx: &NamingContext,
) -> Result<String, NamingError> {
    // 1. Try project-specific rule (if project_id provided)
    // 2. Fall back to global rule
    // 3. Resolve template with context
    // 4. Return filename
}
```

**Conditional Tokens:**

Some tokens are "conditional" — they expand to a value or to empty string based on context:
- `{variant_prefix}` → `"topless_"` if variant is topless, else `""` (not "clothed_")
- `{clothes_off_suffix}` → `"_clothes_off"` if is_clothes_off, else `""`
- `{index_suffix}` → `"_2"` if index > 0, else `""`

**Filename Sanitization:**

After token resolution:
1. Replace any remaining `{...}` with empty string (unresolved tokens)
2. Replace whitespace with underscore
3. Remove characters not in `[a-zA-Z0-9_\-.]`
4. Collapse multiple consecutive underscores/hyphens
5. Trim leading/trailing underscores/hyphens
6. Ensure filename is not empty (fallback to `unnamed_{uuid}`)

**Acceptance Criteria:**
- [ ] `resolve_template()` pure function in `crates/core` — no DB access, testable in isolation
- [ ] `resolve_filename()` async function that loads the rule from DB then delegates to `resolve_template()`
- [ ] Project-specific rules override global rules (fallback chain)
- [ ] Conditional tokens produce correct output for all cases
- [ ] Format specifiers zero-pad integers correctly
- [ ] Filename sanitization produces valid filesystem names
- [ ] Empty context values produce empty string (no crash, no `{null}`)
- [ ] Unit tests for all token types, edge cases, and sanitization

---

#### Requirement 1.4: Platform Integration (Replace Hardcoded Patterns)

**Description:** All existing hardcoded naming patterns across the platform are replaced with calls to the naming engine. This is the migration step that connects the engine to all file creation points.

**Files to Modify:**

| File | Current Pattern | Naming Category |
|------|----------------|-----------------|
| `core/src/naming.rs` | `scene_video_filename()` | `scene_video` |
| `api/handlers/image_variant.rs` | `format!("variant_{char_id}_{id}_v{ver}_{ts}.{ext}")` | `image_variant` |
| `api/handlers/scene_video_version.rs` | `format!("scene_{scene_id}_{ts}.{ext}")` | `scene_video_import` |
| `api/handlers/video.rs` | `format!("frame_{frame:06}.jpg")` | `thumbnail` |
| `api/handlers/metadata.rs` | `format!("{entity_type}_{entity_id}/{file_type}.json")` | `metadata_export` |
| `core/src/delivery.rs` | Fixed delivery structure | `delivery_video`, `delivery_image`, `delivery_metadata`, `delivery_folder`, `delivery_zip` |
| `api/handlers/test_shot.rs` | Test shot output naming | `test_shot` |
| Scene artifact handler (PRD-115) | Chunk artifact naming | `chunk_artifact` |

**Migration Strategy:**
1. Add naming engine alongside existing hardcoded functions
2. Seed database with default rules matching current patterns
3. Replace each hardcoded call with `resolve_filename()` call
4. Verify output matches existing patterns with default rules (backward compatible)
5. Remove old hardcoded functions

**Acceptance Criteria:**
- [ ] All 7+ hardcoded naming patterns replaced with naming engine calls
- [ ] Default rules produce identical output to the previous hardcoded patterns
- [ ] Existing files are NOT renamed (new files only use the engine)
- [ ] Each file creation point passes appropriate `NamingContext` with available entity data
- [ ] No hardcoded `format!()` calls for filenames remain in handler code (except inline utility formats)
- [ ] `naming.rs` `scene_video_filename()` function is deprecated and eventually removed

---

#### Requirement 1.5: Admin API Endpoints

**Description:** API endpoints for managing naming rules, previewing resolved names, and listing available tokens.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/admin/naming/categories` | List all naming categories with active rules |
| `GET` | `/admin/naming/categories/:id/tokens` | List available tokens for a category |
| `GET` | `/admin/naming/rules` | List all rules (global + per-project) |
| `GET` | `/admin/naming/rules/:id` | Get single rule |
| `POST` | `/admin/naming/rules` | Create rule (global or project-scoped) |
| `PUT` | `/admin/naming/rules/:id` | Update rule template |
| `DELETE` | `/admin/naming/rules/:id` | Delete project-scoped rule (fall back to global) |
| `POST` | `/admin/naming/preview` | Preview resolved filename with sample data |
| `GET` | `/admin/naming/rules/:id/history` | View previous versions of a rule |

**Preview Endpoint:**

```
POST /admin/naming/preview
{
  "category": "scene_video",
  "template": "{character_slug}_{scene_type_slug}_{date_compact}.mp4",
  "sample_context": {
    "character_name": "Chloe Riley",
    "scene_type_name": "Slow Dance",
    "date": "2026-02-24"
  }
}

Response:
{
  "data": {
    "resolved": "chloe_riley_slow_dance_20260224.mp4",
    "tokens_used": ["character_slug", "scene_type_slug", "date_compact"],
    "tokens_available": ["project_slug", "character_slug", "scene_type_slug", ...],
    "warnings": []
  }
}
```

**Acceptance Criteria:**
- [ ] All endpoints require `admin` role
- [ ] Preview endpoint resolves templates without creating files
- [ ] Preview accepts sample context OR loads from existing entities (`sample_character_id`, `sample_scene_type_id`)
- [ ] Template validation on create/update — reject unknown tokens with helpful error
- [ ] Deleting a project rule is allowed; deleting the global default is NOT allowed
- [ ] Rule history tracked (previous templates kept for audit, not versioned table — stored in JSONB changelog)

---

#### Requirement 1.6: Admin UI — Naming Rules Editor

**Description:** Admin page for viewing and editing all naming rules, accessible from the Admin section of the sidebar.

**Page Structure:**

```
Naming Rules
├── Category List (14 categories, grouped by type)
│   ├── Generation
│   │   ├── Scene Video: {variant_prefix}{scene_type_slug}...
│   │   ├── Thumbnail: frame_{frame_number:06}.jpg
│   │   ├── Test Shot: test_{character_slug}...
│   │   └── Chunk Artifact: chunk_{sequence:03}...
│   ├── Storage
│   │   ├── Image Variant: variant_{character_slug}...
│   │   └── Scene Video Import: scene_{character_slug}...
│   ├── Export
│   │   └── Metadata Export: {character_slug}...
│   └── Delivery
│       ├── Delivery ZIP: {project_slug}_delivery...
│       ├── Delivery Folder: {project_slug}/{character_slug}
│       ├── Delivery Video: {variant_prefix}{scene_type_slug}...
│       ├── Delivery Image: {variant_label}.{ext}
│       └── Delivery Metadata: metadata.json
│
├── Rule Editor (on click)
│   ├── Template input with token autocomplete
│   ├── Available tokens (clickable chips that insert into template)
│   ├── Live Preview (resolved with sample data)
│   ├── Project Override section (add per-project rules)
│   └── Save / Reset to Default
│
└── Project Overrides (per-project view)
    └── List of projects with custom naming rules
```

**Template Editor Features:**
- Textarea with `{token}` syntax highlighting
- Autocomplete dropdown triggered by typing `{`
- Clickable token chips below the editor (click to insert at cursor)
- Live preview updates as you type (debounced 300ms)
- Sample data selector: pick a real character + scene type for realistic preview
- Validation errors shown inline (unknown tokens, empty result)

**Acceptance Criteria:**
- [ ] Naming Rules page accessible at `/admin/naming`
- [ ] All 14 categories displayed, grouped by type (Generation, Storage, Export, Delivery)
- [ ] Each category shows its current template and a resolved example
- [ ] Rule editor with token autocomplete and syntax highlighting
- [ ] Live preview updates as template is edited
- [ ] Sample data can be loaded from existing entities (character dropdown, scene type dropdown)
- [ ] Per-project overrides shown beneath the global rule
- [ ] "Reset to Default" restores the seed template
- [ ] Unsaved changes indicator; confirmation dialog on navigation away

**Frontend Hooks:**
- `useNamingCategories()` — list all categories
- `useNamingRules(projectId?)` — list rules, optionally scoped to project
- `useNamingPreview(category, template, context)` — live preview (debounced)
- `useCategoryTokens(categoryId)` — available tokens for a category
- `useUpdateNamingRule(ruleId)` — save rule mutation

---

#### Requirement 1.7: Project-Level Naming Overrides

**Description:** Projects can override any naming category with a project-specific rule. This is configured in the project settings page (PRD-112 Req 1.8 — Configuration tab). When a file is created within a project context, the engine checks for a project override first, then falls back to the global default.

**UI Location:** Project Detail → Configuration tab → "Naming Conventions" section

```
Naming Conventions for "Alpha Project"
├── Using global defaults (10 of 14 categories)
├── Custom rules:
│   ├── Delivery Video: {character_slug}_{scene_type_slug}_final.mp4  [Edit] [Remove]
│   └── Delivery Folder: alpha/{batch_slug}/{character_slug}           [Edit] [Remove]
└── [+ Add Custom Rule] → category picker → template editor
```

**Acceptance Criteria:**
- [ ] Project settings page shows which naming rules are overridden vs using global defaults
- [ ] Admin can add project-specific overrides for any category
- [ ] Admin can remove project overrides (reverts to global default)
- [ ] Project overrides use the same template editor with preview
- [ ] When resolving a filename within a project context, project rule takes priority
- [ ] Projects without overrides use global defaults seamlessly

---

### Phase 2: Post-MVP Enhancements

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Retroactive Batch Rename

**Description:** Admin can trigger a batch rename of existing files to match updated naming rules. The system previews all changes (before → after), requires confirmation, and updates file paths in the database and on disk.

---

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Naming Rule Versioning

**Description:** Full version history for naming rules with the ability to view previous templates, compare versions, and restore old rules.

---

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** Custom Tokens

**Description:** Admins can define custom tokens that pull values from character metadata JSONB, project settings, or other extensible sources. Example: `{custom:eye_color}` resolves from `characters.metadata->>'eye_color'`.

---

#### Requirement 2.4: **[OPTIONAL — Post-MVP]** Naming Collision Detection

**Description:** Before saving a rule, the engine checks if the new template could produce duplicate filenames for existing data. Warns the admin if collisions are detected and suggests adding `{id}` or `{uuid}` tokens.

---

#### Requirement 2.5: **[OPTIONAL — Post-MVP]** Path Templates (Directory Structure)

**Description:** Extend naming rules to control not just filenames but full directory paths for storage organization. Example: `storage/{project_slug}/{character_slug}/variants/{filename}` instead of flat `storage/variants/`.

## 6. Non-Goals (Out of Scope)

- **File content** — the naming engine controls names only, not file content or format.
- **Database entity naming** — this covers file/artifact names, not database record names (project titles, character names, etc.).
- **URL routing** — API endpoint paths are not controlled by the naming engine.
- **Code identifiers** — Rust/TypeScript variable names, function names, etc. are not in scope.
- **Retroactive renaming in MVP** — only new files use the engine. Batch rename is post-MVP.
- **Real-time rename on rule change** — changing a rule does not rename existing files.

## 7. Design Considerations

- **Naming Rules page** follows the existing admin page pattern (PRD-110 Platform Settings, PRD-06 Hardware Dashboard).
- **Template editor** uses a monospace textarea with inline token highlighting, similar to the prompt editor (PRD-63) pattern.
- **Token chips** use the design system's `Badge` or `Tag` component, clickable to insert.
- **Live preview** uses a debounced API call (300ms) to the preview endpoint.
- **Category grouping** (Generation, Storage, Export, Delivery) uses collapsible sections.
- **Project override UI** embedded in the Project Detail → Configuration tab (PRD-112 Req 1.8).

## 8. Technical Considerations

### Existing Code to Reuse

| Component | Source | Usage |
|-----------|--------|-------|
| Slug generation | `core::naming::scene_video_filename` | Extract slug logic into shared utility |
| Placeholder resolution | `core::scene_type_config::resolve_placeholders` | Similar `{token}` pattern — share regex/parser |
| Delivery manifest | `core::delivery::DeliveryManifest` | Adapt to use naming engine for file paths |
| Template validation | `core::scene_type_config::validate_placeholders` | Reuse unknown-token detection pattern |

### New Infrastructure Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `NamingEngine` | `crates/core/src/naming_engine.rs` | Core resolution logic, token registry, validation |
| `NamingContext` | `crates/core/src/naming_engine.rs` | Token value struct passed to resolver |
| `NamingRule` model | `crates/db/src/models/naming_rule.rs` | DB model for rules and categories |
| `NamingRuleRepo` | `crates/db/src/repositories/naming_rule_repo.rs` | Rule CRUD, category listing |
| API handlers | `crates/api/src/handlers/naming.rs` | Admin endpoints |
| Frontend feature | `apps/frontend/src/features/naming-rules/` | Admin editor UI |

### Database Changes

2 new tables: `naming_categories` (lookup, 12 rows), `naming_rules` (configurable rules)

Seed migration with 14 categories + 14 default global rules matching current hardcoded patterns.

### API Changes

~9 new admin endpoints under `/admin/naming/` (see Req 1.5).

Modifications to all file creation handlers to call `resolve_filename()` instead of hardcoded `format!()`.

## 9. Success Metrics

- Zero hardcoded `format!()` calls for filenames in handler code after migration.
- All 14 naming categories have configurable rules with working live preview.
- Default rules produce byte-identical filenames to previous hardcoded patterns (backward compatibility verified by tests).
- Admin can change a naming rule and see the new pattern applied to the next generated file within the same session.
- Project-specific delivery naming works correctly — two projects using different delivery rules produce correctly named files.

## 10. Open Questions

1. **Separator character** — should slug rules use underscores (`chloe_riley`) or hyphens (`chloe-riley`) by default? Should this be configurable per rule?
2. **Case sensitivity** — should all slugs be lowercase, or should the engine support `{CHARACTER_NAME}` for UPPERCASE and `{Character_Name}` for Title Case?
3. **Collision handling** — when two files resolve to the same name, should the engine auto-append `_1`, `_2`, etc., or fail with an error?
4. **Caching** — should naming rules be cached in memory (with invalidation on update), or fetched from DB on every file creation? At scale, DB lookups per file could add latency.
5. **Migration order** — should all 7+ hardcoded patterns be migrated at once, or one category at a time across multiple PRs?

## 11. Version History

- **v1.0** (2026-02-24): Initial PRD creation. 12 naming categories, token system, core engine, platform integration, admin UI, project overrides.
- **v1.1** (2026-02-26): Added 2 new naming categories for pipeline intermediates (`pipeline_intermediate_image`, `pipeline_intermediate_video`) and `pass_number` token — total 14 categories. Ensures all ComfyUI pipeline artifacts (not just final outputs) are named consistently.
