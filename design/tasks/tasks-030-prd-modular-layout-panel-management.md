# Task List: Modular Layout & Panel Management

**PRD Reference:** `design/prds/030-prd-modular-layout-panel-management.md`
**Scope:** Build a Blender-style snappable, resizable panel system with role-based default layouts, saveable presets, and panel content routing for hosting any view module.

## Overview

Different roles need different screen layouts. This PRD provides a drag-and-drop panel system where panels can be resized, collapsed, rearranged, and populated with any view module. Role-optimized default layouts ensure new users start with an appropriate workspace, while saveable presets let users switch between task-specific configurations. The panel system uses PRD-029 layout components (Panel, Sidebar, Stack, Grid) as its foundation.

### What Already Exists
- PRD-029 design system layout components (Panel, Sidebar, Stack, Grid)
- PRD-000 database infrastructure

### What We're Building
1. Panel management engine with snap grid, resize, collapse, and drag-and-drop
2. Role-based default layout configurations
3. Saveable and shareable layout presets (database-backed)
4. Panel content routing — any panel can host any registered view module
5. Backend API for layout preset CRUD

### Key Design Decisions
1. **JSON serialization for layouts** — Layout state stored as JSON in the database, enabling full state restoration including panel positions, sizes, and hosted views.
2. **View module registry** — Panels accept any registered view module by key. Same module can appear in multiple panels simultaneously.
3. **Role-based defaults** — Admin, Creator, and Reviewer each get a sensible default layout matching their primary workflows.
4. **Snap grid** — Panels snap to a grid during drag for clean, aligned layouts.

---

## Phase 1: Database & API for Layout Persistence

### Task 1.1: Create User Layouts Table
**File:** `migrations/YYYYMMDD_create_user_layouts.sql`

```sql
CREATE TABLE user_layouts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    layout_name TEXT NOT NULL,
    layout_json JSONB NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_layouts_user_id ON user_layouts(user_id);
CREATE UNIQUE INDEX uq_user_layouts_user_id_name ON user_layouts(user_id, layout_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_layouts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Admin-shared layout presets (studio-wide)
CREATE TABLE admin_layout_presets (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role_default_for TEXT,  -- 'admin' | 'creator' | 'reviewer' | NULL
    layout_json JSONB NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_layout_presets_created_by ON admin_layout_presets(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON admin_layout_presets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_layouts` table stores per-user named layout presets as JSONB
- [ ] `admin_layout_presets` table stores studio-wide shared presets with optional role defaults
- [ ] Unique constraint on (user_id, layout_name) prevents duplicate names
- [ ] All FK columns have indexes
- [ ] All tables have `updated_at` triggers

### Task 1.2: Layout Models & Repository
**File:** `src/models/layout.rs`, `src/repositories/layout_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserLayout {
    pub id: DbId,
    pub user_id: DbId,
    pub layout_name: String,
    pub layout_json: serde_json::Value,
    pub is_default: bool,
    pub is_shared: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AdminLayoutPreset {
    pub id: DbId,
    pub name: String,
    pub role_default_for: Option<String>,
    pub layout_json: serde_json::Value,
    pub created_by: DbId,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] `UserLayout` and `AdminLayoutPreset` model structs
- [ ] Repository with CRUD for user layouts and admin presets
- [ ] `get_default_for_role(role)` fetches the admin preset marked as role default
- [ ] Unit tests for all repository operations

### Task 1.3: Layout API Endpoints
**File:** `src/routes/layout.rs`

```rust
pub fn layout_routes() -> Router<AppState> {
    Router::new()
        .route("/user/layouts", get(list_user_layouts).post(create_user_layout))
        .route("/user/layouts/:id", get(get_layout).put(update_layout).delete(delete_layout))
        .route("/admin/layout-presets", get(list_presets).post(create_preset))
        .route("/admin/layout-presets/:id", put(update_preset).delete(delete_preset))
}
```

**Acceptance Criteria:**
- [ ] `GET/POST /user/layouts` — list and create user layouts
- [ ] `GET/PUT/DELETE /user/layouts/:id` — manage individual layouts
- [ ] `GET/POST/PUT/DELETE /admin/layout-presets` — admin preset management
- [ ] Admin endpoints require admin role via RBAC middleware

---

## Phase 2: Panel System Core

### Task 2.1: Panel Container Component
**File:** `frontend/src/features/layout/PanelContainer.tsx`

Build the top-level panel container that manages all panel instances.

```typescript
interface PanelState {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  collapsed: boolean;
  viewModule: string;  // Registry key for the view hosted in this panel
  viewProps?: Record<string, unknown>;
}

