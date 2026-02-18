# Task List: Node-Based Workflow Canvas

**PRD Reference:** `design/prds/033-prd-node-based-workflow-canvas.md`
**Scope:** Build a React Flow-based node graph canvas for visualizing generation pipelines with node-level timing telemetry, drag-and-drop node building, and bidirectional ComfyUI integration.

## Overview

Understanding where GPU time is spent in a complex generation pipeline requires visual representation. This PRD provides a React Flow-based node canvas that renders ComfyUI workflow definitions as connected node graphs, with real-time timing telemetry per node (color-coded by performance), drag-and-drop node creation from a sidebar catalog, wire routing for connections, and bidirectional sync with ComfyUI workflow JSON.

### What Already Exists
- PRD-005 ComfyUI WebSocket Bridge (real-time communication with ComfyUI)
- PRD-029 design system components
- PRD-000 database infrastructure

### What We're Building
1. React Flow-based node graph visualization
2. Node-level timing telemetry with color-coded performance
3. Drag-and-drop node building from a sidebar catalog
4. Wire routing engine with compatibility validation
5. ComfyUI JSON import/export (bidirectional)
6. Canvas layout persistence
7. Backend API for canvas and telemetry data

### Key Design Decisions
1. **React Flow library** — Industry-standard React node graph library for the canvas rendering.
2. **ComfyUI as the source of truth** — The canvas visualizes and edits ComfyUI workflows. Import/export is lossless.
3. **Timing telemetry via WebSocket** — Node execution times stream in real-time from PRD-005 bridge during generation.
4. **Canvas layout stored separately** — Node positions are a visual concern stored in `workflow_layouts`, not in the ComfyUI workflow JSON.

---

## Phase 1: Database & API

### Task 1.1: Create Workflow Layouts Table
**File:** `migrations/YYYYMMDD_create_workflow_layouts.sql`

