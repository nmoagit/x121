# Task List: Progressive Disclosure & UX Intelligence

**PRD Reference:** `design/prds/032-prd-progressive-disclosure-ux-intelligence.md`
**Scope:** Implement progressive disclosure patterns including Power Knobs/Advanced Drawers, Focus Mode, contextual parameter visibility, and user proficiency tracking to prevent information overload while maintaining deep control for experts.

## Overview

A platform with 106 PRDs risks overwhelming users with controls. This PRD provides progressive disclosure patterns that surface essential controls by default while keeping advanced functionality accessible through expandable drawers. Focus Mode minimizes distractions during specific tasks, contextual visibility hides irrelevant parameters, and proficiency tracking gradually reveals features as users gain experience. The system ensures beginners are not overwhelmed while experts have full access.

### What Already Exists
- PRD-029 design system (visual hierarchy tokens)
- PRD-004 session persistence
- PRD-000 database infrastructure

### What We're Building
1. Power Knobs / Advanced Drawer component pattern
2. Focus Mode controller (Review Focus, Generation Focus)
3. Contextual parameter visibility engine
4. User proficiency tracking system (beginner/intermediate/expert)
5. Backend API for proficiency and focus mode preferences

### Key Design Decisions
1. **Two-tier parameter exposure** — "Power Knobs" are always visible; advanced parameters live in collapsible drawers. Drawer state persists per user per view.
2. **Focus Mode is view-scoped** — Review Focus shows only player + approval; Generation Focus shows only canvas + parameters. Not a global setting.
3. **Proficiency is non-judgmental** — No visible "beginner" labels. The system quietly tracks usage and adjusts feature visibility.
4. **Parameters hidden, not disabled** — Irrelevant parameters are hidden (not grayed out) to reduce visual noise.

---

## Phase 1: Database & API for Proficiency & Preferences

### Task 1.1: Create User Proficiency Table
**File:** `migrations/YYYYMMDD_create_user_proficiency.sql`

```sql
CREATE TABLE user_proficiency (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_area TEXT NOT NULL,         -- 'generation' | 'review' | 'library' | 'workflow' | etc.
    proficiency_level TEXT NOT NULL DEFAULT 'beginner',  -- 'beginner' | 'intermediate' | 'expert'
    usage_count INTEGER NOT NULL DEFAULT 0,
    manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_proficiency_user_id ON user_proficiency(user_id);
CREATE UNIQUE INDEX uq_user_proficiency_user_area ON user_proficiency(user_id, feature_area);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_proficiency
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Focus mode preferences
CREATE TABLE user_focus_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    focus_mode TEXT,                    -- 'review' | 'generation' | NULL (off)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_focus_preferences_user_id ON user_focus_preferences(user_id);
CREATE INDEX idx_user_focus_preferences_user_id ON user_focus_preferences(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_focus_preferences
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_proficiency` tracks per-user, per-feature-area proficiency levels
- [ ] Unique constraint on (user_id, feature_area)
- [ ] `manual_override` flag for user overrides
- [ ] `user_focus_preferences` stores current focus mode
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Proficiency Models & Repository
**File:** `src/models/proficiency.rs`, `src/repositories/proficiency_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserProficiency {
    pub id: DbId,
    pub user_id: DbId,
    pub feature_area: String,
    pub proficiency_level: String,
    pub usage_count: i32,
    pub manual_override: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl ProficiencyRepo {
    /// Increment usage count and auto-upgrade proficiency level based on thresholds
    pub async fn record_feature_usage(&self, user_id: DbId, feature_area: &str) -> Result<()>;

    /// Manual override by user
    pub async fn set_proficiency(&self, user_id: DbId, feature_area: &str, level: &str) -> Result<()>;
}
```

**Acceptance Criteria:**
- [ ] `record_feature_usage` increments count and auto-promotes level at thresholds
- [ ] Thresholds: beginner → intermediate at 20 uses, intermediate → expert at 100 uses
- [ ] Manual override prevents auto-promotion (user chose their level)
- [ ] Unit tests for threshold-based promotion logic

### Task 1.3: Proficiency & Focus Mode API
**File:** `src/routes/proficiency.rs`

