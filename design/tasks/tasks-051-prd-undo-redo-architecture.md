# Task List: Undo/Redo Architecture

**PRD Reference:** `design/prds/051-prd-undo-redo-architecture.md`
**Scope:** Implement a tree-based (not linear) undo/redo system with per-entity scoping, persistent state across sessions, a visual history browser, and clear boundaries between undoable and non-undoable actions.

## Overview

This PRD provides a structured, tree-based undo/redo system essential for creative exploration. The tree model preserves all branches when users explore parameter variations — "try this, undo, try that" never loses history. Undo operates per-entity (character, scene, segment) so that undoing work on Character A never affects Character B. The undo tree is serialized and persisted across sessions via PRD-004, and a visual history browser renders the tree for navigation.

### What Already Exists
- PRD-004 session persistence (for undo tree storage)
- PRD-047 tagging system (for tag add/remove undo)
- PRD-000 database infrastructure

### What We're Building
1. Tree-based undo data structure (not linear stack)
2. Per-entity undo scope (separate trees per character/scene/segment)
3. Action serializer/deserializer for all undoable actions
4. Undo tree persistence (database-backed, survives sessions)
5. Visual history browser component
6. Backend API for undo tree CRUD

### Key Design Decisions
1. **Tree, not stack** — When a user undoes and performs a new action, the old forward path becomes a branch, not deleted. All history preserved.
2. **Per-entity scope** — Each entity has its own undo tree. Undoing on one entity never affects another.
3. **Serialized actions** — Each action in the undo tree is a serialized command (forward + reverse) enabling both undo and redo.
4. **Non-undoable actions explicitly defined** — Completed GPU generation, disk reclamation, and audit log entries cannot be undone. Users are warned before these actions.

---

## Phase 1: Database & API for Undo Trees

### Task 1.1: Create Undo Trees Table
**File:** `migrations/YYYYMMDD_create_undo_trees.sql`

