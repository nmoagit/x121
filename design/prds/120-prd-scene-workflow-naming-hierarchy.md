# PRD-120: Scene & Workflow Naming Hierarchy (Generation Script)

## 1. Introduction/Overview

The standalone Python generation script (`scripts/python/comfyui_generate.py`) currently uses a flat `SCENE_DEFS` dictionary that maps scene names directly to `(seed_file, workflow_file)` tuples. This flat structure has several problems:

1. **No separation of concerns** -- workflow files, scene types, and seed image variants are conflated into a single mapping. Adding a new workflow requires duplicating entries for each seed variant.
2. **No display names** -- terminal output and progress tracking use raw internal names like `topless_boobs_fondle` with no human-readable labels.
3. **No hierarchy** -- there is no concept of a "scene type" that groups its clothed and topless variants together, making it impossible to filter at the type level (e.g., "all bj variants").

This PRD restructures the scene definition system into a three-level hierarchy: **Workflows** (physical files on the pod), **Scene Types** (logical groupings that reference a workflow and define which seed variants are supported), and **Scenes** (derived combinations of scene_type + seed variant). The restructuring improves extensibility (adding a new workflow or scene type requires a single entry), enables display names throughout terminal output and JSON artifacts, and supports both type-level and scene-level filtering in the CLI and config files.

## 2. Related PRDs & Dependencies

- **Independent of web app PRDs** -- this PRD covers only the standalone Python generation script. No Rust/React changes.
- **Future alignment:** PRD-111 (Scene Catalog & Track Management) defines a DB-backed catalog with tracks and scene types for the web application. A future PRD may synchronize the Python script's definitions with the web app's catalog via API or shared config. For now, the two systems are independent.
- **Depended on by:** Any future PRD that extends the generation script's scene system.

## 3. Goals

### Primary Goals
- Replace the flat `SCENE_DEFS` dict with a three-level hierarchy: `WORKFLOWS`, `SCENE_TYPES`, and derived scenes.
- Add human-readable display names for workflows, scene types, and derived scenes.
- Surface display names in terminal output, `progress.json`, and `manifest.json`.
- Support both scene-type-level and derived-scene-level filtering in `--scenes`, `--no-scenes`, and config file `[characters]` overrides.
- Maintain full backward compatibility with existing config files and CLI usage.

### Secondary Goals
- Add a `--list-scenes` CLI flag that prints the full hierarchy for reference.
- Make adding a new workflow or scene type a single-entry change.

## 4. User Stories

- As a script operator, I want to see human-readable scene names in terminal output so that I can quickly understand what is being generated without decoding internal names.
- As a script operator, I want `progress.json` and `manifest.json` to include display names so that external monitoring tools and dashboards can show friendly labels.
- As a script operator, I want to filter by scene type (e.g., `--scenes bj`) and have it expand to all variants (bj + topless_bj) so that I do not need to list every variant manually.
- As a script operator, I want to filter by specific derived scene (e.g., `--scenes topless_bj`) when I only need one variant, and have it work as before.
- As a script operator, I want to run `--list-scenes` to see the full hierarchy of workflows, scene types, seed variants, and derived scene names so that I know exactly what is available.
- As a script operator, I want my existing config files (which reference scene names like `bj`, `topless_bj`) to continue working without changes.
- As a developer, I want to add a new workflow by adding one entry to `WORKFLOWS` and one entry to `SCENE_TYPES` so that the derived scenes are automatically generated.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: WORKFLOWS Registry

**Description:** A top-level dictionary mapping workflow identifiers to their metadata. Each workflow corresponds to a physical `.json` file in `/workspace/ComfyUI/workflows_api/` on the pod.