interface PanelContainerProps {
  layout: PanelState[];
  onLayoutChange: (layout: PanelState[]) => void;
}
```

**Acceptance Criteria:**
- [ ] Renders all panels from the layout state array
- [ ] Provides layout change callback for persistence
- [ ] Handles panel creation, deletion, and reordering

### Task 2.2: Panel Resize & Snap Engine
**File:** `frontend/src/features/layout/useSnapGrid.ts`, `frontend/src/features/layout/usePanelResize.ts`

Implement resize handles and snap grid logic.

**Acceptance Criteria:**
- [ ] Panels resizable by dragging borders
- [ ] Snap to grid positions when dragged (configurable grid size)
- [ ] Minimum and maximum size constraints prevent unusable layouts
- [ ] Resize operations complete in <50ms (no visible lag)
- [ ] Visual feedback during drag (ghost outline, snap indicators)

### Task 2.3: Panel Collapse/Expand
**File:** `frontend/src/features/layout/PanelHeader.tsx`

Panel header with collapse/expand toggle and drag handle.

**Acceptance Criteria:**
- [ ] Single-click collapse/expand toggle on panel header
- [ ] Collapsed panels show a minimal icon strip for quick identification
- [ ] Collapse/expand animation using design system animation tokens
- [ ] Drag handle in panel header for repositioning

---

## Phase 3: Panel Content Routing

### Task 3.1: View Module Registry
**File:** `frontend/src/features/layout/viewModuleRegistry.ts`

Registry of all available view modules that can be hosted in panels.

```typescript
interface ViewModuleRegistration {
  key: string;
  label: string;
  icon: React.ComponentType;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  allowMultiple: boolean;  // Can this view appear in multiple panels?
}

const registry = new Map<string, ViewModuleRegistration>();

export function registerViewModule(module: ViewModuleRegistration) {
  registry.set(module.key, module);
}

