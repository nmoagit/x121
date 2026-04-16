# PRD-166: Semantic Typography Token System

## 1. Introduction/Overview

The app's text styling is currently applied ad-hoc — the same `text-[10px] font-medium uppercase tracking-wide font-mono text-[var(--color-text-muted)]` string is copy-pasted across 200+ locations. There are ~5 partial constants in `ui-classes.ts` (TERMINAL_LABEL, TERMINAL_TEXT, etc.) but they mix typography with layout and color, making them hard to reuse cleanly.

The reesets_app solves this with a **semantic typography token system**: a `typography-tokens.ts` file that exports named `TYPO_*` constants for every text role (page title, card label, table header, data value, etc.). Each token is a self-contained Tailwind class string that bundles font family, size, weight, color, tracking, and case.

This PRD brings the same pattern to this app:
1. Expand the typography CSS variables with letter-spacing tokens
2. Create `typography-tokens.ts` with semantic `TYPO_*` constants for every text role
3. Refactor `ui-classes.ts` to compose `TYPO_*` tokens into layout constants (replacing raw text classes)
4. Migrate all ~2,000 ad-hoc text styling instances across 90+ files to use the tokens

## 2. Related PRDs & Dependencies

### Depends On
- None — uses the existing CSS variable infrastructure in `tokens/typography.css` and `tokens/colors.css`

### Extends
- **PRD-029** (Design System / Shared Component Library): This PRD adds the typography token layer to the existing design token system (colors, spacing, borders already tokenized)

### Conflicts With
- None — all changes are additive or refactors of existing patterns

## 3. Goals

1. Every text styling combination in the app is defined **once** as a named `TYPO_*` token
2. Components reference tokens by semantic role, not raw Tailwind classes
3. Global typography changes (e.g., changing the label font size from 10px to 11px) can be made by editing one token
4. `ui-classes.ts` becomes a **layout composition layer** that imports `TYPO_*` tokens instead of hardcoding text classes
5. No visual change — the migration is a refactor, not a redesign

## 4. User Stories

- **As a developer**, I want to apply text styling by role name (`TYPO_LABEL`, `TYPO_DATA_VALUE`) instead of remembering the exact combination of 5-6 Tailwind classes, so I write consistent UI faster.
- **As a designer**, I want to change the label font size globally by editing one token definition, so I don't have to hunt through 200 files.
- **As a code reviewer**, I want to see `TYPO_TABLE_HEADER` in a diff instead of `text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono`, so I can understand intent at a glance.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Expand Typography CSS Variables
**Description:** Add letter-spacing tokens to `tokens/typography.css` to complete the typography variable set. The existing font-size, font-weight, and line-height variables stay as-is (keeping the current scale).

**Acceptance Criteria:**
- [ ] `--letter-spacing-tight: -0.01em` added to `@theme` block
- [ ] `--letter-spacing-normal: 0` added to `@theme` block
- [ ] `--letter-spacing-wide: 0.02em` added to `@theme` block
- [ ] Existing font-size/weight/line-height variables unchanged
- [ ] No visual changes to any existing component

#### Requirement 1.2: Create Typography Token File
**Description:** Create `src/lib/typography-tokens.ts` with semantic `TYPO_*` constants. Each constant is a Tailwind class string that fully defines the text appearance for a specific role. Tokens include font family, size, weight, line-height, letter-spacing, text-transform, and color.

The token set must cover all distinct text roles identified in the codebase audit:

**Page-Level Tokens:**
- `TYPO_PAGE_TITLE` — page headings (text-xl, semibold, primary color)
- `TYPO_PAGE_DESCRIPTION` — page subtitle/description (text-sm, secondary color)

**Section-Level Tokens:**
- `TYPO_SECTION_TITLE` — section headings within a page (text-base, semibold)
- `TYPO_SECTION_SUBTITLE` — section descriptions (text-sm, secondary)

**Label Tokens:**
- `TYPO_LABEL` — 10px uppercase monospace label (table headers, field labels, section sub-titles) — replaces the pattern used 200+ times
- `TYPO_LABEL_INLINE` — same as TYPO_LABEL but without uppercase (for inline contextual labels)

