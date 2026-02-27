# Task List: Scene & Workflow Naming Hierarchy (Generation Script)

**PRD Reference:** `design/prds/120-prd-scene-workflow-naming-hierarchy.md`
**Scope:** Restructure the flat `SCENE_DEFS` dictionary in `comfyui_generate.py` into a three-level hierarchy (WORKFLOWS → SCENE_TYPES → derived SCENES), add display names throughout terminal output and JSON artifacts, support dual-level filtering (scene type + derived scene), and add a `--list-scenes` informational flag.

## Overview

The current `comfyui_generate.py` uses a flat `SCENE_DEFS` dict mapping 10 scene names to `(seed_file, workflow_file)` tuples. This PRD replaces it with three registries: `WORKFLOWS` (7 entries mapping to physical workflow files), `SCENE_TYPES` (7 entries defining logical groupings with seed variants), and `SCENES` (10 derived entries computed automatically). The restructuring enables single-entry extensibility, human-readable display names in all output, and dual-level filtering where `--scenes bj` expands to all BJ variants.

All changes are in a single file: `scripts/python/comfyui_generate.py`.

### What Already Exists
- `SCENE_DEFS` dict (line 121-132) — flat mapping of 10 scene names to `(seed_file, workflow_file)` tuples
- `ALL_SCENE_NAMES` list (line 133) — derived from `SCENE_DEFS.keys()`
- `resolve_scenes()` (line 570-612) — resolves `--scenes`/`--no-scenes` CLI args to scene list
- `parse_scene_spec()` (line 615-637) — parses include/exclude scene specs from config files
- `apply_scene_spec()` (line 640-650) — applies include/exclude filters to a base scene list
- `build_scene_jobs()` (line 732-775) — builds job list from characters × scenes, reads `SCENE_DEFS[scene]`
- `preview_jobs()` (line 778-840) — displays execution plan, reads `SCENE_DEFS[j["scene"]]`
- `process_job()` (line 1079-1210) — processes a single job, uses `job["scene"]` for logging label
- `ProgressTracker` (line 864-968) — tracks job progress to `progress.json`, stores `scene` and `workflow` fields
- `main()` epilog (line 1220-1253) — lists available scenes in help text

### What We're Building
1. `WORKFLOWS` registry — 7 entries mapping workflow IDs to `{name, display}`
2. `SCENE_TYPES` registry — 7 entries mapping scene type IDs to `{workflow, display, seeds}`
3. `build_scene_registry()` function — computes `SCENES`, `ALL_SCENE_NAMES`, `SCENE_TYPE_TO_SCENES`
4. Updated `resolve_scenes()` / `parse_scene_spec()` / `apply_scene_spec()` with dual-level filtering
5. Display names in terminal output, `progress.json`, and `manifest.json`
6. `--list-scenes` CLI flag
7. Module-level assertions for internal consistency

### Key Design Decisions
1. **Scene type takes precedence over derived scene** when a token matches both (e.g., `--scenes bj` expands to `[bj, topless_bj]`). This is a documented behavioral change.
2. **Derived scene naming rules**: clothed variant = scene_type key; topless variant = `topless_` + key (unless key already starts with `topless_`); single-seed types = key as-is.
3. **Display names are additive** — existing `scene` and `workflow` fields in JSON artifacts keep their current values; new `display`, `scene_type`, `scene_type_display`, `workflow_display` fields are added alongside.
4. **`SCENE_DEFS` is completely removed** — no backward-compatible alias since it's internal to the script.

---

## Phase 1: WORKFLOWS & SCENE_TYPES Registries

### Task 1.1: Define WORKFLOWS registry
**File:** `scripts/python/comfyui_generate.py`

Replace the comment block and `SCENE_DEFS` dict (lines 117-133) with the `WORKFLOWS` registry. Each entry maps a short identifier to `{"name": <filename>, "display": <human-readable>}`.

```python
WORKFLOWS = {
    "bj":             {"name": "bj-api.json",             "display": "BJ"},
    "boobs_fondle":   {"name": "boobs-fondle-api.json",   "display": "Boobs Fondle"},
    "bottom":         {"name": "bottom-api.json",         "display": "Bottom"},
    "feet":           {"name": "feet-api.json",           "display": "Feet"},
    "strip":          {"name": "strip-api.json",          "display": "Strip"},
    "topless_bottom": {"name": "topless-bottom-api.json", "display": "Topless Bottom"},
    "topless_sex":    {"name": "topless-sex-api.json",    "display": "Topless Sex"},
}
```