export function getViewModule(key: string): ViewModuleRegistration | undefined {
  return registry.get(key);
}
```

**Acceptance Criteria:**
- [ ] Central registry for all view modules (Library, Review, Workflow, Dashboard, etc.)
- [ ] Lazy loading of view module components
- [ ] `allowMultiple` flag controls whether the same view can appear in multiple panels
- [ ] View modules registered during application initialization

### Task 3.2: Drag-and-Drop View Assignment
**File:** `frontend/src/features/layout/PanelDropZone.tsx`

Enable dragging view modules into panel slots.

**Acceptance Criteria:**
- [ ] View module sidebar/catalog lists all registered views
- [ ] Drag a view module from catalog onto any panel slot
- [ ] Visual drop zone indicator during drag
- [ ] Same view module can appear in multiple panels simultaneously (e.g., two library views with different filters)

---

## Phase 4: Role-Based Defaults

### Task 4.1: Default Layout Definitions
**File:** `frontend/src/features/layout/defaultLayouts.ts`

Define default panel arrangements per role.

```typescript
export const defaultLayouts: Record<string, PanelState[]> = {
  admin: [
    { id: 'main', viewModule: 'dashboard', size: { width: 60, height: 100 }, ... },
    { id: 'side', viewModule: 'worker-status', size: { width: 40, height: 50 }, ... },
    { id: 'config', viewModule: 'settings', size: { width: 40, height: 50 }, ... },
  ],
  creator: [
    { id: 'canvas', viewModule: 'workflow-canvas', size: { width: 60, height: 70 }, ... },
    { id: 'library', viewModule: 'library', size: { width: 40, height: 100 }, ... },
    { id: 'controls', viewModule: 'generation-controls', size: { width: 60, height: 30 }, ... },
  ],
  reviewer: [
    { id: 'player', viewModule: 'video-player', size: { width: 70, height: 80 }, ... },
    { id: 'review', viewModule: 'review-controls', size: { width: 30, height: 100 }, ... },
    { id: 'notes', viewModule: 'review-notes', size: { width: 70, height: 20 }, ... },
  ],
};
```

**Acceptance Criteria:**
- [ ] Admin layout: system health, worker status, and configuration panels prominent
- [ ] Creator layout: workflow canvas, generation controls, and library panels prominent
- [ ] Reviewer layout: video player maximized with review controls and approval panel
- [ ] Default applied on first login based on user role from PRD-003

---

## Phase 5: Layout Presets

### Task 5.1: Layout Serializer
**File:** `frontend/src/features/layout/layoutSerializer.ts`

Serialize and deserialize layout state for persistence.

**Acceptance Criteria:**
- [ ] Serialize current panel arrangement to JSON
- [ ] Deserialize JSON to restore panel arrangement exactly
- [ ] Handle forward-compatibility: gracefully ignore unknown view modules from newer versions

### Task 5.2: Preset Management UI
**File:** `frontend/src/features/layout/PresetSwitcher.tsx`

UI for saving, switching, and managing layout presets.

**Acceptance Criteria:**
- [ ] "Save current layout" with a name prompt
- [ ] Dropdown to switch between saved presets with single click
- [ ] Layout preset switching completes in <200ms
- [ ] Delete saved presets
- [ ] Admin-shared presets appear for all users with "(Shared)" label

### Task 5.3: Layout Persistence Hook
**File:** `frontend/src/features/layout/useLayoutPersistence.ts`

Hook connecting layout state to the backend API.

**Acceptance Criteria:**
- [ ] On login, fetch user's saved layouts and apply the default (or role default)
- [ ] Auto-save current layout on change (debounced)
- [ ] Save/load presets via API
- [ ] Graceful fallback if API is unavailable

---

## Phase 6: Integration & Testing

### Task 6.1: Panel System Integration Tests
**File:** `frontend/src/features/layout/__tests__/`

**Acceptance Criteria:**
- [ ] Test panel resize respects min/max constraints
- [ ] Test snap grid alignment
- [ ] Test collapse/expand preserves panel content
- [ ] Test view module routing renders correct component
- [ ] Test layout serialization round-trip (serialize → deserialize → identical state)
- [ ] Test role-based default selection

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_user_layouts.sql` | Layout persistence tables |
| `src/models/layout.rs` | Rust model structs |
| `src/repositories/layout_repo.rs` | Layout CRUD repository |
| `src/routes/layout.rs` | Axum API endpoints |
| `frontend/src/features/layout/PanelContainer.tsx` | Top-level panel manager |
| `frontend/src/features/layout/useSnapGrid.ts` | Snap grid logic |
| `frontend/src/features/layout/viewModuleRegistry.ts` | View module registry |
| `frontend/src/features/layout/PresetSwitcher.tsx` | Preset management UI |
| `frontend/src/features/layout/defaultLayouts.ts` | Role-based default layouts |

## Dependencies
- PRD-029: Design system layout components (Panel, Sidebar, Stack, Grid)
- PRD-003: RBAC for role-based default selection
- PRD-004: Session persistence

## Implementation Order
### MVP
1. Phase 1 (Database & API) — layout persistence
2. Phase 2 (Panel Core) — resize, snap, collapse
3. Phase 3 (Content Routing) — view module registry and assignment
4. Phase 4 (Role Defaults) — default layouts per role
5. Phase 5 (Presets) — saveable and switchable layouts

### Post-MVP Enhancements
- Multi-monitor support: detach panels to separate browser windows with real-time sync

## Notes
- Panel resize performance is critical — target <50ms per operation.
- The view module registry is extensible — each new feature PRD registers its view module.
- Layout JSON must be forward-compatible as new view modules are added.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
