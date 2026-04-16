# Task List: Semantic Typography Token System

**PRD Reference:** `design/prds/166-prd-semantic-typography-tokens.md`
**Scope:** Create a semantic typography token system (`TYPO_*` constants), refactor `ui-classes.ts` to compose from tokens, and migrate all ~2,000 ad-hoc text styling instances across 90+ files.

## Overview

This is a mechanical refactor — no visual changes. We create a single `typography-tokens.ts` file with ~30 named constants, update `ui-classes.ts` to compose from them, then systematically replace every ad-hoc text class combination with the appropriate token. The migration is done pattern-by-pattern (labels first, then data text, then headings, etc.) with TypeScript compilation and grep verification after each batch.

### What Already Exists
- `tokens/typography.css` — CSS variables for font sizes, weights, line heights (missing letter-spacing)
- `tokens/colors.css` — all `--color-text-*` and `--color-action-*` CSS variables
- `lib/ui-classes.ts` — 5 text-related constants (TERMINAL_LABEL, TERMINAL_TEXT, TERMINAL_TH, TERMINAL_HEADER_TITLE, SECTION_HEADING) that mix typography with layout

### What We're Building
1. Letter-spacing CSS variables in `typography.css`
2. `lib/typography-tokens.ts` with ~30 semantic `TYPO_*` constants
3. Refactored `ui-classes.ts` that composes `TYPO_*` tokens
4. Migration of ~2,000 ad-hoc text styling instances across 90+ files

### Key Design Decisions
1. **Tokens include color** — each token is self-contained (font + size + weight + color + tracking)
2. **TERMINAL_* becomes composition** — `TERMINAL_HEADER_TITLE = TYPO_LABEL`, `TERMINAL_TH = \`text-left ${TYPO_LABEL}\``
3. **Colored data tokens are standalone** — `TYPO_DATA_CYAN` includes everything (not `TYPO_DATA` + separate color)
4. **No visual changes** — token values match the current ad-hoc patterns exactly

---

## Phase 1: Foundation — Create Token System

### Task 1.1: Add Letter-Spacing CSS Variables
**File:** `apps/frontend/src/tokens/typography.css`

Add letter-spacing tokens to the `@theme` block alongside existing font variables.

```css
@theme {
  /* ... existing font-size, weight, line-height vars ... */

  --letter-spacing-tight: -0.01em;
  --letter-spacing-normal: 0;
  --letter-spacing-wide: 0.02em;
}
```

**Acceptance Criteria:**
- [ ] Three letter-spacing variables added to `@theme` block
- [ ] Existing variables unchanged
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 1.2: Create typography-tokens.ts
**File:** `apps/frontend/src/lib/typography-tokens.ts` (new file)

Create the semantic typography token file. Each constant is an exported Tailwind class string. Group tokens by category with JSDoc comments.

