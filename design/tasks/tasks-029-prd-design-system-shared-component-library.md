# Task List: Design System & Shared Component Library

**PRD Reference:** `design/prds/029-prd-design-system-shared-component-library.md`
**Scope:** Establish a token-driven design system with a shared component library, multi-axis theming, enforcement mechanisms, Storybook documentation, and an admin Token Editor.

## Overview

This PRD provides the foundational UI infrastructure for the entire platform. A centralized, token-driven design system ensures visual consistency across all 106 PRDs. All UI is built from a single shared component library with lint-enforced import restrictions, enabling single-line changes to platform-wide color, typography, or spacing. The theme system supports a two-axis model (Dark/Light x Obsidian/Neon/Custom) with runtime switching via CSS custom properties.

### What Already Exists
- Nothing — this is foundational UI infrastructure (PRD-029 depends on no other PRDs)
- Backend database and migration infrastructure from PRD-000

### What We're Building
1. Design token system (color, typography, spacing, icons, animation) as CSS custom properties
2. Shared component library (primitives, composites, layout, domain components)
3. Multi-axis theme system with runtime switching
4. Storybook catalog documenting all components
5. ESLint/Stylelint enforcement rules
6. Admin Token Editor UI
7. Database table and API endpoints for theme configuration persistence

### Key Design Decisions
1. **CSS Custom Properties for theming** — Token values are CSS custom properties on `:root`, enabling runtime theme switching without page reload or re-render.
2. **Semantic token naming** — Tokens use semantic names (`surface-primary`, `action-danger`) not raw values. Feature code never contains hex/rgb literals.
3. **Single barrel export** — All shared components exported from `@/components`. Lint rules prevent importing internal implementation files.
4. **4px base unit** — All spacing derives from a 4px base scale for consistent rhythm.

---

## Phase 1: Design Token Architecture

### Task 1.1: Create Theme Configuration Database Table
**File:** `migrations/YYYYMMDD_create_theme_configurations.sql`

Create the database table for persisting user theme preferences and admin custom themes.

