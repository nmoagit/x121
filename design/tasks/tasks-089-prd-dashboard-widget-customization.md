# Task List: Dashboard Widget Customization

**PRD Reference:** `design/prds/089-prd-dashboard-widget-customization.md`
**Scope:** Extend the PRD-42 Studio Pulse Dashboard with drag-and-drop widget placement, a widget library catalog, per-widget configuration, role-based defaults, and saveable presets.

## Overview

PRD-42 defines the core dashboard widgets with a fixed layout. This PRD adds user personalization: drag-and-drop rearrangement, resizing, a widget catalog, per-widget settings (e.g., "show my jobs only"), role-based default layouts, and saveable named presets ("Production Mode", "Review Mode"). The implementation uses `react-grid-layout` for the drag-and-drop grid and extends the existing `dashboard_configs` table with presets and widget instance settings.

### What Already Exists
- PRD-42 Studio Pulse Dashboard with widget framework and `dashboard_configs` table
- PRD-04 Session Persistence for layout storage
- PRD-85 UI Plugin Architecture for extension widgets
- PRD-29 Design System components

### What We're Building
1. Database extensions for presets and role defaults
2. Widget library catalog with registration API
3. Drag-and-drop layout editor using react-grid-layout
4. Per-widget configuration settings engine
5. Role-based default layouts configurable by Admin
6. Preset save/load/share functionality
7. React UI for edit mode, widget catalog, and preset management

### Key Design Decisions
1. **react-grid-layout** -- Mature, well-tested React library for grid layouts with drag-and-drop. Responsive columns, snap-to-grid, resize handles.
2. **Widget registry pattern** -- Native and extension widgets register in a shared catalog. Each widget declares its default size, available settings, and data requirements.
3. **Presets are per-user, shareable by ID** -- Presets belong to a user but can be shared via a preset ID.
4. **Role defaults set by Admin** -- Admin configures default layouts per role. New users inherit their role's default.

---

## Phase 1: Database Schema

### Task 1.1: Dashboard Presets Table
**File:** `migrations/YYYYMMDDHHMMSS_create_dashboard_presets.sql`