**Data/Terminal Tokens:**
- `TYPO_DATA` — monospace data text (font-mono text-xs, primary color)
- `TYPO_DATA_MUTED` — monospace data text in muted color
- `TYPO_DATA_TINY` — monospace 10px data text for compact displays
- `TYPO_DATA_CYAN` — default data value color (cyan-400, the most common ~400 occurrences)
- `TYPO_DATA_SUCCESS` — success state data (green-400)
- `TYPO_DATA_WARNING` — warning state data (orange-400)
- `TYPO_DATA_DANGER` — error/danger state data (red-400)

**Card/Panel Tokens:**
- `TYPO_CARD_LABEL` — card field label (10px uppercase mono, muted)
- `TYPO_CARD_VALUE` — card data value (mono xs, primary)

**Table Tokens:**
- `TYPO_TABLE_HEADER` — table column header (10px uppercase mono, muted) — alias of TYPO_LABEL
- `TYPO_TABLE_CELL` — table cell text (mono xs, primary)

**Numeric Tokens:**
- `TYPO_NUMERIC` — tabular-nums monospace for numbers/counts
- `TYPO_NUMERIC_LARGE` — larger numeric display (stat tickers, dashboards)

**Form/Input Tokens:**
- `TYPO_INPUT_LABEL` — form field label (xs, medium weight, secondary)
- `TYPO_INPUT_HELPER` — helper/hint text below inputs (xs, muted)
- `TYPO_INPUT_ERROR` — validation error text (xs, danger color, mono)

**Interactive Tokens:**
- `TYPO_LINK` — text link styling (xs, primary action color, hover underline)
- `TYPO_BADGE` — badge/tag text (xs, medium weight)
- `TYPO_BUTTON` — button text base (xs, mono, uppercase tracking-wide, medium weight)

**Feedback Tokens:**
- `TYPO_EMPTY_STATE` — empty state message (sm, muted, italic)
- `TYPO_ERROR_MESSAGE` — error display text (xs, mono, danger)

**Utility Tokens:**
- `TYPO_CODE` — inline code text (mono xs, primary)
- `TYPO_CAPTION` — image/media caption (xs, secondary)
- `TYPO_TIMESTAMP` — timestamp text (10px, mono, muted)
- `TYPO_PIPE` — pipe separator (muted, opacity-30, select-none)

**Acceptance Criteria:**
- [ ] File created at `src/lib/typography-tokens.ts`
- [ ] All tokens listed above are defined as exported `const` strings
- [ ] Each token is a complete Tailwind class string (no composition required at call site)
- [ ] Tokens use CSS variables where appropriate (e.g., `text-[var(--color-text-muted)]` not `text-gray-500`)
- [ ] All color references use the theme's CSS variables
- [ ] `TYPO_TABLE_HEADER` is identical to `TYPO_LABEL` (explicit alias for semantic clarity)
- [ ] File has JSDoc comments explaining each token's intended use

#### Requirement 1.3: Refactor ui-classes.ts to Compose Tokens
**Description:** Refactor `ui-classes.ts` so that existing `TERMINAL_*` constants import and compose `TYPO_*` tokens for their typography portion. Layout concerns (padding, borders, backgrounds) stay in `ui-classes.ts`. Typography concerns move to the tokens.

**Before:**
```typescript
export const TERMINAL_HEADER_TITLE =
  "text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";
```

**After:**
```typescript
import { TYPO_LABEL } from "./typography-tokens";

export const TERMINAL_HEADER_TITLE = TYPO_LABEL;
```

**Before:**
```typescript
export const TERMINAL_TH =
  "text-left text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";
```

**After:**
```typescript
export const TERMINAL_TH = `text-left ${TYPO_LABEL}`;
```

**Acceptance Criteria:**
- [ ] `TERMINAL_HEADER_TITLE` re-exports `TYPO_LABEL`
- [ ] `TERMINAL_TH` composes `text-left` + `TYPO_LABEL`
- [ ] `TERMINAL_TEXT` re-exports `TYPO_DATA`
- [ ] `TERMINAL_PIPE` re-exports `TYPO_PIPE`
- [ ] `SECTION_HEADING` re-exports `TYPO_SECTION_TITLE`
- [ ] `TERMINAL_PANEL`, `TERMINAL_HEADER`, `TERMINAL_BODY`, `TERMINAL_LOG_AREA` retain layout classes only (no typography)
- [ ] `TERMINAL_SELECT` and `TERMINAL_TEXTAREA` reference `TYPO_DATA` or `TYPO_CODE` for their text portion
- [ ] All existing imports of `TERMINAL_*` continue to work (no breaking changes)
- [ ] No visual changes to any component