```sql
-- Theme configuration statuses
CREATE TABLE theme_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON theme_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO theme_statuses (name, description) VALUES
    ('active', 'Theme is active and available'),
    ('draft', 'Theme is being edited'),
    ('archived', 'Theme is no longer available');

-- User theme preferences
CREATE TABLE user_theme_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    color_scheme TEXT NOT NULL DEFAULT 'dark',       -- 'dark' | 'light'
    brand_palette TEXT NOT NULL DEFAULT 'obsidian',   -- 'obsidian' | 'neon' | custom name
    high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_user_theme_preferences_user_id ON user_theme_preferences(user_id);
CREATE INDEX idx_user_theme_preferences_user_id ON user_theme_preferences(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_theme_preferences
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Admin-created custom themes
CREATE TABLE custom_themes (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    status_id BIGINT NOT NULL REFERENCES theme_statuses(id) ON DELETE RESTRICT,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tokens_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_custom_themes_status_id ON custom_themes(status_id);
CREATE INDEX idx_custom_themes_created_by ON custom_themes(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON custom_themes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `theme_statuses` lookup table created with seed data
- [ ] `user_theme_preferences` table stores per-user color scheme and brand palette
- [ ] `custom_themes` table stores admin-created custom token sets as JSONB
- [ ] All FK columns have indexes
- [ ] All tables have `updated_at` triggers
- [ ] Migration applies cleanly via `sqlx migrate run`

### Task 1.2: Theme Configuration Backend Models & Repository
**File:** `src/models/theme.rs`, `src/repositories/theme_repo.rs`

Create Rust structs and repository for theme configuration CRUD.

```rust
// src/models/theme.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::types::DbId;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserThemePreference {
    pub id: DbId,
    pub user_id: DbId,
    pub color_scheme: String,
    pub brand_palette: String,
    pub high_contrast: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateThemePreference {
    pub color_scheme: Option<String>,
    pub brand_palette: Option<String>,
    pub high_contrast: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CustomTheme {
    pub id: DbId,
    pub name: String,
    pub status_id: DbId,
    pub created_by: DbId,
    pub tokens_json: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] `UserThemePreference` and `CustomTheme` model structs with `DbId` fields
- [ ] Repository with `get_user_preference`, `upsert_user_preference`, CRUD for `CustomTheme`
- [ ] All queries use parameterized SQLx statements
- [ ] Unit tests for repository operations

### Task 1.3: Theme API Endpoints
**File:** `src/routes/theme.rs`

Create Axum route handlers for theme preference and admin theme management.

```rust
// Route registration
pub fn theme_routes() -> Router<AppState> {
    Router::new()
        .route("/user/theme", get(get_user_theme).put(update_user_theme))
        .route("/admin/themes", get(list_themes).post(create_theme))
        .route("/admin/themes/:id", get(get_theme).put(update_theme).delete(delete_theme))
        .route("/admin/themes/:id/export", get(export_theme))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/theme` returns current user's theme preference
- [ ] `PUT /user/theme` updates color scheme, brand palette, or high contrast
- [ ] `GET/POST/PUT/DELETE /admin/themes` for custom theme CRUD (admin-only)
- [ ] `GET /admin/themes/:id/export` returns token set as JSON or CSS custom properties
- [ ] All endpoints use RBAC middleware for authorization

---

## Phase 2: Color, Typography & Spacing Tokens

### Task 2.1: Color Token Definitions
**File:** `frontend/src/design-system/tokens/colors.ts`

Define semantic color tokens for all theme combinations.

```typescript
// Semantic color tokens — map to CSS custom properties
export const colorTokens = {
  // Surface colors
  'surface-primary': '--ds-surface-primary',
  'surface-secondary': '--ds-surface-secondary',
  'surface-tertiary': '--ds-surface-tertiary',
  'surface-overlay': '--ds-surface-overlay',

  // Text colors
  'text-primary': '--ds-text-primary',
  'text-secondary': '--ds-text-secondary',
  'text-muted': '--ds-text-muted',
  'text-inverse': '--ds-text-inverse',

  // Action colors
  'action-primary': '--ds-action-primary',
  'action-primary-hover': '--ds-action-primary-hover',
  'action-danger': '--ds-action-danger',
  'action-success': '--ds-action-success',
  'action-warning': '--ds-action-warning',

  // Border colors
  'border-default': '--ds-border-default',
  'border-focus': '--ds-border-focus',
} as const;
```

**Acceptance Criteria:**
- [ ] Semantic color names cover surfaces, text, actions, borders, and states
- [ ] No raw hex/rgb values — all tokens resolve through CSS custom properties
- [ ] Dark/Light scheme definitions for Obsidian and Neon palettes
- [ ] High Contrast variant definitions meeting WCAG AAA thresholds

### Task 2.2: Typography Token Definitions
**File:** `frontend/src/design-system/tokens/typography.ts`

Define font family, size scale, weight, line-height, and letter-spacing tokens.

```typescript
export const typographyScale = {
  'text-xs': { fontSize: '0.75rem', lineHeight: '1rem' },       // 12px
  'text-sm': { fontSize: '0.875rem', lineHeight: '1.25rem' },   // 14px
  'text-base': { fontSize: '1rem', lineHeight: '1.5rem' },      // 16px
  'text-lg': { fontSize: '1.125rem', lineHeight: '1.75rem' },   // 18px
  'text-xl': { fontSize: '1.25rem', lineHeight: '1.75rem' },    // 20px
  'text-2xl': { fontSize: '1.5rem', lineHeight: '2rem' },       // 24px
  'text-3xl': { fontSize: '2rem', lineHeight: '2.5rem' },       // 32px
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
```

**Acceptance Criteria:**
- [ ] Font size scale from `text-xs` (12px) through `text-3xl` (32px) in named steps
- [ ] Font weight, line-height, and letter-spacing tokens defined
- [ ] Font family tokens support primary and monospace families

### Task 2.3: Spacing, Layout & Animation Tokens
**File:** `frontend/src/design-system/tokens/spacing.ts`, `frontend/src/design-system/tokens/animation.ts`

Define spacing scale, border radii, shadows, breakpoints, and animation presets.

```typescript
// 4px base unit spacing scale
export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
} as const;

export const durations = {
  instant: '50ms',
  fast: '150ms',
  normal: '250ms',
  slow: '400ms',
} as const;

export const easings = {
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;
```

**Acceptance Criteria:**
- [ ] Spacing scale uses 4px base unit
- [ ] Border radius tokens (sm, md, lg, full)
- [ ] Shadow elevation tokens (sm, md, lg)
- [ ] Responsive breakpoints (sm, md, lg, xl)
- [ ] Animation duration and easing curve presets

### Task 2.4: Icon Token Registry
**File:** `frontend/src/design-system/tokens/icons.ts`

Centralized icon registry — all icons imported from a single source.

**Acceptance Criteria:**
- [ ] Single-file icon registry exporting all platform icons
- [ ] Adding or swapping an icon requires editing only this file
- [ ] Icon sizing tokens (sm: 16px, md: 20px, lg: 24px, xl: 32px)

---

## Phase 3: Shared Component Library

### Task 3.1: Primitive Components
**File:** `frontend/src/design-system/components/primitives/`

Build the primitive component set: Button, Input, Select, Checkbox, Toggle, Badge, Tooltip, Avatar.

```typescript
// Example: Button component with token-driven styling
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ variant, size, ...props }) => {
  // Uses design tokens for all visual properties
  // No inline styles, no raw color values
};
```

**Acceptance Criteria:**
- [ ] Button: primary/secondary/danger/ghost variants, sm/md/lg sizes, loading state
- [ ] Input: text/password/number types, error state, helper text
- [ ] Select: single/multi, searchable option
- [ ] Checkbox, Toggle, Badge, Tooltip, Avatar components
- [ ] All components use design tokens exclusively — zero raw CSS values
- [ ] All components have TypeScript prop types

### Task 3.2: Composite Components
**File:** `frontend/src/design-system/components/composites/`

Build composite components from primitives: Card, Modal, Drawer, Dropdown, Table, Tabs, Accordion, Toast.

**Acceptance Criteria:**
- [ ] Card: header, body, footer slots with elevation variants
- [ ] Modal: overlay, close button, sizes, focus trap
- [ ] Drawer: left/right/bottom position, push or overlay mode
- [ ] Dropdown: trigger, menu items, keyboard navigation
- [ ] Table: sortable columns, row selection, pagination
- [ ] Tabs, Accordion, Toast components
- [ ] All composites built from primitive components only

### Task 3.3: Layout Components
**File:** `frontend/src/design-system/components/layout/`

Build layout components: Stack, Grid, Divider, Spacer, Panel, Sidebar.

**Acceptance Criteria:**
- [ ] Stack: vertical/horizontal, configurable gap using spacing tokens
- [ ] Grid: responsive column system with breakpoint support
- [ ] Divider: horizontal/vertical, label option
- [ ] Spacer: fixed or flexible space using spacing tokens
- [ ] Panel, Sidebar: foundation for PRD-030 layout system
- [ ] All layout components encapsulate spacing and responsive behavior

### Task 3.4: Domain Components
**File:** `frontend/src/design-system/components/domain/`

Build shared domain components: ThumbnailCard, StatusBadge, TimelineEntry, MetadataField.

**Acceptance Criteria:**
- [ ] ThumbnailCard: image/video preview with overlay info, used in Library and Review
- [ ] StatusBadge: maps status IDs to colored badge labels
- [ ] TimelineEntry: timestamp + content layout for timelines
- [ ] MetadataField: label + value display with edit capability
- [ ] All domain components use primitives and composites internally

### Task 3.5: Barrel Export and Import Restrictions
**File:** `frontend/src/components/index.ts`

Single barrel file exporting all shared components.

```typescript
// frontend/src/components/index.ts
// All shared components exported from this single entry point
export { Button } from '@/design-system/components/primitives/Button';
export { Input } from '@/design-system/components/primitives/Input';
// ... all other components
```

**Acceptance Criteria:**
- [ ] Single `@/components` barrel exports all shared components
- [ ] No internal implementation files are importable from outside the design system
- [ ] Import path aliases configured in tsconfig

---

## Phase 4: Theme System

### Task 4.1: Theme Provider & CSS Custom Property System
**File:** `frontend/src/design-system/theme/ThemeProvider.tsx`, `frontend/src/design-system/theme/themes/`

Implement the two-axis theme model with runtime CSS custom property switching.

```typescript
interface ThemeProviderProps {
  colorScheme: 'dark' | 'light';
  brandPalette: 'obsidian' | 'neon' | string; // string for custom themes
  highContrast?: boolean;
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  colorScheme,
  brandPalette,
  highContrast,
  children,
}) => {
  useEffect(() => {
    const tokens = resolveTokens(colorScheme, brandPalette, highContrast);
    applyToRoot(tokens); // Sets CSS custom properties on :root
  }, [colorScheme, brandPalette, highContrast]);

  return <ThemeContext.Provider value={{ colorScheme, brandPalette }}>{children}</ThemeContext.Provider>;
};
```

**Acceptance Criteria:**
- [ ] Two-axis model: color scheme (Dark/Light) x brand palette (Obsidian/Neon/Custom)
- [ ] Runtime switching by swapping CSS custom property sets on `:root`
- [ ] No page reload, no re-render, no flash during theme switch
- [ ] Theme switch completes in <100ms
- [ ] System preference detection via `prefers-color-scheme` on first visit
- [ ] High Contrast mode variant

### Task 4.2: Dark Mode Theme Definition
**File:** `frontend/src/design-system/theme/themes/dark-obsidian.ts`, `frontend/src/design-system/theme/themes/dark-neon.ts`

Define dark mode token values for Obsidian and Neon palettes.

**Acceptance Criteria:**
- [ ] Dark Obsidian: cool, neutral, slate grays, muted accents, professional tone
- [ ] Dark Neon: vibrant, high-energy, electric accents on dark surfaces
- [ ] All tokens from Phase 2 have values in both dark palettes
- [ ] Meets WCAG AA contrast ratios minimum

### Task 4.3: Light Mode Theme Definition
**File:** `frontend/src/design-system/theme/themes/light-obsidian.ts`, `frontend/src/design-system/theme/themes/light-neon.ts`

Define light mode token values for Obsidian and Neon palettes.

**Acceptance Criteria:**
- [ ] Light Obsidian: high-luminance surfaces, professional neutral tone
- [ ] Light Neon: bright with vibrant accents
- [ ] All tokens from Phase 2 have values in both light palettes
- [ ] Meets WCAG AA contrast ratios minimum

---

## Phase 5: Storybook Catalog

### Task 5.1: Storybook Configuration
**File:** `frontend/.storybook/main.ts`, `frontend/.storybook/preview.ts`

Configure Storybook with theme support and design token documentation.

**Acceptance Criteria:**
- [ ] Storybook configured for TypeScript React components
- [ ] Theme switcher in Storybook toolbar (all 4 palette combinations)
- [ ] Design token documentation addon

### Task 5.2: Component Stories
**File:** `frontend/src/design-system/components/**/*.stories.tsx`

Create Storybook stories for every shared component.

**Acceptance Criteria:**
- [ ] Every primitive component has a Storybook story with all variants and states
- [ ] Every composite component has a Storybook story with usage examples
- [ ] Every layout and domain component documented
- [ ] Zero undocumented components in the shared library

---

## Phase 6: Enforcement Mechanisms

### Task 6.1: ESLint Rules for Design System Enforcement
**File:** `frontend/.eslintrc.js` or `frontend/eslint.config.js`

Configure lint rules to enforce design system usage.

```javascript
// Example rule configuration
rules: {
  'no-restricted-imports': ['error', {
    patterns: [
      {
        group: ['@/design-system/components/*/internal/*'],
        message: 'Import from @/components barrel instead.',
      },
    ],
  }],
  // Custom rule: no raw color values
  // Custom rule: no raw <button>, <input> elements outside design system
}
```

**Acceptance Criteria:**
- [ ] Lint rules flag raw color values (hex/rgb literals) in feature code
- [ ] Lint rules flag inline styles where design tokens should be used
- [ ] Lint rules flag direct HTML `<button>`, `<input>` elements outside the library
- [ ] Import restrictions prevent importing internal design system files
- [ ] CI fails on lint violations

### Task 6.2: Stylelint Rules
**File:** `frontend/.stylelintrc.js`

Configure Stylelint to enforce token usage in CSS/SCSS files.

**Acceptance Criteria:**
- [ ] Flag raw color values in CSS files
- [ ] Flag raw spacing values (should use token variables)
- [ ] Flag non-token font sizes

---

## Phase 7: Admin Token Editor

### Task 7.1: Token Editor UI
**File:** `frontend/src/features/admin/TokenEditor.tsx`

Admin interface for adjusting design tokens with live preview.

**Acceptance Criteria:**
- [ ] Color palette editor with color pickers
- [ ] Font family and size scale adjusters
- [ ] Spacing scale adjusters
- [ ] Live split-pane preview showing changes before committing
- [ ] "Save" persists to the `custom_themes` table via API
- [ ] "Export" downloads token set as JSON or CSS custom properties
- [ ] Admin-only access via RBAC

---

## Phase 8: Integration & Testing

### Task 8.1: Theme Persistence Integration
**File:** `frontend/src/hooks/useTheme.ts`

Connect theme provider to backend API for cross-session persistence.

**Acceptance Criteria:**
- [ ] On login, fetch user theme preference from API and apply
- [ ] On theme change, persist to API
- [ ] System preference detection on first visit (no saved preference)
- [ ] Graceful fallback to dark/obsidian if API is unavailable

### Task 8.2: Comprehensive Component Tests
**File:** `frontend/src/design-system/**/*.test.tsx`

Unit and integration tests for all shared components.

**Acceptance Criteria:**
- [ ] Every primitive component has render tests for all variants
- [ ] Theme switching tests: all components render correctly in all 4 theme combinations
- [ ] Accessibility tests: keyboard navigation, aria attributes, contrast ratios
- [ ] Import restriction tests: verify barrel export completeness

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_theme_configurations.sql` | Theme-related database tables |
| `src/models/theme.rs` | Rust model structs for theme preferences |
| `src/repositories/theme_repo.rs` | Theme CRUD repository |
| `src/routes/theme.rs` | Axum API endpoints for theme management |
| `frontend/src/design-system/tokens/` | Design token definitions (colors, typography, spacing, icons, animation) |
| `frontend/src/design-system/components/` | Shared component library (primitives, composites, layout, domain) |
| `frontend/src/design-system/theme/` | Theme provider, theme definitions, CSS custom property system |
| `frontend/src/components/index.ts` | Barrel export for all shared components |
| `frontend/.storybook/` | Storybook configuration and stories |
| `frontend/.eslintrc.js` | ESLint enforcement rules |
| `frontend/src/features/admin/TokenEditor.tsx` | Admin Token Editor UI |

## Dependencies
- PRD-000: Database conventions (BIGSERIAL, triggers, status tables)
- PRD-004: Session persistence (theme preference storage)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — theme persistence infrastructure
2. Phase 2 (Tokens) — design token definitions
3. Phase 3 (Components) — shared component library
4. Phase 4 (Themes) — multi-axis theme system with runtime switching
5. Phase 5 (Storybook) — component documentation
6. Phase 6 (Enforcement) — lint rules and CI gates

### Post-MVP Enhancements
- Phase 7 (Token Editor) — admin UI for custom themes
- Custom theme creation from duplicating existing token sets

## Notes
- This PRD is foundational — all other frontend PRDs depend on it. Prioritize stability and completeness.
- The design system is enforced infrastructure, not optional guidance. Lint rules and CI gates are critical.
- Changing the platform's primary color must be a single-line edit (token value change).

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
