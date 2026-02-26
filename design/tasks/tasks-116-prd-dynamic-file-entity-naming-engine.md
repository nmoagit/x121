# Task List: Dynamic File & Entity Naming Engine

**PRD Reference:** `design/prds/116-prd-dynamic-file-entity-naming-engine.md`
**Scope:** Replace all hardcoded file naming patterns with a centralized, database-backed naming engine. Admins can view, edit, and preview naming templates per file category. Supports per-project overrides, token substitution with format specifiers, and live preview.

## Overview

Every file the platform generates (scene videos, image variants, thumbnails, delivery ZIPs, metadata exports, test shots, chunk artifacts) is currently named using patterns hardcoded across `naming.rs`, `image_variant.rs`, `scene_video_version.rs`, `video.rs`, `metadata.rs`, and `delivery.rs`. This PRD centralizes all naming logic into a configurable engine backed by two database tables, an admin UI, and a core resolution library.

The implementation follows existing codebase patterns: zero-sized repository structs with `&PgPool` methods, three-struct models (entity/create/update), Axum handlers with `AppState`/`AppResult`, `#[sqlx::test]` integration tests, and TanStack Query hooks in the frontend.

### What Already Exists
- `x121_core::naming::scene_video_filename` — hardcoded scene video naming function (to be replaced)
- `x121_core::scene_type_config::resolve_prompt_template` — `{placeholder}` regex resolution (reusable pattern)
- `x121_core::scene_type_config::extract_placeholders` / `validate_placeholders` — token extraction and validation
- `x121_core::scene_type_config::PLACEHOLDER_RE` — `LazyLock<regex::Regex>` for `{token}` matching
- `x121_db::repositories::*` — CRUD repositories with zero-sized struct pattern, `COLUMNS` const
- `x121_db::models::*` — Three-struct pattern (entity/create/update) with `FromRow`, `Serialize`, `Deserialize`
- `x121_api::handlers::*` — Consistent handler pattern with `AppState`, `AppResult`, `DataResponse`
- `x121_api::handlers::presets.rs` — Admin handler pattern with query params, `ensure_*_exists` helpers
- `x121_api::handlers::image_variant.rs` — Hardcoded `format!()` naming for variant files
- `x121_api::handlers::scene_video_version.rs` — Hardcoded imported video naming
- `x121_api::handlers::video.rs` — Hardcoded thumbnail naming (`frame_{frame:06}.jpg`)
- `x121_core::delivery` — `DeliveryManifest` with hardcoded folder/file naming
- `apps/frontend/src/features/admin/` — Admin page patterns (HardwareDashboard, ReclamationDashboard)
- `apps/frontend/src/app/navigation.ts` — Sidebar nav items with admin group

### What We're Building
1. Database migration: `naming_categories` lookup table (12 rows) and `naming_rules` configurable table
2. `NamingCategory` and `NamingRule` model structs with create/update DTOs
3. `NamingCategoryRepo` and `NamingRuleRepo` repositories
4. `NamingEngine` core module in `crates/core` with `resolve_template()` and token validation
5. Admin API endpoints for CRUD, preview, and token listing
6. Platform integration: replace all hardcoded `format!()` naming with engine calls
7. Admin UI: Naming Rules editor page with template editing, token chips, and live preview
8. Project-level naming overrides (in Project Configuration tab)
9. Integration tests at DB, core, and API levels

### Key Design Decisions
1. **Two tables** — `naming_categories` (lookup, SMALLINT PK, 12 seed rows) and `naming_rules` (configurable, BIGSERIAL PK, one active rule per category per project).
2. **Pure function in core** — `resolve_template()` is a pure function with no DB access. `resolve_filename()` is the async wrapper that loads the rule from DB first. This separation maximizes testability.
3. **Reuse existing regex pattern** — The `{token}` regex from `scene_type_config::PLACEHOLDER_RE` is extended to support `{token:N}` format specifiers.
4. **Backward-compatible seed data** — Default rules reproduce the exact output of current hardcoded patterns, ensuring zero breaking changes on migration.
5. **Project override fallback** — `resolve_filename()` tries project-specific rule first, then falls back to global default. No rule = error.
6. **Conditional tokens** — `{variant_prefix}`, `{clothes_off_suffix}`, `{index_suffix}` expand to value-or-empty-string based on context.

---

## Phase 1: Database Migration

### Task 1.1: Create `naming_categories` and `naming_rules` tables
**File:** `apps/db/migrations/YYYYMMDDHHMMSS_create_naming_rules.sql`

Create the lookup table for naming categories and the configurable table for naming rules. Seed with 12 categories and 12 default global rules matching current hardcoded patterns.

```sql
-- Naming category lookup table (PRD-116 Req 1.1)
CREATE TABLE naming_categories (
    id          SMALLINT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    example_output TEXT
);

INSERT INTO naming_categories (id, name, description, example_output) VALUES
    (1,  'scene_video',        'Generated scene video files',                'topless_dance_clothes_off_1.mp4'),
    (2,  'image_variant',      'Source image variants (clothed, topless)',    'variant_chloe_clothed_v2.png'),
    (3,  'scene_video_import', 'Externally imported scene videos',           'scene_chloe_dance_20260224.mp4'),
    (4,  'thumbnail',          'Video frame thumbnails',                     'frame_000042.jpg'),
    (5,  'metadata_export',    'Character/scene metadata JSON files',        'chloe_character_metadata.json'),
    (6,  'delivery_video',     'Video files inside delivery ZIP',            'dance.mp4'),
    (7,  'delivery_image',     'Reference images inside delivery ZIP',       'clothed.png'),
    (8,  'delivery_metadata',  'Metadata files inside delivery ZIP',         'metadata.json'),
    (9,  'delivery_folder',    'Folder structure inside delivery ZIP',       'project_name/character_name'),
    (10, 'test_shot',          'Quick test shot outputs',                    'test_chloe_dance_001.mp4'),
    (11, 'chunk_artifact',     'Intermediate workflow chunk files',          'chunk_001_chloe_dance.mp4'),
    (12, 'delivery_zip',       'The delivery ZIP file itself',               'project_alpha_delivery_20260224.zip');

-- Naming rules table (PRD-116 Req 1.1)
CREATE TABLE naming_rules (
    id          BIGSERIAL PRIMARY KEY,
    category_id SMALLINT NOT NULL REFERENCES naming_categories(id),
    project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    template    TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    changelog   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by  BIGINT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active rule per category per project (NULL project = global)
CREATE UNIQUE INDEX uq_naming_rules_category_project
    ON naming_rules (category_id, COALESCE(project_id, 0));

-- FK indexes
CREATE INDEX idx_naming_rules_category_id ON naming_rules (category_id);
CREATE INDEX idx_naming_rules_project_id  ON naming_rules (project_id) WHERE project_id IS NOT NULL;

-- Updated-at trigger
CREATE TRIGGER set_updated_at_naming_rules
    BEFORE UPDATE ON naming_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default global rules matching current hardcoded patterns
INSERT INTO naming_rules (category_id, project_id, template, description) VALUES
    (1,  NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4',
               'Default scene video naming (matches existing naming.rs)'),
    (2,  NULL, 'variant_{character_slug}_{variant_label}_v{version}.{ext}',
               'Default image variant naming'),
    (3,  NULL, 'scene_{character_slug}_{scene_type_slug}_{date_compact}.{ext}',
               'Default imported video naming'),
    (4,  NULL, 'frame_{frame_number:06}.jpg',
               'Default thumbnail naming'),
    (5,  NULL, '{character_slug}_{metadata_type}.json',
               'Default metadata export naming'),
    (6,  NULL, '{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4',
               'Default delivery video naming'),
    (7,  NULL, '{variant_label}.{ext}',
               'Default delivery image naming'),
    (8,  NULL, 'metadata.json',
               'Default delivery metadata naming'),
    (9,  NULL, '{project_slug}/{character_slug}',
               'Default delivery folder structure'),
    (10, NULL, 'test_{character_slug}_{scene_type_slug}_{sequence:03}.mp4',
               'Default test shot naming'),
    (11, NULL, 'chunk_{sequence:03}_{character_slug}_{scene_type_slug}.mp4',
               'Default chunk artifact naming'),
    (12, NULL, '{project_slug}_delivery_{date_compact}.zip',
               'Default delivery ZIP naming');
```

