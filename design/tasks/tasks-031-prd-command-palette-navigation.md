# Task List: Command Palette & Navigation (Cmd+K)

**PRD Reference:** `design/prds/031-prd-command-palette-navigation.md`
**Scope:** Build a global Cmd+K command palette with fuzzy search across all platform entities, command execution, frecency-based ranking, and keyboard shortcut hints.

## Overview

Power users need to jump between projects, characters, scenes, and trigger bulk actions without clicking through menus. This PRD provides a global search and command interface activated via Cmd+K (or Ctrl+K). It integrates with PRD-020's search engine for instant entity lookup and PRD-052's shortcut registry for displaying shortcut hints alongside every action. The palette supports recent history, frecency-based ranking, and full keyboard navigation.

### What Already Exists
- PRD-020 Search & Discovery Engine (entity search API)
- PRD-052 Keyboard Shortcut System (shortcut registry)
- PRD-029 Design system components

### What We're Building
1. Command palette modal UI component with fuzzy search
2. Command registry for navigation and action commands
3. Frecency scoring system for result ranking
4. User recent items tracking (database-backed)
5. Backend API for palette search and recent items

### Key Design Decisions
1. **Unified search** — Entity search uses PRD-020 API; command search uses client-side command registry. Results merged in the palette.
2. **Frecency scoring** — Combines recency (how recently accessed) with frequency (how often accessed) for intelligent ranking.
3. **Command registry** — All executable commands (navigation, actions, settings) register in a central client-side registry.
4. **Keyboard-first** — Full keyboard navigation within the palette; no mouse required.

---

## Phase 1: Database & API for Recent Items

### Task 1.1: Create User Recent Items Table
**File:** `migrations/YYYYMMDD_create_user_recent_items.sql`

```sql
CREATE TABLE user_recent_items (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,       -- 'project' | 'character' | 'scene' | 'segment' | etc.
    entity_id BIGINT NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 1,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_recent_items_user_id ON user_recent_items(user_id);
CREATE INDEX idx_user_recent_items_last_accessed ON user_recent_items(user_id, last_accessed_at DESC);
CREATE UNIQUE INDEX uq_user_recent_items_user_entity ON user_recent_items(user_id, entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_recent_items
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_recent_items` tracks entity accesses per user with access count and timestamp
- [ ] Unique constraint on (user_id, entity_type, entity_id) prevents duplicates
- [ ] Index on (user_id, last_accessed_at DESC) for efficient recent items query
- [ ] `updated_at` trigger applied

### Task 1.2: Recent Items Model & Repository
**File:** `src/models/recent_item.rs`, `src/repositories/recent_item_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRecentItem {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub access_count: i32,
    pub last_accessed_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl RecentItemRepo {
    /// Upsert: increment access_count, update last_accessed_at
    pub async fn record_access(&self, user_id: DbId, entity_type: &str, entity_id: DbId) -> Result<()>;

    /// Get recent items sorted by frecency score
    pub async fn get_recent(&self, user_id: DbId, limit: i32) -> Result<Vec<UserRecentItem>>;
}
```

**Acceptance Criteria:**
- [ ] `record_access` upserts: inserts on first access, increments count on subsequent
- [ ] `get_recent` returns items sorted by frecency (recency + frequency weighting)
- [ ] Limit configurable, default 10
- [ ] Unit tests for frecency calculation

### Task 1.3: Palette Search & Recent Items API
**File:** `src/routes/palette.rs`

```rust
pub fn palette_routes() -> Router<AppState> {
    Router::new()
        .route("/search/palette", get(palette_search))
        .route("/user/recent-items", get(get_recent_items))
}

/// GET /search/palette?q=query
/// Searches entities via PRD-020 search engine, returns typed results
async fn palette_search(Query(params): Query<PaletteSearchParams>) -> impl IntoResponse;
```