```typescript
/**
 * Semantic typography tokens — named class strings for every text role.
 *
 * Import these instead of hand-writing text class combinations.
 * Each token is a complete Tailwind class string: font, size, weight,
 * color, tracking, and case — no composition required at call site.
 *
 * Architecture:
 *   Layer 1: CSS Variables (tokens/typography.css)
 *   Layer 2: Semantic Tokens (this file)     ← you are here
 *   Layer 3: Layout Composition (lib/ui-classes.ts)
 */

// ---------------------------------------------------------------------------
// Page-level
// ---------------------------------------------------------------------------

/** Page heading — largest text on the page. */
export const TYPO_PAGE_TITLE =
  "text-xl font-semibold text-[var(--color-text-primary)]";

/** Page subtitle / description below the title. */
export const TYPO_PAGE_DESCRIPTION =
  "text-sm text-[var(--color-text-secondary)]";

// ---------------------------------------------------------------------------
// Section-level
// ---------------------------------------------------------------------------

/** Section heading within a page. */
export const TYPO_SECTION_TITLE =
  "text-base font-semibold text-[var(--color-text-primary)]";

/** Section description / subtitle. */
export const TYPO_SECTION_SUBTITLE =
  "text-sm text-[var(--color-text-secondary)]";

// ---------------------------------------------------------------------------
// Labels (the most common pattern — 200+ occurrences)
// ---------------------------------------------------------------------------

/** 10px uppercase monospace label — table headers, field labels, sub-titles. */
export const TYPO_LABEL =
  "text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono";

/** Same as TYPO_LABEL but without uppercase (inline contextual labels). */
export const TYPO_LABEL_INLINE =
  "text-[10px] font-medium text-[var(--color-text-muted)] tracking-wide font-mono";

// ---------------------------------------------------------------------------
// Data / terminal text
// ---------------------------------------------------------------------------

/** Monospace data text — default primary color. */
export const TYPO_DATA =
  "font-mono text-xs text-[var(--color-text-primary)]";

/** Monospace data text — muted. */
export const TYPO_DATA_MUTED =
  "font-mono text-xs text-[var(--color-text-muted)]";

/** Monospace 10px data text for compact displays. */
export const TYPO_DATA_TINY =
  "font-mono text-[10px] text-[var(--color-text-primary)]";

/** Data value — cyan (default value color, ~400 occurrences). */
export const TYPO_DATA_CYAN =
  "font-mono text-xs text-cyan-400";

/** Data value — success / complete. */
export const TYPO_DATA_SUCCESS =
  "font-mono text-xs text-green-400";

/** Data value — warning. */
export const TYPO_DATA_WARNING =
  "font-mono text-xs text-orange-400";

/** Data value — error / danger. */
export const TYPO_DATA_DANGER =
  "font-mono text-xs text-red-400";

// ---------------------------------------------------------------------------
// Card / panel
// ---------------------------------------------------------------------------

/** Card field label (alias of TYPO_LABEL for semantic clarity). */
export const TYPO_CARD_LABEL = TYPO_LABEL;

/** Card data value. */
export const TYPO_CARD_VALUE =
  "font-mono text-xs text-[var(--color-text-primary)]";

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/** Table column header (alias of TYPO_LABEL for semantic clarity). */
export const TYPO_TABLE_HEADER = TYPO_LABEL;

/** Table cell text. */
export const TYPO_TABLE_CELL =
  "font-mono text-xs text-[var(--color-text-primary)]";

// ---------------------------------------------------------------------------
// Numeric
// ---------------------------------------------------------------------------

/** Tabular-nums monospace for numbers and counts. */
export const TYPO_NUMERIC =
  "font-mono text-xs tabular-nums text-[var(--color-text-primary)]";

/** Large numeric display — stat tickers, dashboard KPIs. */
export const TYPO_NUMERIC_LARGE =
  "font-mono text-lg font-medium tabular-nums text-[var(--color-text-primary)]";

// ---------------------------------------------------------------------------
// Form / input
// ---------------------------------------------------------------------------

/** Form field label. */
export const TYPO_INPUT_LABEL =
  "text-xs font-medium text-[var(--color-text-secondary)]";

/** Helper / hint text below inputs. */
export const TYPO_INPUT_HELPER =
  "text-xs text-[var(--color-text-muted)]";

/** Validation error text. */
export const TYPO_INPUT_ERROR =
  "text-xs font-mono text-[var(--color-action-danger)]";

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

/** Text link. */
export const TYPO_LINK =
  "text-xs text-[var(--color-action-primary)] hover:text-[var(--color-action-primary-hover)] hover:underline";

/** Badge / tag text. */
export const TYPO_BADGE =
  "text-xs font-medium";

/** Button text base (mono, uppercase, tracked). */
export const TYPO_BUTTON =
  "text-xs font-mono font-medium uppercase tracking-wide";

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Empty state message. */
export const TYPO_EMPTY_STATE =
  "text-sm italic text-[var(--color-text-muted)]";

/** Error display text. */
export const TYPO_ERROR_MESSAGE =
  "text-xs font-mono text-[var(--color-action-danger)]";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Inline code / technical text. */
export const TYPO_CODE =
  "font-mono text-xs text-[var(--color-text-primary)]";

/** Image / media caption. */
export const TYPO_CAPTION =
  "text-xs text-[var(--color-text-secondary)]";

/** Timestamp text. */
export const TYPO_TIMESTAMP =
  "text-[10px] font-mono text-[var(--color-text-muted)]";

/** Pipe separator between inline items. */
export const TYPO_PIPE =
  "text-[var(--color-text-muted)] opacity-30 select-none";
```

