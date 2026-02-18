# Task List: Keyboard Shortcut System & Presets

**PRD Reference:** `design/prds/052-prd-keyboard-shortcut-system-presets.md`
**Scope:** Build a centralized keyboard shortcut registry with industry-standard preset profiles (Premiere, Resolve, Avid), custom keymaps, context-aware shortcuts, a cheat sheet overlay, and a one-handed review mode.

## Overview

Professional editors bring muscle memory from their primary NLE. This PRD provides a unified keyboard shortcut infrastructure with a single centralized registry (no scattered `addEventListener` calls), industry-standard presets, full customization with export/import, context-aware shortcuts (same key does different things in different panels), and a discoverable cheat sheet. A one-handed review mode enables rapid segment review with keyboard-only controls.

### What Already Exists
- PRD-029 design system components (for overlay UI)
- PRD-000 database infrastructure

### What We're Building
1. Centralized shortcut registry (single source of truth)
2. Industry preset profiles (Default, Premiere, Resolve, Avid)
3. Custom keymap system with conflict detection
4. Context-aware shortcut resolution based on focused panel
5. Cheat sheet overlay (press `?`)
6. One-handed review mode
7. Backend API for keymap persistence and preset management

### Key Design Decisions
1. **Single registry** — Every shortcut registers through one central system. Zero scattered `addEventListener` calls.
2. **Context-based resolution** — The same key can map to different actions depending on which panel is focused (e.g., Space = play in Review, toggle selection in Library).
3. **Custom overrides preset** — User rebindings override the active preset, not replace it entirely.
4. **Export/import JSON** — Keymaps shareable as JSON files for team standardization.

---

## Phase 1: Database & API for Keymap Persistence

### Task 1.1: Create User Keymaps Table
**File:** `migrations/YYYYMMDD_create_user_keymaps.sql`

```sql
CREATE TABLE user_keymaps (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_preset TEXT NOT NULL DEFAULT 'default',    -- 'default' | 'premiere' | 'resolve' | 'avid'
    custom_bindings_json JSONB NOT NULL DEFAULT '{}',  -- User overrides on top of preset
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_keymaps_user_id ON user_keymaps(user_id);
CREATE INDEX idx_user_keymaps_user_id ON user_keymaps(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_keymaps
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_keymaps` stores active preset name and custom binding overrides as JSONB
- [ ] One row per user (unique constraint on user_id)
- [ ] `updated_at` trigger applied

