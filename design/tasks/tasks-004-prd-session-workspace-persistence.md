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

## Phase 1: Database Schema [COMPLETE]

### Task 1.1: Create Workspace States Table [COMPLETE]
**File:** `apps/db/migrations/20260221000033_create_workspace_states.sql`

**Acceptance Criteria:**
- [x] `workspace_states` table with `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- [x] Unique constraint on `(user_id, device_type)` — one state per user per device
- [x] `layout_state JSONB` for panel sizes, positions, visibility
- [x] `navigation_state JSONB` for open project/character/scene, scroll positions, zoom
- [x] `preferences JSONB` for user-specific settings (zoom level, etc.)
- [x] FK index on `user_id`

### Task 1.2: Create Undo Snapshots Table [COMPLETE]
**File:** `apps/db/migrations/20260221000034_create_undo_snapshots.sql`

**Acceptance Criteria:**
- [x] `undo_snapshots` table with per-user per-entity undo tree storage
- [x] `entity_type TEXT` and `entity_id BIGINT` identify which entity the undo tree belongs to
- [x] `snapshot_data JSONB` stores serialized undo tree
- [x] `snapshot_size_bytes INTEGER` tracks size for enforcing limits
- [x] Unique constraint on `(user_id, entity_type, entity_id)`

---

## Phase 2: Backend API [COMPLETE]

### Task 2.1: Workspace State Repository [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/workspace_repo.rs`

**Implementation Notes:** Combined `update_layout` and `update_navigation` into a single `update` method that does partial JSONB merge via `||` operator. Also added `UndoSnapshotRepo` in the same file.

**Acceptance Criteria:**
- [x] `get_or_create` returns existing state or creates default
- [x] `update` saves layout, navigation, and preferences via JSONB merge
- [x] `reset_to_default` clears all state back to empty JSON
- [x] All queries use explicit column lists

### Task 2.2: Workspace API Handlers [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/workspace.rs`

**Acceptance Criteria:**
- [x] `GET /api/v1/workspace?device_type=desktop` — returns workspace state for device
- [x] `PUT /api/v1/workspace?device_type=desktop` — updates workspace state
- [x] `POST /api/v1/workspace/reset?device_type=desktop` — resets to defaults
- [x] All endpoints require authentication (`AuthUser`)
- [x] Device type defaults to "desktop" if not specified

### Task 2.3: Undo Snapshot API [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/workspace.rs` (same file)

**Acceptance Criteria:**
- [x] `GET /api/v1/workspace/undo/{entity_type}/{entity_id}` — get undo snapshot
- [x] `PUT /api/v1/workspace/undo/{entity_type}/{entity_id}` — save undo snapshot
- [x] Size limit enforced (1MB per snapshot via `MAX_UNDO_SNAPSHOT_BYTES`)
- [x] Requires authentication

### Task 2.4: Register Workspace Routes [COMPLETE]
**File:** `apps/backend/crates/api/src/routes/workspace.rs`

**Acceptance Criteria:**
- [x] All workspace routes registered under `/api/v1/workspace`
- [x] Routes require authentication

### Task 2.5: Core Workspace Constants [COMPLETE]
**File:** `apps/backend/crates/core/src/workspace.rs`

**Acceptance Criteria:**
- [x] `MAX_UNDO_SNAPSHOT_BYTES` constant (1MB)
- [x] `DEFAULT_DEVICE_TYPE` constant
- [x] `VALID_DEVICE_TYPES` array and `is_valid_device_type` validator
- [x] Unit tests (4 tests, all passing)

---

## Phase 3: Frontend State Management [COMPLETE]

### Task 3.1: Workspace Zustand Store [COMPLETE]
**File:** `apps/frontend/src/features/workspace/hooks/use-workspace.ts`

**Implementation Notes:** Combined Zustand store with TanStack Query hooks in one module. The store holds the local working copy; TanStack Query handles server sync. This follows the project convention of co-locating hooks with their feature.

**Acceptance Criteria:**
- [x] Zustand store manages layout and navigation state
- [x] `setLayout` and `setNavigation` update local state and mark dirty
- [x] `loadFromServer` via TanStack Query + `hydrateFromServer` action
- [x] `saveToServer` via `useUpdateWorkspace` mutation
- [x] `isLoaded` flag prevents rendering before state is restored
- [x] `zustand` already in frontend `package.json`

### Task 3.2: Debounced Auto-Save Hook [COMPLETE]
**File:** `apps/frontend/src/features/workspace/useAutoSave.ts`

**Acceptance Criteria:**
- [x] State changes trigger auto-save after 2-second debounce
- [x] Multiple rapid changes reset the debounce timer
- [x] `beforeunload` event triggers immediate save via `sendBeacon`
- [x] No unnecessary API calls when state hasn't changed (isDirty guard)

### Task 3.3: Device Type Detection [COMPLETE]
**File:** `apps/frontend/src/features/workspace/deviceDetection.ts`

**Acceptance Criteria:**
- [x] Detects desktop, tablet, mobile from user agent
- [x] Used as key for workspace state API calls
- [x] Returns 'desktop' as fallback for unknown user agents