**Acceptance Criteria:**
- [ ] File created at `apps/frontend/src/lib/typography-tokens.ts`
- [ ] All ~30 tokens defined and exported
- [ ] Each token uses CSS variables for colors (not hardcoded hex or gray-scale)
- [ ] Aliases defined: `TYPO_TABLE_HEADER = TYPO_LABEL`, `TYPO_CARD_LABEL = TYPO_LABEL`, `TYPO_CARD_VALUE = TYPO_DATA` (or equivalent)
- [ ] JSDoc comment on every exported constant
- [ ] `npx tsc --noEmit` passes

### Task 1.3: Refactor ui-classes.ts to Compose Tokens
**File:** `apps/frontend/src/lib/ui-classes.ts`

Import `TYPO_*` tokens and rewrite the text-related constants to compose from them. Layout-only constants stay unchanged.

**Changes:**

| Constant | Before | After |
|----------|--------|-------|
| `TERMINAL_HEADER_TITLE` | raw text classes | `TYPO_LABEL` |
| `TERMINAL_LABEL` | raw text classes | `TYPO_LABEL` |
| `TERMINAL_TH` | `"text-left"` + raw text classes | `` `text-left ${TYPO_LABEL}` `` |
| `TERMINAL_TEXT` | `"font-mono text-xs"` | `TYPO_DATA` |
| `TERMINAL_PIPE` | raw classes | `TYPO_PIPE` |
| `SECTION_HEADING` | raw classes | `TYPO_SECTION_TITLE` |
| `TERMINAL_SELECT` | inline text classes + layout | compose `TYPO_DATA` into layout string |
| `TERMINAL_TEXTAREA` | inline text classes + layout | compose `TYPO_DATA_CYAN` into layout string |
| `INLINE_LINK_BTN` | raw classes | compose `TYPO_LINK` + cursor |

Note: `TERMINAL_PANEL`, `TERMINAL_HEADER`, `TERMINAL_BODY`, `TERMINAL_LOG_AREA`, `TERMINAL_DIVIDER`, `TERMINAL_ROW_HOVER`, `TERMINAL_INPUT` are layout-only — leave unchanged.

**Acceptance Criteria:**
- [ ] `import { TYPO_LABEL, TYPO_DATA, ... } from "./typography-tokens"` at top
- [ ] All text-related constants rewritten to compose from tokens
- [ ] Layout-only constants unchanged
- [ ] All existing imports of `TERMINAL_*` across the codebase continue to work
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes (verified by spot-checking 3-4 pages)

---

## Phase 2: Migrate Label Patterns

### Task 2.1: Migrate Inline 10px Label Patterns
**Files:** ~34 files containing raw `text-[10px]` + `uppercase` + `tracking-wide` + `font-mono` patterns that are NOT imported from ui-classes.

Use grep to find all instances, then replace with `TYPO_LABEL` import. Common patterns to match:

```
text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono
text-[10px] uppercase tracking-wide font-mono text-[var(--color-text-muted)] font-medium
```

The order of Tailwind classes may vary — match all permutations.

For each file:
1. Add `import { TYPO_LABEL } from "@/lib/typography-tokens"` (or extend existing import)
2. Replace the raw class string with `TYPO_LABEL`
3. If used inside a template literal with other classes, compose: `` `text-left ${TYPO_LABEL}` ``

**Acceptance Criteria:**
- [ ] All ~34 files with inline label patterns migrated
- [ ] `grep -r "text-\[10px\].*uppercase.*tracking-wide.*font-mono" src/` returns only `typography-tokens.ts` and `ui-classes.ts`
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 2.2: Audit TERMINAL_LABEL / TERMINAL_HEADER_TITLE / TERMINAL_TH Imports
**Files:** ~79 files importing these from ui-classes

These already work correctly after Task 1.3 (ui-classes now composes from tokens). No code changes needed in these files — verify they compile and render correctly.

**Acceptance Criteria:**
- [ ] All files importing `TERMINAL_LABEL`, `TERMINAL_HEADER_TITLE`, `TERMINAL_TH` compile without errors
- [ ] Spot-check 5 representative pages visually (activity console, scenes page, queue table, avatar detail, media page)
- [ ] No visual changes