**Acceptance Criteria:**
- [ ] `naming_categories` table created with SMALLINT PK, 12 seed rows
- [ ] `naming_rules` table created with BIGSERIAL PK, FK to `naming_categories` and `projects`
- [ ] Unique index on `(category_id, COALESCE(project_id, 0))` prevents duplicate rules per category per project
- [ ] 12 default global rules seeded (project_id = NULL) matching current hardcoded patterns
- [ ] `changelog` JSONB column stores rule edit history (array of `{template, changed_at, changed_by}`)
- [ ] `set_updated_at` trigger applied to `naming_rules`
- [ ] FK indexes created for `category_id` and `project_id`
- [ ] Migration runs cleanly via `sqlx migrate run`

---

## Phase 2: Models & Repository

### Task 2.1: Create `NamingCategory` and `NamingRule` model structs
**File:** `apps/backend/crates/db/src/models/naming_rule.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/preset.rs` and `models/project_config.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `naming_categories` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct NamingCategory {
    pub id: i16,
    pub name: String,
    pub description: String,
    pub example_output: Option<String>,
}

/// A row from the `naming_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct NamingRule {
    pub id: DbId,
    pub category_id: i16,
    pub project_id: Option<DbId>,
    pub template: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub changelog: serde_json::Value,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new naming rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateNamingRule {
    pub category_id: i16,
    pub project_id: Option<DbId>,
    pub template: String,
    pub description: Option<String>,
}

/// DTO for updating an existing naming rule.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNamingRule {
    pub template: Option<String>,
    pub description: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] `NamingCategory` derives `Debug, Clone, FromRow, Serialize`, uses `i16` for id (matches SMALLINT)
- [ ] `NamingRule` derives `Debug, Clone, FromRow, Serialize`, uses `DbId` for id/project_id/created_by
- [ ] `CreateNamingRule` derives `Debug, Clone, Deserialize`
- [ ] `UpdateNamingRule` derives `Debug, Clone, Deserialize` with all-optional fields
- [ ] `changelog` field is `serde_json::Value` (JSONB)
- [ ] Module registered in `models/mod.rs` with `pub mod naming_rule;`

### Task 2.2: Create `NamingRuleRepo` with CRUD operations
**File:** `apps/backend/crates/db/src/repositories/naming_rule_repo.rs`

Follow the zero-sized struct pattern from `preset_repo.rs`.

```rust
pub struct NamingRuleRepo;

impl NamingRuleRepo {
    /// List all naming categories.
    pub async fn list_categories(pool: &PgPool) -> Result<Vec<NamingCategory>, sqlx::Error>;

    /// Find a naming category by name (e.g., "scene_video").
    pub async fn find_category_by_name(pool: &PgPool, name: &str) -> Result<Option<NamingCategory>, sqlx::Error>;

    /// List all naming rules, optionally filtered by project_id.
    pub async fn list_rules(pool: &PgPool, project_id: Option<DbId>) -> Result<Vec<NamingRule>, sqlx::Error>;

    /// List all rules for a specific category (global + project overrides).
    pub async fn list_rules_by_category(pool: &PgPool, category_id: i16) -> Result<Vec<NamingRule>, sqlx::Error>;

    /// Find a single naming rule by ID.
    pub async fn find_rule_by_id(pool: &PgPool, id: DbId) -> Result<Option<NamingRule>, sqlx::Error>;

    /// Find the active rule for a category, with project fallback to global.
    /// Tries project-specific first (if project_id provided), then global (project_id IS NULL).
    pub async fn find_active_rule(
        pool: &PgPool,
        category_name: &str,
        project_id: Option<DbId>,
    ) -> Result<Option<NamingRule>, sqlx::Error>;

    /// Create a new naming rule. Validates unique constraint on (category_id, project_id).
    pub async fn create_rule(
        pool: &PgPool,
        input: &CreateNamingRule,
        created_by: Option<DbId>,
    ) -> Result<NamingRule, sqlx::Error>;

    /// Update an existing naming rule. Appends previous template to changelog JSONB.
    pub async fn update_rule(
        pool: &PgPool,
        id: DbId,
        input: &UpdateNamingRule,
        changed_by: Option<DbId>,
    ) -> Result<Option<NamingRule>, sqlx::Error>;

    /// Delete a project-scoped naming rule. Returns error if rule is a global default.
    pub async fn delete_rule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key query details for `find_active_rule`:
```sql
-- Try project-specific first, fall back to global
SELECT {RULE_COLUMNS}
FROM naming_rules nr
JOIN naming_categories nc ON nc.id = nr.category_id
WHERE nc.name = $1
  AND nr.is_active = true
  AND (nr.project_id = $2 OR nr.project_id IS NULL)