**Acceptance Criteria:**
- [ ] `WORKFLOWS` is a module-level `dict[str, dict]` where the key is a short identifier (e.g., `"bj"`) and the value contains `name` (filename on pod, e.g., `"bj-api.json"`) and `display` (human-readable, e.g., `"BJ"`)
- [ ] All 7 current workflow files are represented:
  - `"bj"` -> `{"name": "bj-api.json", "display": "BJ"}`
  - `"boobs_fondle"` -> `{"name": "boobs-fondle-api.json", "display": "Boobs Fondle"}`
  - `"bottom"` -> `{"name": "bottom-api.json", "display": "Bottom"}`
  - `"feet"` -> `{"name": "feet-api.json", "display": "Feet"}`
  - `"strip"` -> `{"name": "strip-api.json", "display": "Strip"}`
  - `"topless_bottom"` -> `{"name": "topless-bottom-api.json", "display": "Topless Bottom"}`
  - `"topless_sex"` -> `{"name": "topless-sex-api.json", "display": "Topless Sex"}`
- [ ] No two entries share the same `name` value (filename uniqueness)

**Technical Notes:**
- The workflow `name` field is the exact filename used by `resolve_workflow()` to locate the file on the pod. No change to that function is needed beyond passing the filename from the registry instead of from `SCENE_DEFS`.

---

#### Requirement 1.2: SCENE_TYPES Registry

**Description:** A top-level dictionary mapping scene type identifiers to their metadata, including which workflow they use and which seed image variants they support.

**Acceptance Criteria:**
- [ ] `SCENE_TYPES` is a module-level `dict[str, dict]` where the key is the scene type identifier (e.g., `"bj"`) and the value contains:
  - `workflow` -- key into the `WORKFLOWS` dict (e.g., `"bj"`)
  - `display` -- human-readable name for the scene type (e.g., `"BJ"`)
  - `seeds` -- list of seed variant identifiers supported by this scene type, where each variant is a dict with `name` (the seed file basename, e.g., `"clothed"`) and `file` (the actual filename, e.g., `"clothed.png"`)
- [ ] All 7 current scene types are represented:
  - `"bj"` -> `{"workflow": "bj", "display": "BJ", "seeds": [clothed, topless]}`
  - `"feet"` -> `{"workflow": "feet", "display": "Feet", "seeds": [clothed, topless]}`
  - `"boobs_fondle"` -> `{"workflow": "boobs_fondle", "display": "Boobs Fondle", "seeds": [clothed, topless]}`
  - `"bottom"` -> `{"workflow": "bottom", "display": "Bottom", "seeds": [clothed, topless]}`
  - `"topless_bottom"` -> `{"workflow": "topless_bottom", "display": "Topless Bottom", "seeds": [topless]}`
  - `"topless_sex"` -> `{"workflow": "topless_sex", "display": "Topless Sex", "seeds": [topless]}`
  - `"boobs_clothes_off"` -> `{"workflow": "strip", "display": "Boobs Clothes Off", "seeds": [clothed]}`
- [ ] Each `workflow` value is a valid key in the `WORKFLOWS` dict (validated at module load time with an assertion)
- [ ] Scene types with `seeds: [clothed, topless]` produce two derived scenes; scene types with a single seed produce one derived scene

**Technical Notes:**
- Seed variants use a standard structure: `{"name": "clothed", "file": "clothed.png"}` and `{"name": "topless", "file": "topless.png"}`. This structure is extensible -- a future "lingerie" seed variant would simply add `{"name": "lingerie", "file": "lingerie.png"}`.

---

#### Requirement 1.3: Derived Scene Computation

**Description:** At module load time, the script derives the full list of individual scenes from `SCENE_TYPES`. Each derived scene is a combination of a scene type and a seed variant, with a computed name and display name.

**Acceptance Criteria:**
- [ ] A `build_scene_registry()` function runs at module load time and produces:
  - `SCENES` -- `dict[str, dict]` mapping derived scene name to `{"scene_type": str, "workflow_file": str, "seed_file": str, "display": str}`
  - `ALL_SCENE_NAMES` -- `list[str]` of all derived scene names (replaces current `ALL_SCENE_NAMES`)
  - `SCENE_TYPE_TO_SCENES` -- `dict[str, list[str]]` mapping each scene type to its derived scene names (for type-level filtering)