**Acceptance Criteria:**
- [ ] `WORKFLOWS` is a module-level `dict[str, dict]` with 7 entries
- [ ] Each value has `name` (exact workflow filename on pod) and `display` (human-readable label)
- [ ] No two entries share the same `name` value

### Task 1.2: Define seed variant constants
**File:** `scripts/python/comfyui_generate.py`

Define the standard seed variant structures as module-level constants, placed directly after `WORKFLOWS`.

```python
SEED_CLOTHED = {"name": "clothed", "file": "clothed.png"}
SEED_TOPLESS = {"name": "topless", "file": "topless.png"}
```

**Acceptance Criteria:**
- [ ] Each seed constant has `name` (variant identifier) and `file` (actual filename)
- [ ] Constants are reused by all `SCENE_TYPES` entries (no inline dicts)

### Task 1.3: Define SCENE_TYPES registry
**File:** `scripts/python/comfyui_generate.py`

Define the `SCENE_TYPES` registry directly after the seed constants. Each entry maps a scene type identifier to `{"workflow": <key into WORKFLOWS>, "display": <label>, "seeds": [<seed constants>]}`.

```python
SCENE_TYPES = {
    "bj":                {"workflow": "bj",             "display": "BJ",               "seeds": [SEED_CLOTHED, SEED_TOPLESS]},
    "feet":              {"workflow": "feet",           "display": "Feet",             "seeds": [SEED_CLOTHED, SEED_TOPLESS]},
    "boobs_fondle":      {"workflow": "boobs_fondle",   "display": "Boobs Fondle",     "seeds": [SEED_CLOTHED, SEED_TOPLESS]},
    "bottom":            {"workflow": "bottom",         "display": "Bottom",           "seeds": [SEED_CLOTHED, SEED_TOPLESS]},
    "topless_bottom":    {"workflow": "topless_bottom", "display": "Topless Bottom",   "seeds": [SEED_TOPLESS]},
    "topless_sex":       {"workflow": "topless_sex",    "display": "Topless Sex",      "seeds": [SEED_TOPLESS]},
    "boobs_clothes_off": {"workflow": "strip",          "display": "Boobs Clothes Off", "seeds": [SEED_CLOTHED]},
}
```

**Acceptance Criteria:**
- [ ] `SCENE_TYPES` is a module-level `dict[str, dict]` with 7 entries
- [ ] Each `workflow` value is a valid key in `WORKFLOWS`
- [ ] Each `seeds` list contains 1 or 2 seed variant dicts
- [ ] Scene types with dual seeds produce 2 derived scenes; single-seed types produce 1

---

## Phase 2: Derived Scene Computation

### Task 2.1: Implement `build_scene_registry()` function
**File:** `scripts/python/comfyui_generate.py`

Create a `build_scene_registry()` function that computes the three derived data structures from `WORKFLOWS` and `SCENE_TYPES`. Place it directly after the `SCENE_TYPES` definition.

Derived scene naming rules:
- Clothed variant of a multi-seed type: derived name = scene_type key (e.g., `bj`)
- Topless variant of a multi-seed type: derived name = `topless_` + scene_type key (e.g., `topless_bj`)
  - Exception: if scene_type key already starts with `topless_`, derived name = scene_type key (no double prefix)
- Single-seed type: derived name = scene_type key regardless of seed variant

Display name rules:
- Multi-seed clothed: `"Clothed " + scene_type.display` (e.g., `"Clothed BJ"`)
- Multi-seed topless: `"Topless " + scene_type.display` (e.g., `"Topless BJ"`)
- Single-seed: just `scene_type.display` (e.g., `"Topless Sex"`)