```sql
CREATE TABLE workflow_layouts (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL,
    canvas_json JSONB NOT NULL DEFAULT '{}',        -- React Flow canvas state
    node_positions_json JSONB NOT NULL DEFAULT '{}', -- Node position overrides
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_workflow_layouts_workflow_id ON workflow_layouts(workflow_id);
CREATE INDEX idx_workflow_layouts_workflow_id ON workflow_layouts(workflow_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workflow_layouts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `workflow_layouts` stores canvas state and node positions per workflow
- [ ] Unique constraint on workflow_id (one layout per workflow)
- [ ] `updated_at` trigger applied

### Task 1.2: Workflow Canvas Model & Repository
**File:** `src/models/workflow_layout.rs`, `src/repositories/workflow_layout_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WorkflowLayout {
    pub id: DbId,
    pub workflow_id: DbId,
    pub canvas_json: serde_json::Value,
    pub node_positions_json: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model struct and repository with get/upsert operations
- [ ] Unit tests for repository

### Task 1.3: Canvas & Telemetry API
**File:** `src/routes/workflow_canvas.rs`

```rust
pub fn workflow_canvas_routes() -> Router<AppState> {
    Router::new()
        .route("/workflows/:id/canvas", get(get_canvas).put(save_canvas))
        .route("/workflows/:id/telemetry", get(get_telemetry))
        .route("/workflows/import-comfyui", post(import_comfyui))
}
```

**Acceptance Criteria:**
- [ ] `GET/PUT /workflows/:id/canvas` for layout persistence
- [ ] `GET /workflows/:id/telemetry` returns per-node timing data from recent runs
- [ ] `POST /workflows/import-comfyui` parses ComfyUI JSON and creates workflow

---

## Phase 2: Node Graph Visualization

### Task 2.1: React Flow Canvas Setup
**File:** `frontend/src/features/workflow-canvas/WorkflowCanvas.tsx`

```typescript
import ReactFlow, { Node, Edge, Controls, MiniMap } from 'reactflow';

interface WorkflowCanvasProps {
  workflowId: number;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ workflowId }) => {
  const { nodes, edges, onNodesChange, onEdgesChange } = useWorkflowGraph(workflowId);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
    >
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
};
```

**Acceptance Criteria:**
- [ ] Display ComfyUI workflow as a connected node graph
- [ ] Nodes represent pipeline stages (image loading, face detection, generation, post-processing)
- [ ] Edges represent data flow between nodes
- [ ] Pan, zoom, and minimap navigation
- [ ] Canvas renders 50+ nodes at >30fps

### Task 2.2: Custom Node Components
**File:** `frontend/src/features/workflow-canvas/nodes/`

```typescript
interface WorkflowNodeData {
  label: string;
  nodeType: string;       // 'loader' | 'sampler' | 'vae' | 'controlnet' | etc.
  parameters: Record<string, unknown>;
  timing?: NodeTiming;
}

interface NodeTiming {
  executionMs: number;
  status: 'idle' | 'running' | 'complete' | 'error';
}
```

**Acceptance Criteria:**
- [ ] Custom node component with header, parameter preview, and port indicators
- [ ] Input/output ports with type indicators (image, latent, conditioning, model)
- [ ] Node styling follows PRD-029 design system tokens
- [ ] Compact and expanded view modes per node

---

## Phase 3: Timing Telemetry

### Task 3.1: Telemetry Collector
**File:** `frontend/src/features/workflow-canvas/useTelemetryStream.ts`

```typescript
export function useTelemetryStream(workflowId: number) {
  // Subscribe to PRD-005 WebSocket for node execution events
  // Update node timing data in real-time
  return { nodeTiming: Map<string, NodeTiming> };
}
```

**Acceptance Criteria:**
- [ ] Display execution time per node during and after generation
- [ ] Color-code nodes by performance: green (fast <1s), yellow (moderate 1-5s), red (slow >5s)
- [ ] Total pipeline time shown as a summary
- [ ] Updates in real-time during generation (within 1 second of node completion)

### Task 3.2: Historical Timing Comparison
**File:** `frontend/src/features/workflow-canvas/TimingHistory.tsx`

**Acceptance Criteria:**
- [ ] View timing data from previous runs
- [ ] Compare timing across runs to identify regressions
- [ ] Timing data persisted via API

---

## Phase 4: Drag-and-Drop Node Building

### Task 4.1: Node Catalog Sidebar
**File:** `frontend/src/features/workflow-canvas/NodeCatalog.tsx`

```typescript
interface NodeCatalogEntry {
  type: string;
  label: string;
  category: string;        // 'Input' | 'Sampler' | 'ControlNet' | 'VAE' | 'Output'
  icon: React.ComponentType;
  defaultParams: Record<string, unknown>;
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
}
```

**Acceptance Criteria:**
- [ ] Sidebar listing available node types organized by category
- [ ] Drag nodes from sidebar onto the canvas
- [ ] Node type search/filter in the sidebar
- [ ] Category grouping with expand/collapse

### Task 4.2: Connection Validation
**File:** `frontend/src/features/workflow-canvas/connectionValidator.ts`

**Acceptance Criteria:**
- [ ] Draw connections between compatible node ports
- [ ] Type-based validation: only compatible output→input connections allowed
- [ ] Flag incompatible connections with clear error messages
- [ ] Visual feedback during drag: compatible ports highlighted

---

## Phase 5: ComfyUI Integration

### Task 5.1: ComfyUI JSON Parser
**File:** `frontend/src/features/workflow-canvas/comfyuiParser.ts`

```typescript
export function parseComfyUIWorkflow(json: object): { nodes: Node[]; edges: Edge[] };
export function exportToComfyUI(nodes: Node[], edges: Edge[]): object;
```

**Acceptance Criteria:**
- [ ] Import ComfyUI workflow JSON and render as node graph
- [ ] Export canvas layout back to ComfyUI-compatible JSON
- [ ] Round-trip: import → export produces equivalent JSON (no data loss)
- [ ] Sync node parameters with ComfyUI settings

### Task 5.2: ComfyUI Import API
**File:** `src/services/comfyui_importer.rs`

**Acceptance Criteria:**
- [ ] Server-side validation of ComfyUI workflow JSON
- [ ] Node type mapping from ComfyUI types to canvas node types
- [ ] Error reporting for unsupported or invalid node types

---

## Phase 6: Integration & Testing

### Task 6.1: Canvas Persistence
**File:** `frontend/src/features/workflow-canvas/useCanvasPersistence.ts`

**Acceptance Criteria:**
- [ ] Auto-save canvas state on changes (debounced)
- [ ] Restore canvas state on navigation back to workflow
- [ ] Node positions preserved across sessions

### Task 6.2: Comprehensive Tests
**File:** `frontend/src/features/workflow-canvas/__tests__/`

**Acceptance Criteria:**
- [ ] Canvas renders 50+ nodes at >30fps
- [ ] Timing telemetry updates within 1 second of node completion
- [ ] ComfyUI import/export is lossless (round-trip test)
- [ ] Connection validation correctly rejects incompatible connections
- [ ] Drag-and-drop creates properly configured nodes

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_workflow_layouts.sql` | Canvas layout table |
| `src/models/workflow_layout.rs` | Rust model struct |
| `src/repositories/workflow_layout_repo.rs` | Layout repository |
| `src/routes/workflow_canvas.rs` | Canvas and telemetry API |
| `src/services/comfyui_importer.rs` | ComfyUI import service |
| `frontend/src/features/workflow-canvas/WorkflowCanvas.tsx` | Main canvas component |
| `frontend/src/features/workflow-canvas/nodes/` | Custom node components |
| `frontend/src/features/workflow-canvas/NodeCatalog.tsx` | Node catalog sidebar |
| `frontend/src/features/workflow-canvas/comfyuiParser.ts` | ComfyUI JSON parser |
| `frontend/src/features/workflow-canvas/useTelemetryStream.ts` | Timing telemetry |

## Dependencies
- PRD-005: ComfyUI WebSocket Bridge (real-time communication, timing events)
- PRD-029: Design system (node styling)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — layout persistence, telemetry, import endpoints
2. Phase 2 (Visualization) — React Flow canvas with custom nodes
3. Phase 3 (Telemetry) — real-time timing with color coding
4. Phase 4 (Building) — drag-and-drop nodes, connection validation
5. Phase 5 (ComfyUI) — import/export integration

### Post-MVP Enhancements
- Workflow comparison: side-by-side diff of two workflow versions

## Notes
- React Flow is the recommended library for the node graph rendering.
- Canvas must handle 50+ nodes without performance degradation.
- ComfyUI round-trip fidelity is critical — no data loss during import/export.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
