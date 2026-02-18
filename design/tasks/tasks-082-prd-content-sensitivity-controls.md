# Task List: Content Sensitivity Controls

**PRD Reference:** `design/prds/082-prd-content-sensitivity-controls.md`
**Scope:** Implement configurable content visibility controls including thumbnail blur levels, per-view overrides, preview watermarking, one-click Screen-Share Mode, and admin-enforced minimum sensitivity levels.

## Overview

The platform handles content that may not be appropriate for all viewing contexts (office environments, screen shares, client demos). This PRD provides configurable sensitivity controls: four blur levels (Full, Soft, Heavy, Placeholder), per-view overrides (blur in library but full in Review), preview watermarking, and a one-click Screen-Share Mode that instantly makes the entire UI safe for sharing. Admins can enforce studio-wide minimum sensitivity levels that users cannot decrease below.

### What Already Exists
- PRD-029 design system (visual consistency, CSS filters)
- PRD-052 keyboard shortcut registry (Screen-Share Mode hotkey)
- PRD-004 session persistence
- PRD-000 database infrastructure

### What We're Building
1. Thumbnail blur system with four configurable levels
2. Per-view override system for context-appropriate visibility
3. Preview watermark compositor (overlay during playback, not burned into files)
4. Screen-Share Mode — one-click platform-wide safety mode
5. Admin minimum sensitivity enforcement
6. Database tables and API endpoints for sensitivity settings

### Key Design Decisions
1. **CSS filter blur** — Blur applied via CSS `filter: blur()` on image/video elements. Zero performance impact on library browsing.
2. **Non-destructive watermark** — Watermark is a compositing overlay during playback. Does not affect source files.
3. **Screen-Share Mode toggles max blur globally** — One shortcut to activate, one to deactivate and restore previous settings.
4. **Admin floor, not ceiling** — Users can increase sensitivity above the admin minimum but never decrease below it.

---

## Phase 1: Database & API for Sensitivity Settings

### Task 1.1: Create Sensitivity Settings Tables
**File:** `migrations/YYYYMMDD_create_sensitivity_settings.sql`

```sql
-- User sensitivity preferences
CREATE TABLE user_sensitivity_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    global_level TEXT NOT NULL DEFAULT 'full',   -- 'full' | 'soft_blur' | 'heavy_blur' | 'placeholder'
    view_overrides_json JSONB NOT NULL DEFAULT '{}',  -- { "review": "full", "library": "heavy_blur" }
    watermark_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    watermark_text TEXT,
    watermark_position TEXT NOT NULL DEFAULT 'center',  -- 'center' | 'corner'
    watermark_opacity REAL NOT NULL DEFAULT 0.3,
    screen_share_mode BOOLEAN NOT NULL DEFAULT FALSE,
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_sensitivity_user_id ON user_sensitivity_settings(user_id);
CREATE INDEX idx_user_sensitivity_user_id ON user_sensitivity_settings(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_sensitivity_settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Studio-wide minimum sensitivity
CREATE TABLE studio_sensitivity_config (
    id BIGSERIAL PRIMARY KEY,
    min_level TEXT NOT NULL DEFAULT 'full',    -- 'full' | 'soft_blur' | 'heavy_blur' | 'placeholder'
    updated_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_studio_sensitivity_updated_by ON studio_sensitivity_config(updated_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON studio_sensitivity_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_sensitivity_settings` stores per-user blur level, view overrides, watermark config
- [ ] `studio_sensitivity_config` stores admin-defined minimum level
- [ ] All FK columns indexed, `updated_at` triggers applied