```python
def build_scene_registry():
    """Derive SCENES, ALL_SCENE_NAMES, and SCENE_TYPE_TO_SCENES from WORKFLOWS and SCENE_TYPES."""
    scenes = {}
    type_to_scenes = {}

    for type_key, type_def in SCENE_TYPES.items():
        wf_key = type_def["workflow"]
        assert wf_key in WORKFLOWS, f"SCENE_TYPES[{type_key!r}].workflow={wf_key!r} not in WORKFLOWS"
        assert type_def["seeds"], f"SCENE_TYPES[{type_key!r}] has empty seeds list"

        wf = WORKFLOWS[wf_key]
        multi_seed = len(type_def["seeds"]) > 1
        derived = []

        for seed in type_def["seeds"]:
            # Compute derived scene name
            if not multi_seed:
                scene_name = type_key
            elif seed["name"] == "clothed":
                scene_name = type_key
            elif seed["name"] == "topless":
                scene_name = type_key if type_key.startswith("topless_") else f"topless_{type_key}"
            else:
                scene_name = f"{seed['name']}_{type_key}"

            # Compute display name
            if not multi_seed:
                display = type_def["display"]
            elif seed["name"] == "clothed":
                display = f"Clothed {type_def['display']}"
            elif seed["name"] == "topless":
                display = f"Topless {type_def['display']}"
            else:
                display = f"{seed['name'].title()} {type_def['display']}"

            scenes[scene_name] = {
                "scene_type": type_key,
                "workflow_key": wf_key,
                "workflow_file": wf["name"],
                "workflow_display": wf["display"],
                "seed_file": seed["file"],
                "seed_name": seed["name"],
                "display": display,
                "scene_type_display": type_def["display"],
            }
            derived.append(scene_name)

        type_to_scenes[type_key] = derived

    return scenes, list(scenes.keys()), type_to_scenes
```

**Acceptance Criteria:**
- [ ] Returns `(SCENES, ALL_SCENE_NAMES, SCENE_TYPE_TO_SCENES)` tuple
- [ ] `SCENES` has exactly 10 entries matching current `SCENE_DEFS` keys: `bj`, `topless_bj`, `feet`, `topless_feet`, `topless_sex`, `boobs_fondle`, `topless_boobs_fondle`, `bottom`, `topless_bottom`, `boobs_clothes_off`
- [ ] Each `SCENES` entry contains: `scene_type`, `workflow_key`, `workflow_file`, `workflow_display`, `seed_file`, `seed_name`, `display`, `scene_type_display`
- [ ] `SCENE_TYPE_TO_SCENES` maps each of the 7 scene types to its derived scene name(s)
- [ ] No `topless_topless_*` double-prefix names are generated
- [ ] Function is pure computation (no I/O)

### Task 2.2: Call `build_scene_registry()` at module load time and remove `SCENE_DEFS`
**File:** `scripts/python/comfyui_generate.py`

Replace the `SCENE_DEFS` and `ALL_SCENE_NAMES` definitions with a call to `build_scene_registry()`. Add module-level assertions.

```python
SCENES, ALL_SCENE_NAMES, SCENE_TYPE_TO_SCENES = build_scene_registry()

# Consistency assertions
assert len(SCENES) == 10, f"Expected 10 derived scenes, got {len(SCENES)}: {list(SCENES.keys())}"
assert all(wf["name"] for wf in WORKFLOWS.values()), "WORKFLOWS entries must have non-empty 'name'"
```

**Acceptance Criteria:**
- [ ] `SCENE_DEFS` is completely removed (no references remain)
- [ ] `ALL_SCENE_NAMES` is now produced by `build_scene_registry()` (same variable name, new source)
- [ ] Module-level assertions validate expected scene count and internal consistency
- [ ] Script still imports cleanly (`python -c "import comfyui_generate"` succeeds)

---

## Phase 3: Dual-Level Scene Filtering

### Task 3.1: Update `resolve_scenes()` for dual-level resolution
**File:** `scripts/python/comfyui_generate.py`

Update `resolve_scenes()` (line ~570) to support both scene type names and derived scene names. Scene type names expand to all their derived scenes.

```python
def resolve_scenes(scenes_arg: Optional[str], no_scenes_arg: Optional[str]) -> list[str]:
    if not scenes_arg or scenes_arg.strip().upper() == "ALL":
        scenes = list(ALL_SCENE_NAMES)
    else:
        includes = []
        excludes = []
        for item in scenes_arg.split(","):
            item = item.strip()
            if not item:
                continue
            if item.upper().startswith("NO "):
                excludes.append(item[3:].strip())
            else:
                includes.append(item)

        if includes:
            scenes = _expand_scene_tokens(includes)
        else:
            scenes = list(ALL_SCENE_NAMES)

        expanded_excludes = _expand_scene_tokens(excludes)
        scenes = [s for s in scenes if s not in expanded_excludes]

    # Apply --no-scenes exclusions
    if no_scenes_arg:
        tokens = [t.strip().lower() for t in no_scenes_arg.split(",") if t.strip()]
        expanded = _expand_scene_tokens(tokens)
        scenes = [s for s in scenes if s not in expanded]

    # Validate
    for s in scenes:
        if s not in SCENES:
            _raise_unknown_scene(s)

    return scenes
```