```sql
CREATE TABLE dashboard_presets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    layout_json JSONB NOT NULL,
    widget_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_presets_user_id ON dashboard_presets(user_id);
CREATE UNIQUE INDEX uq_dashboard_presets_user_name ON dashboard_presets(user_id, name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_presets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Presets belong to a user (cascade on delete)
- [ ] Unique name per user
- [ ] `is_active` indicates the currently selected preset
- [ ] Layout and widget settings stored as JSONB

### Task 1.2: Role Default Layouts Table
**File:** `migrations/YYYYMMDDHHMMSS_create_dashboard_role_defaults.sql`

```sql
CREATE TABLE dashboard_role_defaults (
    id BIGSERIAL PRIMARY KEY,
    role_name TEXT NOT NULL UNIQUE,    -- 'admin', 'creator', 'reviewer'
    layout_json JSONB NOT NULL,
    widget_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    configured_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_role_defaults_configured_by ON dashboard_role_defaults(configured_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dashboard_role_defaults
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One default layout per role
- [ ] Admin configurable via `configured_by` tracking
- [ ] Role names match PRD-03 RBAC roles

### Task 1.3: Seed Role Default Layouts
**File:** `migrations/YYYYMMDDHHMMSS_seed_dashboard_role_defaults.sql`

```sql
INSERT INTO dashboard_role_defaults (role_name, layout_json, widget_settings_json) VALUES
    ('admin', '[{"widget":"active-tasks","x":0,"y":0,"w":2,"h":2},{"widget":"disk-health","x":2,"y":0,"w":1,"h":2},{"widget":"gpu-utilization","x":3,"y":0,"w":1,"h":2},{"widget":"activity-feed","x":0,"y":2,"w":4,"h":2}]'::jsonb, '{}'::jsonb),
    ('creator', '[{"widget":"active-tasks","x":0,"y":0,"w":2,"h":2},{"widget":"project-progress","x":2,"y":0,"w":2,"h":2},{"widget":"activity-feed","x":0,"y":2,"w":4,"h":2}]'::jsonb, '{"active-tasks":{"filter":"my_jobs"}}'::jsonb),
    ('reviewer', '[{"widget":"review-queue","x":0,"y":0,"w":2,"h":2},{"widget":"recent-approvals","x":2,"y":0,"w":2,"h":2},{"widget":"activity-feed","x":0,"y":2,"w":4,"h":2}]'::jsonb, '{}'::jsonb);
```

**Acceptance Criteria:**
- [ ] Three role defaults seeded: admin, creator, reviewer
- [ ] Admin layout emphasizes system health and GPU utilization
- [ ] Creator layout emphasizes jobs and project progress
- [ ] Reviewer layout emphasizes review queue

---

## Phase 2: Rust Backend

### Task 2.1: Widget Registry Service
**File:** `src/services/widget_registry.rs`

Server-side registry of available widgets with metadata.

```rust
pub struct WidgetDefinition {
    pub id: String,                    // "active-tasks", "disk-health", etc.
    pub name: String,
    pub description: String,
    pub category: String,              // "monitoring", "productivity", "reporting"
    pub default_width: i32,
    pub default_height: i32,
    pub min_width: i32,
    pub min_height: i32,
    pub settings_schema: Option<serde_json::Value>,  // JSON Schema for per-widget settings
    pub source: String,                // "native" or extension ID
}
```

**Acceptance Criteria:**
- [ ] Registers all native widgets from PRD-42
- [ ] Extension widgets from PRD-85 register dynamically
- [ ] Each widget declares size constraints and available settings
- [ ] Settings schema defines what the per-widget configuration form looks like

### Task 2.2: Preset Model & CRUD
**File:** `src/models/dashboard_preset.rs`

**Acceptance Criteria:**
- [ ] CRUD: create, list_by_user, get_by_id, update, delete, set_active
- [ ] Only one preset active at a time per user (toggle)
- [ ] Share preset: returns a shareable ID that other users can import

### Task 2.3: Role Default Model & CRUD
**File:** `src/models/dashboard_role_default.rs`

**Acceptance Criteria:**
- [ ] Get default for role
- [ ] Update default (Admin only)
- [ ] Used as fallback when user has no custom config

### Task 2.4: Dashboard Config Resolution
**File:** `src/services/dashboard_config_resolver.rs`

Resolves the effective dashboard layout for a user.

```rust
pub async fn resolve_dashboard(
    user_id: DbId,
    user_role: &str,
    pool: &PgPool,
) -> DashboardLayout {
    // 1. Check for user's active preset
    // 2. Fall back to user's base dashboard_config
    // 3. Fall back to role default
    // 4. Fall back to platform default
}
```

**Acceptance Criteria:**
- [ ] Priority: active preset > user config > role default > platform default
- [ ] Returns resolved layout and widget settings
- [ ] Handles missing data at any level gracefully

---

## Phase 3: API Endpoints

### Task 3.1: User Dashboard Routes
**File:** `src/routes/dashboard_customization.rs`

```
GET  /user/dashboard                   -- Get resolved dashboard layout
PUT  /user/dashboard                   -- Save dashboard layout
```

**Acceptance Criteria:**
- [ ] GET returns the resolved layout (preset or default)
- [ ] PUT saves the full layout and widget settings
- [ ] Validates layout_json structure (grid positions, widget IDs)

### Task 3.2: Preset CRUD Routes
**File:** `src/routes/dashboard_customization.rs`

```
GET    /user/dashboard/presets         -- List user's presets
POST   /user/dashboard/presets         -- Create a new preset
PUT    /user/dashboard/presets/:id     -- Update preset
DELETE /user/dashboard/presets/:id     -- Delete preset
POST   /user/dashboard/presets/:id/activate -- Set as active preset
POST   /user/dashboard/presets/:id/share -- Get shareable ID
POST   /user/dashboard/presets/import/:share_id -- Import shared preset
```

**Acceptance Criteria:**
- [ ] Standard CRUD with user ownership validation
- [ ] Activate switches the active preset
- [ ] Share returns a UUID that other users can import from
- [ ] Import creates a copy under the importing user's presets

### Task 3.3: Widget Catalog Route
**File:** `src/routes/dashboard_customization.rs`

```
GET /dashboard/widget-catalog          -- List all available widgets
```

**Acceptance Criteria:**
- [ ] Returns all registered widgets (native + extension)
- [ ] Each widget includes name, description, category, size constraints, settings schema
- [ ] Filterable by category

### Task 3.4: Admin Role Defaults Routes
**File:** `src/routes/dashboard_customization.rs`

```
GET  /admin/dashboard/role-defaults           -- List all role defaults
PUT  /admin/dashboard/role-defaults/:role     -- Update role default
```

**Acceptance Criteria:**
- [ ] Admin-only access
- [ ] Updates role default layout and settings
- [ ] Existing users are NOT retroactively changed (only new users get the default)

---

## Phase 4: React Frontend

### Task 4.1: Layout Editor with react-grid-layout
**File:** `frontend/src/components/dashboard/LayoutEditor.tsx`

```tsx
import { Responsive, WidthProvider } from 'react-grid-layout';
const ResponsiveGridLayout = WidthProvider(Responsive);

interface LayoutEditorProps {
    layout: LayoutItem[];
    onLayoutChange: (layout: LayoutItem[]) => void;
    editMode: boolean;
}
```

**Acceptance Criteria:**
- [ ] "Edit Mode" toggle with visual distinction (dashed borders, drag handles)
- [ ] Drag widgets to rearrange positions
- [ ] Resize widgets (span 1-4 columns, configurable row height)
- [ ] Snap-to-grid with responsive columns (4 columns on desktop, 2 on tablet, 1 on mobile)
- [ ] Smooth animations at >30fps during drag operations

### Task 4.2: Widget Catalog Browser
**File:** `frontend/src/components/dashboard/WidgetCatalog.tsx`

**Acceptance Criteria:**
- [ ] Slide-out panel or modal showing all available widgets
- [ ] Each widget: name, description, preview thumbnail
- [ ] Filter by category and search by name
- [ ] Click or drag to add a widget to the dashboard
- [ ] Extension widgets from PRD-85 appear alongside native widgets

### Task 4.3: Per-Widget Settings Panel
**File:** `frontend/src/components/dashboard/WidgetSettings.tsx`

**Acceptance Criteria:**
- [ ] Gear icon on widget header opens settings panel
- [ ] Settings form auto-generated from widget's settings schema
- [ ] Example: "Active Tasks" filter: "My jobs" / "All jobs"
- [ ] Example: "Project Progress" filter: specific project / all projects
- [ ] Settings saved per widget instance in `widget_settings_json`

### Task 4.4: Preset Manager
**File:** `frontend/src/components/dashboard/PresetManager.tsx`

**Acceptance Criteria:**
- [ ] Dropdown in dashboard header showing available presets
- [ ] "Save as Preset" button to save current layout
- [ ] Rename, delete, and activate presets from the dropdown
- [ ] Share preset: generates a link, shows success toast
- [ ] Import preset: paste shared link to import

### Task 4.5: Edit Mode Controls
**File:** `frontend/src/components/dashboard/EditModeControls.tsx`

**Acceptance Criteria:**
- [ ] "Edit Dashboard" button toggles edit mode
- [ ] In edit mode: "Add Widget" opens catalog, "Save" persists layout, "Cancel" reverts
- [ ] Widget removal via X button (only visible in edit mode)
- [ ] Undo support for accidental widget removal

---

## Phase 5: Testing

### Task 5.1: Layout Persistence Tests
**File:** `tests/dashboard_layout_test.rs`

**Acceptance Criteria:**
- [ ] Test layout save and load roundtrip
- [ ] Test preset creation, activation, and switching
- [ ] Test role default fallback when user has no custom config
- [ ] Test layout validation rejects invalid grid positions

### Task 5.2: Widget Registry Tests
**File:** `tests/widget_registry_test.rs`

**Acceptance Criteria:**
- [ ] Test native widgets are all registered
- [ ] Test extension widget registration
- [ ] Test widget catalog endpoint returns complete data
- [ ] Test settings schema validation

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_dashboard_presets.sql` | Preset storage table |
| `migrations/YYYYMMDDHHMMSS_create_dashboard_role_defaults.sql` | Role default layouts |
| `migrations/YYYYMMDDHHMMSS_seed_dashboard_role_defaults.sql` | Default layout seed data |
| `src/services/widget_registry.rs` | Widget catalog and registration |
| `src/models/dashboard_preset.rs` | Preset model and CRUD |
| `src/models/dashboard_role_default.rs` | Role default model |
| `src/services/dashboard_config_resolver.rs` | Layout resolution logic |
| `src/routes/dashboard_customization.rs` | Dashboard API endpoints |
| `frontend/src/components/dashboard/LayoutEditor.tsx` | react-grid-layout editor |
| `frontend/src/components/dashboard/WidgetCatalog.tsx` | Widget library browser |
| `frontend/src/components/dashboard/WidgetSettings.tsx` | Per-widget configuration |
| `frontend/src/components/dashboard/PresetManager.tsx` | Preset management |
| `frontend/src/components/dashboard/EditModeControls.tsx` | Edit mode UI |

## Dependencies

### Upstream PRDs
- PRD-04: Session Persistence for layout storage
- PRD-42: Studio Pulse Dashboard for base widget framework
- PRD-85: UI Plugin Architecture for extension widgets

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)
4. Phase 4: React Frontend (Tasks 4.1-4.5)

**MVP Success Criteria:**
- Drag-and-drop operations render at >30fps
- Layout saves persist correctly across sessions 100% of the time
- Preset switching completes in <500ms
- Role-based defaults provide sensible starting layouts

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.2)
2. Widget templates/bundles (PRD Requirement 2.1)

## Notes

1. **react-grid-layout version** -- Use `react-grid-layout` v1.4+ which supports responsive breakpoints out of the box.
2. **Layout JSON schema** -- Each widget instance in the layout JSON includes: `{widget: string, x: number, y: number, w: number, h: number, i: string}` where `i` is a unique instance ID.
3. **Extension widgets** -- When PRD-85 extensions register new widgets, they appear in the catalog automatically. The widget registry is the integration point.
4. **No retroactive default changes** -- Updating a role default does NOT change existing users' dashboards. Only new users who have never customized their dashboard will get the updated default.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-089