---

## Phase 3: Migrate Data Text Patterns

### Task 3.1: Migrate Colored Data Patterns
**Files:** ~68 files with `font-mono text-xs text-{color}-400` patterns

Replace with the corresponding colored token. Search and replace patterns:

| Pattern | Token | ~Files |
|---------|-------|--------|
| `font-mono text-xs text-cyan-400` | `TYPO_DATA_CYAN` | 40 |
| `font-mono text-xs text-green-400` | `TYPO_DATA_SUCCESS` | 10 |
| `font-mono text-xs text-orange-400` | `TYPO_DATA_WARNING` | 9 |
| `font-mono text-xs text-red-400` | `TYPO_DATA_DANGER` | 9 |

Note: class order may vary (`text-cyan-400 font-mono text-xs`). Match all permutations. Some instances may have additional classes — only replace the font-mono + text-xs + color portion.

**Acceptance Criteria:**
- [ ] All colored `font-mono text-xs text-{color}-400` patterns replaced
- [ ] `grep -r "font-mono text-xs text-cyan-400" src/` returns zero results outside token definition
- [ ] Same for green-400, orange-400, red-400 variants
- [ ] Each file has the correct import from `@/lib/typography-tokens`
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 3.2: Migrate Bare Data Text Patterns
**Files:** ~158 files with `font-mono text-xs` (without a color class)

Replace with `TYPO_DATA`. This is the largest batch. Some instances will have adjacent color classes applied dynamically (e.g., `clsx("font-mono text-xs", colorClass)`) — these should become `clsx(TYPO_DATA, colorClass)` but note `TYPO_DATA` already includes `text-[var(--color-text-primary)]`, so the dynamic color will override it correctly via Tailwind's last-class-wins.

Handle these sub-patterns:
- `font-mono text-xs` → `TYPO_DATA`
- `font-mono text-xs text-[var(--color-text-primary)]` → `TYPO_DATA`
- `font-mono text-xs text-[var(--color-text-muted)]` → `TYPO_DATA_MUTED`
- `font-mono text-xs text-[var(--color-text-secondary)]` → `TYPO_DATA_MUTED` (close enough)

**Acceptance Criteria:**
- [ ] All ~158 files with bare `font-mono text-xs` migrated
- [ ] `grep -rn "font-mono text-xs" src/ | grep -v typography-tokens | grep -v ui-classes | grep -v node_modules` returns zero
- [ ] Dynamic color composition handled correctly (token + override class)
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 3.3: Migrate Tiny Data Patterns
**Files:** ~74 files with `font-mono text-[10px]` patterns

Replace with `TYPO_DATA_TINY`. Similar approach — match all permutations, handle adjacent color classes.

**Acceptance Criteria:**
- [ ] All `font-mono text-[10px]` patterns (outside labels) replaced with `TYPO_DATA_TINY`
- [ ] Distinguished from label patterns (labels have `uppercase tracking-wide`)
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

---

## Phase 4: Migrate Heading Patterns

### Task 4.1: Migrate Page Title Patterns
**Files:** ~8 files with `text-xl font-semibold` or `text-2xl font-bold`

Replace with `TYPO_PAGE_TITLE`. Check PageHeader component first — if it applies text styling, update it there and all pages benefit.

**Acceptance Criteria:**
- [ ] All page title patterns replaced with `TYPO_PAGE_TITLE`
- [ ] PageHeader component checked and updated if applicable
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 4.2: Migrate Section Heading Patterns
**Files:** ~41 files with `text-lg font-semibold`, ~25 with `text-base font-semibold`

Replace with `TYPO_SECTION_TITLE`. Be selective — only replace where the pattern represents a section heading, not arbitrary bold text.

For `text-base font-semibold` patterns: these match `SECTION_HEADING` from ui-classes (already updated in Task 1.3). Files using `SECTION_HEADING` already work. Focus on files with inline patterns.

**Acceptance Criteria:**
- [ ] `text-lg font-semibold` heading patterns migrated where semantically appropriate
- [ ] `text-base font-semibold` heading patterns migrated where semantically appropriate
- [ ] Non-heading uses of `font-semibold` left unchanged (e.g., emphasis in body text)
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 4.3: Migrate Small Heading Patterns
**Files:** ~70 files with `text-sm font-semibold`