#### Requirement 1.4: Migrate Ad-Hoc Label Patterns
**Description:** Replace all ~200 instances of the inline label pattern `text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono` (and minor variants) with `TYPO_LABEL` or `TYPO_TABLE_HEADER`.

**Acceptance Criteria:**
- [ ] All instances of the 10px uppercase mono label pattern replaced with `TYPO_LABEL` import
- [ ] Files that already import from `ui-classes.ts` for `TERMINAL_LABEL` now import `TYPO_LABEL` from `typography-tokens.ts` (or continue using `TERMINAL_HEADER_TITLE` which re-exports it)
- [ ] No visual changes to any component
- [ ] TypeScript compiles without errors

#### Requirement 1.5: Migrate Ad-Hoc Data Text Patterns
**Description:** Replace all ~800+ instances of `font-mono text-xs` data text patterns with appropriate `TYPO_DATA*` tokens. Where the pattern includes a semantic color (cyan-400, green-400, etc.), use the corresponding colored token.

**Acceptance Criteria:**
- [ ] `font-mono text-xs text-cyan-400` → `TYPO_DATA_CYAN`
- [ ] `font-mono text-xs text-green-400` → `TYPO_DATA_SUCCESS`
- [ ] `font-mono text-xs text-orange-400` → `TYPO_DATA_WARNING`
- [ ] `font-mono text-xs text-red-400` → `TYPO_DATA_DANGER`
- [ ] `font-mono text-xs` (no color or primary color) → `TYPO_DATA`
- [ ] `font-mono text-xs text-[var(--color-text-muted)]` → `TYPO_DATA_MUTED`
- [ ] `font-mono text-[10px]` → `TYPO_DATA_TINY`
- [ ] Patterns in dynamic contexts (template literals, conditional joins) are handled correctly
- [ ] No visual changes
- [ ] TypeScript compiles without errors

#### Requirement 1.6: Migrate Heading Patterns
**Description:** Replace ad-hoc heading patterns with `TYPO_PAGE_TITLE`, `TYPO_SECTION_TITLE`, and `TYPO_SECTION_SUBTITLE` tokens.

**Acceptance Criteria:**
- [ ] `text-xl font-semibold` / `text-2xl font-bold` page title patterns → `TYPO_PAGE_TITLE`
- [ ] `text-lg font-semibold` section heading patterns → `TYPO_SECTION_TITLE` (where semantically appropriate)
- [ ] `text-base font-semibold` / SECTION_HEADING usages → compose with `TYPO_SECTION_TITLE`
- [ ] Heading patterns inside PageHeader component updated
- [ ] No visual changes
- [ ] TypeScript compiles without errors

#### Requirement 1.7: Migrate Form Label and Helper Patterns
**Description:** Replace ad-hoc form label patterns with `TYPO_INPUT_LABEL`, `TYPO_INPUT_HELPER`, and `TYPO_INPUT_ERROR` tokens.

**Acceptance Criteria:**
- [ ] Input/form label patterns → `TYPO_INPUT_LABEL`
- [ ] Helper text / hint patterns → `TYPO_INPUT_HELPER`
- [ ] Validation error text patterns → `TYPO_INPUT_ERROR`
- [ ] No visual changes
- [ ] TypeScript compiles without errors

#### Requirement 1.8: Migrate Remaining Ad-Hoc Patterns
**Description:** Sweep all remaining ad-hoc text patterns that match defined tokens. This includes: card labels/values, badge text, empty state text, timestamp text, code blocks, captions, and link text.

**Acceptance Criteria:**
- [ ] All identifiable ad-hoc text patterns replaced with appropriate `TYPO_*` tokens
- [ ] No remaining instances of the common patterns that have token equivalents (verified by grep)
- [ ] Dynamic/conditional text styling (e.g., status color maps) updated to reference token patterns where possible
- [ ] No visual changes
- [ ] TypeScript compiles without errors
- [ ] Linter passes

## 6. Non-Goals (Out of Scope)