- [ ] Derived scene naming rules:
  - If the seed variant is `"clothed"`, the derived scene name equals the scene_type key (e.g., scene_type `"bj"` + seed `"clothed"` -> scene `"bj"`)
  - If the seed variant is `"topless"`, the derived scene name is `"topless_" + scene_type_key` (e.g., scene_type `"bj"` + seed `"topless"` -> scene `"topless_bj"`)
  - Exception: if the scene type key already starts with `"topless_"`, the derived name for the topless variant is just the scene_type key itself (e.g., scene_type `"topless_sex"` + seed `"topless"` -> scene `"topless_sex"`, not `"topless_topless_sex"`)
  - For single-seed scene types, the derived name equals the scene_type key regardless of seed variant
- [ ] Derived scene display names follow the pattern:
  - Clothed variant: `"Clothed " + scene_type.display` (e.g., `"Clothed BJ"`)
  - Topless variant: `"Topless " + scene_type.display` (e.g., `"Topless BJ"`)
  - Single-seed scene types: just the scene_type.display (e.g., `"Topless Sex"`, `"Boobs Clothes Off"`)
- [ ] The derived `SCENES` dict produces the same 10 scene names as the current `SCENE_DEFS`, ensuring backward compatibility:
  - `bj`, `topless_bj`, `feet`, `topless_feet`, `topless_sex`, `boobs_fondle`, `topless_boobs_fondle`, `bottom`, `topless_bottom`, `boobs_clothes_off`
- [ ] Module-level assertion verifies that `WORKFLOWS`, `SCENE_TYPES`, and `SCENES` are internally consistent (no dangling references)

**Technical Notes:**
- The `SCENES` dict replaces `SCENE_DEFS` as the authoritative lookup used by `build_scene_jobs()`, `preview_jobs()`, and `resolve_scenes()`. All callsites that currently read `SCENE_DEFS[scene]` must be updated to read from `SCENES[scene]`.

---

#### Requirement 1.4: Dual-Level Scene Filtering

**Description:** The `--scenes` and `--no-scenes` CLI flags, as well as per-character overrides in config files, accept both scene type names and derived scene names. Scene type names expand to all their derived scenes.

**Acceptance Criteria:**
- [ ] `resolve_scenes()` and `parse_scene_spec()` are updated to support dual-level resolution:
  - If a token matches a key in `SCENE_TYPE_TO_SCENES`, it expands to all derived scenes for that type
  - If a token matches a key in `SCENES` directly, it resolves to just that one scene
  - If a token matches both (e.g., `"bj"` is both a scene_type and a derived scene name), scene_type expansion takes precedence (expands to all variants)
  - Unknown tokens produce a clear error message listing both valid scene types and valid derived scene names
- [ ] `--scenes bj` expands to `["bj", "topless_bj"]` (type-level expansion)
- [ ] `--scenes topless_bj` resolves to `["topless_bj"]` only (exact derived scene match, since `topless_bj` is not a scene_type key)
- [ ] `--no-scenes bj` excludes all bj variants (`bj` and `topless_bj`)
- [ ] Per-character overrides in config files follow the same rules: `sabien_demonia = bj, feet` expands to all bj and feet variants
- [ ] Existing config files that reference derived scene names (e.g., `sabien_demonia = bj, feet, bottom`) continue to work -- `bj` matches scene_type `bj` and expands, which is a superset of the old behavior
- [ ] Error messages for unknown scenes list valid options grouped by level:
  ```
  Unknown scene: 'dance'. Valid scene types: bj, feet, boobs_fondle, ...
  Valid scenes: bj, topless_bj, feet, topless_feet, ...
  ```

**Technical Notes:**
- The precedence rule (scene_type over derived scene) is important for backward compatibility. The token `"bj"` previously meant just the `bj` scene (clothed variant). Under the new system, `"bj"` as a scene_type expands to `["bj", "topless_bj"]`. This is a **behavioral change** for users who wrote `--scenes bj` expecting only the clothed variant. The PRD accepts this change because type-level filtering is the more useful default, and users who want only the clothed variant can write `--scenes bj --no-scenes topless_bj`. This should be documented in the CLI help text.