**Acceptance Criteria:**
- [ ] `--scenes bj` expands to `["bj", "topless_bj"]` (type-level expansion)
- [ ] `--scenes topless_bj` resolves to `["topless_bj"]` only (exact derived scene match)
- [ ] `--no-scenes bj` excludes both `bj` and `topless_bj`
- [ ] `--scenes bj,feet` expands to `["bj", "topless_bj", "feet", "topless_feet"]`
- [ ] Mixed: `--scenes bj,topless_feet` expands to `["bj", "topless_bj", "topless_feet"]`
- [ ] Unknown tokens produce a clear error listing valid scene types and derived scenes

### Task 3.2: Implement `_expand_scene_tokens()` and `_raise_unknown_scene()` helpers
**File:** `scripts/python/comfyui_generate.py`

Add two helper functions used by the updated filtering functions. Place them before `resolve_scenes()`.

```python
def _expand_scene_tokens(tokens: list[str]) -> list[str]:
    """Expand a list of tokens (scene type names or derived scene names) to derived scene names.

    Scene type names take precedence: if a token matches a SCENE_TYPE_TO_SCENES key,
    it expands to all derived scenes for that type.
    """
    result = []
    for token in tokens:
        token = token.lower()
        if token in SCENE_TYPE_TO_SCENES:
            for s in SCENE_TYPE_TO_SCENES[token]:
                if s not in result:
                    result.append(s)
        elif token in SCENES:
            if token not in result:
                result.append(token)
        else:
            _raise_unknown_scene(token)
    return result


def _raise_unknown_scene(name: str):
    type_names = ", ".join(SCENE_TYPE_TO_SCENES.keys())
    scene_names = ", ".join(ALL_SCENE_NAMES)
    raise ValueError(
        f"Unknown scene: '{name}'.\n"
        f"  Valid scene types: {type_names}\n"
        f"  Valid scenes: {scene_names}"
    )
```

**Acceptance Criteria:**
- [ ] `_expand_scene_tokens(["bj"])` returns `["bj", "topless_bj"]`
- [ ] `_expand_scene_tokens(["topless_bj"])` returns `["topless_bj"]`
- [ ] `_expand_scene_tokens(["bj", "topless_feet"])` returns `["bj", "topless_bj", "topless_feet"]`
- [ ] `_expand_scene_tokens(["dance"])` raises `ValueError` with helpful message
- [ ] No duplicates in output

### Task 3.3: Update `parse_scene_spec()` and `apply_scene_spec()` for dual-level resolution
**File:** `scripts/python/comfyui_generate.py`

Update `apply_scene_spec()` to use `_expand_scene_tokens()` for both includes and excludes, replacing `SCENE_DEFS` references.

```python
def apply_scene_spec(includes: list[str], excludes: list[str],
                     base_scenes: list[str]) -> list[str]:
    """Apply include/exclude filters to a base scene list with type-level expansion."""
    if includes:
        scenes = _expand_scene_tokens(includes)
        # Only keep scenes that are in the base list
        scenes = [s for s in scenes if s in base_scenes]
    else:
        scenes = list(base_scenes)

    expanded_excludes = _expand_scene_tokens(excludes) if excludes else []
    return [s for s in scenes if s not in expanded_excludes]
```

`parse_scene_spec()` needs no structural changes — it already returns `(includes, excludes)` as raw strings. The expansion happens in `apply_scene_spec()`.

**Acceptance Criteria:**
- [ ] Config line `sabien_demonia = bj, feet` expands to all bj and feet variants for that character
- [ ] Config line `carli_nicki = NO bj` excludes both `bj` and `topless_bj`
- [ ] `apply_scene_spec()` no longer references `SCENE_DEFS`
- [ ] Existing config files continue to work (backward compatible)

---

## Phase 4: Update All Callsites

### Task 4.1: Update `build_scene_jobs()` to use `SCENES`
**File:** `scripts/python/comfyui_generate.py`

Replace `SCENE_DEFS[scene]` tuple unpacking with `SCENES[scene]` dict access. Add display fields to the job dict.

```python
# Before:
seed_file, workflow = SCENE_DEFS[scene]

# After:
scene_def = SCENES[scene]
seed_file = scene_def["seed_file"]
workflow = scene_def["workflow_file"]
```