### Task 3.4: State Restoration on Login [COMPLETE]
**File:** `apps/frontend/src/features/workspace/WorkspaceProvider.tsx`

**Acceptance Criteria:**
- [x] Workspace state loads after authentication completes
- [x] Loading skeleton shown during state restoration (no layout flash)
- [x] State restoration completes in <500ms (single GET request)
- [x] If state load fails, default layout is used gracefully

### Task 3.5: Reset Layout Button [COMPLETE]
**File:** `apps/frontend/src/features/workspace/ResetLayoutButton.tsx`

**Acceptance Criteria:**
- [x] Confirmation dialog before reset (destructive action)
- [x] Resets both layout and navigation state to defaults
- [x] Immediately saves the reset state to the server
- [x] Uses design system Button and Modal components

### Task 3.6: Frontend Tests [COMPLETE]
**File:** `apps/frontend/src/features/workspace/__tests__/WorkspaceProvider.test.tsx`

**Acceptance Criteria:**
- [x] 7 tests passing (3 component, 4 store unit tests)
- [x] Tests workspace loading skeleton, hydration, and fallback behavior
- [x] Tests store setLayout/setNavigation/markClean/reset actions

---

## Phase 4: Layout Persistence

### Task 4.1: Panel Configuration System
**File:** `frontend/src/components/layout/PanelManager.tsx`

**Acceptance Criteria:**
- [ ] Panel sizes and positions persist across sessions
- [ ] Panel visibility (open/closed) persists
- [ ] Sidebar width and collapsed state persist
- [ ] Resizing triggers debounced save

### Task 4.2: Reset Layout Action
**File:** `frontend/src/components/layout/ResetLayoutButton.tsx`

**Acceptance Criteria:**
- [ ] "Reset Layout" button visible in settings/toolbar
- [ ] Confirmation dialog before reset (destructive action)
- [ ] Resets both layout and navigation state to defaults
- [ ] Immediately saves the reset state to the server

---

## Phase 5: Navigation State

### Task 5.1: Navigation State Tracking
**File:** `frontend/src/hooks/useNavigationPersistence.ts`

**Acceptance Criteria:**
- [ ] Active project/character/scene/segment tracked from URL changes
- [ ] Scroll positions tracked per list view
- [ ] Video playback position tracked
- [ ] Zoom level in canvas views tracked
- [ ] All changes trigger debounced auto-save

### Task 5.2: Navigation Restoration
**File:** `frontend/src/hooks/useNavigationRestore.ts`

**Acceptance Criteria:**
- [ ] On login, navigate to the last-viewed entity
- [ ] Restore scroll positions after navigation
- [ ] Restore zoom level in canvas views
- [ ] Handle deleted entities gracefully (navigate to parent if entity no longer exists)

---

## Phase 6: Integration Tests

### Task 6.1: Backend Workspace API Tests
**File:** `tests/workspace_tests.rs`

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
| `apps/db/migrations/20260221000033_create_workspace_states.sql` | Workspace states DDL |
| `apps/db/migrations/20260221000034_create_undo_snapshots.sql` | Undo snapshots DDL |
| `apps/backend/crates/db/src/models/workspace.rs` | WorkspaceState and UndoSnapshot model structs |
| `apps/backend/crates/db/src/repositories/workspace_repo.rs` | Workspace and Undo CRUD operations |
| `apps/backend/crates/core/src/workspace.rs` | Workspace constants and device type validation |
| `apps/backend/crates/api/src/handlers/workspace.rs` | Workspace and undo API handlers |
| `apps/backend/crates/api/src/routes/workspace.rs` | Workspace route definitions |
| `apps/frontend/src/features/workspace/types.ts` | TypeScript types and defaults |
| `apps/frontend/src/features/workspace/hooks/use-workspace.ts` | Zustand store + TanStack Query hooks |
| `apps/frontend/src/features/workspace/useAutoSave.ts` | Debounced auto-save hook |
| `apps/frontend/src/features/workspace/deviceDetection.ts` | Device type detection utility |
| `apps/frontend/src/features/workspace/WorkspaceProvider.tsx` | State restoration wrapper |
| `apps/frontend/src/features/workspace/ResetLayoutButton.tsx` | Reset layout with confirmation |
| `apps/frontend/src/features/workspace/index.ts` | Barrel export |
| `apps/frontend/src/features/workspace/__tests__/WorkspaceProvider.test.tsx` | Component and store tests |

---

## Dependencies

### Existing Components to Reuse
- PRD-000: `set_updated_at()` trigger function, `DbId = i64`, JSONB support
- PRD-002: Axum server, `AppState`, `AppError`, API routing
- PRD-003: `AuthUser` extractor for per-user scoping, `users` table FK

### New Infrastructure Needed
- `zustand` npm package for frontend state management (already in package.json)
- No new Rust crates needed (JSONB handled by `serde_json` already in deps)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.2 [COMPLETE]
2. Phase 2: Backend API — Tasks 2.1–2.5 [COMPLETE]
3. Phase 3: Frontend State Management — Tasks 3.1–3.6 [COMPLETE]

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
- **v1.1** (2026-02-21): Phases 1-3 (MVP) implemented — database, backend API, frontend state management
