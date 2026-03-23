# PRD-141: Pipeline-Scoped Imports and Storage

## 1. Introduction / Overview

The import system currently has hardcoded rules based on x121's seed image naming conventions (clothed.png, topless.png, scene video filenames like bj.mp4). These rules need to become pipeline-configurable, with each pipeline defining its own import matching rules. Additionally, imports must be pipeline-isolated — the same avatar name imported into both x121 and y122 creates separate database entries and separate physical storage. The pipeline's import rules must mesh with the main naming engine (PRD-116) which provides granular template-based naming with token substitution.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-138** (Multi-Pipeline Architecture) — Pipeline entity, pipeline_id on all tables
- **PRD-113** (Character Ingest Pipeline) — Current import system
- **PRD-116** (Dynamic Naming Engine) — Template-based naming with per-category templates and project overrides

### Extends
- **PRD-139** (Pipeline Workspace Completeness) — Pipeline-filtered listings
- **PRD-140** (Character to Avatar Rename) — Uses avatar terminology

### Must Integrate With
- **PRD-116 Naming Engine** — The main naming engine has granular templates (12 categories), token substitution (`{avatar}`, `{scene_type}`, `{track}`, etc.), project-level overrides, and live preview. Pipeline import rules must:
  - Use the same token vocabulary as the naming engine
  - Respect the naming engine's template hierarchy (platform → project → pipeline)
  - Not conflict with or duplicate the naming engine's functionality
  - The naming engine should become pipeline-aware (templates can vary per pipeline)

## 3. Goals

1. **Pipeline-configurable import rules** — Each pipeline defines how filenames are matched to seed slots, scene types, and tracks during import
2. **Pipeline-isolated imports** — Same avatar name in different pipelines = separate DB records, separate storage
3. **Pipeline-scoped storage** — Physical files stored under `{storage_root}/{pipeline_code}/{project}/{avatar}/` instead of `{storage_root}/{project}/{avatar}/`
4. **Naming engine integration** — Pipeline import rules use the same naming engine (PRD-116) as delivery, with pipeline as a template hierarchy level
5. **Editable import rules** — Admin UI to configure import matching patterns per pipeline

## 4. User Stories

- **As an admin**, I want to configure import rules for y122 that expect "reference.png" as the seed image, different from x121's "clothed.png" / "topless.png".
- **As an operator**, I want to import the same person "Jane" into both x121 and y122 without the imports conflicting.
- **As a storage admin**, I want files organized by pipeline so I can manage storage per content vertical.
- **As an admin**, I want the import filename patterns to use the same naming tokens as the delivery naming engine, so the system is consistent.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Pipeline Import Rules Configuration

**Description:** Each pipeline has configurable import rules stored in a new `import_rules` JSONB column on the `pipelines` table. Rules define how dropped/uploaded filenames are matched to seed slots, scene types, and tracks.

**Acceptance Criteria:**
- [ ] `pipelines` table gains `import_rules` JSONB column
- [ ] Import rules define: seed image patterns (e.g., `{slot_name}.{ext}`), video patterns (e.g., `{scene_type}_{track}.{ext}`), metadata patterns
- [ ] Rules use the same token vocabulary as the naming engine (PRD-116)
- [ ] x121 seeded with rules matching current hardcoded behavior
- [ ] y122 seeded with rules matching single-seed import
- [ ] Admin UI page to edit import rules per pipeline

#### Requirement 1.2: Pipeline-Isolated Avatar Records

**Description:** When importing avatars, the import system creates records scoped to the import's pipeline. The same avatar name in different pipelines creates separate records.

**Acceptance Criteria:**
- [ ] Avatar ingest resolves pipeline from the target project
- [ ] Duplicate detection is scoped to the pipeline (same name in different pipelines is NOT a duplicate)
- [ ] Avatar records reference their pipeline through their project
- [ ] Import wizard shows which pipeline the import targets

#### Requirement 1.3: Pipeline-Scoped Storage Layout

**Description:** Physical files are stored in pipeline-scoped directories.

**Acceptance Criteria:**
- [ ] Storage path includes pipeline code: `{storage_root}/{pipeline_code}/{project_slug}/{avatar_slug}/`
- [ ] Existing x121 files migrated or aliased under `x121/` prefix
- [ ] New imports use the pipeline-scoped path
- [ ] File resolution (thumbnails, downloads, streaming) resolves the correct pipeline path

#### Requirement 1.4: Import Rule Matching Engine

**Description:** The import system uses pipeline-specific rules to classify uploaded files during ingest.