```sql
CREATE TABLE undo_trees (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,       -- 'character' | 'scene' | 'segment'
    entity_id BIGINT NOT NULL,
    tree_json JSONB NOT NULL DEFAULT '{}',
    current_node_id TEXT,            -- Pointer to current position in the tree
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_undo_trees_user_id ON undo_trees(user_id);
CREATE INDEX idx_undo_trees_entity ON undo_trees(entity_type, entity_id);
CREATE UNIQUE INDEX uq_undo_trees_user_entity ON undo_trees(user_id, entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON undo_trees
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `undo_trees` stores per-user, per-entity undo tree as JSONB
- [ ] `current_node_id` tracks the current position in the tree
- [ ] Unique constraint on (user_id, entity_type, entity_id) ensures one tree per user per entity
- [ ] Indexes on user_id and (entity_type, entity_id)
- [ ] `updated_at` trigger applied

### Task 1.2: Undo Tree Model & Repository
**File:** `src/models/undo_tree.rs`, `src/repositories/undo_tree_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UndoTree {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub tree_json: serde_json::Value,
    pub current_node_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl UndoTreeRepo {
    pub async fn get_tree(&self, user_id: DbId, entity_type: &str, entity_id: DbId) -> Result<Option<UndoTree>>;
    pub async fn save_tree(&self, user_id: DbId, entity_type: &str, entity_id: DbId, tree_json: serde_json::Value, current_node_id: &str) -> Result<()>;
}
```

**Acceptance Criteria:**
- [ ] `get_tree` fetches the undo tree for a specific user + entity
- [ ] `save_tree` upserts the tree JSON and current node pointer
- [ ] Unit tests for repository operations

### Task 1.3: Undo Tree API Endpoints
**File:** `src/routes/undo_tree.rs`

```rust
pub fn undo_tree_routes() -> Router<AppState> {
    Router::new()
        .route("/user/undo-tree/:entity_type/:entity_id", get(get_tree).put(save_tree))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/undo-tree/:entity_type/:entity_id` returns the undo tree for an entity
- [ ] `PUT /user/undo-tree/:entity_type/:entity_id` saves updated tree state
- [ ] User can only access their own undo trees

---

## Phase 2: Tree Data Structure

### Task 2.1: Undo Tree Core Data Structure
**File:** `frontend/src/features/undo/UndoTree.ts`

```typescript
interface UndoNode {
  id: string;                  // Unique node ID (UUID)
  parentId: string | null;     // Parent node (null for root)
  action: UndoableAction;      // The action that created this node
  timestamp: number;
  children: string[];          // Child node IDs (branches)
}

interface UndoableAction {
  type: string;                // Action type discriminator
  label: string;               // Human-readable description
  forward: SerializedCommand;  // Command to apply (redo)
  reverse: SerializedCommand;  // Command to reverse (undo)
}

class UndoTree {
  private nodes: Map<string, UndoNode>;
  private currentNodeId: string;
  private rootId: string;

  pushAction(action: UndoableAction): void;   // Add new action, branch if not at tip
  undo(): UndoableAction | null;              // Move to parent
  redo(branchIndex?: number): UndoableAction | null;  // Move to child (which branch?)
  getCurrentNode(): UndoNode;
  getBranches(): UndoNode[];                  // Get available branches at current position
  toJSON(): object;                           // Serialize for persistence
  static fromJSON(json: object): UndoTree;   // Deserialize
}
```

**Acceptance Criteria:**
- [ ] Tree structure: each node has a parent and zero or more children
- [ ] `pushAction` at a non-tip position creates a new branch (old forward path preserved)
- [ ] `undo` navigates to parent node and executes reverse command
- [ ] `redo` navigates to child node (with branch selection) and executes forward command
- [ ] No history is ever destroyed by branching
- [ ] Serialize/deserialize for persistence

### Task 2.2: Action Serializer
**File:** `frontend/src/features/undo/actionSerializer.ts`

```typescript
interface SerializedCommand {
  type: string;
  payload: Record<string, unknown>;
}

// Registry of action type handlers
const actionHandlers = new Map<string, {
  execute: (payload: Record<string, unknown>) => Promise<void>;
}>();

export function registerUndoHandler(type: string, handler: { execute: (payload: any) => Promise<void> }): void;
export function executeCommand(command: SerializedCommand): Promise<void>;
```

**Acceptance Criteria:**
- [ ] All undoable actions can be serialized to JSON
- [ ] Serialized actions can be deserialized and re-executed
- [ ] Action handlers registered per action type
- [ ] Forward and reverse commands are independent (each fully describes its operation)

---

## Phase 3: Per-Entity Undo Scope

### Task 3.1: Entity-Scoped Undo Manager
**File:** `frontend/src/features/undo/useEntityUndo.ts`

```typescript
export function useEntityUndo(entityType: string, entityId: number) {
  // Manages the undo tree for a specific entity
  // Loads from API on mount, saves on change (debounced)

  return {
    pushAction: (action: UndoableAction) => void;
    undo: () => void;
    redo: (branchIndex?: number) => void;
    canUndo: boolean;
    canRedo: boolean;
    branches: UndoNode[];
    currentNode: UndoNode;
    tree: UndoTree;  // For visual browser
  };
}
```

**Acceptance Criteria:**
- [ ] Each entity (character, scene, segment) has its own undo tree
- [ ] Undoing on one entity does not affect other entities
- [ ] Tree loads from API on component mount
- [ ] Tree saves to API on change (debounced to avoid excessive API calls)
- [ ] Undo/redo operations execute in <50ms

---

## Phase 4: Undoable & Non-Undoable Actions

### Task 4.1: Undoable Action Definitions
**File:** `frontend/src/features/undo/undoableActions.ts`

Define forward/reverse commands for all undoable action types.

**Acceptance Criteria:**
- [ ] Metadata edits: character traits, scene parameters, segment settings
- [ ] Approval/rejection decisions (with confirmation for downstream effects)
- [ ] Parameter changes on pending/queued generation jobs
- [ ] Tag additions/removals (PRD-047)
- [ ] Template application (PRD-027) — revert to pre-template state
- [ ] Each action type has a registered handler with forward and reverse commands

### Task 4.2: Non-Undoable Action Warnings
**File:** `frontend/src/features/undo/NonUndoableWarning.tsx`

```typescript
const NON_UNDOABLE_ACTIONS = [
  'completed_generation',   // Too expensive to reverse
  'disk_reclamation',       // Deleted files cannot be restored
  'audit_log_entry',        // Immutable by definition
] as const;
```

**Acceptance Criteria:**
- [ ] Clear warning dialog when performing a non-undoable action
- [ ] Completed GPU generation marked as non-undoable (use re-generation instead)
- [ ] Disk reclamation (PRD-015) marked as non-undoable
- [ ] Audit log entries (PRD-045) marked as non-undoable

---

## Phase 5: Visual History Browser

### Task 5.1: Tree Visualization Component
**File:** `frontend/src/features/undo/HistoryBrowser.tsx`

```typescript
interface HistoryBrowserProps {
  tree: UndoTree;
  currentNodeId: string;
  onNavigate: (nodeId: string) => void;
}
```

**Acceptance Criteria:**
- [ ] Renders the undo tree as a visual tree/graph (not a flat list)
- [ ] Branch points visually distinct from linear steps
- [ ] Current position clearly indicated with a highlight marker
- [ ] Click any node to preview the state at that point
- [ ] Branch labels showing the action that created each branch
- [ ] Scrollable timeline for large trees

### Task 5.2: State Preview on Hover/Click
**File:** `frontend/src/features/undo/StatePreview.tsx`

**Acceptance Criteria:**
- [ ] Clicking a history node shows a preview of the entity state at that point
- [ ] Preview is non-destructive — view only until user commits
- [ ] "Restore to this point" button to commit the navigation
- [ ] Clear visual difference between "previewing" and "committed" states

---

## Phase 6: Persistence & Session Survival

### Task 6.1: Undo Tree Persistence Hook
**File:** `frontend/src/features/undo/useUndoTreePersistence.ts`

**Acceptance Criteria:**
- [ ] Undo tree serialized and saved to backend API on changes (debounced)
- [ ] On login, undo tree restored from API for any entity the user navigates to
- [ ] Survives logout/login cycles
- [ ] Graceful handling of API errors (local state preserved, retry on reconnect)

---

## Phase 7: Keyboard Integration & Testing

### Task 7.1: Keyboard Shortcut Registration
**File:** integration with PRD-052

**Acceptance Criteria:**
- [ ] Cmd+Z / Ctrl+Z registered for undo (via PRD-052 shortcut registry)
- [ ] Cmd+Shift+Z / Ctrl+Shift+Z for redo
- [ ] Shortcuts are context-aware: undo operates on the entity in the focused panel

### Task 7.2: Comprehensive Tests
**File:** `frontend/src/features/undo/__tests__/`

**Acceptance Criteria:**
- [ ] Tree structure tests: branching preserves all paths
- [ ] Undo/redo navigation tests: correct node traversal
- [ ] Per-entity scope tests: operations on entity A don't affect entity B
- [ ] Serialization round-trip tests: serialize → deserialize → identical tree
- [ ] Persistence tests: tree survives simulated logout/login
- [ ] Performance tests: undo/redo operations complete in <50ms

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_undo_trees.sql` | Undo tree persistence table |
| `src/models/undo_tree.rs` | Rust model struct |
| `src/repositories/undo_tree_repo.rs` | Undo tree repository |
| `src/routes/undo_tree.rs` | Axum API endpoints |
| `frontend/src/features/undo/UndoTree.ts` | Core tree data structure |
| `frontend/src/features/undo/actionSerializer.ts` | Action serialization |
| `frontend/src/features/undo/useEntityUndo.ts` | Per-entity undo hook |
| `frontend/src/features/undo/HistoryBrowser.tsx` | Visual tree browser |
| `frontend/src/features/undo/undoableActions.ts` | Action definitions |

## Dependencies
- PRD-004: Session persistence (undo tree storage)
- PRD-047: Tagging system (tag add/remove as undoable actions)
- PRD-027: Template system (template application as undoable action)
- PRD-052: Keyboard shortcuts (Cmd+Z/Cmd+Shift+Z registration)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — undo tree persistence
2. Phase 2 (Tree Data Structure) — core tree with branching
3. Phase 3 (Per-Entity Scope) — entity-scoped undo manager
4. Phase 4 (Actions) — undoable and non-undoable action definitions
5. Phase 5 (Visual Browser) — tree visualization
6. Phase 6 (Persistence) — session survival
7. Phase 7 (Keyboard) — shortcut integration

### Post-MVP Enhancements
- Undo history sharing: export branches as named "explorations" for team collaboration

## Notes
- Tree model is essential — linear stacks lose history on branching, which is unacceptable for creative work.
- Maximum undo tree depth/size should be configurable before pruning old branches.
- Performance target: all undo/redo operations in <50ms.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