Also add display metadata to each job dict:
```python
jobs.append({
    "character": char["name"],
    "scene": scene,
    "display": scene_def["display"],
    "scene_type": scene_def["scene_type"],
    "scene_type_display": scene_def["scene_type_display"],
    "workflow_display": scene_def["workflow_display"],
    "workflow": workflow,
    "seed": str(seed_path),
    "dest_dir": str(char_output_dir),
    "dest_name": scene,
})
```

**Acceptance Criteria:**
- [ ] No references to `SCENE_DEFS` remain in `build_scene_jobs()`
- [ ] Job dicts include `display`, `scene_type`, `scene_type_display`, `workflow_display` fields
- [ ] Existing fields (`character`, `scene`, `workflow`, `seed`, `dest_dir`, `dest_name`) remain unchanged
- [ ] Jobs are generated for the same 10 scenes as before (same behavior, richer metadata)

### Task 4.2: Update `preview_jobs()` to show display names
**File:** `scripts/python/comfyui_generate.py`

Update the preview table to include a "Display" column and read seed file from `SCENES` instead of `SCENE_DEFS`.

```python
# Before:
log(f"    {'Scene':<25s} {'Seed':<14s} {'Workflow':<25s} {'Output'}")
# ...
seed_file = SCENE_DEFS[j["scene"]][0]

# After:
log(f"    {'Scene':<25s} {'Display':<25s} {'Seed':<14s} {'Workflow':<25s} {'Output'}")
# ...
scene_def = SCENES[j["scene"]]
seed_file = scene_def["seed_file"]
display = scene_def["display"]
```

**Acceptance Criteria:**
- [ ] Preview table includes a "Display" column between "Scene" and "Seed"
- [ ] No references to `SCENE_DEFS` remain in `preview_jobs()`
- [ ] Display names are shown for each job row (e.g., `"Clothed BJ"`, `"Topless Feet"`)

### Task 4.3: Update `process_job()` log output to use display names
**File:** `scripts/python/comfyui_generate.py`

Update the job header log line to include the display name.

```python
# Before:
label = f"{character}/{scene}" if scene else character
log(f"[{job_num}/{total}] {label}")

# After:
display = job.get("display", scene)
label = f"{character} / {display}" if display else f"{character}/{scene}" if scene else character
log(f"[{job_num}/{total}] {label}")
```

**Acceptance Criteria:**
- [ ] Terminal progress lines show display names: `[3/20] sabien_demonia / Clothed BJ`
- [ ] Falls back to scene name if `display` is not in job dict (backward compat for CSV/single modes)

### Task 4.4: Update `ProgressTracker` to include display fields
**File:** `scripts/python/comfyui_generate.py`

Update `start_job()`, `complete_job()`, and `fail_job()` to include `display`, `scene_type`, `scene_type_display`, and `workflow_display` fields in the progress JSON entries.

```python
# In start_job(), complete_job(), fail_job() — add these fields:
"display": job.get("display", ""),
"scene_type": job.get("scene_type", ""),
"scene_type_display": job.get("scene_type_display", ""),
"workflow_display": job.get("workflow_display", ""),
```

**Acceptance Criteria:**
- [ ] `progress.json` entries include `display`, `scene_type`, `scene_type_display`, `workflow_display`
- [ ] Existing fields (`status`, `character`, `scene`, `workflow`, `started`, etc.) remain unchanged
- [ ] Display fields default to empty string if not present in job dict

### Task 4.5: Update manifest output to include display fields
**File:** `scripts/python/comfyui_generate.py`

Update the `saved.append()` call in `process_job()` to include display metadata in the result dict that flows into `manifest.json`.

```python
saved.append({
    "character": character,
    "scene": scene or Path(workflow_name).stem.replace("-api", ""),
    "display": job.get("display", ""),
    "scene_type": job.get("scene_type", ""),
    "scene_type_display": job.get("scene_type_display", ""),
    "workflow_display": job.get("workflow_display", ""),
    "file": str(dest.relative_to(dest_dir.parent) if dest_name else out_name),
})
```

**Acceptance Criteria:**
- [ ] `manifest.json` entries include `display`, `scene_type`, `scene_type_display`, `workflow_display`
- [ ] Existing fields (`character`, `scene`, `file`) remain unchanged
- [ ] New fields are additive — no existing consumers break

---

## Phase 5: --list-scenes CLI Flag

### Task 5.1: Implement `list_scenes()` function
**File:** `scripts/python/comfyui_generate.py`