ORDER BY nr.project_id IS NULL ASC   -- project-specific first (non-NULL sorts before NULL)
LIMIT 1
```

Key query details for `update_rule` (append to changelog):
```sql
UPDATE naming_rules
SET template = $2,
    description = COALESCE($3, description),
    changelog = changelog || $4::jsonb,
    updated_at = now()
WHERE id = $1
RETURNING {RULE_COLUMNS}
```
Where `$4` is a JSON object like `[{"template": "old_template", "changed_at": "2026-02-25T...", "changed_by": 42}]`.

**Acceptance Criteria:**
- [ ] Zero-sized struct with `CATEGORY_COLUMNS` and `RULE_COLUMNS` consts
- [ ] `list_categories` returns all 12 categories ordered by id
- [ ] `find_active_rule` implements project-fallback-to-global logic in a single query
- [ ] `create_rule` handles unique constraint violation with descriptive error
- [ ] `update_rule` appends the old template to the `changelog` JSONB array before updating
- [ ] `delete_rule` checks `project_id IS NOT NULL` before deleting (global defaults cannot be deleted)
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

---

## Phase 3: Core Naming Engine

### Task 3.1: Create `NamingEngine` module with token registry and template resolution
**File:** `apps/backend/crates/core/src/naming_engine.rs`

Build the pure-function naming resolution engine. This module has zero DB dependencies (it lives in `core` which depends on nothing internal). Reuse the `{placeholder}` regex pattern from `scene_type_config.rs`, extended for `{token:N}` format specifiers.

```rust
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use crate::types::DbId;

/// Regex matching `{token}` and `{token:N}` patterns.
static TOKEN_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\{(\w+)(?::(\d+))?\}").expect("valid regex"));

/// All known token names.
pub const ALL_TOKENS: &[&str] = &[
    "project_name", "project_slug",
    "character_name", "character_slug",
    "scene_type", "scene_type_slug",
    "variant_label", "variant_prefix",
    "batch_name", "batch_slug",
    "date", "date_compact", "datetime", "timestamp",
    "version", "sequence", "index_suffix",
    "frame_number", "ext",
    "resolution", "resolution_width", "resolution_height",
    "clothes_off_suffix", "metadata_type",
    "id", "uuid",
];

/// Context map providing token values for resolution.
#[derive(Debug, Clone, Default)]
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

/// Errors from the naming engine.
#[derive(Debug, thiserror::Error)]
pub enum NamingError {
    #[error("Unknown tokens in template: {tokens:?}. Available: {available:?}")]
    UnknownTokens { tokens: Vec<String>, available: Vec<String> },

    #[error("Template produced empty filename")]
    EmptyResult,

    #[error("Naming rule not found for category '{category}'")]
    RuleNotFound { category: String },
}

/// Result of template validation.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub unknown_tokens: Vec<String>,
    pub available_tokens: Vec<String>,
}

/// Result of template preview/resolution.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ResolvedName {
    pub resolved: String,
    pub tokens_used: Vec<String>,
    pub warnings: Vec<String>,
}

/// Slugify a string: lowercase, spaces→underscores, remove non-alnum except _-,
/// collapse consecutive underscores/hyphens.
pub fn slugify(input: &str) -> String { ... }

/// Validate a template against available tokens for a category.
pub fn validate_template(template: &str, category: &str) -> ValidationResult { ... }

/// Get the list of available token names for a naming category.
pub fn tokens_for_category(category: &str) -> Vec<&'static str> { ... }

/// Resolve a naming template with the given context. Pure function, no DB access.
pub fn resolve_template(template: &str, ctx: &NamingContext) -> Result<ResolvedName, NamingError> {
    // 1. Parse template for {token} and {token:N} patterns using TOKEN_RE
    // 2. For each token, look up value from NamingContext
    // 3. Apply slugification for *_slug tokens
    // 4. Handle conditional tokens (variant_prefix, clothes_off_suffix, index_suffix)
    // 5. Apply format specifiers ({sequence:03} → zero-pad to 3 digits)
    // 6. Sanitize result: remove unresolved tokens, collapse separators, trim
    // 7. Fallback to "unnamed_{uuid}" if result is empty
}

/// Sanitize a resolved filename for filesystem safety.
fn sanitize_filename(input: &str) -> String {
    // 1. Replace whitespace with underscore
    // 2. Remove chars not in [a-zA-Z0-9_\-./]
    // 3. Collapse consecutive underscores/hyphens
    // 4. Trim leading/trailing underscores/hyphens/dots
    // 5. If empty, return "unnamed_{short_uuid}"
}
```

Token-to-category mapping (defined as constants or a function):

| Category | Available Token Groups |
|----------|----------------------|
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

**Acceptance Criteria:**
- [ ] `TOKEN_RE` regex matches both `{token}` and `{token:N}` patterns
- [ ] `NamingContext` struct with all 17+ fields, derives `Debug, Clone, Default`
- [ ] `NamingError` enum with `UnknownTokens`, `EmptyResult`, `RuleNotFound` variants
- [ ] `slugify()` produces deterministic lowercase snake_case output (spaces→underscore, strip non-alnum)
- [ ] `resolve_template()` is a pure function with no DB access — takes `&str` template + `&NamingContext`
- [ ] Conditional tokens: `{variant_prefix}` → `"topless_"` or `""`, `{clothes_off_suffix}` → `"_clothes_off"` or `""`, `{index_suffix}` → `"_N"` or `""`
- [ ] Format specifiers: `{sequence:03}` → `"001"`, `{frame_number:06}` → `"000042"`
- [ ] `sanitize_filename()` produces valid filesystem names (no double underscores, no leading/trailing separators)
- [ ] Empty/null token values produce empty string (no `{null}` in output)
- [ ] `tokens_for_category()` returns the correct token list for each of the 12 categories
- [ ] `validate_template()` rejects unknown tokens with the list of available tokens
- [ ] Module registered in `core/src/lib.rs` as `pub mod naming_engine;`

### Task 3.2: Unit tests for naming engine
**File:** `apps/backend/crates/core/src/naming_engine.rs` (inline `#[cfg(test)] mod tests`)