---

#### Requirement 1.5: Display Names in Output

**Description:** All terminal output, `progress.json`, and `manifest.json` include display names alongside internal scene names.

**Acceptance Criteria:**
- [ ] The preview table (`preview_jobs()`) includes a "Display" column showing the derived scene's display name
- [ ] Terminal progress lines use display names: `[3/20] sabien_demonia / Clothed BJ` instead of `[3/20] sabien_demonia/bj`
- [ ] `progress.json` job entries include a `display` field alongside the existing `scene` field:
  ```json
  {
    "status": "completed",
    "character": "sabien_demonia",
    "scene": "bj",
    "display": "Clothed BJ",
    "workflow": "bj-api.json",
    ...
  }
  ```
- [ ] `manifest.json` entries include a `display` field:
  ```json
  {
    "character": "sabien_demonia",
    "scene": "bj",
    "display": "Clothed BJ",
    "file": "sabien_demonia/bj.mp4"
  }
  ```
- [ ] The scene type's display name and workflow display name are also included in progress/manifest entries for richer context:
  ```json
  {
    "scene_type": "bj",
    "scene_type_display": "BJ",
    "workflow_display": "BJ"
  }
  ```

**Technical Notes:**
- Display names are additive -- the existing `scene` and `workflow` fields retain their current values for backward compatibility with any external tools that parse these files.

---

#### Requirement 1.6: --list-scenes CLI Flag

**Description:** A new `--list-scenes` flag prints the full scene hierarchy and exits, providing a reference for operators.

**Acceptance Criteria:**
- [ ] `--list-scenes` outputs a formatted hierarchy showing all three levels:
  ```
  WORKFLOWS (7):
    bj             bj-api.json              "BJ"
    boobs_fondle   boobs-fondle-api.json    "Boobs Fondle"
    bottom         bottom-api.json          "Bottom"
    feet           feet-api.json            "Feet"
    strip          strip-api.json           "Strip"
    topless_bottom topless-bottom-api.json  "Topless Bottom"
    topless_sex    topless-sex-api.json     "Topless Sex"

  SCENE TYPES (7):
    bj               workflow: bj          seeds: clothed, topless   "BJ"
    feet             workflow: feet        seeds: clothed, topless   "Feet"
    boobs_fondle     workflow: boobs_fondle seeds: clothed, topless  "Boobs Fondle"
    bottom           workflow: bottom      seeds: clothed, topless   "Bottom"
    topless_bottom   workflow: topless_bottom seeds: topless         "Topless Bottom"
    topless_sex      workflow: topless_sex seeds: topless            "Topless Sex"
    boobs_clothes_off workflow: strip      seeds: clothed            "Boobs Clothes Off"

  DERIVED SCENES (10):
    bj                    seed: clothed.png   workflow: bj-api.json   "Clothed BJ"
    topless_bj            seed: topless.png   workflow: bj-api.json   "Topless BJ"
    feet                  seed: clothed.png   workflow: feet-api.json  "Clothed Feet"
    topless_feet          seed: topless.png   workflow: feet-api.json  "Topless Feet"
    boobs_fondle          seed: clothed.png   workflow: boobs-fondle-api.json "Clothed Boobs Fondle"
    topless_boobs_fondle  seed: topless.png   workflow: boobs-fondle-api.json "Topless Boobs Fondle"
    bottom                seed: clothed.png   workflow: bottom-api.json "Clothed Bottom"
    topless_bottom        seed: topless.png   workflow: topless-bottom-api.json "Topless Bottom"
    topless_sex           seed: topless.png   workflow: topless-sex-api.json "Topless Sex"
    boobs_clothes_off     seed: clothed.png   workflow: strip-api.json "Boobs Clothes Off"
  ```
- [ ] Exits with code 0 after printing (no pod interaction, no API key required)
- [ ] Works in combination with no other flags -- `--list-scenes` is a standalone informational command

---