This is the trickiest heading level — `text-sm font-semibold` is used both as small headings and as emphasis in various contexts. Only migrate where it clearly represents a heading/title role (e.g., card titles, dialog sub-headings, collapsible section titles).

A good heuristic: if the element is an `<h3>`, `<h4>`, or has a role like "heading" / "title" in its context, it's a heading. If it's inline emphasis in a paragraph, leave it.

**Acceptance Criteria:**
- [ ] Clear heading uses of `text-sm font-semibold` migrated
- [ ] Non-heading bold text left unchanged
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

---

## Phase 5: Migrate Form & Remaining Patterns

### Task 5.1: Migrate Form Label Patterns
**Files:** ~68 files with `text-xs font-medium` + muted/secondary color for form labels

Replace with `TYPO_INPUT_LABEL`. Common patterns:
- `text-xs font-medium text-[var(--color-text-muted)]` → `TYPO_INPUT_LABEL`
- `text-xs font-medium text-[var(--color-text-secondary)]` → `TYPO_INPUT_LABEL`
- `block text-xs font-medium text-[var(--color-text-muted)]` → `block ${TYPO_INPUT_LABEL}`

Distinguish from `TYPO_LABEL` (which is 10px, uppercase, mono) — form labels are regular font, normal case.

**Acceptance Criteria:**
- [ ] Form label patterns replaced with `TYPO_INPUT_LABEL`
- [ ] Helper text patterns replaced with `TYPO_INPUT_HELPER` where found
- [ ] Error text patterns replaced with `TYPO_INPUT_ERROR` where found
- [ ] Not confused with 10px uppercase labels (those are `TYPO_LABEL`)
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 5.2: Migrate Empty State Patterns
**Files:** Search for `italic` + `text-[var(--color-text-muted)]` or similar empty state messages

Replace with `TYPO_EMPTY_STATE`.

**Acceptance Criteria:**
- [ ] Empty state text patterns replaced with `TYPO_EMPTY_STATE`
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 5.3: Migrate Timestamp and Caption Patterns
**Files:** Search for `text-[10px] font-mono text-[var(--color-text-muted)]` without uppercase (timestamps), and `text-xs text-[var(--color-text-secondary)]` for captions

Replace with `TYPO_TIMESTAMP` and `TYPO_CAPTION` respectively.

**Acceptance Criteria:**
- [ ] Timestamp patterns → `TYPO_TIMESTAMP`
- [ ] Caption patterns → `TYPO_CAPTION` (where clearly a caption/description)
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

### Task 5.4: Migrate Link Text Patterns
**Files:** Check `INLINE_LINK_BTN` usages and any inline `text-[var(--color-action-primary)]` patterns

The `INLINE_LINK_BTN` in ui-classes was already updated in Task 1.3 to compose `TYPO_LINK`. Check for any remaining inline link text patterns.

**Acceptance Criteria:**
- [ ] Remaining inline link text patterns migrated to `TYPO_LINK`
- [ ] `npx tsc --noEmit` passes
- [ ] No visual changes

---

## Phase 6: Verification & Cleanup

### Task 6.1: Final Grep Sweep
**Files:** All of `apps/frontend/src/`

Run verification greps to confirm the major ad-hoc patterns are gone:

```bash
# Labels — should only be in typography-tokens.ts
grep -rn "text-\[10px\].*uppercase.*tracking-wide" src/ | grep -v typography-tokens | grep -v node_modules

# Data text — should only be in typography-tokens.ts and ui-classes.ts
grep -rn "font-mono text-xs text-cyan-400" src/ | grep -v typography-tokens | grep -v ui-classes | grep -v node_modules
grep -rn "font-mono text-xs text-green-400" src/ | grep -v typography-tokens | grep -v node_modules
grep -rn "font-mono text-xs text-orange-400" src/ | grep -v typography-tokens | grep -v node_modules
grep -rn "font-mono text-xs text-red-400" src/ | grep -v typography-tokens | grep -v node_modules

# Bare data text — should be near zero
grep -rn '"font-mono text-xs"' src/ | grep -v typography-tokens | grep -v ui-classes | grep -v node_modules
```