Comprehensive unit tests for the pure resolution function, slug generation, token validation, conditional tokens, format specifiers, and edge cases.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slugify_basic() {
        assert_eq!(slugify("Chloe Riley"), "chloe_riley");
        assert_eq!(slugify("Slow Dance"), "slow_dance");
        assert_eq!(slugify("Alpha Project"), "alpha_project");
    }

    #[test]
    fn test_slugify_special_chars() {
        assert_eq!(slugify("Chloe's Dance!"), "chloes_dance");
        assert_eq!(slugify("  multiple   spaces  "), "multiple_spaces");
    }

    #[test]
    fn test_resolve_scene_video_clothed() {
        // Should match current naming.rs output: "dance.mp4"
        let ctx = NamingContext {
            variant_label: Some("clothed".into()),
            scene_type_name: Some("Dance".into()),
            ..Default::default()
        };
        let result = resolve_template(
            "{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4",
            &ctx,
        ).unwrap();
        assert_eq!(result.resolved, "dance.mp4");
    }

    #[test]
    fn test_resolve_scene_video_topless_clothes_off_indexed() {
        // Should match: "topless_slow_walk_clothes_off_1.mp4"
        let ctx = NamingContext {
            variant_label: Some("topless".into()),
            scene_type_name: Some("Slow Walk".into()),
            is_clothes_off: true,
            index: Some(1),
            ..Default::default()
        };
        let result = resolve_template(
            "{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4",
            &ctx,
        ).unwrap();
        assert_eq!(result.resolved, "topless_slow_walk_clothes_off_1.mp4");
    }

    #[test]
    fn test_format_specifier_zero_pad() {
        let ctx = NamingContext {
            frame_number: Some(42),
            ..Default::default()
        };
        let result = resolve_template("frame_{frame_number:06}.jpg", &ctx).unwrap();
        assert_eq!(result.resolved, "frame_000042.jpg");
    }

    #[test]
    fn test_format_specifier_sequence() {
        let ctx = NamingContext {
            sequence: Some(1),
            character_name: Some("Chloe".into()),
            scene_type_name: Some("Dance".into()),
            ..Default::default()
        };
        let result = resolve_template(
            "chunk_{sequence:03}_{character_slug}_{scene_type_slug}.mp4",
            &ctx,
        ).unwrap();
        assert_eq!(result.resolved, "chunk_001_chloe_dance.mp4");
    }

    #[test]
    fn test_validate_template_unknown_token() {
        let result = validate_template("{character_slug}_{nonexistent}.mp4", "scene_video");
        assert!(!result.valid);
        assert!(result.unknown_tokens.contains(&"nonexistent".to_string()));
    }

    #[test]
    fn test_validate_template_wrong_category() {
        // frame_number is only available for thumbnails
        let result = validate_template("{frame_number:06}.jpg", "scene_video");
        assert!(!result.valid);
        assert!(result.unknown_tokens.contains(&"frame_number".to_string()));
    }

    #[test]
    fn test_sanitize_double_underscores() {
        let ctx = NamingContext {
            variant_label: Some("clothed".into()),
            scene_type_name: Some("Dance".into()),
            ..Default::default()
        };
        // variant_prefix for clothed is "", resulting in potential leading underscore
        let result = resolve_template(
            "{variant_prefix}{scene_type_slug}.mp4",
            &ctx,
        ).unwrap();
        assert_eq!(result.resolved, "dance.mp4"); // no leading underscore
    }

    #[test]
    fn test_empty_context_values() {
        let ctx = NamingContext::default();
        let result = resolve_template("{character_slug}_{scene_type_slug}.mp4", &ctx).unwrap();
        // Empty slugs produce empty strings; sanitizer handles the result
        assert!(!result.resolved.contains("{"));
    }

    #[test]
    fn test_tokens_for_category() {
        let tokens = tokens_for_category("thumbnail");
        assert!(tokens.contains(&"frame_number"));
        assert!(!tokens.contains(&"batch_slug"));
    }

    #[test]
    fn test_backward_compat_with_naming_rs() {
        // Verify all 6 test cases from naming.rs produce identical output
        let cases = vec![
            ("clothed", "Dance", false, None, "dance.mp4"),
            ("topless", "Dance", false, None, "topless_dance.mp4"),
            ("clothed", "Dance", true, None, "dance_clothes_off.mp4"),
            ("clothed", "Idle", false, Some(2u32), "idle_2.mp4"),
            ("topless", "Slow Walk", true, Some(1u32), "topless_slow_walk_clothes_off_1.mp4"),
            ("clothed", "Hair Flip Idle", false, None, "hair_flip_idle.mp4"),
        ];
        let template = "{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4";
        for (variant, scene_type, clothes_off, index, expected) in cases {
            let ctx = NamingContext {
                variant_label: Some(variant.into()),
                scene_type_name: Some(scene_type.into()),
                is_clothes_off: clothes_off,
                index,
                ..Default::default()
            };
            let result = resolve_template(template, &ctx).unwrap();
            assert_eq!(result.resolved, expected, "Failed for: {variant}/{scene_type}/{clothes_off}/{index:?}");
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Backward compatibility tests verify all 6 test cases from `naming.rs` produce identical output
- [ ] Slug generation tested for basic names, special chars, multiple spaces
- [ ] Format specifier tested for `{frame_number:06}` and `{sequence:03}`
- [ ] Conditional tokens tested: `variant_prefix` (clothed vs topless), `clothes_off_suffix`, `index_suffix`
- [ ] Template validation tested: unknown tokens, wrong-category tokens
- [ ] Sanitization tested: double underscores, leading/trailing separators
- [ ] Empty context values tested: no crashes, no `{null}` in output
- [ ] Token-per-category lookup tested
- [ ] All tests pass with `cargo test -p x121_core`

---

## Phase 4: Admin API Endpoints

### Task 4.1: Create naming handler module
**File:** `apps/backend/crates/api/src/handlers/naming.rs`

Follow the existing handler patterns in `presets.rs` and `project_config.rs`. All endpoints require `admin` role.

```rust
/// GET /api/v1/admin/naming/categories
/// List all 12 naming categories with their current global rule.
pub async fn list_categories(...) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/naming/categories/:id/tokens
/// List available tokens for a specific category.
pub async fn list_category_tokens(...) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/naming/rules
/// List all rules (global + project overrides). Optional ?project_id filter.
pub async fn list_rules(...) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/naming/rules/:id
/// Get a single rule with its changelog history.
pub async fn get_rule(...) -> AppResult<impl IntoResponse>;

/// POST /api/v1/admin/naming/rules
/// Create a new rule (global or project-scoped). Validates template tokens.
pub async fn create_rule(...) -> AppResult<impl IntoResponse>;

/// PUT /api/v1/admin/naming/rules/:id
/// Update rule template. Validates tokens, appends old template to changelog.
pub async fn update_rule(...) -> AppResult<impl IntoResponse>;

/// DELETE /api/v1/admin/naming/rules/:id
/// Delete a project-scoped rule. Returns 400 if attempting to delete global default.
pub async fn delete_rule(...) -> AppResult<impl IntoResponse>;

/// POST /api/v1/admin/naming/preview
/// Preview resolved filename with sample data. Does not create any files.
pub async fn preview(...) -> AppResult<impl IntoResponse>;

/// GET /api/v1/admin/naming/rules/:id/history
/// View changelog (previous templates) for a rule.
pub async fn rule_history(...) -> AppResult<impl IntoResponse>;
```

Preview request/response:
```rust
#[derive(Debug, Deserialize)]
pub struct PreviewRequest {
    pub category: String,
    pub template: String,
    pub sample_context: Option<serde_json::Value>,
    pub sample_character_id: Option<DbId>,
    pub sample_scene_type_id: Option<DbId>,
}

#[derive(Debug, Serialize)]
pub struct PreviewResponse {
    pub resolved: String,
    pub tokens_used: Vec<String>,
    pub tokens_available: Vec<String>,
    pub warnings: Vec<String>,
}
```

For `create_rule` and `update_rule`, validate the template before persisting:
```rust
let category = NamingRuleRepo::find_category_by_name(&state.pool, &input.category_name)
    .await?
    .ok_or_else(|| AppError::Core(CoreError::NotFound { entity: "NamingCategory", id: 0 }))?;
let validation = naming_engine::validate_template(&input.template, &category.name);
if !validation.valid {
    return Err(AppError::Core(CoreError::Validation(format!(
        "Unknown tokens: {:?}. Available: {:?}",
        validation.unknown_tokens, validation.available_tokens
    ))));
}
```

**Acceptance Criteria:**
- [ ] All 9 endpoints implemented and require `admin` role
- [ ] `list_categories` returns all 12 categories with their current global template
- [ ] `list_category_tokens` returns available tokens for a category from `naming_engine::tokens_for_category()`
- [ ] `create_rule` validates template tokens before persisting, returns 422 for unknown tokens
- [ ] `update_rule` validates template, appends old template to changelog
- [ ] `delete_rule` returns 400 for global defaults (`project_id IS NULL`)
- [ ] `preview` resolves template without creating files, supports sample context and entity lookups
- [ ] `rule_history` returns the changelog JSONB array
- [ ] Handler module registered in `handlers/mod.rs` as `pub mod naming;`

### Task 4.2: Create naming routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify existing route tree)

Add admin naming routes nested under `/admin/naming`:

```rust
let naming_routes = Router::new()
    .route("/categories", get(naming::list_categories))
    .route("/categories/{id}/tokens", get(naming::list_category_tokens))
    .route("/rules", get(naming::list_rules).post(naming::create_rule))
    .route("/rules/{id}", get(naming::get_rule).put(naming::update_rule).delete(naming::delete_rule))
    .route("/rules/{id}/history", get(naming::rule_history))
    .route("/preview", post(naming::preview));

// Nest under admin routes
.nest("/admin/naming", naming_routes)
```

**Acceptance Criteria:**
- [ ] All 9 naming endpoints registered under `/api/v1/admin/naming/`
- [ ] Route tree comment updated with naming endpoints
- [ ] Admin auth middleware applied to all naming routes
- [ ] Routes compile and respond to correct HTTP methods

---

## Phase 5: Platform Integration (Replace Hardcoded Patterns)

### Task 5.1: Create async `resolve_filename()` wrapper
**File:** `apps/backend/crates/api/src/handlers/naming.rs` (or a new `crates/api/src/naming_service.rs`)

Create the async function that loads the active rule from DB and delegates to the pure `resolve_template()`. This function is called by all file creation handlers.

```rust
use x121_core::naming_engine::{self, NamingContext, NamingError, ResolvedName};
use x121_db::repositories::NamingRuleRepo;

/// Resolve a filename for a given category, with project fallback to global.
/// This is the main entry point for all file creation handlers.
pub async fn resolve_filename(
    pool: &sqlx::PgPool,
    category: &str,
    project_id: Option<DbId>,
    ctx: &NamingContext,
) -> Result<String, AppError> {
    let rule = NamingRuleRepo::find_active_rule(pool, category, project_id)
        .await?
        .ok_or_else(|| AppError::Core(CoreError::Validation(
            format!("No naming rule found for category '{category}'")
        )))?;
    let result = naming_engine::resolve_template(&rule.template, ctx)
        .map_err(|e| AppError::Core(CoreError::Validation(e.to_string())))?;
    Ok(result.resolved)
}
```

**Acceptance Criteria:**
- [ ] `resolve_filename()` loads rule via `NamingRuleRepo::find_active_rule`
- [ ] Falls back from project-specific to global rule
- [ ] Returns descriptive error if no rule found for category
- [ ] Returns descriptive error if template resolution fails
- [ ] Function is reusable across all handler modules

### Task 5.2: Replace hardcoded naming in existing handlers
**Files to modify:**

| File | Current Pattern | Category | Notes |
|------|----------------|----------|-------|
| `core/src/naming.rs` | `scene_video_filename()` | `scene_video` | Deprecate function, add `#[deprecated]` attribute |
| `api/src/handlers/image_variant.rs` | `format!("variant_{}_{}_v{}_{}.{}", ...)` | `image_variant` | Replace in upload handler |
| `api/src/handlers/scene_video_version.rs` | `format!("scene_{}_{}.{}", ...)` | `scene_video_import` | Replace in import handler |
| `api/src/handlers/video.rs` | `format!("frame_{:06}.jpg", ...)` | `thumbnail` | Replace in thumbnail generation |
| `api/src/handlers/metadata.rs` | `format!("{}_{}_{}.json", ...)` | `metadata_export` | Replace in export handler |
| `api/src/handlers/delivery.rs` | Hardcoded structure | `delivery_*` | Replace all 5 delivery categories |
| `api/src/handlers/test_shot.rs` | Test shot naming | `test_shot` | Replace in output handler |

For each handler:
1. Build `NamingContext` from available entity data
2. Call `resolve_filename(pool, category, project_id, &ctx).await?`
3. Use the returned filename instead of the hardcoded `format!()` call

Example for `image_variant.rs`:
```rust
// BEFORE:
let filename = format!("variant_{char_id}_{id}_v{ver}_{ts}.{ext}");

// AFTER:
let ctx = NamingContext {
    character_name: Some(character.name.clone()),
    variant_label: Some(input.variant_type.clone()),
    version: Some(variant.version as u32),
    extension: Some(ext.to_string()),
    entity_id: Some(variant.id),
    ..Default::default()
};
let filename = resolve_filename(&state.pool, "image_variant", project_id, &ctx).await?;
```

**Acceptance Criteria:**
- [ ] All 7+ hardcoded naming patterns replaced with `resolve_filename()` calls
- [ ] `scene_video_filename()` in `naming.rs` marked `#[deprecated]` with note pointing to naming engine
- [ ] Each handler builds an appropriate `NamingContext` from available entity data
- [ ] Default rules produce identical output to previous hardcoded patterns (backward compatible)
- [ ] No hardcoded `format!()` calls for filenames remain in handler code
- [ ] All existing tests pass (output unchanged with default rules)

---

## Phase 6: Admin UI — Naming Rules Editor

### Task 6.1: Create API hooks for naming rules
**File:** `apps/frontend/src/features/naming-rules/hooks/useNamingRules.ts`

TanStack Query hooks for all naming API endpoints.

```typescript
// useNamingCategories() — GET /admin/naming/categories
export function useNamingCategories() {
  return useQuery({
    queryKey: ['naming', 'categories'],
    queryFn: () => api.get('/admin/naming/categories'),
  });
}

// useNamingRules(projectId?) — GET /admin/naming/rules?project_id=
export function useNamingRules(projectId?: number) {
  return useQuery({
    queryKey: ['naming', 'rules', { projectId }],
    queryFn: () => api.get('/admin/naming/rules', { params: { project_id: projectId } }),
  });
}

// useCategoryTokens(categoryId) — GET /admin/naming/categories/:id/tokens
export function useCategoryTokens(categoryId: number) {
  return useQuery({
    queryKey: ['naming', 'categories', categoryId, 'tokens'],
    queryFn: () => api.get(`/admin/naming/categories/${categoryId}/tokens`),
    enabled: categoryId > 0,
  });
}

// useNamingPreview(category, template, context) — POST /admin/naming/preview (debounced)
export function useNamingPreview(category: string, template: string, context: Record<string, unknown>) {
  return useQuery({
    queryKey: ['naming', 'preview', { category, template, context }],
    queryFn: () => api.post('/admin/naming/preview', { category, template, sample_context: context }),
    enabled: template.length > 0,
    staleTime: 0,
  });
}

// useUpdateNamingRule(ruleId) — PUT /admin/naming/rules/:id
export function useUpdateNamingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; template?: string; description?: string }) =>
      api.put(`/admin/naming/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['naming'] });
    },
  });
}