#### Requirement 1.7: Update All Callsites

**Description:** All functions that currently reference `SCENE_DEFS` must be updated to use the new `SCENES` registry.

**Acceptance Criteria:**
- [ ] `build_scene_jobs()` reads `workflow_file` and `seed_file` from `SCENES[scene]` instead of `SCENE_DEFS[scene]`
- [ ] `preview_jobs()` uses `SCENES[scene]["seed_file"]` and includes the display name column
- [ ] `resolve_scenes()` uses `SCENES` for validation and `SCENE_TYPE_TO_SCENES` for type-level expansion
- [ ] `apply_scene_spec()` uses `SCENES` for validation and `SCENE_TYPE_TO_SCENES` for type-level expansion
- [ ] `_job_key()` remains unchanged (uses `character/scene` format with internal names)
- [ ] `ProgressTracker.start_job()`, `complete_job()`, `fail_job()` include the `display` field from `SCENES`
- [ ] `process_job()` log output uses the display name for the label
- [ ] The CLI help text (`--help` epilog) is updated to reference scene types and the `--list-scenes` flag
- [ ] `SCENE_DEFS` is completely removed -- no backward-compatible alias needed since this is internal to the script

---

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: External Configuration File

**Description:** Move workflow, scene type, and seed variant definitions from Python dicts to an external YAML or JSON configuration file.

**Acceptance Criteria:**
- [ ] Scene definitions loaded from `scenes.yaml` (or `scenes.json`) at script startup
- [ ] Falls back to embedded Python dicts if the external file is not found
- [ ] Schema validation on load with clear error messages for malformed config
- [ ] Enables non-developer operators to modify the scene inventory without editing Python code

#### Requirement 2.2: Web App Catalog Synchronization

**Description:** Synchronize the Python script's scene definitions with the web application's scene catalog (PRD-111).

**Acceptance Criteria:**
- [ ] A `--sync-catalog` flag fetches the scene catalog from the web API and builds `WORKFLOWS` / `SCENE_TYPES` dynamically
- [ ] Falls back to local definitions if the API is unreachable
- [ ] Validates that all referenced workflow files exist on the pod before proceeding

#### Requirement 2.3: Auto-Discovery of Workflow Files

**Description:** Optionally scan the pod's workflow directory to discover available workflow files.

**Acceptance Criteria:**
- [ ] A `--discover-workflows` flag lists all `*-api.json` files on the pod
- [ ] Shows which are registered in `WORKFLOWS` and which are unregistered
- [ ] Does not auto-register -- informational only

## 6. Non-Functional Requirements

### Performance
- The `build_scene_registry()` function runs at module load time and must complete in < 1ms (pure dict/list operations, no I/O).
- No additional network calls are introduced by the naming restructure -- all new logic is local computation.

### Maintainability
- Adding a new workflow requires adding exactly one entry to `WORKFLOWS`.
- Adding a new scene type requires adding exactly one entry to `SCENE_TYPES`. Derived scenes are computed automatically.
- Adding a new seed variant (e.g., `"lingerie"`) requires updating the `seeds` list of applicable scene types. The naming convention for deriving scene names from non-standard seed variants should be documented in a code comment.

## 7. Non-Goals (Out of Scope)

- **No web application changes** -- this PRD does not modify any Rust, React, or database code.
- **No workflow file validation** -- the script does not parse or validate the contents of workflow JSON files. It only checks that the file exists on the pod (existing behavior).
- **No auto-discovery** -- workflow files are not auto-discovered from the pod filesystem in MVP.
- **No database persistence** -- scene definitions live in Python dicts, not in a database.
- **No prompt management** -- prompt templates and character metadata substitution are handled by PRD-115, not this PRD.

## 8. Design Considerations

### Data Model Overview