```rust
pub fn proficiency_routes() -> Router<AppState> {
    Router::new()
        .route("/user/proficiency", get(get_proficiency).put(set_proficiency))
        .route("/user/focus-mode-preferences", get(get_focus).put(set_focus))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/proficiency` returns all feature area proficiency levels
- [ ] `PUT /user/proficiency` allows manual override of proficiency level
- [ ] `GET/PUT /user/focus-mode-preferences` for focus mode state

---

## Phase 2: Power Knobs & Advanced Drawers

### Task 2.1: AdvancedDrawer Component
**File:** `frontend/src/design-system/components/composites/AdvancedDrawer.tsx`

Reusable collapsible drawer for advanced parameters.

```typescript
interface AdvancedDrawerProps {
  label?: string;           // Default: "Advanced"
  defaultOpen?: boolean;
  persistKey?: string;      // Unique key for persisting drawer state per view
  children: React.ReactNode;
}

export const AdvancedDrawer: React.FC<AdvancedDrawerProps> = ({
  label = 'Advanced',
  defaultOpen = false,
  persistKey,
  children,
}) => {
  // Collapsible drawer with visual distinction from essential controls
  // State persists per user per view via PRD-004
};
```

**Acceptance Criteria:**
- [ ] Collapsible drawer with animated expand/collapse
- [ ] Visual distinction: muted colors, smaller text for secondary importance
- [ ] Drawer state persists per user per view (via session persistence)
- [ ] "Advanced" label with chevron toggle

### Task 2.2: Parameter Configuration Schema
**File:** `frontend/src/features/progressive-disclosure/parameterSchema.ts`

Define which parameters are "essential" vs. "advanced" for each view.

```typescript
interface ParameterConfig {
  key: string;
  label: string;
  tier: 'essential' | 'advanced';
  tooltip: string;
  dependsOn?: string[];    // Other parameter keys this depends on
  visibleWhen?: (context: Record<string, unknown>) => boolean;
}
```

**Acceptance Criteria:**
- [ ] Each configuration screen has a defined parameter schema
- [ ] Essential parameters marked as "Power Knobs" — always visible
- [ ] Advanced parameters grouped in drawers
- [ ] Default views show <8 essential parameters

---

## Phase 3: Focus Mode

### Task 3.1: Focus Mode Controller
**File:** `frontend/src/features/progressive-disclosure/FocusModeController.tsx`

```typescript
type FocusMode = 'review' | 'generation' | null;

export const useFocusMode = () => {
  const [focusMode, setFocusMode] = useState<FocusMode>(null);

  const enterFocus = (mode: FocusMode) => {
    setFocusMode(mode);
    // Hide all panels except the primary task panel
  };

  const exitFocus = () => {
    setFocusMode(null);
    // Restore previous panel layout
  };

  return { focusMode, enterFocus, exitFocus };
};
```

**Acceptance Criteria:**
- [ ] Single-click activation hides all panels except primary task panel
- [ ] Review Focus: video player + approval controls only
- [ ] Generation Focus: workflow canvas + generation parameters only
- [ ] Keyboard shortcut to toggle (registered with PRD-052)
- [ ] Focus Mode activates/deactivates in <200ms
- [ ] Clear "Exit Focus" affordance visible in focus mode

### Task 3.2: Focus Mode Visual Transition
**File:** `frontend/src/features/progressive-disclosure/FocusModeTransition.tsx`

**Acceptance Criteria:**
- [ ] Animated transition when entering/exiting focus mode
- [ ] Non-active panels slide out or fade (using design system animation tokens)
- [ ] Reversible — previous layout restored on exit

---

## Phase 4: Contextual Parameter Visibility

### Task 4.1: Parameter Visibility Engine
**File:** `frontend/src/features/progressive-disclosure/useParameterVisibility.ts`

```typescript
export function useParameterVisibility(
  params: ParameterConfig[],
  context: Record<string, unknown>
): ParameterConfig[] {
  return params.filter(param => {
    if (param.visibleWhen && !param.visibleWhen(context)) return false;
    return true;
  });
}
```