### Task 1.2: Keymap Model & Repository
**File:** `src/models/keymap.rs`, `src/repositories/keymap_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserKeymap {
    pub id: DbId,
    pub user_id: DbId,
    pub active_preset: String,
    pub custom_bindings_json: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] `UserKeymap` model with `DbId` fields
- [ ] Repository: `get_keymap`, `upsert_keymap`
- [ ] Unit tests for repository operations

### Task 1.3: Keymap API Endpoints
**File:** `src/routes/keymap.rs`

```rust
pub fn keymap_routes() -> Router<AppState> {
    Router::new()
        .route("/user/keymap", get(get_keymap).put(update_keymap))
        .route("/keymaps/presets", get(list_presets))
        .route("/keymaps/export", post(export_keymap))
        .route("/keymaps/import", post(import_keymap))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/keymap` returns active preset and custom bindings
- [ ] `PUT /user/keymap` updates active preset or custom bindings
- [ ] `GET /keymaps/presets` returns list of available preset names
- [ ] `POST /keymaps/export` returns full resolved keymap as JSON download
- [ ] `POST /keymaps/import` applies imported keymap JSON

---

## Phase 2: Centralized Shortcut Registry

### Task 2.1: Shortcut Registry Core
**File:** `frontend/src/features/shortcuts/ShortcutRegistry.ts`

```typescript
interface ShortcutBinding {
  id: string;              // Unique action ID (e.g., 'playback.playPause')
  key: string;             // Key combo (e.g., 'Space', 'Ctrl+Z', 'Shift+Enter')
  label: string;           // Human-readable label
  category: string;        // 'navigation' | 'playback' | 'review' | 'generation' | 'general'
  context?: string;        // Panel context (e.g., 'review-panel', 'library-panel') or global
  action: () => void;
}

class ShortcutRegistry {
  private bindings = new Map<string, ShortcutBinding>();
  private activePreset: string = 'default';
  private customOverrides = new Map<string, string>(); // actionId → key

  register(binding: ShortcutBinding): void;
  unregister(id: string): void;
  setPreset(preset: string): void;
  setCustomBinding(actionId: string, key: string): void;
  getResolvedBinding(actionId: string): string;  // Preset + overrides
  getShortcutForKey(key: string, context?: string): ShortcutBinding | null;
  getAllBindings(context?: string): ShortcutBinding[];
}

export const shortcutRegistry = new ShortcutRegistry();
```

**Acceptance Criteria:**
- [ ] Single source of truth for all keyboard shortcuts
- [ ] Every shortcut-enabled action registers through the central registry
- [ ] No scattered `addEventListener` calls anywhere in the codebase
- [ ] Registry resolves active preset + custom overrides for each action

### Task 2.2: Global Keyboard Event Handler
**File:** `frontend/src/features/shortcuts/useShortcutHandler.ts`

```typescript
export function useShortcutHandler() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = normalizeKeyCombo(event);
      const context = getActiveContext(); // Which panel is focused
      const binding = shortcutRegistry.getShortcutForKey(key, context);
      if (binding) {
        event.preventDefault();
        binding.action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

**Acceptance Criteria:**
- [ ] Single global keydown listener routes to the registry
- [ ] Event prevention for matched shortcuts (no browser default actions)
- [ ] Context determined by currently focused panel

---

## Phase 3: Preset Profiles

### Task 3.1: Default Preset
**File:** `frontend/src/features/shortcuts/presets/default.ts`

```typescript
export const defaultPreset: Record<string, string> = {
  'playback.playPause': 'Space',
  'playback.frameForward': 'ArrowRight',
  'playback.frameBackward': 'ArrowLeft',
  'playback.speedUp': 'Shift+ArrowRight',
  'review.approve': 'Enter',
  'review.reject': 'Backspace',
  'review.flag': 'f',
  'general.undo': 'Ctrl+z',
  'general.redo': 'Ctrl+Shift+z',
  'general.commandPalette': 'Ctrl+k',
  'general.cheatSheet': '?',
  'general.focusMode': 'Ctrl+Shift+f',
  // ... comprehensive mapping
};
```

**Acceptance Criteria:**
- [ ] Default preset: platform-native shortcuts optimized for Trulience workflow
- [ ] Covers all registered shortcut actions

### Task 3.2: Industry Presets (Premiere, Resolve, Avid)
**File:** `frontend/src/features/shortcuts/presets/premiere.ts`, `resolve.ts`, `avid.ts`

**Acceptance Criteria:**
- [ ] Premiere preset: familiar to Adobe Premiere Pro editors
- [ ] Resolve preset: familiar to DaVinci Resolve colorists
- [ ] Avid preset: familiar to Avid Media Composer editors
- [ ] Each preset maps transport controls (J/K/L), mark in/out, and common editing keys

---

## Phase 4: Custom Keymaps

### Task 4.1: Keymap Customization UI
**File:** `frontend/src/features/shortcuts/KeymapEditor.tsx`

**Acceptance Criteria:**
- [ ] List all shortcuts grouped by category
- [ ] Click a shortcut to rebind: "Press new key combo" capture dialog
- [ ] Custom bindings override the active preset
- [ ] Conflict detection: warn when new binding conflicts with existing one
- [ ] Options on conflict: override, cancel, or rebind the conflicting shortcut
- [ ] "Reset to preset default" per shortcut and global reset

### Task 4.2: Export/Import Keymaps
**File:** `frontend/src/features/shortcuts/keymapExportImport.ts`

**Acceptance Criteria:**
- [ ] Export current resolved keymap as JSON file download
- [ ] Import keymap JSON to apply as custom bindings
- [ ] Validation on import: reject invalid key combos, warn about missing actions
- [ ] Team sharing workflow: export → share file → team members import

---

## Phase 5: Context-Aware Shortcuts

### Task 5.1: Context Detection
**File:** `frontend/src/features/shortcuts/useActiveContext.ts`

```typescript
export function useActiveContext(): string | null {
  // Determine which panel/view is currently focused
  // Based on DOM focus or active panel from PRD-030 panel system
  return 'review-panel' | 'library-panel' | 'workflow-panel' | null;
}
```

**Acceptance Criteria:**
- [ ] Context determined by currently focused panel (from PRD-030)
- [ ] `Space` plays video in Review panel but toggles selection in Library
- [ ] Global shortcuts (Cmd+K, Cmd+Z) work regardless of context
- [ ] Context-specific shortcuts only fire when their panel is focused

---

## Phase 6: Cheat Sheet & One-Handed Review

### Task 6.1: Cheat Sheet Overlay
**File:** `frontend/src/features/shortcuts/CheatSheet.tsx`

**Acceptance Criteria:**
- [ ] Press `?` to see all available shortcuts for the current context
- [ ] Shortcuts grouped by category (navigation, playback, review, generation, etc.)
- [ ] Customized bindings highlighted to distinguish from defaults
- [ ] Translucent overlay that doesn't fully obscure the workspace
- [ ] Escape to dismiss

### Task 6.2: One-Handed Review Mode
**File:** `frontend/src/features/shortcuts/oneHandedReview.ts`

```typescript
const ONE_HANDED_REVIEW: Record<string, string> = {
  'review.approve': '1',
  'review.reject': '2',
  'review.flag': '3',
  'playback.rewind': 'j',
  'playback.pause': 'k',
  'playback.forward': 'l',
};
```

**Acceptance Criteria:**
- [ ] `1` = Approve, `2` = Reject, `3` = Flag
- [ ] `J/K/L` = shuttle controls (rewind/pause/forward)
- [ ] Optimized for one hand on keyboard, other on mouse/jog dial
- [ ] Activatable as a review mode toggle

---

## Phase 7: Persistence & Testing

### Task 7.1: Keymap Persistence Hook
**File:** `frontend/src/features/shortcuts/useKeymapPersistence.ts`

**Acceptance Criteria:**
- [ ] On login, fetch user keymap from API and apply preset + custom bindings
- [ ] On preset change, persist to API
- [ ] On custom binding change, persist to API
- [ ] Preset switching applies new keymap instantly (<100ms)

### Task 7.2: Comprehensive Tests
**File:** `frontend/src/features/shortcuts/__tests__/`

**Acceptance Criteria:**
- [ ] Registry correctly resolves preset + custom overrides
- [ ] Context-aware shortcuts fire in correct panel
- [ ] Conflict detection identifies overlapping bindings
- [ ] Export → import round-trip produces identical keymap
- [ ] Cheat sheet accurately reflects current active bindings
- [ ] One-handed review mode maps keys correctly
- [ ] Preset switching applies instantly

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_user_keymaps.sql` | Keymap persistence table |
| `src/models/keymap.rs` | Rust model struct |
| `src/repositories/keymap_repo.rs` | Keymap repository |
| `src/routes/keymap.rs` | Axum API endpoints |
| `frontend/src/features/shortcuts/ShortcutRegistry.ts` | Core registry |
| `frontend/src/features/shortcuts/useShortcutHandler.ts` | Global keyboard event handler |
| `frontend/src/features/shortcuts/presets/` | Preset profile definitions |
| `frontend/src/features/shortcuts/KeymapEditor.tsx` | Customization UI |
| `frontend/src/features/shortcuts/CheatSheet.tsx` | Shortcut overlay |

## Dependencies
- PRD-029: Design system components (for overlay/editor UI)
- PRD-030: Panel system (for context detection based on focused panel)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — keymap persistence
2. Phase 2 (Registry) — centralized shortcut registry and global handler
3. Phase 3 (Presets) — Default, Premiere, Resolve, Avid presets
4. Phase 4 (Custom Keymaps) — rebinding UI, export/import
5. Phase 5 (Context) — context-aware shortcut resolution
6. Phase 6 (Cheat Sheet & Review Mode) — discoverability and one-handed review

### Post-MVP Enhancements
- Shortcut recording: record macro sequences from keyboard actions and assign shortcut

## Notes
- This is infrastructure depended on by many PRDs (PRD-031, PRD-055, etc.). Every shortcut across the platform must register here.
- Preset selection should be prompted during onboarding (PRD-053).
- No multi-key chord shortcuts in MVP (e.g., Ctrl+K then Ctrl+S) — single combo only.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