Add a function that prints the full three-level hierarchy in a formatted table. Place it after `build_scene_registry()`.

```python
def list_scenes():
    """Print the full scene hierarchy and exit."""
    print(f"\nWORKFLOWS ({len(WORKFLOWS)}):")
    for key, wf in WORKFLOWS.items():
        print(f"  {key:<20s} {wf['name']:<30s} \"{wf['display']}\"")

    print(f"\nSCENE TYPES ({len(SCENE_TYPES)}):")
    for key, st in SCENE_TYPES.items():
        seeds = ", ".join(s["name"] for s in st["seeds"])
        print(f"  {key:<22s} workflow: {st['workflow']:<18s} seeds: {seeds:<20s} \"{st['display']}\"")

    print(f"\nDERIVED SCENES ({len(SCENES)}):")
    for name, s in SCENES.items():
        print(f"  {name:<25s} seed: {s['seed_file']:<14s} workflow: {s['workflow_file']:<28s} \"{s['display']}\"")

    print(f"\nSCENE TYPE EXPANSION:")
    for type_key, scene_names in SCENE_TYPE_TO_SCENES.items():
        print(f"  --scenes {type_key:<20s} -> {', '.join(scene_names)}")
    print()
```

**Acceptance Criteria:**
- [ ] Prints all three levels: WORKFLOWS (7), SCENE TYPES (7), DERIVED SCENES (10)
- [ ] Includes a SCENE TYPE EXPANSION section showing what `--scenes <type>` resolves to
- [ ] Display names are shown in quotes for easy identification
- [ ] Output is aligned and readable

### Task 5.2: Add `--list-scenes` argument and wire it into `main()`
**File:** `scripts/python/comfyui_generate.py`

Add the CLI argument and handle it early in `main()`, before any pod interaction or API key validation.

```python
# In argparse setup:
parser.add_argument("--list-scenes", action="store_true",
                    help="Show the full scene hierarchy and exit")

# Early in main(), before API key check:
if args.list_scenes:
    list_scenes()
    sys.exit(0)
```

**Acceptance Criteria:**
- [ ] `--list-scenes` prints the hierarchy and exits with code 0
- [ ] Does not require `RUNPOD_API_KEY` or any environment variables
- [ ] Does not interact with any pod or network
- [ ] Works in combination with no other flags (standalone)

### Task 5.3: Update CLI help text / epilog
**File:** `scripts/python/comfyui_generate.py`

Update the argparse epilog to document the new hierarchy, explain that `--scenes` accepts both scene types and derived scene names, and reference `--list-scenes`.

Replace the "Available scenes:" section:

```
Scene hierarchy:
  Use --list-scenes to see the full hierarchy of workflows, scene types,
  and derived scenes.

  Scene types: bj, feet, boobs_fondle, bottom, topless_bottom, topless_sex,
               boobs_clothes_off
  Derived scenes: bj, topless_bj, feet, topless_feet, topless_sex,
                  boobs_fondle, topless_boobs_fondle, bottom,
                  topless_bottom, boobs_clothes_off

  --scenes accepts both levels:
    --scenes bj           -> expands to bj + topless_bj (scene type)
    --scenes topless_bj   -> just topless_bj (derived scene)
    --scenes bj,feet      -> all bj + all feet variants
```

**Acceptance Criteria:**
- [ ] Epilog documents both scene types and derived scene names
- [ ] Explains the type-level expansion behavior with examples
- [ ] References `--list-scenes` flag
- [ ] Backward-compatible usage examples remain valid

---

## Phase 6: Cleanup & Removal

### Task 6.1: Remove all `SCENE_DEFS` references
**File:** `scripts/python/comfyui_generate.py`

Search the entire file for any remaining references to `SCENE_DEFS` and remove/replace them. This includes:
- The original `SCENE_DEFS` dict definition (should already be removed in Task 2.2)
- Any `SCENE_DEFS[...]` access patterns in validation code
- Any comments mentioning `SCENE_DEFS`

**Acceptance Criteria:**
- [ ] `grep -n "SCENE_DEFS" comfyui_generate.py` returns zero matches
- [ ] Script runs cleanly: `python -c "import comfyui_generate"` succeeds
- [ ] `python comfyui_generate.py --list-scenes` produces correct output
- [ ] `python comfyui_generate.py --help` shows updated epilog

---

## Phase 7: Testing & Validation