// useCreateNamingRule() — POST /admin/naming/rules
// useDeleteNamingRule() — DELETE /admin/naming/rules/:id
```

**Acceptance Criteria:**
- [ ] `useNamingCategories()` fetches all 12 categories
- [ ] `useNamingRules()` supports optional project_id filter
- [ ] `useCategoryTokens()` returns available tokens for a category
- [ ] `useNamingPreview()` calls preview endpoint, enabled only when template is non-empty
- [ ] `useUpdateNamingRule()` invalidates naming queries on success
- [ ] All hooks use `api` client from `@/lib/api`
- [ ] Query keys follow `['naming', ...]` pattern

### Task 6.2: Create NamingRulesPage component
**File:** `apps/frontend/src/features/naming-rules/NamingRulesPage.tsx`

Main admin page showing all 12 naming categories grouped by type, with an inline rule editor.

```
Naming Rules
├── Category List (grouped by type)
│   ├── Generation: Scene Video, Thumbnail, Test Shot, Chunk Artifact
│   ├── Storage: Image Variant, Scene Video Import
│   ├── Export: Metadata Export
│   └── Delivery: ZIP, Folder, Video, Image, Metadata
│
├── Rule Editor (opens on category click)
│   ├── Template textarea with monospace font
│   ├── Token chips (clickable, insert at cursor position)
│   ├── Live preview (debounced 300ms)
│   ├── Sample data selectors (character dropdown, scene type dropdown)
│   └── Save / Reset to Default buttons
│
└── Project Overrides section
    └── List of projects with custom rules for this category