### Task 1.2: Sensitivity Models & Repository
**File:** `src/models/sensitivity.rs`, `src/repositories/sensitivity_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserSensitivitySettings {
    pub id: DbId,
    pub user_id: DbId,
    pub global_level: String,
    pub view_overrides_json: serde_json::Value,
    pub watermark_enabled: bool,
    pub watermark_text: Option<String>,
    pub watermark_position: String,
    pub watermark_opacity: f32,
    pub screen_share_mode: bool,
    pub sound_enabled: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model structs for user and studio sensitivity settings
- [ ] Repository with get/upsert for user settings
- [ ] Repository enforces admin minimum: user cannot set a level lower than studio minimum
- [ ] Unit tests for minimum enforcement logic

### Task 1.3: Sensitivity API Endpoints
**File:** `src/routes/sensitivity.rs`

```rust
pub fn sensitivity_routes() -> Router<AppState> {
    Router::new()
        .route("/user/sensitivity", get(get_settings).put(update_settings))
        .route("/admin/sensitivity-defaults", get(get_defaults).put(update_defaults))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/sensitivity` returns current sensitivity settings
- [ ] `PUT /user/sensitivity` updates settings (enforcing admin minimum)
- [ ] `GET/PUT /admin/sensitivity-defaults` for studio-wide minimum (admin-only)

---

## Phase 2: Thumbnail Blur System

### Task 2.1: Blur Level Provider
**File:** `frontend/src/features/sensitivity/SensitivityProvider.tsx`

```typescript
type BlurLevel = 'full' | 'soft_blur' | 'heavy_blur' | 'placeholder';

interface SensitivityContextValue {
  globalLevel: BlurLevel;
  getViewLevel: (viewName: string) => BlurLevel;
  screenShareMode: boolean;
  setGlobalLevel: (level: BlurLevel) => void;
  setViewOverride: (viewName: string, level: BlurLevel) => void;
  toggleScreenShareMode: () => void;
}
```

**Acceptance Criteria:**
- [ ] React context provides sensitivity state to all components
- [ ] Resolves effective blur level: Screen-Share Mode > view override > global level
- [ ] Admin minimum enforced on the client side (cannot select below floor)

### Task 2.2: Blur Renderer Component
**File:** `frontend/src/features/sensitivity/BlurredMedia.tsx`

```typescript
interface BlurredMediaProps {
  src: string;
  type: 'image' | 'video';
  viewContext: string;   // Which view this media is in
  children?: React.ReactNode;
}

const BLUR_CSS: Record<BlurLevel, string> = {
  full: 'none',
  soft_blur: 'blur(8px)',
  heavy_blur: 'blur(24px)',
  placeholder: 'none',  // Replace with placeholder icon
};
```

**Acceptance Criteria:**
- [ ] Four levels: Full (unblurred), Soft Blur, Heavy Blur, Placeholder Icon
- [ ] Applies to all image and video thumbnails platform-wide
- [ ] Setting persists per user via API
- [ ] Blur levels visually distinct and immediately identifiable
- [ ] No perceptible lag during library/dashboard browsing

---

## Phase 3: Per-View Overrides

### Task 3.1: View Override Manager
**File:** `frontend/src/features/sensitivity/useViewOverride.ts`

**Acceptance Criteria:**
- [ ] Users set different blur level per view (e.g., blur in library, full in Review)
- [ ] Overrides take precedence over global setting for that view only
- [ ] Override settings persist per user per view
- [ ] Quick access from view header or settings panel

---

## Phase 4: Preview Watermarking

### Task 4.1: Watermark Compositor
**File:** `frontend/src/features/sensitivity/WatermarkOverlay.tsx`

```typescript
interface WatermarkOverlayProps {
  text: string;            // Username, timestamp, project name, or custom
  position: 'center' | 'corner';
  opacity: number;         // 0.0 to 1.0
}
```

**Acceptance Criteria:**
- [ ] Configurable watermark: username, timestamp, project name, or custom text
- [ ] Applied as a compositing layer during playback only — does not affect source files
- [ ] Distinct from PRD-039 delivery watermarking
- [ ] Configurable position (center/corner) and opacity
- [ ] Rendered via CSS/Canvas overlay, not burned into video

---

## Phase 5: Screen-Share Mode

### Task 5.1: Screen-Share Mode Controller
**File:** `frontend/src/features/sensitivity/useScreenShareMode.ts`

```typescript
export function useScreenShareMode() {
  const toggleScreenShare = () => {
    if (isActive) {
      // Deactivate: restore previous settings
    } else {
      // Activate: save current settings, apply maximum blur
    }
  };
}
```

**Acceptance Criteria:**
- [ ] Keyboard shortcut toggle (registered with PRD-052)
- [ ] Activates maximum blur/redaction across all views simultaneously
- [ ] Disables video autoplay and mutes audio
- [ ] Clear visual indicator (e.g., colored border around viewport)
- [ ] Single shortcut to deactivate and restore previous settings
- [ ] Activates/deactivates in <200ms

---

## Phase 6: Admin Defaults

### Task 6.1: Admin Sensitivity Configuration UI
**File:** `frontend/src/features/admin/SensitivityDefaults.tsx`

**Acceptance Criteria:**
- [ ] Admin UI to set studio-wide default sensitivity level
- [ ] Preview showing how each level looks
- [ ] When admin sets "Soft Blur" as minimum, users can choose "Heavy Blur" but not "Full"
- [ ] Admin-only access via RBAC

---

## Phase 7: Integration & Testing

### Task 7.1: Platform-Wide Blur Integration
**File:** integration across library, dashboard, search, review views

**Acceptance Criteria:**
- [ ] All image/video thumbnails in library views use BlurredMedia component
- [ ] Dashboard widgets use BlurredMedia for thumbnails
- [ ] Search results use BlurredMedia
- [ ] Review interface respects view override

### Task 7.2: Comprehensive Tests
**File:** `frontend/src/features/sensitivity/__tests__/`

**Acceptance Criteria:**
- [ ] Screen-Share Mode activates in <200ms
- [ ] Blur rendering adds no perceptible lag
- [ ] Zero incidents of unblurred content when blur is active
- [ ] Admin minimum correctly prevents users from lowering sensitivity
- [ ] View overrides correctly apply per-view levels
- [ ] Watermark renders correctly at all positions and opacities

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_sensitivity_settings.sql` | Sensitivity tables |
| `src/models/sensitivity.rs` | Rust model structs |
| `src/repositories/sensitivity_repo.rs` | Sensitivity repository |
| `src/routes/sensitivity.rs` | Axum API endpoints |
| `frontend/src/features/sensitivity/SensitivityProvider.tsx` | Context provider |
| `frontend/src/features/sensitivity/BlurredMedia.tsx` | Blur renderer component |
| `frontend/src/features/sensitivity/WatermarkOverlay.tsx` | Watermark compositor |
| `frontend/src/features/sensitivity/useScreenShareMode.ts` | Screen-Share Mode |
| `frontend/src/features/admin/SensitivityDefaults.tsx` | Admin configuration |

## Dependencies
- PRD-029: Design system (CSS filter styling)
- PRD-052: Keyboard shortcut registry (Screen-Share Mode hotkey)
- PRD-004: Session persistence (settings storage)
- PRD-003: RBAC (admin-only sensitivity defaults)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — settings persistence
2. Phase 2 (Blur System) — four blur levels with provider
3. Phase 3 (View Overrides) — per-view sensitivity
4. Phase 4 (Watermarking) — preview watermark overlay
5. Phase 5 (Screen-Share Mode) — one-click safety mode
6. Phase 6 (Admin Defaults) — minimum sensitivity enforcement

### Post-MVP Enhancements
- Scheduled sensitivity: time-based adjustments (Office Hours mode, After Hours mode)

## Notes
- This feature has zero tolerance for failure — if blur is set, content must never appear unblurred.
- Screen-Share Mode must be fast and reliable since it's used in high-stakes situations (live screen shares).
- Watermarking must not affect video playback performance.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