**Acceptance Criteria:**
- [ ] Seed image matching uses pipeline's seed slot patterns (not hardcoded "clothed"/"topless")
- [ ] Video file matching uses pipeline's scene type patterns
- [ ] Unrecognized files are flagged for manual classification
- [ ] Import preview shows how each file was classified with the pipeline's rules

#### Requirement 1.5: Naming Engine Pipeline Integration

**Description:** The naming engine (PRD-116) becomes pipeline-aware, allowing different naming templates per pipeline while maintaining the template hierarchy.

**Acceptance Criteria:**
- [ ] Naming engine template hierarchy: platform defaults → pipeline overrides → project overrides
- [ ] Pipeline can override any naming category template
- [ ] Naming admin page (within pipeline workspace) shows pipeline-specific templates
- [ ] Global naming admin page shows platform defaults
- [ ] Token `{pipeline}` / `{pipeline_code}` available in all templates
- [ ] Existing PRD-116 naming behavior unchanged for x121

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Import Rule Testing

**[OPTIONAL — Post-MVP]** Preview how a set of filenames would be classified under a pipeline's import rules, without actually importing.

#### Requirement 2.2: Cross-Pipeline Avatar Linking

**[OPTIONAL — Post-MVP]** Optional metadata to note that avatar "Jane" in x121 and "Jane" in y122 are the same real person, without sharing any data between pipelines.

## 6. Non-Goals (Out of Scope)

- Cross-pipeline file sharing (files are always pipeline-isolated)
- Automatic import rule generation from examples
- Real-time file system watchers for auto-import

## 7. Design Considerations

### Import Rules Schema
```json
{
  "seed_patterns": [
    {"slot": "clothed", "pattern": "{avatar}_clothed.{ext}", "extensions": ["png", "jpg"]},
    {"slot": "topless", "pattern": "{avatar}_topless.{ext}", "extensions": ["png", "jpg"]}
  ],
  "video_patterns": [
    {"pattern": "{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "{track}_{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "{scene_type}_{track}.{ext}", "extensions": ["mp4"]}
  ],
  "metadata_patterns": [
    {"type": "bio", "pattern": "bio.json"},
    {"type": "tov", "pattern": "tov.json"}
  ],
  "case_sensitive": false
}
```

### Naming Engine Integration
The naming engine (PRD-116) currently has:
- 12 naming categories (seed image, video, export archive, etc.)
- Token substitution (`{avatar}`, `{scene_type}`, `{track}`, `{index}`, etc.)
- Platform-level defaults and project-level overrides
- Live preview

Pipeline adds a middle tier:
```
Platform defaults → Pipeline overrides → Project overrides
```

This means:
- `pipeline.naming_rules` merges with the naming engine templates
- The existing `naming_rules` JSONB on pipelines (from PRD-138) should be migrated into the naming engine's template system
- Or the naming engine reads from both sources and pipeline takes precedence over platform

### Storage Layout
```
Current:  {storage_root}/projects/{project}/avatars/{avatar}/...
Proposed: {storage_root}/{pipeline_code}/projects/{project}/avatars/{avatar}/...
```

## 8. Technical Considerations

### Existing Code to Reuse
- Naming engine (`crates/core/src/naming_engine.rs`) — Template parsing, token substitution
- Avatar ingest system (`crates/api/src/handlers/avatar_ingest.rs`) — Import pipeline
- File classification logic in `useAvatarImportBase` hook
- Storage path resolution in `AppState::resolve_to_path()`

### Database Changes
- `pipelines` table: add `import_rules` JSONB column
- Consider adding `pipeline_id` to naming engine template tables if they exist

### API Changes
- Import rules CRUD via pipeline update endpoint
- Naming engine endpoints gain pipeline context

### Migration Concerns
- Existing x121 files need path migration or backward-compatible resolution
- The `import_rules` seed data for x121 must reproduce current hardcoded behavior exactly

## 9. Success Metrics

- y122 imports work with single "reference" seed image pattern
- x121 imports work identically to before (zero regression)
- Same avatar name in both pipelines creates isolated records
- Files stored in pipeline-scoped directories
- Naming engine templates configurable per pipeline

## 10. Open Questions

1. **Storage migration strategy** — Move existing files under `x121/` prefix, or resolve both old and new paths?
2. **Naming engine template storage** — Store pipeline templates in the naming engine tables (new `pipeline_id` column) or keep them in `pipelines.naming_rules` JSONB?
3. **Import rule complexity** — How complex should patterns be? Simple glob-style or full regex?

## 11. Version History

- **v1.0** (2026-03-23): Initial PRD creation