**Acceptance Criteria:**
- [ ] `GET /search/palette?q=query` searches across projects, characters, scenes, segments, scene types
- [ ] Results include entity type icon hint, name, and parent context string
- [ ] Results within 100ms for search queries
- [ ] `GET /user/recent-items` returns frecency-ranked recent items

---

## Phase 2: Command Registry

### Task 2.1: Client-Side Command Registry
**File:** `frontend/src/features/command-palette/commandRegistry.ts`

```typescript
interface PaletteCommand {
  id: string;
  label: string;
  category: 'navigation' | 'action' | 'settings';
  icon?: React.ComponentType;
  shortcut?: string;       // From PRD-052 registry
  execute: () => void;
  context?: string;        // Only available in this panel context
}

class CommandRegistry {
  private commands = new Map<string, PaletteCommand>();

  register(command: PaletteCommand): void;
  unregister(id: string): void;
  search(query: string): PaletteCommand[];
  getAll(): PaletteCommand[];
  getByCategory(category: string): PaletteCommand[];
}

export const commandRegistry = new CommandRegistry();
```

**Acceptance Criteria:**
- [ ] Central registry for all palette-executable commands
- [ ] Navigation commands: go to project, character, scene, settings, dashboard
- [ ] Action commands: submit batch, export ZIP, run QA, approve all, reject all
- [ ] Settings commands: switch theme, change layout, toggle sensitivity mode
- [ ] Each command shows its keyboard shortcut from PRD-052 registry if one exists

### Task 2.2: Command Registration from Feature Modules
**File:** `frontend/src/features/*/commands.ts` (pattern)

Each feature module registers its commands during initialization.

**Acceptance Criteria:**
- [ ] Feature modules register commands on mount and unregister on unmount
- [ ] Commands tied to feature availability (e.g., batch commands only when batch view is loaded)
- [ ] Shortcut hints sourced from PRD-052 shortcut registry

---

## Phase 3: Frecency Scoring

### Task 3.1: Frecency Scorer
**File:** `frontend/src/features/command-palette/frecencyScorer.ts`

```typescript
interface FrecencyItem {
  entityType: string;
  entityId: number;
  accessCount: number;
  lastAccessedAt: Date;
}

export function calculateFrecencyScore(item: FrecencyItem): number {
  const recencyWeight = getRecencyWeight(item.lastAccessedAt);
  const frequencyWeight = Math.log2(item.accessCount + 1);
  return recencyWeight * frequencyWeight;
}

function getRecencyWeight(lastAccessed: Date): number {
  const hoursAgo = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) return 10;
  if (hoursAgo < 24) return 5;
  if (hoursAgo < 168) return 2; // 1 week
  return 1;
}
```

**Acceptance Criteria:**
- [ ] Frecency score combines recency and frequency
- [ ] More recent accesses weighted higher
- [ ] Higher access count weighted logarithmically (diminishing returns)
- [ ] Configurable weights
- [ ] Unit tests for scoring function

---

## Phase 4: Palette UI Component

### Task 4.1: Palette Modal Component
**File:** `frontend/src/features/command-palette/CommandPalette.tsx`

```typescript
export const CommandPalette: React.FC = () => {
  // Centered modal overlay with subtle backdrop
  // Search input at top
  // Category tabs: All | Commands | Entities
  // Results list with keyboard navigation
};
```

**Acceptance Criteria:**
- [ ] Opens with Cmd+K / Ctrl+K (registered with PRD-052)
- [ ] Opens in <100ms after keyboard shortcut
- [ ] Centered overlay with subtle backdrop
- [ ] Results update live as user types (no submit button)
- [ ] Category tabs: All, Commands, Entities

### Task 4.2: Search Result Items
**File:** `frontend/src/features/command-palette/PaletteResult.tsx`

