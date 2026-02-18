# Task List: Session & Workspace Persistence

**PRD Reference:** `design/prds/004-prd-session-workspace-persistence.md`
**Scope:** Implement database-backed UI state persistence (panel layouts, navigation state, undo tree snapshots, per-device profiles) so users resume exactly where they left off across sessions and devices.

## Overview

This PRD creates a workspace persistence system that stores all UI state per user per device in PostgreSQL as JSONB. The backend provides simple GET/PUT endpoints for workspace state, while the frontend manages state serialization, debounced auto-saving, and restoration on login. The system is designed to be invisible to users — state saves automatically and restores seamlessly.

### What Already Exists
- PRD-000: Database with migration framework, `DbId = i64`, JSONB support
- PRD-001: Entity model (projects, characters, scenes) for navigation state references
- PRD-002: Axum server, `AppState`, `AppError`, API routing
- PRD-003: User authentication, `AuthUser` extractor for per-user scoping

### What We're Building
1. Database tables: `workspace_states`, `undo_snapshots`
2. Backend API: GET/PUT workspace state, GET/PUT undo snapshots
3. Frontend Zustand store for workspace state management
4. Auto-save with debouncing (frontend)
5. State restoration on login (frontend)
6. Per-device profile detection and routing
7. Reset-to-default layout action

### Key Design Decisions
1. **JSONB storage** — Workspace state is highly flexible and changes frequently. JSONB allows schema evolution without migrations.
2. **Debounced saves** — Layout changes fire rapidly during resize. A 2-second debounce prevents excessive API calls while ensuring state is captured.
3. **Per-device via user-agent classification** — Device type (desktop/tablet/mobile) is determined by user-agent string on the frontend and sent as a key.
4. **Undo snapshots separate from layout** — Undo trees can be large and are per-entity, so they get their own table rather than being crammed into the workspace state blob.

---

## Phase 1: Database Schema

### Task 1.1: Create Workspace States Table
**File:** `migrations/20260218300001_create_workspace_states_table.sql`

```sql
CREATE TABLE workspace_states (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    device_type TEXT NOT NULL DEFAULT 'desktop',
    layout_state JSONB NOT NULL DEFAULT '{}',
    navigation_state JSONB NOT NULL DEFAULT '{}',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_states_user_id ON workspace_states(user_id);
CREATE UNIQUE INDEX uq_workspace_states_user_device ON workspace_states(user_id, device_type);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workspace_states
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `workspace_states` table with `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- [ ] Unique constraint on `(user_id, device_type)` — one state per user per device
- [ ] `layout_state JSONB` for panel sizes, positions, visibility
- [ ] `navigation_state JSONB` for open project/character/scene, scroll positions, zoom
- [ ] `preferences JSONB` for user-specific settings (zoom level, etc.)
- [ ] FK index on `user_id`

### Task 1.2: Create Undo Snapshots Table
**File:** `migrations/20260218300002_create_undo_snapshots_table.sql`

```sql
CREATE TABLE undo_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    snapshot_data JSONB NOT NULL DEFAULT '{}',
    snapshot_size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_undo_snapshots_user_id ON undo_snapshots(user_id);
CREATE UNIQUE INDEX uq_undo_snapshots_user_entity ON undo_snapshots(user_id, entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON undo_snapshots
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `undo_snapshots` table with per-user per-entity undo tree storage
- [ ] `entity_type TEXT` and `entity_id BIGINT` identify which entity the undo tree belongs to
- [ ] `snapshot_data JSONB` stores serialized undo tree
- [ ] `snapshot_size_bytes INTEGER` tracks size for enforcing limits
- [ ] Unique constraint on `(user_id, entity_type, entity_id)`

---

## Phase 2: Backend API

### Task 2.1: Workspace State Repository
**File:** `src/repositories/workspace_repo.rs`

```rust
pub struct WorkspaceRepo;

