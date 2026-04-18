# PRD-168: ComfyUI Workflow Editor — Full Graphical Parity

**Document ID:** 168-prd-comfyui-workflow-editor-full-parity
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

---

## 1. Introduction/Overview

PRD-033 shipped a React Flow canvas that renders ComfyUI workflows, displays per-node timing telemetry, persists layout, and offers click-to-add node construction from a hardcoded catalogue of ten node types. In practice the canvas is a visualization surface, not an editor: the node classes and port definitions are baked into the frontend, inputs are displayed as a generic parameter blob, and round-tripping only works for ComfyUI **API-format** JSON (the flat object keyed by node ID produced by `/prompt`). Users who save a workflow from the ComfyUI web UI (**standard format** — `nodes` / `links` arrays with `widgets_values`, `bypass`, primitive/reroute nodes, groups) cannot import it, cannot edit widget values natively, cannot add node types that are not in the hardcoded list, and cannot toggle bypass/mute. They have to round-trip through ComfyUI's own UI for every non-trivial change, defeating the purpose of having an in-app editor.

This PRD extends PRD-033 to full graphical editing parity with the ComfyUI frontend. It introduces a widget rendering system driven by the authoritative `/object_info` schema exposed over the PRD-005 bridge, adds the three "UI-only" node kinds ComfyUI relies on (Primitive, Reroute, Note/Group), supports bypass and mute toggles, and makes standard ↔ API format conversion a first-class workflow concern so that every workflow the platform touches round-trips losslessly between the storage format (standard — preserves UI metadata) and the execution format (API — what ComfyUI actually runs).

The PRD also defines what "missing custom node" means for the editor: we treat an unknown class as a placeholder node that remains editable at the JSON level and fails validation at execute time, rather than blocking the entire workflow.

## 2. Related PRDs & Dependencies

### Depends On (Hard)
- **PRD-033** — Node-Based Workflow Canvas. Provides the React Flow surface, layout persistence, telemetry overlay, and current API-format importer. This PRD extends it in place.
- **PRD-005** — ComfyUI WebSocket Bridge. Exposes `/object_info` (node class registry) and the REST client this PRD needs for widget schemas, input/output type maps, and node-class validation.
- **PRD-075** — ComfyUI Workflow Import & Validation. Owns the validation framework (node class presence, model/LoRA presence, parameter discovery, version management). This PRD hooks into PRD-075 validation at edit time and execute time instead of duplicating it.

### Depends On (Soft)
- **PRD-029** — Design System. Widget controls (string input, number spinner, combo/select, slider, seed randomiser, image picker) must be built from existing primitives.
- **PRD-115** — Generation Strategy & Workflow Prompt Management. Its prompt slot / fragment system must continue to work against workflows edited through this PRD (widget-to-input conversion must not strip slot annotations).
- **PRD-146** — Dynamic Generation Seeds. Media-slot auto-detection must continue to work against workflows saved in standard format.

### Extends
- **PRD-033** — Canvas gains widgets, primitives, reroute, bypass, search palette.
- **PRD-075** — Validation gains node-class-exists check against the connected worker's `/object_info`.

### Part
Part 5 — Workflow Editor & Review.

## 3. Goals

### Primary
- Users can import a workflow saved from ComfyUI's own UI (standard format) and have it render, edit, and execute identically to how it runs in ComfyUI.
- Every input widget ComfyUI supports is editable inline on the node (string, int, float, combo/enum, boolean, seed with randomise, image/file picker, model picker, multiline text).
- A searchable "Add Node" palette shows every node class available on the connected ComfyUI instance, not a hardcoded list.
- Workflows round-trip losslessly through the platform: standard-in → edit → standard-out preserves node positions, widget values, bypass state, primitives, reroutes, groups, and notes.

### Secondary
- Graceful degradation when a workflow references a node class not installed on the target worker (placeholder rendering, editable JSON, execute-time validation error — never a hard block on opening the workflow).
- Bypass and mute toggles per node, surfaced in the UI and preserved through format conversion.
- Primitive and Reroute nodes are first-class so users can refactor wire topology and lift widgets into shared values.