**Acceptance Criteria:**
- [ ] Entity results: type icon, name, parent context (e.g., "Jane > Dance Scene")
- [ ] Command results: icon, label, keyboard shortcut hint
- [ ] Results appear within 100ms of typing
- [ ] Fuzzy matching with ranked results (exact match first, then fuzzy)

### Task 4.3: Keyboard Navigation
**File:** `frontend/src/features/command-palette/useKeyboardNavigation.ts`

**Acceptance Criteria:**
- [ ] Arrow keys navigate results (up/down)
- [ ] Enter selects/executes the highlighted result
- [ ] Escape dismisses the palette
- [ ] Tab switches between search categories (All, Commands, Entities)
- [ ] Home/End jump to first/last result

---

## Phase 5: Recent History Display

### Task 5.1: Recent Items Panel
**File:** `frontend/src/features/command-palette/RecentItems.tsx`

**Acceptance Criteria:**
- [ ] When palette opens (before typing), show recent items ranked by frecency
- [ ] Default: 10 most recent/frequent items
- [ ] Configurable number of recent items to display
- [ ] Items update after each navigation action

### Task 5.2: Access Recording Hook
**File:** `frontend/src/features/command-palette/useRecordAccess.ts`

**Acceptance Criteria:**
- [ ] Hook records entity access when user navigates to an entity
- [ ] Posts to `record_access` API endpoint (debounced)
- [ ] Updates local frecency cache optimistically

---

## Phase 6: Integration & Testing

### Task 6.1: PRD-020 Search Integration
**File:** `frontend/src/features/command-palette/useEntitySearch.ts`

**Acceptance Criteria:**
- [ ] Entity search uses PRD-020 search API for fuzzy entity lookup
- [ ] Results merged with command registry results
- [ ] Entity results show type icon and parent context

### Task 6.2: PRD-052 Shortcut Integration
**File:** integration within `commandRegistry.ts`

**Acceptance Criteria:**
- [ ] Each command displays its keyboard shortcut from PRD-052 registry
- [ ] Shortcut hints update when user changes keymap preset

### Task 6.3: Comprehensive Tests
**File:** `frontend/src/features/command-palette/__tests__/`

**Acceptance Criteria:**
- [ ] Palette opens/closes correctly with keyboard shortcut
- [ ] Fuzzy search returns correct results
- [ ] Frecency scoring ranks results correctly
- [ ] Keyboard navigation works through results
- [ ] Command execution triggers correct action
- [ ] Recent items persist across sessions

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_user_recent_items.sql` | Recent items table |
| `src/models/recent_item.rs` | Rust model for recent items |
| `src/repositories/recent_item_repo.rs` | Recent items repository |
| `src/routes/palette.rs` | Palette search and recent items API |
| `frontend/src/features/command-palette/CommandPalette.tsx` | Main palette modal |
| `frontend/src/features/command-palette/commandRegistry.ts` | Command registry |
| `frontend/src/features/command-palette/frecencyScorer.ts` | Frecency scoring |
| `frontend/src/features/command-palette/useKeyboardNavigation.ts` | Keyboard nav hook |

## Dependencies
- PRD-020: Search & Discovery Engine (entity search API)
- PRD-052: Keyboard Shortcut System (shortcut registry, Cmd+K binding)
- PRD-029: Design system components for palette UI

## Implementation Order
### MVP
1. Phase 1 (Database & API) — recent items persistence
2. Phase 2 (Command Registry) — client-side command system
3. Phase 3 (Frecency) — scoring algorithm
4. Phase 4 (Palette UI) — modal, search, keyboard nav
5. Phase 5 (Recent History) — recent items display and recording
6. Phase 6 (Integration) — PRD-020 and PRD-052 integration

### Post-MVP Enhancements
- Scoped command contexts: context-aware commands based on active panel/view

## Notes
- The palette must feel instant — <100ms open time, <100ms search results.
- Command registration is distributed: each feature module registers its own commands.
- Frecency scoring is the key differentiator from a simple "recent items" list.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