impl WorkspaceRepo {
    pub async fn get_or_create(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
    ) -> Result<WorkspaceState, sqlx::Error> {
        // Use INSERT ... ON CONFLICT to upsert with defaults
        sqlx::query_as::<_, WorkspaceState>(
            "INSERT INTO workspace_states (user_id, device_type)
             VALUES ($1, $2)
             ON CONFLICT (user_id, device_type) DO NOTHING
             RETURNING id, user_id, device_type, layout_state, navigation_state,
                       preferences, created_at, updated_at"
        )
        .bind(user_id)
        .bind(device_type)
        .fetch_optional(pool)
        .await
        .map(|opt| opt.unwrap_or_default())
        // Fallback to SELECT if ON CONFLICT hit
    }

    pub async fn update_layout(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
        layout_state: &serde_json::Value,
    ) -> Result<WorkspaceState, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceState>(
            "UPDATE workspace_states SET layout_state = $3
             WHERE user_id = $1 AND device_type = $2
             RETURNING id, user_id, device_type, layout_state, navigation_state,
                       preferences, created_at, updated_at"
        )
        .bind(user_id)
        .bind(device_type)
        .bind(layout_state)
        .fetch_one(pool)
        .await
    }

    pub async fn update_navigation(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
        navigation_state: &serde_json::Value,
    ) -> Result<WorkspaceState, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceState>(
            "UPDATE workspace_states SET navigation_state = $3
             WHERE user_id = $1 AND device_type = $2
             RETURNING id, user_id, device_type, layout_state, navigation_state,
                       preferences, created_at, updated_at"
        )
        .bind(user_id)
        .bind(device_type)
        .bind(navigation_state)
        .fetch_one(pool)
        .await
    }

    pub async fn reset_to_default(
        pool: &PgPool,
        user_id: DbId,
        device_type: &str,
    ) -> Result<WorkspaceState, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceState>(
            "UPDATE workspace_states
             SET layout_state = '{}', navigation_state = '{}', preferences = '{}'
             WHERE user_id = $1 AND device_type = $2
             RETURNING id, user_id, device_type, layout_state, navigation_state,
                       preferences, created_at, updated_at"
        )
        .bind(user_id)
        .bind(device_type)
        .fetch_one(pool)
        .await
    }
}
```

**Acceptance Criteria:**
- [ ] `get_or_create` returns existing state or creates default
- [ ] `update_layout` saves panel layout JSONB
- [ ] `update_navigation` saves navigation JSONB
- [ ] `reset_to_default` clears all state back to empty JSON
- [ ] All queries use explicit column lists

### Task 2.2: Workspace API Handlers
**File:** `src/api/handlers/workspace.rs`

```rust
pub async fn get_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
) -> Result<Json<WorkspaceState>, AppError> {
    let device_type = params.device_type.as_deref().unwrap_or("desktop");
    let ws = WorkspaceRepo::get_or_create(&state.pool, auth.user_id, device_type).await?;
    Ok(Json(ws))
}

pub async fn update_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
    Json(input): Json<UpdateWorkspaceRequest>,
) -> Result<Json<WorkspaceState>, AppError> {
    let device_type = params.device_type.as_deref().unwrap_or("desktop");
    // Update whichever fields are provided
}