```
WORKFLOWS (7 entries)
  bj             -> { name: "bj-api.json",              display: "BJ" }
  boobs_fondle   -> { name: "boobs-fondle-api.json",    display: "Boobs Fondle" }
  bottom         -> { name: "bottom-api.json",          display: "Bottom" }
  feet           -> { name: "feet-api.json",            display: "Feet" }
  strip          -> { name: "strip-api.json",           display: "Strip" }
  topless_bottom -> { name: "topless-bottom-api.json",  display: "Topless Bottom" }
  topless_sex    -> { name: "topless-sex-api.json",     display: "Topless Sex" }

SCENE_TYPES (7 entries)
  bj               -> { workflow: "bj",              display: "BJ",               seeds: [clothed, topless] }
  feet             -> { workflow: "feet",            display: "Feet",             seeds: [clothed, topless] }
  boobs_fondle     -> { workflow: "boobs_fondle",    display: "Boobs Fondle",     seeds: [clothed, topless] }
  bottom           -> { workflow: "bottom",          display: "Bottom",           seeds: [clothed, topless] }
  topless_bottom   -> { workflow: "topless_bottom",  display: "Topless Bottom",   seeds: [topless] }
  topless_sex      -> { workflow: "topless_sex",     display: "Topless Sex",      seeds: [topless] }
  boobs_clothes_off -> { workflow: "strip",          display: "Boobs Clothes Off", seeds: [clothed] }

SCENES (10 derived entries -- computed, not hand-written)
  bj                   -> { scene_type: "bj",     workflow_file: "bj-api.json",              seed_file: "clothed.png", display: "Clothed BJ" }
  topless_bj           -> { scene_type: "bj",     workflow_file: "bj-api.json",              seed_file: "topless.png", display: "Topless BJ" }
  feet                 -> { scene_type: "feet",   workflow_file: "feet-api.json",            seed_file: "clothed.png", display: "Clothed Feet" }
  topless_feet         -> { scene_type: "feet",   workflow_file: "feet-api.json",            seed_file: "topless.png", display: "Topless Feet" }
  boobs_fondle         -> { scene_type: "boobs_fondle", workflow_file: "boobs-fondle-api.json", seed_file: "clothed.png", display: "Clothed Boobs Fondle" }
  topless_boobs_fondle -> { scene_type: "boobs_fondle", workflow_file: "boobs-fondle-api.json", seed_file: "topless.png", display: "Topless Boobs Fondle" }
  bottom               -> { scene_type: "bottom", workflow_file: "bottom-api.json",          seed_file: "clothed.png", display: "Clothed Bottom" }
  topless_bottom       -> { scene_type: "topless_bottom", workflow_file: "topless-bottom-api.json", seed_file: "topless.png", display: "Topless Bottom" }
  topless_sex          -> { scene_type: "topless_sex", workflow_file: "topless-sex-api.json", seed_file: "topless.png", display: "Topless Sex" }
  boobs_clothes_off    -> { scene_type: "boobs_clothes_off", workflow_file: "strip-api.json", seed_file: "clothed.png", display: "Boobs Clothes Off" }
```

### Filtering Behavior Matrix

| Input | Type | Resolves To |
|-------|------|-------------|
| `--scenes bj` | scene_type match | `bj, topless_bj` |
| `--scenes topless_bj` | derived scene match | `topless_bj` |
| `--scenes bj,feet` | two scene_type matches | `bj, topless_bj, feet, topless_feet` |
| `--scenes bj,topless_feet` | mixed | `bj, topless_bj, topless_feet` |
| `--no-scenes bj` | scene_type exclusion | removes `bj, topless_bj` |
| `--no-scenes topless_bj` | derived scene exclusion | removes `topless_bj` only |
| `--scenes ALL` | all | all 10 derived scenes |
| `char = bj, feet` (config) | per-character, type-level | `bj, topless_bj, feet, topless_feet` |
| `char = NO bj` (config) | per-character, type-level excl. | all minus `bj, topless_bj` |

### Behavioral Change Note

Under the current system, `--scenes bj` means exactly the `bj` scene (clothed variant only). Under the new system, `--scenes bj` matches the `bj` scene_type and expands to both `bj` and `topless_bj`. Users who relied on the old behavior to mean "only the clothed bj variant" need to adjust to `--scenes bj --no-scenes topless_bj`. This is an intentional change -- type-level expansion is more useful as the default, and the workaround is straightforward. The `--list-scenes` flag helps users understand the new mapping.