For any remaining instances, determine if they're:
- Legitimate exceptions (e.g., test files, comments) — leave with a `// TYPO: exception` comment
- Missed migrations — fix them
- Different enough to need a new token — create one

**Acceptance Criteria:**
- [ ] Zero remaining instances of the top 5 ad-hoc patterns outside token files
- [ ] Any legitimate exceptions documented
- [ ] List of any new tokens added during sweep

### Task 6.2: TypeScript and Visual Verification
**Files:** Full project

Run final verification:

```bash
cd apps/frontend && npx tsc --noEmit
```

Then visually verify on these representative pages:
- Project Avatars tab (labels, cards, data values)
- Scenes page (table headers, data cells, status colors)
- Activity Console (log entries, timestamps, status)
- Avatar Detail / Images tab (labels, cards, thumbnails)
- Queue page (table, stats panel)
- Admin Cloud GPUs (data-heavy tables)
- Media page (browse cards, headers)

**Acceptance Criteria:**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All 7 representative pages visually verified — no regressions
- [ ] Light mode and dark mode both checked
- [ ] No layout shifts, missing text, or color changes

### Task 6.3: Update ui-classes.ts Documentation
**File:** `apps/frontend/src/lib/ui-classes.ts`

Update the JSDoc comment at the top of the file to reflect the new architecture. Remove references to raw text class patterns and point developers to `typography-tokens.ts` for text styling.

**Acceptance Criteria:**
- [ ] Doc comment updated to describe the three-layer architecture
- [ ] References to raw hex colors and text classes removed
- [ ] Points to `typography-tokens.ts` for all text styling
- [ ] Describes that `TERMINAL_*` text constants now compose from `TYPO_*` tokens

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/tokens/typography.css` | Add letter-spacing CSS variables |
| `apps/frontend/src/lib/typography-tokens.ts` | **New** — all TYPO_* semantic token constants |
| `apps/frontend/src/lib/ui-classes.ts` | Refactor to compose from TYPO_* tokens |
| ~90 component/page files | Migration targets for ad-hoc text patterns |

---

## Dependencies

### Existing Components to Reuse
- `tokens/typography.css` — existing CSS variables for font sizes, weights, line heights
- `tokens/colors.css` — all `--color-text-*` and `--color-action-*` variables
- `lib/ui-classes.ts` — existing TERMINAL_* constants (refactored in-place)

### New Infrastructure Needed
- `src/lib/typography-tokens.ts` — the token file (~30 constants)
- 3 CSS variables in `typography.css` (letter-spacing)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Foundation — Tasks 1.1-1.3
2. Phase 2: Migrate Labels — Tasks 2.1-2.2
3. Phase 3: Migrate Data Text — Tasks 3.1-3.3

**MVP Success Criteria:**
- Token file exists with all constants
- ui-classes.ts composes from tokens
- The two highest-volume patterns (labels + data text = ~1,100 instances) are migrated
- Zero visual regressions

### Full Implementation
4. Phase 4: Migrate Headings — Tasks 4.1-4.3
5. Phase 5: Migrate Form & Remaining — Tasks 5.1-5.4
6. Phase 6: Verification & Cleanup — Tasks 6.1-6.3

---

## Notes

1. **Class order doesn't matter in Tailwind** — `font-mono text-xs text-cyan-400` and `text-cyan-400 font-mono text-xs` are identical. Grep patterns must account for all permutations.
2. **Dynamic class composition** — when a component uses `clsx(baseClasses, dynamicColor)`, replace `baseClasses` with the colorless token (e.g., `TYPO_DATA`) and keep the dynamic color override. Tailwind's last-class-wins behavior ensures the override works.
3. **Don't migrate test files** — test assertions that check for specific class strings should be updated to match the new token values, but test utility helpers may use inline classes intentionally.
4. **Batch by pattern, not by file** — migrating all instances of one pattern at a time is safer and easier to verify than migrating all patterns in one file at a time.
5. **The `TERMINAL_*` re-exports prevent breaking changes** — any file importing `TERMINAL_LABEL` continues to work identically after Task 1.3. The gradual migration to direct `TYPO_*` imports can happen at any pace.

---

## Version History

- **v1.0** (2026-04-16): Initial task list creation from PRD-166