- **Changing the visual design** — this is a refactor, not a redesign. Token values match the current appearance exactly.
- **Changing the font scale** — the existing trulience font sizes stay as-is (text-xs = 0.6875rem, etc.)
- **Creating a Text/Typography React component** — tokens are Tailwind class strings, not components. A `<Text>` component is a potential future enhancement.
- **Migrating component library internals** — Button, Badge, Input components already have their own internal text styling; those stay as-is unless they use ad-hoc patterns.
- **Dark/light theme changes** — tokens use CSS variables that already respond to theme switching.

## 7. Design Considerations

### Token Architecture (Three Layers)

```
Layer 1: CSS Variables (tokens/typography.css)
  └── --text-xs, --font-weight-medium, --letter-spacing-wide, etc.

Layer 2: Semantic Tokens (lib/typography-tokens.ts)
  └── TYPO_LABEL, TYPO_DATA, TYPO_PAGE_TITLE, etc.
      (Tailwind class strings consuming CSS variables)

Layer 3: Layout Composition (lib/ui-classes.ts)
  └── TERMINAL_PANEL, TERMINAL_HEADER, etc.
      (Compose TYPO_* tokens + layout classes like padding, borders, bg)
```

### Token Naming Convention

Pattern: `TYPO_{CONTEXT}_{MODIFIER}`

- Context = where it's used (PAGE, SECTION, CARD, TABLE, DATA, INPUT, etc.)
- Modifier = variant (TITLE, LABEL, VALUE, HEADER, CELL, etc.)

Examples: `TYPO_PAGE_TITLE`, `TYPO_TABLE_HEADER`, `TYPO_DATA_CYAN`, `TYPO_INPUT_ERROR`

### Reference Model

The reesets_app's `typography-tokens.ts` at `/home/matthias/dev_projects/reesets_app/apps/shared/design-system/src/utils/typography-tokens.ts` is the reference implementation. Adapt the pattern to trulience's existing CSS variable names and font scale.

## 8. Technical Considerations

### Existing Code to Reuse
- `tokens/typography.css` — existing font-size, weight, and line-height variables
- `tokens/colors.css` — all `--color-text-*` and `--color-action-*` variables
- `lib/ui-classes.ts` — existing TERMINAL_* constants (refactored, not deleted)

### New Infrastructure Needed
- `src/lib/typography-tokens.ts` — the new token file (~30 exported constants)
- Letter-spacing additions to `tokens/typography.css` (3 new variables)

### Migration Strategy
The migration is mechanical — search for a pattern, replace with a token import. The risk is low because:
1. Every replacement is visually identical (same classes, just imported from a token)
2. TypeScript catches any import errors
3. The app can be visually verified in the browser
4. Migration can be done file-by-file or pattern-by-pattern

**Recommended migration order:**
1. Create the token file (Req 1.2)
2. Refactor ui-classes.ts (Req 1.3) — proves tokens work
3. Migrate labels (Req 1.4) — highest-count pattern, most impact
4. Migrate data text (Req 1.5) — second-highest count
5. Migrate headings (Req 1.6)
6. Migrate form patterns (Req 1.7)
7. Final sweep (Req 1.8)

### Verification
After each migration batch:
- `npx tsc --noEmit` must pass
- Visual spot-check on 3-4 representative pages
- Grep for the replaced pattern to confirm zero remaining instances

## 9. Success Metrics

- Zero instances of the common ad-hoc label pattern (`text-[10px] font-medium uppercase tracking-wide font-mono`) remaining outside `typography-tokens.ts`
- Zero instances of bare `font-mono text-xs text-cyan-400` remaining outside `typography-tokens.ts`
- All `TERMINAL_*` text constants in `ui-classes.ts` compose from `TYPO_*` tokens
- No visual regressions in light or dark mode on any page
- Any future text styling change to labels/data/headings requires editing exactly 1 line

## 10. Open Questions

1. **TYPO_DATA with semantic colors** — should `TYPO_DATA_CYAN` use `text-cyan-400` (a Tailwind color) or a CSS variable like `text-[var(--color-data-default)]`? Using a CSS variable would allow the data color to change with themes, but cyan-400 is visually correct in all current themes.
2. **Conditional class composition** — some components build text classes dynamically (e.g., `clsx(TYPO_DATA, isError && "text-red-400")`). Should the colored tokens (TYPO_DATA_CYAN, etc.) override the base TYPO_DATA's color, or should they be standalone? Standalone is simpler.

## 11. Version History

- **v1.0** (2026-04-16): Initial PRD creation
