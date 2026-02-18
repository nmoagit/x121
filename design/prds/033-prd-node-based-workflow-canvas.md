# PRD-033: Node-Based Workflow Canvas

## 1. Introduction/Overview
Understanding where GPU time is actually being spent in a complex generation pipeline requires visual representation. This PRD provides a React Flow-based node-based workflow canvas with node-level timing telemetry, giving users high-level visibility into their generation pipeline structure and performance characteristics.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-05 (ComfyUI WebSocket Bridge), PRD-29 (Design System)
- **Depended on by:** PRD-27 (Template System), PRD-34 (Interactive Debugger)
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Visualize generation pipelines as connected node graphs.
- Display node-level timing telemetry to identify performance bottlenecks.
- Support drag-and-drop node addition and wire routing.
- Integrate with ComfyUI workflow definitions.

## 4. User Stories
- As a Creator, I want to visualize my generation pipeline as a node graph so that I understand the data flow and dependencies.
- As a Creator, I want node-level timing telemetry so that I can see exactly which nodes are consuming GPU time.
- As an Admin, I want to identify expensive workflow nodes so that I can optimize or replace them.
- As a Creator, I want to drag and drop nodes to build pipelines so that I can experiment with different configurations visually.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Node Graph Visualization
**Description:** React Flow-based pipeline visualization.
**Acceptance Criteria:**
- [ ] Display ComfyUI workflow as a connected node graph
- [ ] Nodes represent pipeline stages (image loading, face detection, generation, post-processing)
- [ ] Edges represent data flow between nodes
- [ ] Pan, zoom, and minimap navigation

#### Requirement 1.2: Node-Level Timing Telemetry
**Description:** Performance data displayed on each node.
**Acceptance Criteria:**
- [ ] Display execution time per node during and after generation
- [ ] Color-code nodes by performance: green (fast), yellow (moderate), red (slow)
- [ ] Total pipeline time shown as a summary
- [ ] Historical timing comparison across runs

#### Requirement 1.3: Drag-and-Drop Node Building
**Description:** Visual pipeline construction.
**Acceptance Criteria:**
- [ ] Sidebar catalog of available node types
- [ ] Drag nodes from sidebar onto the canvas
- [ ] Draw connections between compatible node ports
- [ ] Validation: flag incompatible connections with clear error messages

#### Requirement 1.4: ComfyUI Integration
**Description:** Bidirectional sync with ComfyUI workflow definitions.
**Acceptance Criteria:**
- [ ] Import ComfyUI workflow JSON and render as node graph
- [ ] Export canvas layout back to ComfyUI-compatible JSON
- [ ] Sync node parameters with ComfyUI settings

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Workflow Comparison
**Description:** Side-by-side comparison of two workflow versions.
**Acceptance Criteria:**
- [ ] Highlight added, removed, and modified nodes between versions
- [ ] Compare timing telemetry between versions

## 6. Non-Goals (Out of Scope)
- Mid-run control and debugging (covered by PRD-34)
- Template/preset management (covered by PRD-27)
- ComfyUI workflow import validation (covered by PRD-75)

## 7. Design Considerations
- Node styling should follow the PRD-29 design system tokens.
- Timing telemetry should be unobtrusive during editing but prominent during/after generation.
- The canvas should support workflows with 50+ nodes without performance degradation.

## 8. Technical Considerations
- **Stack:** React Flow for node graph rendering, WebSocket for real-time timing updates, PRD-05 ComfyUI bridge
- **Existing Code to Reuse:** PRD-05 WebSocket bridge, PRD-29 design system components
- **New Infrastructure Needed:** Node catalog, wire routing engine, timing telemetry collector, ComfyUI JSON parser/serializer
- **Database Changes:** `workflow_layouts` table (workflow_id, canvas_json, node_positions_json)
- **API Changes:** GET/PUT /workflows/:id/canvas, GET /workflows/:id/telemetry, POST /workflows/import-comfyui

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Canvas renders workflows with 50+ nodes at >30fps (smooth interaction)
- Timing telemetry updates in real-time during generation (within 1 second of node completion)
- ComfyUI workflow import/export is lossless (no data loss during round-trip)

## 11. Open Questions
- Should the canvas support grouping nodes into collapsible sub-graphs for complex workflows?
- How should the canvas handle workflows with multiple parallel branches?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