### Task 7.1: Module-level assertions in `build_scene_registry()`
**File:** `scripts/python/comfyui_generate.py`

Ensure assertions are present (added in Task 2.1 and 2.2) that validate:
- Every `SCENE_TYPES[x]["workflow"]` is a key in `WORKFLOWS`
- Every `SCENE_TYPES` entry has a non-empty `seeds` list
- The derived `SCENES` dict has exactly 10 entries (current expected count)
- All 10 expected scene names are present

```python
# After build_scene_registry() call:
_EXPECTED_SCENES = {
    "bj", "topless_bj", "feet", "topless_feet", "topless_sex",
    "boobs_fondle", "topless_boobs_fondle", "bottom", "topless_bottom",
    "boobs_clothes_off",
}
assert set(SCENES.keys()) == _EXPECTED_SCENES, (
    f"Derived scenes mismatch.\n"
    f"  Expected: {sorted(_EXPECTED_SCENES)}\n"
    f"  Got:      {sorted(SCENES.keys())}"
)
```

**Acceptance Criteria:**
- [ ] Module fails fast with descriptive assertion error if registries are misconfigured
- [ ] Assertion checks exact set of 10 expected scene names
- [ ] Assertion checks WORKFLOWS reference validity
- [ ] Assertion checks non-empty seeds lists

### Task 7.2: Create optional unit test file
**File:** `scripts/python/test_scene_registry.py`

Create a small test file that imports the module and validates the scene registry.

```python
#!/usr/bin/env python3
"""Unit tests for the scene registry in comfyui_generate.py."""

import sys
from pathlib import Path

# Add parent directory to path for import
sys.path.insert(0, str(Path(__file__).parent))

from comfyui_generate import (
    WORKFLOWS, SCENE_TYPES, SCENES, ALL_SCENE_NAMES,
    SCENE_TYPE_TO_SCENES, _expand_scene_tokens, resolve_scenes,
)


def test_scene_count():
    assert len(SCENES) == 10, f"Expected 10 scenes, got {len(SCENES)}"


def test_all_expected_scenes_present():
    expected = {
        "bj", "topless_bj", "feet", "topless_feet", "topless_sex",
        "boobs_fondle", "topless_boobs_fondle", "bottom", "topless_bottom",
        "boobs_clothes_off",
    }
    assert set(SCENES.keys()) == expected


def test_scene_fields():
    for name, s in SCENES.items():
        assert "scene_type" in s, f"{name} missing scene_type"
        assert "workflow_file" in s, f"{name} missing workflow_file"
        assert "seed_file" in s, f"{name} missing seed_file"
        assert "display" in s, f"{name} missing display"
        assert s["scene_type"] in SCENE_TYPES, f"{name} scene_type {s['scene_type']} not in SCENE_TYPES"


def test_type_expansion():
    assert _expand_scene_tokens(["bj"]) == ["bj", "topless_bj"]
    assert _expand_scene_tokens(["topless_bj"]) == ["topless_bj"]
    assert _expand_scene_tokens(["topless_sex"]) == ["topless_sex"]
    assert _expand_scene_tokens(["boobs_clothes_off"]) == ["boobs_clothes_off"]


def test_type_expansion_mixed():
    result = _expand_scene_tokens(["bj", "topless_feet"])
    assert result == ["bj", "topless_bj", "topless_feet"]


def test_resolve_scenes_type_level():
    scenes = resolve_scenes("bj", None)
    assert "bj" in scenes
    assert "topless_bj" in scenes


def test_resolve_scenes_derived():
    scenes = resolve_scenes("topless_bj", None)
    assert scenes == ["topless_bj"]


def test_resolve_scenes_exclusion():
    scenes = resolve_scenes(None, "bj")
    assert "bj" not in scenes
    assert "topless_bj" not in scenes
    assert "feet" in scenes


def test_no_double_topless_prefix():
    for name in SCENES:
        assert not name.startswith("topless_topless_"), f"Double topless prefix: {name}"


def test_display_names():
    assert SCENES["bj"]["display"] == "Clothed BJ"
    assert SCENES["topless_bj"]["display"] == "Topless BJ"
    assert SCENES["topless_sex"]["display"] == "Topless Sex"
    assert SCENES["boobs_clothes_off"]["display"] == "Boobs Clothes Off"


def test_workflow_files_match():
    """Verify derived scenes produce the same workflow files as the old SCENE_DEFS."""
    old_mapping = {
        "bj": "bj-api.json",
        "topless_bj": "bj-api.json",
        "feet": "feet-api.json",
        "topless_feet": "feet-api.json",
        "topless_sex": "topless-sex-api.json",
        "boobs_fondle": "boobs-fondle-api.json",
        "topless_boobs_fondle": "boobs-fondle-api.json",
        "bottom": "bottom-api.json",
        "topless_bottom": "topless-bottom-api.json",
        "boobs_clothes_off": "strip-api.json",
    }
    for scene, expected_wf in old_mapping.items():
        assert SCENES[scene]["workflow_file"] == expected_wf, (
            f"{scene}: expected {expected_wf}, got {SCENES[scene]['workflow_file']}"
        )


def test_seed_files_match():
    """Verify derived scenes produce the same seed files as the old SCENE_DEFS."""
    old_mapping = {
        "bj": "clothed.png",
        "topless_bj": "topless.png",
        "feet": "clothed.png",
        "topless_feet": "topless.png",
        "topless_sex": "topless.png",
        "boobs_fondle": "clothed.png",
        "topless_boobs_fondle": "topless.png",
        "bottom": "clothed.png",
        "topless_bottom": "topless.png",
        "boobs_clothes_off": "clothed.png",
    }
    for scene, expected_seed in old_mapping.items():
        assert SCENES[scene]["seed_file"] == expected_seed, (
            f"{scene}: expected {expected_seed}, got {SCENES[scene]['seed_file']}"
        )


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
            print(f"  PASS  {test.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {test.__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
```