```

Follow the existing admin page pattern from `ReclamationDashboard.tsx` and `HardwareDashboard.tsx`.

**Acceptance Criteria:**
- [ ] Page accessible at `/admin/naming`
- [ ] All 12 categories displayed, grouped into 4 sections (Generation, Storage, Export, Delivery)
- [ ] Each category row shows: name, current template, resolved example
- [ ] Clicking a category opens the inline rule editor
- [ ] Editor shows current template in monospace textarea
- [ ] Token chips displayed below editor, clickable to insert at cursor position
- [ ] Live preview updates as template is edited (debounced 300ms)
- [ ] "Save" button calls `useUpdateNamingRule` mutation
- [ ] "Reset to Default" restores the seed template
- [ ] Unsaved changes tracked with visual indicator
- [ ] Confirmation dialog on navigation away with unsaved changes
- [ ] Named export (no default export)

### Task 6.3: Create TokenChip component
**File:** `apps/frontend/src/features/naming-rules/components/TokenChip.tsx`

Clickable chip component that inserts a `{token}` at the cursor position in the template editor.

```tsx
interface TokenChipProps {
  token: string;
  description?: string;
  onClick: (token: string) => void;
}

export function TokenChip({ token, description, onClick }: TokenChipProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-secondary
                 text-text-primary text-sm font-mono hover:bg-action-primary/20
                 transition-colors cursor-pointer"
      onClick={() => onClick(token)}
      title={description}
    >
      {`{${token}}`}
    </button>
  );
}
```

**Acceptance Criteria:**
- [ ] Renders token name in monospace font with `{...}` delimiters
- [ ] Calls `onClick` with token name when clicked
- [ ] Shows description on hover (title attribute)
- [ ] Uses design system tokens for colors (no raw hex)
- [ ] Named export

### Task 6.4: Create TemplateEditor component
**File:** `apps/frontend/src/features/naming-rules/components/TemplateEditor.tsx`

Textarea-based template editor with token insertion and live preview integration.

```tsx
interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  categoryName: string;
  categoryId: number;
  projectId?: number;
}