## 9. Technical Considerations

### Existing Code to Reuse
- `resolve_workflow()` -- no changes needed; it receives a filename and locates it on the pod
- `load_workflow()` -- no changes needed
- `set_load_image()` -- no changes needed
- `process_job()` -- minor change: read display name from job dict for log output
- `ProgressTracker` -- minor change: include display fields in tracked data
- `load_config_file()` -- no changes needed to parsing; the scene spec resolution happens downstream

### Files Modified
- `scripts/python/comfyui_generate.py` -- all changes in this single file

### Database Changes
- None. This PRD modifies a standalone Python script only.

### API Changes
- None.

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Scene type key matches a derived scene name (e.g., `bj` is both) | Scene type takes precedence -- expands to all variants |
| Scene type has only topless seed but key does not start with `topless_` | Derived scene name uses `topless_` prefix (standard rule) |
| Scene type key already starts with `topless_` and only has topless seed | Derived scene name equals scene_type key (no double prefix) |
| Config file references unknown scene name | Clear error listing valid scene types and derived scenes |
| `SCENE_TYPES` entry references non-existent `WORKFLOWS` key | Module-level assertion fails at import time with descriptive message |
| Character folder missing a seed file for a scene variant | Warning emitted, scene skipped (existing behavior preserved) |
| Empty `seeds` list on a scene type | Module-level assertion fails (every scene type must have at least one seed) |
| Future seed variant (e.g., `"lingerie"`) | Derived name uses `{variant}_{type}` pattern; display uses `{Variant} {Type}` pattern. Naming convention documented in code. |

## 11. Success Metrics

- **Zero regression**: All 10 currently derived scene names are produced by the new system, matching the current `SCENE_DEFS` keys exactly.
- **Single-entry extensibility**: Adding a new workflow + scene type requires exactly 2 dict entries (one in `WORKFLOWS`, one in `SCENE_TYPES`).
- **Display name coverage**: Every terminal log line, `progress.json` entry, and `manifest.json` entry includes a human-readable display name.
- **Backward compatibility**: Existing config files work without modification (though their filtering behavior may expand to include more variants).

## 12. Testing Requirements

Since this is a standalone Python script (not part of the Rust test suite), testing is done via:

1. **Inline assertions at module load**: `build_scene_registry()` validates internal consistency of `WORKFLOWS`, `SCENE_TYPES`, and `SCENES`. Any misconfiguration fails fast.
2. **Manual verification**: Run `--list-scenes` and confirm the hierarchy matches expectations.
3. **Backward compatibility check**: Run with existing config files and verify the same jobs are produced (modulo the type-level expansion change, which is documented).
4. **Dry-run validation**: Run `--dry-run` with various `--scenes` / `--no-scenes` combinations and confirm correct expansion.
5. **Unit tests (optional but recommended)**: Add a `test_scene_registry.py` that imports the module and asserts:
   - `len(SCENES) == 10` (or current expected count)
   - All current scene names present in `SCENES`
   - Type-level expansion works correctly for each scene type
   - Display names follow the expected pattern
   - Error cases raise appropriate exceptions

## 13. Open Questions

1. **Seed variant naming convention for future variants**: The current system uses `"clothed"` and `"topless"` as seed variant names, which map to `clothed.png` and `topless.png`. If a third variant is added (e.g., `"lingerie"` -> `lingerie.png`), the derived scene name pattern would be `lingerie_bj` with display `"Lingerie BJ"`. Is this naming convention acceptable, or should variant prefixes be configurable per seed?

2. **Scene ordering**: The current `SCENE_DEFS` dict preserves insertion order (Python 3.7+). Should the derived `SCENES` dict maintain a specific ordering (e.g., alphabetical, grouped by scene_type, or matching the order of `SCENE_TYPES`)?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-27 | AI Product Manager | Initial draft |