**Acceptance Criteria:**
- [ ] All tests pass: `python test_scene_registry.py` exits 0
- [ ] Tests cover: scene count, expected names, field presence, type expansion, dual-level resolution, exclusion, no double prefix, display names, workflow file matching, seed file matching
- [ ] Tests serve as backward compatibility verification (old SCENE_DEFS mapping is tested against new SCENES)

---

## Relevant Files

| File | Description |
|------|-------------|
| `scripts/python/comfyui_generate.py` | All production code changes (single file) |
| `scripts/python/test_scene_registry.py` | Unit tests for scene registry (new file) |

---

## Dependencies

### Existing Components to Reuse
- `resolve_workflow()` from `comfyui_generate.py` — no changes needed
- `load_workflow()` from `comfyui_generate.py` — no changes needed
- `set_load_image()` from `comfyui_generate.py` — no changes needed
- `load_config_file()` from `comfyui_generate.py` — no changes needed
- `ProgressTracker` from `comfyui_generate.py` — minor additions only

### New Infrastructure Needed
- None — all changes are within a single existing Python script

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Registries — Tasks 1.1-1.3
2. Phase 2: Derived computation — Tasks 2.1-2.2
3. Phase 3: Dual-level filtering — Tasks 3.1-3.3
4. Phase 4: Callsite updates — Tasks 4.1-4.5
5. Phase 5: --list-scenes — Tasks 5.1-5.3
6. Phase 6: Cleanup — Task 6.1
7. Phase 7: Testing — Tasks 7.1-7.2

**MVP Success Criteria:**
- `python -c "import comfyui_generate"` succeeds (module loads, assertions pass)
- `python comfyui_generate.py --list-scenes` prints the full hierarchy
- `python test_scene_registry.py` — all tests pass
- `python comfyui_generate.py --config <existing_config> --dry-run` shows display names in preview
- No references to `SCENE_DEFS` remain in the codebase

### Post-MVP Enhancements (PRD Phase 2)
- External configuration file (`scenes.yaml` / `scenes.json`)
- Web app catalog synchronization (`--sync-catalog`)
- Auto-discovery of workflow files (`--discover-workflows`)

---

## Notes

1. **Behavioral change**: `--scenes bj` now expands to `[bj, topless_bj]` instead of just `[bj]`. This is intentional per the PRD. Users who want only the clothed variant can use `--scenes bj --no-scenes topless_bj`.
2. **Single-file scope**: All changes are in `comfyui_generate.py`. No Rust, React, or database changes.
3. **No network calls added**: The registry restructure is pure local computation. No additional SSH or HTTP calls are introduced.
4. **Phase ordering is strict**: Phase 2 depends on Phase 1 (registries must exist before computation). Phase 3 depends on Phase 2 (`SCENES` and `SCENE_TYPE_TO_SCENES` must exist for filtering). Phase 4 depends on all prior phases.

---

## Version History

- **v1.0** (2026-02-27): Initial task list creation from PRD-120