export function TemplateEditor({ value, onChange, categoryName, categoryId, projectId }: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: tokens } = useCategoryTokens(categoryId);
  const debouncedTemplate = useDebouncedValue(value, 300);
  const { data: preview } = useNamingPreview(categoryName, debouncedTemplate, sampleContext);

  const insertToken = (token: string) => {
    // Insert {token} at cursor position in textarea
  };

  return (
    <div>
      <textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)}
                className="font-mono w-full ..." />
      <div className="flex flex-wrap gap-2 mt-2">
        {tokens?.map(t => <TokenChip key={t.name} token={t.name} onClick={insertToken} />)}
      </div>
      {preview && (
        <div className="mt-3 p-3 bg-surface-secondary rounded-md">
          <span className="text-text-muted text-sm">Preview:</span>
          <code className="block mt-1 text-text-primary font-mono">{preview.resolved}</code>
        </div>
      )}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Monospace textarea for template editing
- [ ] Token chips rendered from `useCategoryTokens()` data
- [ ] Clicking a chip inserts `{token}` at the textarea cursor position
- [ ] Live preview shown below editor, updates on 300ms debounce
- [ ] Preview uses `useNamingPreview()` hook
- [ ] Validation errors shown inline (unknown tokens highlighted)
- [ ] Named export

### Task 6.5: Wire naming rules page into navigation and routing
**Files:**
- `apps/frontend/src/app/navigation.ts` — Add nav item
- `apps/frontend/src/app/router.tsx` — Add route
- `apps/frontend/src/app/pages/` — Add lazy page wrapper

Add to admin nav group in `navigation.ts`:
```typescript
{ label: "Naming Rules", path: "/admin/naming", icon: File, requiredRole: "admin" },
```

Add route in `router.tsx`:
```typescript
{ path: '/admin/naming', component: lazy(() => import('@/features/naming-rules/NamingRulesPage')) }
```

**Acceptance Criteria:**
- [ ] "Naming Rules" appears in Admin section of sidebar
- [ ] Route `/admin/naming` renders NamingRulesPage
- [ ] Page requires admin role (protected by AdminGuard)
- [ ] Lazy loaded for code splitting

---

## Phase 7: Project-Level Naming Overrides

### Task 7.1: Add naming overrides section to project configuration
**File:** `apps/frontend/src/features/naming-rules/components/ProjectNamingOverrides.tsx`

Component embedded in the Project Detail Configuration tab (PRD-112) showing which naming rules are overridden vs using global defaults.

```
Naming Conventions for "Alpha Project"
├── Using global defaults (10 of 12 categories)
├── Custom rules:
│   ├── Delivery Video: {character_slug}_{scene_type_slug}_final.mp4  [Edit] [Remove]
│   └── Delivery Folder: alpha/{batch_slug}/{character_slug}          [Edit] [Remove]
└── [+ Add Custom Rule] → category picker → TemplateEditor
```

**Acceptance Criteria:**
- [ ] Shows count of categories using global defaults vs custom rules
- [ ] Custom rules listed with their template and Edit/Remove actions
- [ ] "Edit" opens the same TemplateEditor component with preview
- [ ] "Remove" deletes the project-scoped rule (falls back to global), with confirmation
- [ ] "Add Custom Rule" shows category picker dropdown, then TemplateEditor
- [ ] Uses `useNamingRules(projectId)` to fetch project-specific rules
- [ ] Creates project-scoped rules via `useCreateNamingRule()` mutation
- [ ] Named export

---

## Phase 8: Integration Tests