**Acceptance Criteria:**
- [ ] Parameters that don't apply to current configuration are hidden (not disabled)
- [ ] Dependencies between parameters: changing one reveals/hides related options
- [ ] Tooltip explanations for each parameter (what it does, when to change it)

---

## Phase 5: User Proficiency Tracking

### Task 5.1: Proficiency Tracker Hook
**File:** `frontend/src/features/progressive-disclosure/useProficiencyTracker.ts`

```typescript
export function useProficiencyTracker(featureArea: string) {
  const recordUsage = useCallback(() => {
    // POST to /user/proficiency/record-usage
    // Debounced to avoid excessive API calls
  }, [featureArea]);

  const proficiency = useProficiencyLevel(featureArea);
  // 'beginner' | 'intermediate' | 'expert'

  return { proficiency, recordUsage };
}
```

**Acceptance Criteria:**
- [ ] Track feature usage to determine proficiency level
- [ ] Beginner: minimal controls, prominent help links
- [ ] Intermediate: more controls visible, help links normal
- [ ] Expert: all controls visible by default, help links subdued
- [ ] User can manually override proficiency level in settings

### Task 5.2: Proficiency-Aware Component Wrapper
**File:** `frontend/src/features/progressive-disclosure/ProficiencyGate.tsx`

```typescript
interface ProficiencyGateProps {
  minLevel: 'beginner' | 'intermediate' | 'expert';
  featureArea: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
```

**Acceptance Criteria:**
- [ ] Component shows/hides content based on user proficiency level
- [ ] Not hidden entirely — accessible if explicitly sought (via Advanced drawer)
- [ ] Proficiency indicators are non-judgmental (no "beginner" labels visible)

---

## Phase 6: Integration & Testing

### Task 6.1: Integration with Feature Modules
**File:** integration across feature PRDs

**Acceptance Criteria:**
- [ ] Generation parameter screens use Power Knobs / Advanced Drawer pattern
- [ ] Review interface supports Focus Mode
- [ ] All parameter-heavy views implement contextual visibility
- [ ] Proficiency tracking integrated into main workflow paths

### Task 6.2: Comprehensive Tests
**File:** `frontend/src/features/progressive-disclosure/__tests__/`

**Acceptance Criteria:**
- [ ] Drawer state persistence across page reloads
- [ ] Focus mode hides correct panels for each mode
- [ ] Parameter visibility engine correctly applies context rules
- [ ] Proficiency auto-promotion at correct thresholds
- [ ] Manual override prevents auto-promotion
- [ ] New users complete first task without accessing Advanced drawer

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_user_proficiency.sql` | Proficiency and focus mode tables |
| `src/models/proficiency.rs` | Rust model structs |
| `src/repositories/proficiency_repo.rs` | Proficiency CRUD repository |
| `src/routes/proficiency.rs` | Axum API endpoints |
| `frontend/src/design-system/components/composites/AdvancedDrawer.tsx` | Reusable drawer component |
| `frontend/src/features/progressive-disclosure/FocusModeController.tsx` | Focus mode logic |
| `frontend/src/features/progressive-disclosure/useParameterVisibility.ts` | Parameter visibility engine |
| `frontend/src/features/progressive-disclosure/useProficiencyTracker.ts` | Proficiency tracking hook |

## Dependencies
- PRD-029: Design system (visual hierarchy tokens, animation tokens)
- PRD-004: Session persistence (drawer state, focus mode state)
- PRD-052: Keyboard shortcuts (Focus Mode toggle)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — proficiency and focus mode persistence
2. Phase 2 (Drawers) — Power Knobs and Advanced Drawer pattern
3. Phase 3 (Focus Mode) — distraction-free task modes
4. Phase 4 (Contextual Visibility) — parameter visibility engine
5. Phase 5 (Proficiency) — usage tracking and gradual reveal

### Post-MVP Enhancements
- Non-linear history: branching parameter history tree for exploring variations

## Notes
- Progressive disclosure is a pattern, not a component — it must be adopted by every feature PRD.
- The AdvancedDrawer component is added to the PRD-029 design system for reuse.
- Proficiency thresholds (20 uses → intermediate, 100 → expert) should be configurable.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