## 4. User Stories

- As a Creator, I want to drag a workflow JSON saved from ComfyUI's web UI into the app and have it open in the editor with every widget value, group, and reroute intact so that I do not have to re-import through the API format.
- As a Creator, I want to search for "KSampler" in an add-node palette and insert it into my graph so that I do not have to switch to ComfyUI to compose a pipeline.
- As a Creator, I want to edit a KSampler's seed, steps, and sampler_name directly on the node card so that I do not have to open a modal or edit JSON.
- As a Creator, I want to right-click a node and choose "Bypass" so that I can debug a pipeline by excluding a node without deleting it and its wires.
- As a Creator, I want to convert a widget into an input (or vice versa) so that I can wire a shared Primitive value into several nodes.
- As an Admin, I want workflows stored in standard format so that a user editing the workflow in ComfyUI's native UI and re-importing sees exactly what I last saved.
- As a Creator, I want a clear error when I try to execute a workflow that references a node class the target worker does not have, so that I do not waste GPU time on a run that was never going to succeed.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Chosen Architecture Path — Native React Flow Editor

**Description:** Build the editor as a native React Flow surface driven by `/object_info`, extending PRD-033's existing canvas.

**Rationale — why Path B over Path A:**

| | Path A: Embed ComfyUI frontend | Path B: Native React Flow (chosen) |
|---|---|---|
| Time to parity | Fastest — iframe / mount `ComfyUI_frontend` and it "just works" | Slower — we own widget rendering, palette, primitives |
| UX integration | Constrained — ComfyUI's look/feel/keybinds, hard to blend with app shell, context-menu + hotkey collisions | Full control — matches PRD-029 design system, consistent with rest of app |
| Upgrade coupling | Tight — pinned to `ComfyUI_frontend` release cadence, breaking changes propagate | Loose — coupled only to `/object_info` wire format, which is stable |
| Custom-node coverage | Free — whatever ComfyUI supports | Must be derived from `/object_info` (which **is** the ComfyUI frontend's own source of truth, so parity is achievable) |
| Telemetry overlay from PRD-033 | Would need to be re-done inside the embed | Already works — telemetry attaches to React Flow nodes |
| Integration with PRD-115 slots / PRD-146 media slots / PRD-075 validation | Would need an IPC bridge back out of the iframe | Direct — same React tree |
| Cost if we ever remove ComfyUI | Rewrite | Already native |

PRD-033 already picked React Flow and the existing features (telemetry, layout persistence, import pipeline) build directly on it. Going Path A now would mean reverting and re-doing that work; going Path B extends it.

**Acceptance Criteria:**
- [ ] The editor remains a React Flow surface — no iframe, no mounted `ComfyUI_frontend` bundle.
- [ ] All node rendering is driven by data fetched from `/object_info`, not hardcoded catalogue entries.
- [ ] The hardcoded ten-entry `CATALOG_ENTRIES` in `workflow-canvas/NodeCatalogue.tsx` is removed or reduced to a fallback.
- [ ] The widget rendering system is shared by all node types (one `WidgetRenderer` component dispatches by input spec type).

**Technical Notes:** Keep PRD-033's React Flow tree. Replace the static `NodeCatalogueEntry[]` with a TanStack Query hook that fetches `/object_info` via the PRD-005 bridge, normalised into a `NodeClassRegistry` keyed by class name. Cache per connected worker (different workers may have different installed custom nodes).

#### Requirement 1.2: `/object_info` Integration — Node Class Registry

**Description:** Fetch, cache, and expose the node class registry from `/object_info` as the single source of truth for node types, input schemas, and output types.

**Acceptance Criteria:**
- [ ] A new hook `useObjectInfo(workerId)` fetches `/object_info` for a given connected worker via the PRD-005 bridge and caches the result with TanStack Query (5-minute `staleTime`, invalidates when worker reconnects).
- [ ] Response is normalised into a typed `NodeClassDef` — `{ name, display_name, category, description, input: { required: [...], optional: [...], hidden: [...] }, output: [...], output_name: [...], output_is_list: [...] }` matching the ComfyUI `/object_info` shape.
- [ ] Each input entry preserves its widget spec: `[type_name, config_object?]` e.g. `["INT", { default: 20, min: 1, max: 10000 }]`, `["STRING", { multiline: true }]`, `[[enum values...], { default }]`.
- [ ] The registry is the source of truth for: the Add Node palette (Req 1.3), widget rendering (Req 1.4), standard→API conversion (Req 1.7), and edit-time node-class validation (Req 1.8).
- [ ] If no worker is connected, the editor falls back to the last-cached registry from localStorage and shows a banner "Editing against cached node schema — connect a worker to refresh".

**Technical Notes:** Add a Rust endpoint `GET /workflows/object-info?worker_id=...` that proxies to the selected worker's `/object_info` and caches it in-memory on the backend with a short TTL. This centralises worker access through the PRD-005 bridge rather than each frontend tab hitting ComfyUI directly.

#### Requirement 1.3: Node Search & Add Palette

**Description:** A searchable palette showing every node class from the registry, replacing the hardcoded ten-entry catalogue.

**Acceptance Criteria:**
- [ ] A keyboard shortcut (default: double-click on empty canvas, or <kbd>Tab</kbd>) opens a centred search palette.
- [ ] The palette lists every class from the registry, grouped by category (`node.category` from `/object_info`, e.g. "sampling", "loaders", "conditioning").
- [ ] Fuzzy search filters by class name, display name, category, and output type (e.g. searching "LATENT" surfaces nodes that produce a `LATENT` output).
- [ ] Selecting an entry (click or <kbd>Enter</kbd>) inserts the node at the cursor position with default widget values drawn from the input spec.
- [ ] Arrow keys navigate results; <kbd>Esc</kbd> closes the palette.
- [ ] The existing sidebar `NodeCatalogue` either stays as a browsable tree view over the same registry or is removed — the palette is the primary add mechanism.

**Technical Notes:** Reuse `SearchInput` from `@/components/primitives`. Palette can be implemented as a floating panel anchored to cursor; for MVP a centred modal is acceptable.

#### Requirement 1.4: Widget Rendering System

**Description:** Inline-editable controls on each node card, dispatched by the input spec type from the registry.

**Acceptance Criteria:**
- [ ] A `WidgetRenderer` component maps input spec to UI control:
  - `STRING` → `<TextInput>` (multiline if spec has `multiline: true`)
  - `INT` → `<NumberInput>` (respects `min`, `max`, `step`)
  - `FLOAT` → `<NumberInput step={0.1}>` (respects `min`, `max`, `step`, `round`)
  - `BOOLEAN` → `<Switch>`
  - Enum (array of strings, e.g. sampler names) → `<Select>`
  - Seed-family inputs (name is `seed` or `noise_seed`) → `<NumberInput>` plus a randomise button and a control-after-generate mode toggle (`fixed` | `increment` | `decrement` | `randomize`)
  - Image / file paths → `<FilePicker>` wired to the platform's existing asset registry (PRD-017)
  - Model / LoRA pickers (inputs typed as e.g. `MODEL`, `LORA_NAME`, `VAE_NAME`) → `<Select>` driven by `/object_info`'s enum values for that input (which is how ComfyUI exposes installed model lists)
- [ ] Widgets edit the node's in-memory state; changes are debounced and persisted through the existing PRD-033 layout-save mechanism.
- [ ] Required inputs that have no widget (i.e. inputs typed as model-flow types like `MODEL`, `CLIP`, `VAE`, `CONDITIONING`, `LATENT`, `IMAGE`) render as connection ports only, no widget control.
- [ ] Optional inputs render collapsed behind a "Show optional" toggle on each node.
- [ ] Hidden inputs (from `input.hidden`) are never rendered.

**Technical Notes:** Follow PRD-029 design tokens. Widget components should live under `features/workflow-canvas/widgets/` and be re-exported. No bespoke CSS — compose with existing primitives.

#### Requirement 1.5: Bypass & Mute Toggles

**Description:** Per-node bypass and mute state, preserved through format conversion.

**Acceptance Criteria:**
- [ ] Right-clicking a node shows a context menu with "Bypass" and "Mute" toggles (mirroring ComfyUI's semantics: bypassed nodes pass inputs through to outputs where types match; muted nodes break the chain).
- [ ] Bypassed nodes render with a dashed border + reduced opacity; muted nodes render with a crossed-out overlay.
- [ ] The standard-format field `mode` (`0` = normal, `2` = muted, `4` = bypassed) is preserved on import and emitted on export.
- [ ] API-format export omits bypassed/muted nodes and rewires bypass-pass-through connections to match ComfyUI's bypass semantics.
- [ ] Keyboard shortcut: <kbd>Ctrl/Cmd+B</kbd> bypass, <kbd>Ctrl/Cmd+M</kbd> mute.

#### Requirement 1.6: Primitive & Reroute Nodes

**Description:** Support the two UI-only node kinds ComfyUI uses for graph ergonomics.

**Acceptance Criteria:**
- [ ] `PrimitiveNode` — a UI-only node that holds a literal value and exposes a single typed output port. The value widget is chosen at wire-time based on what input it connects to (e.g. connecting a Primitive to a `steps` INT input turns it into an INT primitive with the INT widget spec).
- [ ] `Reroute` — a UI-only passthrough node with one input port and one output port, used to route wires. Preserves source type.
- [ ] Primitives and Reroutes are emitted only in standard format; on conversion to API format, they are resolved inline (Primitive values become the downstream input value, Reroutes are bypassed).
- [ ] Converting a widget to an input: right-click a widget → "Convert to input" → the widget becomes an input port, a new Primitive node spawns wired into it (matching ComfyUI's convert-widget-to-input behaviour).
- [ ] Converting an input back to a widget: right-click an input port that is wired only to a single Primitive → "Convert to widget" → the Primitive's value is collapsed back onto the node as a widget, the port becomes a widget, and the Primitive is deleted.

#### Requirement 1.7: Standard ↔ API Format Conversion

**Description:** Full bidirectional conversion between the standard format (what ComfyUI's web UI saves) and the API format (what ComfyUI's `/prompt` endpoint accepts). **This is in scope for MVP.**

**Acceptance Criteria:**
- [ ] **Format detection:** On import, the parser detects format by shape — standard has top-level `nodes: [...]`, `links: [...]`, `groups: [...]`, `version`, `last_node_id`, `last_link_id`; API is an object whose values all have `class_type` and `inputs`. The existing parser in `workflow-canvas/comfyui-parser.ts` handles API-only and must be extended (not replaced) to cover both.
- [ ] **Standard → editor state:** Each entry in `nodes[]` maps to a `CanvasNode` with `id = String(node.id)`, `position` from `node.pos`, `type` from `node.type` (matched against the registry), `widgets_values` zipped against the registry input spec to populate `parameters`, `mode` carried through, `inputs[]`/`outputs[]` slot layout preserved for port rendering. Each entry in `links[]` maps to a `CanvasEdge`.
- [ ] **Editor state → standard:** Inverse of the above. Positions, widget values, bypass/mute, primitives, reroutes, groups, and link colours round-trip.
- [ ] **Editor state → API:** For each non-UI, non-bypassed, non-muted node, emit `{ [id]: { class_type, inputs: { ... } } }` where each input entry is either a literal value (from a widget) or a `[source_node_id, output_index]` tuple (from a connection). Resolution order:
  1. For each input on the node, look up its position in the registry's `input.required` + `input.optional` key list (this gives the named key the API expects).
  2. If the input is a port with a connected edge, emit the tuple.
  3. Otherwise emit the widget value. For `widgets_values` from standard format, zip them against the registry's input-spec order (skipping connection-only inputs and special `seed`-family control-after-generate entries, matching ComfyUI's own `graphToPrompt` logic).
  4. Primitives are inlined — their output value becomes the literal value of every input they wire to.
  5. Reroutes are bypassed — every edge `A → Reroute → B` becomes `A → B`.
  6. Bypassed nodes are removed; their input-to-output passthroughs are rewired per type-matching bypass rules.
  7. Muted nodes are removed and no rewiring occurs (downstream nodes lose that input — will fail validation if the input was required, which is correct).
- [ ] **Storage contract:** The canonical stored form is **standard format** (preserves UI metadata). API format is generated on execute and never stored as the primary representation.
- [ ] **Round-trip test:** A suite of fixture workflows (at minimum: a baseline SDXL txt2img, an ControlNet workflow, a workflow with primitives + reroutes + groups, a workflow with a bypassed node) imports as standard, saves, reloads, and emits byte-equivalent standard JSON (modulo insignificant whitespace / key ordering).
- [ ] **API-format back-compat:** If an API-format file is imported, it is upgraded to standard on first save (positions auto-laid-out, empty `widgets_values` inferred from the input object).

**Technical Notes:** The bulk of this requirement is in `comfyui-parser.ts`. The existing `parseComfyUIWorkflow` handles only API format and must be renamed to `parseApiFormat`, with a new `parseStandardFormat` and a top-level `parseWorkflow` that dispatches on shape. A new `toStandardFormat` and `toApiFormat` complete the bidirectional surface. The API exporter is what PRD-033's existing `/workflows/import-comfyui` endpoint and PRD-024 execution path should call — there is exactly one conversion path, shared.

#### Requirement 1.8: Missing Custom Node Handling

**Description:** When a workflow references a `class_type` that is not in the connected worker's `/object_info`, degrade gracefully.

**Acceptance Criteria:**
- [ ] The unknown class renders as a **placeholder node** with a warning icon, the raw class name, and a list of its raw input/output entries inferred from the JSON.
- [ ] The placeholder is editable at the parameter-value level (positional widgets from `widgets_values` without typed widgets — just raw text boxes).
- [ ] The placeholder can be connected to / disconnected from other nodes — connections are preserved in storage.
- [ ] On execute, a validation step (hook into PRD-075 validation framework) fails with a clear error: `"Node class 'CustomNodeX' is not installed on worker {name}. Install it on the worker or remove nodes of this type before executing."` — the request never reaches the worker.
- [ ] The editor shows a persistent banner at the top of the canvas: "N node(s) reference missing custom nodes — this workflow cannot be executed on the current worker." with a link to a dialog listing them and which workers, if any, do have them.
- [ ] **Out of scope:** Auto-installing missing custom nodes — deferred to a later PRD (ComfyUI-Manager integration is its own can of worms around permissions, restart semantics, and supply-chain trust).

#### Requirement 1.9: Save / Load in Both Formats

**Description:** Users can explicitly export in either format.

**Acceptance Criteria:**
- [ ] "Export workflow" menu offers both: **Standard (for editing)** and **API (for execution)**.
- [ ] "Import workflow" accepts either format (format auto-detected per Req 1.7).
- [ ] The existing PRD-075 workflow import flow is extended to accept standard-format uploads; its validation (node class presence, model/LoRA presence, parameter discovery) runs against the detected format without caring which it is.
- [ ] The stored-on-disk / stored-in-DB canonical form is standard (Req 1.7).

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL — Post-MVP]** Requirement 2.1: Groups
**Description:** Support the ComfyUI "group" construct — coloured rectangles that visually cluster nodes and move together.
**Acceptance Criteria:**
- [ ] Groups from standard format render as React Flow group nodes.
- [ ] Users can create, resize, recolour, and delete groups.
- [ ] Moving a group moves all contained nodes.

#### **[OPTIONAL — Post-MVP]** Requirement 2.2: Notes
**Description:** Sticky-note-style annotations on the canvas (separate from PRD-095 production notes).
**Acceptance Criteria:**
- [ ] Standard-format notes import and export.
- [ ] Users can create, edit, reposition, and delete notes.

#### **[OPTIONAL — Post-MVP]** Requirement 2.3: Subgraphs / Collapsible Groups
**Description:** Collapse a group of nodes into a reusable subgraph node. Addresses PRD-033's open question on sub-graphs.

#### **[OPTIONAL — Post-MVP]** Requirement 2.4: ComfyUI-Manager Integration
**Description:** Surface "install missing node" actions inline from the missing-node banner.

#### **[OPTIONAL — Post-MVP]** Requirement 2.5: Multi-Select, Copy/Paste, Undo/Redo Parity
**Description:** Match ComfyUI's editing conveniences — marquee select, copy/paste with ID remapping, undo/redo per-edit.

## 6. Non-Functional Requirements

### Performance
- Canvas with 100 nodes and 150 edges renders at ≥30 fps during pan/zoom (tightens PRD-033's 50-node target — real ComfyUI workflows routinely exceed 50 nodes once LoRA stacks and ControlNets are involved).
- `/object_info` fetch completes within 2s for a worker with a standard node set; within 10s for a worker with 500+ custom nodes (which `/object_info` can produce).
- Widget value changes feel instant — input debounce ≤100ms, no visible lag between keystroke and on-screen update.
- Standard ↔ API conversion for a 100-node workflow completes in <50ms (pure function, no IO).

### Security
- `/object_info` proxy endpoint is admin-or-creator-gated (same auth as other worker-adjacent endpoints per PRD-005).
- File/image picker widgets only expose assets the current user is authorised to read (goes through PRD-017 asset registry, which enforces this).
- Imported workflow JSON is size-limited (default 10MB, configurable) and parsed defensively — malformed JSON or malicious structure (deeply nested, huge arrays) fails with a bounded error, not a stack overflow.

### Compatibility
- Targets ComfyUI versions supporting the `/object_info` REST endpoint (has been stable since early 2023). Explicitly pin the minimum-supported ComfyUI version in platform settings.

## 7. Non-Goals (Out of Scope)

- **Auto-installing missing custom nodes** — too many security, restart, and trust concerns; punt to a dedicated PRD if pursued.
- **Real-time collaborative editing** — PRD-011 territory; single-user editing with PRD-011 locks is enough for MVP.
- **Workflow version control beyond PRD-075** — no branching, no git-like history. PRD-075's version list is the mechanism.
- **Replacing ComfyUI as the execution engine** — we still queue workflows against ComfyUI through the PRD-005 bridge; this PRD only owns the editor surface and the format-conversion boundary.
- **Embedding the ComfyUI frontend** — rejected in Req 1.1 rationale.
- **Node-class-level hotfixes** — if ComfyUI adds a new input type we have not mapped, we render it as an untyped text box and log a warning; we do not chase every new widget type in real-time.
- **Visual workflow diff** — evaluation list item M-03; out of scope here.

## 8. Design Considerations

- Node cards should match the density and visual language of PRD-029 design tokens — same border radius, same type scale, same surface colours. Do not clone ComfyUI's look — match the app.
- Widget controls on nodes should use the same components as regular forms in the app, not a bespoke "node widget" variant. Users should feel that editing a node is just editing a form.
- Bypass / mute visual states must be distinguishable at a glance — colour alone is insufficient (accessibility). Use shape + opacity + iconography.
- The Add Node palette should feel like a command palette (parity with PRD-111-era command palette if one exists in the app).
- Placeholder nodes for missing custom nodes should be visually noisy (e.g. striped red warning stripe) so users notice without hunting.

## 9. Technical Considerations

### Existing Code to Reuse
- `apps/frontend/src/features/workflow-canvas/WorkflowCanvas.tsx` — extend the React Flow surface; do not fork.
- `apps/frontend/src/features/workflow-canvas/comfyui-parser.ts` — extend with standard-format parsing and the bidirectional converter; the current `parseComfyUIWorkflow` becomes `parseApiFormat`.
- `apps/frontend/src/features/workflow-canvas/hooks/` — where `useObjectInfo` hook belongs.
- `apps/frontend/src/features/workflow-canvas/types.ts` — extend `NodeData`, add `NodeClassDef`, `StandardFormatWorkflow`, `ApiFormatWorkflow`.
- `apps/frontend/src/features/workflow-import/` — existing import wizard; plug standard-format support into its file-detection step.
- `@/components/primitives` — all widget controls must compose from here.
- PRD-005 ComfyUI bridge — adds one new proxy endpoint `GET /workflows/object-info`.

### Database Changes
- **No new tables.** The existing `workflow_layouts` (PRD-033) and `workflows` (PRD-075) tables already cover storage. The `json_content` column in `workflows` becomes standard-format (it is currently API-format in many fixtures — a migration can upgrade in place, but is not strictly required if the parser handles both).
- Add a column `workflows.format_version` (text, e.g. `"standard-v1"` or `"api"`) to make the stored format explicit; default existing rows to `"api"` and upgrade-on-save.
- Follow ID strategy: any future schema additions use `BIGSERIAL id + UUID uuid`.

### API Changes
- **New:** `GET /workflows/object-info?worker_id=...` — proxy to worker `/object_info` with short-TTL server-side cache.
- **Extended:** `POST /workflows/import` (PRD-075) — accepts standard or API format; response includes the detected format.
- **Extended:** `PUT /workflows/:id/canvas` (PRD-033) — payload is now `{ standard_json, canvas_layout }` instead of the canvas layout alone.
- **New:** `POST /workflows/:id/to-api` — returns the API-format rendering of the stored standard-format workflow. Called by the execution path (PRD-024) before queuing.
- **Extended:** Execution validation (PRD-075) gains a node-class-exists check against the target worker's `/object_info` before queuing. Failure is blocking.

### Widget Type Mapping Reference (informational)
The widget spec shapes follow ComfyUI's `/object_info` convention:
- `"INT"`, `"FLOAT"`, `"STRING"`, `"BOOLEAN"` — scalars with `{ default, min, max, step, multiline, ... }` config.
- `[[enum values...]]` — literal enum, e.g. sampler names, scheduler names, model filenames. The enum is dynamic per worker (e.g. the model list reflects `/models/checkpoints`).
- Typed port names (`MODEL`, `CLIP`, `VAE`, `CONDITIONING`, `LATENT`, `IMAGE`, `MASK`, `CONTROL_NET`, etc.) — never have widgets, always ports.

### Dependency Ordering Note
PRD-005 and PRD-033 are both `done`. PRD-075 is `done`. This PRD is unblocked on dependencies and can start as soon as it is approved.

## 10. Edge Cases & Error Handling

- **Worker disconnects mid-edit:** Fall back to last-cached `/object_info`. Banner notifies user. Save continues to work (writes to DB). Execute is blocked until reconnect.
- **Workflow references a node class whose schema changed between ComfyUI versions** (e.g. new required input): On load, the new required input renders with default value; a warning badge appears on the node. On save, widget values are rewritten in the new input order.
- **Primitive wired to multiple inputs of incompatible types:** Block the connection at wire-time (React Flow's `isValidConnection` callback); show a tooltip explaining the type mismatch.
- **Circular reference in the graph:** Detect at export time (standard → API). Block export with a clear error listing the cycle.
- **Standard-format import with `links[]` referencing deleted nodes:** Skip the orphaned links, log a warning, continue.
- **Widget value that violates spec constraints** (e.g. `steps = -1` when min=1): Clamp to min on save; toast warning.
- **Seed randomise clicked during a run:** Permitted; the running job uses the old seed (already queued), next run uses the new one.
- **`/object_info` returns > 2MB JSON** (possible with 500+ custom nodes): Stream-parse on the backend, gzip response, paginate palette in the frontend.
- **Bypass on a node whose input and output types do not match:** Treat as mute (no passthrough possible); show an info icon explaining.

## 11. Success Metrics

- 100% of ComfyUI web-UI-exported workflows (a fixture corpus of ≥20 real-world workflows) import, edit, save, re-import, and execute with byte-equivalent standard-format round-trip.
- Users can execute a workflow end-to-end from "import a standard-format JSON" without ever opening ComfyUI's native UI, for the top 30 most-used node classes in the fixture corpus.
- Average `/object_info` fetch time on a representative worker: <1s steady-state.
- Zero user reports of "my node values got lost" in the first month post-release.
- Missing-custom-node banner catches 100% of node-class mismatches before execution (no wasted GPU time on missing-node failures).

## 12. Testing Requirements

- **Unit tests:** parser (standard → editor, editor → standard, editor → API), widget renderer dispatch, bypass/mute rewiring, primitive inlining, reroute collapse. Fixture corpus of ≥10 workflows covering SDXL, Flux, ControlNet, LoRA stack, primitives, reroutes, bypass, groups, missing custom nodes.
- **Integration tests:** Full flow — drag standard-format JSON → open in editor → edit a widget value → save → re-open → re-export → execute. At least one test per widget type.
- **Round-trip test:** For each fixture, assert `parse(emit(parse(fixture))) === parse(fixture)` (structural equality), and `emit(parse(fixture)) === fixture` modulo whitespace.
- **Performance tests:** 100-node canvas fps benchmark; 500-node-class `/object_info` parse benchmark.
- **E2E test:** Import fixture → edit seed widget → save → trigger generation → verify ComfyUI receives API-format with the edited seed.
- **DRY-GUY agent audit** after implementation per project rules.

## 13. Open Questions

1. **Should the editor show widgets for every instance of a node type, or fold shared widget state into a per-class "defaults" panel?** — ComfyUI shows per-node; we propose per-node for MVP.
2. **When a standard-format workflow uses a node class whose `widgets_values` order differs from the current `/object_info` input order** (e.g. ComfyUI reordered a class's inputs in a version bump), do we warn and best-effort zip, or refuse to open? — Proposed: best-effort zip with per-node warning badge.
3. **Seed control-after-generate (`fixed` / `increment` / `decrement` / `randomize`) — is this editor state only, or is it persisted per-workflow?** — ComfyUI persists it in standard format; we follow suit.
4. **Do we ship a "switch worker" action in the editor that re-validates against a different worker's `/object_info`?** — Likely yes, but UX belongs in PRD-046 / PRD-132 scope; open question is where the control lives.
5. **For the Add Node palette, do we pre-seed recently used node classes per user?** — Nice-to-have; defer to post-MVP unless analytics shows palette search is slow.
6. **Standard-format groups and notes — are they MVP or Phase 2?** — Currently Phase 2 (Req 2.1, 2.2). Revisit if fixture corpus shows many real workflows depend on them.
7. **Does PRD-115's prompt-slot system need to understand widget-to-input conversion?** — Likely yes — if a user converts a widget into an input and wires a Primitive, the slot annotation must migrate to the Primitive. Needs coordination with PRD-115 owners.
8. **Should the missing-custom-node banner offer "try another worker" if a different connected worker has that class?** — Proposed: yes, inline dropdown in the banner. Cheap to implement once we have per-worker registries.

## 14. Version History

- **v1.0** (2026-04-17): Initial PRD. Extends PRD-033 to full graphical editing parity via native React Flow + `/object_info` (Path B). In-scope: widget system, add-node palette, bypass/mute, primitives, reroutes, standard ↔ API format conversion, missing-custom-node placeholders. Deferred: groups, notes, subgraphs, auto-install, multi-select/copy-paste parity.