pub async fn reset_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkspaceQuery>,
) -> Result<Json<WorkspaceState>, AppError> {
    let device_type = params.device_type.as_deref().unwrap_or("desktop");
    let ws = WorkspaceRepo::reset_to_default(&state.pool, auth.user_id, device_type).await?;
    Ok(Json(ws))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/workspace?device_type=desktop` — returns workspace state for device
- [ ] `PUT /api/v1/workspace?device_type=desktop` — updates workspace state
- [ ] `POST /api/v1/workspace/reset?device_type=desktop` — resets to defaults
- [ ] All endpoints require authentication (`AuthUser`)
- [ ] Device type defaults to "desktop" if not specified

### Task 2.3: Undo Snapshot API
**File:** `src/api/handlers/workspace.rs` (extend)

```rust
pub async fn get_undo_snapshot(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
) -> Result<Json<Option<UndoSnapshot>>, AppError> { ... }

pub async fn save_undo_snapshot(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, DbId)>,
    Json(input): Json<SaveUndoRequest>,
) -> Result<Json<UndoSnapshot>, AppError> {
    // Check size limit
    let size = serde_json::to_string(&input.snapshot_data)?.len();
    if size > MAX_UNDO_SNAPSHOT_BYTES {
        return Err(AppError::BadRequest("Undo snapshot exceeds size limit".to_string()));
    }
    // Upsert snapshot
}
```

**Acceptance Criteria:**
- [ ] `GET /api/v1/workspace/undo/:entity_type/:entity_id` — get undo snapshot
- [ ] `PUT /api/v1/workspace/undo/:entity_type/:entity_id` — save undo snapshot
- [ ] Size limit enforced (configurable, default 1MB per snapshot)
- [ ] Requires authentication

### Task 2.4: Register Workspace Routes
**File:** `src/api/routes.rs` (update)

```rust
fn workspace_routes() -> Router<AppState> {
    Router::new()
        .route("/", axum::routing::get(handlers::workspace::get_workspace)
            .put(handlers::workspace::update_workspace))
        .route("/reset", axum::routing::post(handlers::workspace::reset_workspace))
        .route("/undo/:entity_type/:entity_id",
            axum::routing::get(handlers::workspace::get_undo_snapshot)
                .put(handlers::workspace::save_undo_snapshot))
}
```

**Acceptance Criteria:**
- [ ] All workspace routes registered under `/api/v1/workspace`
- [ ] Routes require authentication

---

## Phase 3: Frontend State Management

### Task 3.1: Workspace Zustand Store
**File:** `frontend/src/stores/workspaceStore.ts`

```typescript
import { create } from 'zustand';

interface LayoutState {
  panels: Record<string, PanelConfig>;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

interface NavigationState {
  activeProjectId: number | null;
  activeCharacterId: number | null;
  activeSceneId: number | null;
  activeSegmentId: number | null;
  scrollPositions: Record<string, number>;
  zoomLevel: number;
  videoPlaybackPosition: number;
}

interface WorkspaceStore {
  layout: LayoutState;
  navigation: NavigationState;
  isLoaded: boolean;
  isDirty: boolean;