### Task 8.1: DB-level naming rule tests
**File:** `apps/backend/crates/db/tests/naming_rule.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_categories_returns_12(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_rules_returns_12_global_defaults(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_active_rule_global(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_active_rule_project_override(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_find_active_rule_project_falls_back_to_global(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_project_override(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_duplicate_rule_fails(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_rule_appends_changelog(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_project_rule(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_global_rule_fails(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Seed data verified: 12 categories, 12 global rules
- [ ] `find_active_rule` returns project-specific rule when it exists
- [ ] `find_active_rule` falls back to global when no project override
- [ ] Creating a second rule for same category+project violates unique constraint
- [ ] Updating a rule appends old template to `changelog` JSONB
- [ ] Deleting a global default returns error or false
- [ ] Deleting a project override succeeds and removes the row
- [ ] All tests pass

### Task 8.2: API-level naming endpoint tests
**File:** `apps/backend/crates/api/tests/naming_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_categories(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_rules(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_rule(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_rule_with_valid_template(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_rule_with_invalid_template_422(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_rule(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_global_rule_400(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_project_rule_204(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_preview_endpoint(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_rule_history(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_naming_endpoints_require_admin(pool: PgPool);
```

Each test uses `common::build_test_app` and the shared HTTP helpers (`post_json`, `get`, `delete`, `put_json`, `body_json`).

**Acceptance Criteria:**
- [ ] `GET /admin/naming/categories` returns 12 categories
- [ ] `GET /admin/naming/rules` returns 12 global default rules
- [ ] `POST /admin/naming/rules` with valid template returns 201
- [ ] `POST /admin/naming/rules` with unknown token returns 422
- [ ] `PUT /admin/naming/rules/:id` updates template and appends changelog
- [ ] `DELETE /admin/naming/rules/:id` returns 400 for global default
- [ ] `DELETE /admin/naming/rules/:id` returns 204 for project-scoped rule
- [ ] `POST /admin/naming/preview` returns resolved filename
- [ ] `GET /admin/naming/rules/:id/history` returns changelog array
- [ ] All endpoints return 401/403 for non-admin users
- [ ] All tests pass

### Task 8.3: Backward compatibility integration tests
**File:** `apps/backend/crates/api/tests/naming_backward_compat.rs`

Verify that the naming engine with default rules produces identical output to the old hardcoded patterns for all 12 categories.

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_scene_video_names_match_old_naming_rs(pool: PgPool) {
    // Run the same test cases as naming.rs unit tests
    // Verify resolve_filename produces identical output
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_thumbnail_names_match_old_pattern(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_variant_names_match_old_pattern(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Scene video filenames match `naming.rs::scene_video_filename()` for all test cases
- [ ] Thumbnail filenames match `frame_{N:06}.jpg` pattern
- [ ] Image variant filenames match existing `format!()` pattern
- [ ] All default templates produce expected output with sample data
- [ ] Tests serve as regression guard against accidental naming changes
- [ ] All tests pass

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/YYYYMMDDHHMMSS_create_naming_rules.sql` | New tables + seed data migration |
| `apps/backend/crates/db/src/models/naming_rule.rs` | NamingCategory, NamingRule, Create/Update DTOs |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model module |
| `apps/backend/crates/db/src/repositories/naming_rule_repo.rs` | NamingRuleRepo with CRUD + find_active_rule |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo module |
| `apps/backend/crates/core/src/naming_engine.rs` | Pure naming resolution engine, token registry, validation |
| `apps/backend/crates/core/src/lib.rs` | Register `pub mod naming_engine` |
| `apps/backend/crates/core/src/naming.rs` | Deprecate `scene_video_filename()` |
| `apps/backend/crates/api/src/handlers/naming.rs` | Admin API handlers for naming rules |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register `pub mod naming` |
| `apps/backend/crates/api/src/lib.rs` | Add naming routes to route tree |
| `apps/backend/crates/api/src/handlers/image_variant.rs` | Replace hardcoded format! with naming engine |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | Replace hardcoded format! with naming engine |
| `apps/backend/crates/api/src/handlers/video.rs` | Replace hardcoded format! with naming engine |
| `apps/backend/crates/api/src/handlers/metadata.rs` | Replace hardcoded format! with naming engine |
| `apps/backend/crates/api/src/handlers/delivery.rs` | Replace hardcoded format! with naming engine |
| `apps/backend/crates/api/src/handlers/test_shot.rs` | Replace hardcoded format! with naming engine |
| `apps/frontend/src/features/naming-rules/hooks/useNamingRules.ts` | TanStack Query hooks |
| `apps/frontend/src/features/naming-rules/NamingRulesPage.tsx` | Main admin page |
| `apps/frontend/src/features/naming-rules/components/TokenChip.tsx` | Token chip component |
| `apps/frontend/src/features/naming-rules/components/TemplateEditor.tsx` | Template editor with preview |
| `apps/frontend/src/features/naming-rules/components/ProjectNamingOverrides.tsx` | Project override UI |
| `apps/frontend/src/app/navigation.ts` | Add "Naming Rules" to admin nav |
| `apps/frontend/src/app/router.tsx` | Add `/admin/naming` route |
| `apps/backend/crates/db/tests/naming_rule.rs` | DB-level integration tests |
| `apps/backend/crates/api/tests/naming_api.rs` | API-level integration tests |
| `apps/backend/crates/api/tests/naming_backward_compat.rs` | Backward compatibility tests |

---

## Dependencies

### Existing Components to Reuse
- `x121_core::scene_type_config::PLACEHOLDER_RE` — `{token}` regex pattern (extend for `{token:N}`)
- `x121_core::scene_type_config::resolve_prompt_template` — Template resolution logic (similar pattern)
- `x121_core::scene_type_config::extract_placeholders` / `validate_placeholders` — Token extraction
- `x121_core::naming::scene_video_filename` — Current naming function (to be deprecated, used as reference)
- `x121_core::types::{DbId, Timestamp}` — Shared type aliases
- `x121_core::error::CoreError` — Domain error variants (NotFound, Validation, Conflict)
- `x121_db::repositories::*` — Zero-sized struct, `COLUMNS` const, `&PgPool` pattern
- `x121_db::models::*` — Three-struct pattern (entity/create/update)
- `x121_api::error::{AppError, AppResult}` — HTTP error mapping
- `x121_api::response::DataResponse` — Standard `{ data }` envelope
- `x121_api::state::AppState` — Shared state with `pool: PgPool`
- `x121_api::middleware::auth::AuthUser` — Admin role verification
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`
- Frontend: `@/lib/api` client, TanStack Query patterns, design tokens

### New Infrastructure Needed
- `naming_categories` lookup table (12 seed rows)
- `naming_rules` configurable table with unique constraint
- `NamingEngine` pure module in `crates/core` (no DB dependency)
- `NamingRuleRepo` repository with project-fallback query
- `resolve_filename()` async wrapper function
- `naming-rules` frontend feature module

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration — Task 1.1
2. Phase 2: Models & Repository — Tasks 2.1-2.2
3. Phase 3: Core Naming Engine — Tasks 3.1-3.2
4. Phase 4: Admin API Endpoints — Tasks 4.1-4.2
5. Phase 5: Platform Integration — Tasks 5.1-5.2
6. Phase 8: Integration Tests — Tasks 8.1-8.3

### Post-MVP (UI & Project Overrides)
7. Phase 6: Admin UI — Tasks 6.1-6.5
8. Phase 7: Project Overrides — Task 7.1

**MVP Success Criteria:**
- All 12 naming categories have configurable rules in the database
- Core `resolve_template()` is a pure, heavily-tested function
- All hardcoded `format!()` naming calls replaced with naming engine
- Default rules produce byte-identical filenames to previous patterns (backward compatible)
- Admin API endpoints for CRUD, preview, and token listing
- DB + API integration tests pass

### Post-MVP Enhancements (PRD Phase 2)
- Retroactive batch rename (PRD-116 Req 2.1)
- Full rule versioning (PRD-116 Req 2.2)
- Custom tokens from metadata JSONB (PRD-116 Req 2.3)
- Collision detection (PRD-116 Req 2.4)
- Path templates for directory structure (PRD-116 Req 2.5)

---

## Notes

1. **Migration file naming:** Use the next available timestamp in `apps/db/migrations/`. Check existing files to avoid collisions.
2. **COALESCE trick for unique index:** `UNIQUE (category_id, COALESCE(project_id, 0))` handles the SQL limitation that `UNIQUE (category_id, project_id)` allows multiple rows where `project_id IS NULL`. Using `COALESCE(project_id, 0)` treats NULL as 0 for uniqueness purposes. Ensure project IDs never naturally equal 0 (BIGSERIAL starts at 1).
3. **Regex extension:** The existing `PLACEHOLDER_RE` matches `\{(\w+)\}`. The new `TOKEN_RE` extends this to `\{(\w+)(?::(\d+))?\}` to support format specifiers. Both regexes can coexist since they're in different modules.
4. **Caching consideration:** For MVP, the DB lookup per `resolve_filename()` call is acceptable. If performance becomes an issue, add an in-memory cache with TTL or invalidation on rule update. The `NamingRuleRepo::find_active_rule` query is lightweight (indexed lookups on small tables).
5. **Slug determinism:** The `slugify()` function must be deterministic. Same input must always produce same output. Document the exact transformation rules (lowercase, spaces→underscore, strip non-alnum except `-_`, collapse multiples) and test with edge cases.
6. **Backward compatibility is the #1 priority:** The default seed templates must reproduce the exact output of the current hardcoded functions. Task 3.2 and Task 8.3 exist specifically to verify this. If any test case diverges, the seed template is wrong.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-116