  // Actions
  setLayout: (layout: Partial<LayoutState>) => void;
  setNavigation: (nav: Partial<NavigationState>) => void;
  loadFromServer: (deviceType: string) => Promise<void>;
  saveToServer: (deviceType: string) => Promise<void>;
  resetLayout: () => Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] Zustand store manages layout and navigation state
- [ ] `setLayout` and `setNavigation` update local state and mark dirty
- [ ] `loadFromServer` fetches state from API on login
- [ ] `saveToServer` persists state via API
- [ ] `isLoaded` flag prevents rendering before state is restored
- [ ] `zustand` added to frontend `package.json`

### Task 3.2: Debounced Auto-Save Hook
**File:** `frontend/src/hooks/useAutoSave.ts`

```typescript
import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function useAutoSave(debounceMs: number = 2000) {
  const { isDirty, saveToServer } = useWorkspaceStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceType = detectDeviceType();

  useEffect(() => {
    if (!isDirty) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveToServer(deviceType);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isDirty, debounceMs]);
}
```

**Acceptance Criteria:**
- [ ] State changes trigger auto-save after 2-second debounce
- [ ] Multiple rapid changes reset the debounce timer
- [ ] `beforeunload` event triggers immediate save
- [ ] No unnecessary API calls when state hasn't changed

### Task 3.3: Device Type Detection
**File:** `frontend/src/lib/deviceDetection.ts`

```typescript
export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|android/i.test(ua) && !/tablet/i.test(ua)) return 'mobile';
  return 'desktop';
}
```

**Acceptance Criteria:**
- [ ] Detects desktop, tablet, mobile from user agent
- [ ] Used as key for workspace state API calls
- [ ] Returns 'desktop' as fallback for unknown user agents

### Task 3.4: State Restoration on Login
**File:** `frontend/src/components/WorkspaceProvider.tsx`

```typescript
const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { isLoaded, loadFromServer } = useWorkspaceStore();
  const deviceType = detectDeviceType();

  useEffect(() => {
    if (isAuthenticated && !isLoaded) {
      loadFromServer(deviceType);
    }
  }, [isAuthenticated, isLoaded]);

  if (isAuthenticated && !isLoaded) {
    return <WorkspaceLoadingSkeleton />;
  }

  return <>{children}</>;
};
```

**Acceptance Criteria:**
- [ ] Workspace state loads after authentication completes
- [ ] Loading skeleton shown during state restoration (no layout flash)
- [ ] State restoration completes in <500ms
- [ ] If state load fails, default layout is used gracefully

---

## Phase 4: Layout Persistence

### Task 4.1: Panel Configuration System
**File:** `frontend/src/components/layout/PanelManager.tsx`

Implement panel layout management that integrates with the workspace store.

```typescript
interface PanelConfig {
  id: string;
  isVisible: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  order: number;
}

const PanelManager: React.FC = () => {
  const { layout, setLayout } = useWorkspaceStore();

  const handlePanelResize = (panelId: string, size: { width: number; height: number }) => {
    setLayout({
      panels: {
        ...layout.panels,
        [panelId]: { ...layout.panels[panelId], size },
      },
    });
  };

  // Render panels based on layout state
};
```

**Acceptance Criteria:**
- [ ] Panel sizes and positions persist across sessions
- [ ] Panel visibility (open/closed) persists
- [ ] Sidebar width and collapsed state persist
- [ ] Resizing triggers debounced save

### Task 4.2: Reset Layout Action
**File:** `frontend/src/components/layout/ResetLayoutButton.tsx`

```typescript
const ResetLayoutButton: React.FC = () => {
  const { resetLayout } = useWorkspaceStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button onClick={() => setConfirmOpen(true)}>Reset Layout</button>
      {confirmOpen && (
        <ConfirmDialog
          message="This will reset all panels to their default positions. Continue?"
          onConfirm={() => { resetLayout(); setConfirmOpen(false); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
};
```

**Acceptance Criteria:**
- [ ] "Reset Layout" button visible in settings/toolbar
- [ ] Confirmation dialog before reset (destructive action)
- [ ] Resets both layout and navigation state to defaults
- [ ] Immediately saves the reset state to the server

---

## Phase 5: Navigation State

### Task 5.1: Navigation State Tracking
**File:** `frontend/src/hooks/useNavigationPersistence.ts`

```typescript
export function useNavigationPersistence() {
  const { navigation, setNavigation } = useWorkspaceStore();
  const location = useLocation();

  // Track active entity from URL
  useEffect(() => {
    const projectId = extractProjectId(location.pathname);
    const characterId = extractCharacterId(location.pathname);
    setNavigation({ activeProjectId: projectId, activeCharacterId: characterId });
  }, [location.pathname]);

  // Track scroll positions
  const trackScrollPosition = (viewId: string, position: number) => {
    setNavigation({
      scrollPositions: { ...navigation.scrollPositions, [viewId]: position },
    });
  };

  return { trackScrollPosition };
}
```

**Acceptance Criteria:**
- [ ] Active project/character/scene/segment tracked from URL changes
- [ ] Scroll positions tracked per list view
- [ ] Video playback position tracked
- [ ] Zoom level in canvas views tracked
- [ ] All changes trigger debounced auto-save

### Task 5.2: Navigation Restoration
**File:** `frontend/src/hooks/useNavigationRestore.ts`

```typescript
export function useNavigationRestore() {
  const { navigation, isLoaded } = useWorkspaceStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (navigation.activeProjectId) {
      navigate(`/projects/${navigation.activeProjectId}`);
    }
  }, [isLoaded]);
}
```

**Acceptance Criteria:**
- [ ] On login, navigate to the last-viewed entity
- [ ] Restore scroll positions after navigation
- [ ] Restore zoom level in canvas views
- [ ] Handle deleted entities gracefully (navigate to parent if entity no longer exists)

---

## Phase 6: Integration Tests

### Task 6.1: Backend Workspace API Tests
**File:** `tests/workspace_tests.rs`

```rust
#[tokio::test]
async fn test_workspace_get_creates_default() {
    // Authenticated GET with no existing state creates default
}

#[tokio::test]
async fn test_workspace_update_and_retrieve() {
    // PUT state, GET state, verify match
}

#[tokio::test]
async fn test_workspace_per_device_isolation() {
    // Update desktop state, verify tablet state is independent
}

#[tokio::test]
async fn test_workspace_reset() {
    // Set state, reset, verify empty
}

#[tokio::test]
async fn test_undo_snapshot_size_limit() {
    // Try to save snapshot exceeding size limit, verify rejection
}
```

**Acceptance Criteria:**
- [ ] Test: default state created on first GET
- [ ] Test: PUT then GET round-trip preserves state
- [ ] Test: desktop and tablet states are independent
- [ ] Test: reset clears all state
- [ ] Test: undo snapshot size limit enforced
- [ ] Test: deleting user cascades to workspace state

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260218300001_create_workspace_states_table.sql` | Workspace states DDL |
| `migrations/20260218300002_create_undo_snapshots_table.sql` | Undo snapshots DDL |
| `src/models/workspace.rs` | WorkspaceState and UndoSnapshot model structs |
| `src/repositories/workspace_repo.rs` | Workspace CRUD operations |
| `src/api/handlers/workspace.rs` | Workspace API handlers |
| `frontend/src/stores/workspaceStore.ts` | Zustand store for workspace state |
| `frontend/src/hooks/useAutoSave.ts` | Debounced auto-save hook |
| `frontend/src/hooks/useNavigationPersistence.ts` | Navigation state tracking |
| `frontend/src/hooks/useNavigationRestore.ts` | Navigation restoration on login |
| `frontend/src/lib/deviceDetection.ts` | Device type detection utility |
| `frontend/src/components/layout/PanelManager.tsx` | Panel layout management |
| `frontend/src/components/layout/ResetLayoutButton.tsx` | Reset layout with confirmation |
| `frontend/src/components/WorkspaceProvider.tsx` | State restoration wrapper |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `trigger_set_updated_at()`, `DbId = i64`, JSONB support
- PRD-002: Axum server, `AppState`, `AppError`, API routing
- PRD-003: `AuthUser` extractor for per-user scoping, `users` table FK

### New Infrastructure Needed
- `zustand` npm package for frontend state management
- No new Rust crates needed (JSONB handled by `serde_json` already in deps)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2
2. Phase 2: Backend API — Tasks 2.1–2.4
3. Phase 3: Frontend State Management — Tasks 3.1–3.4

**MVP Success Criteria:**
- Workspace state (layout + navigation) saves and restores per user
- Per-device profiles work independently
- State restoration <500ms after auth
- Auto-save debounced at 2 seconds

### Post-MVP Enhancements
1. Phase 4: Layout Persistence — Tasks 4.1–4.2
2. Phase 5: Navigation State — Tasks 5.1–5.2
3. Phase 6: Integration Tests — Task 6.1

---

## Notes

1. **JSONB flexibility:** The workspace state schema is intentionally loose (JSONB). As the UI evolves, new fields can be added without database migrations. The frontend should handle missing fields gracefully with defaults.
2. **Undo snapshot size:** Default limit is 1MB per entity per user. This should be monitored and adjusted based on real usage. Large undo trees should truncate oldest entries.
3. **Stale references:** Navigation state may reference deleted entities. The frontend should detect 404 responses and fall back to the parent entity or dashboard.
4. **Tab synchronization:** For MVP, each tab manages its own state independently. Cross-tab sync via BroadcastChannel API is a post-MVP enhancement.
5. **Performance:** The workspace state endpoint will be called frequently (debounced, but still). Consider HTTP caching headers or ETags to avoid unnecessary round-trips.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD
