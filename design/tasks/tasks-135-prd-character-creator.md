# Task List: Character Creator

**PRD Reference:** `design/prds/135-prd-character-creator.md`
**Scope:** Dedicated character provisioning page with seed images, metadata, shared group/card module, and intelligent file assignment for unmatched filenames.

## Overview

This feature extracts reusable character group/card/filter components from `ProjectCharactersTab` into a shared module, then builds a new Character Creator page at `/content/characters` that uses those components without video functionality. A new `FileAssignmentModal` handles unmatched filenames during folder import, and is backported to the existing project import flow.

### What Already Exists
- `ProjectCharactersTab` with GroupSection, CharacterCard, filter bar, drop zone import
- `CharacterCard` component with avatar, status, readiness indicators
- `use-character-import.ts` hook with 5-phase import (groups → characters → images → metadata → videos)
- `ImportConfirmModal` with name normalization, dedup, overwrite toggles
- `FileDropZone` component for drag-and-drop
- Route `/content/characters` and nav entry already registered
- `CharactersPage.tsx` exists but uses picker pattern (needs rewrite)
- Metadata template system with field definitions

### What We're Building
1. Shared character group/card/filter module (extracted from ProjectCharactersTab)
2. FileAssignmentModal for unmatched file mapping
3. Character Creator page (rewrite of existing CharactersPage)
4. Seed data completeness indicators on CharacterCard
5. Admin project auto-creation confirmation modal
6. Backport FileAssignmentModal to project import flow

### Key Design Decisions
1. Extract shared module rather than duplicate — both pages consume the same components
2. `useCharacterImportBase` hook skips Phase 4 (videos) for the Creator page
3. FileAssignmentModal is a standalone shared component used by both import flows
4. Route and nav entry already exist — just need to rewrite the page component
5. Character creation is never blocked by missing files — partial state is valid

---

## Phase 1: Shared Module Extraction

### Task 1.1: Extract GroupSection Component
**File:** `apps/frontend/src/features/characters/components/CharacterGroupSection.tsx`

Extract the `GroupSection` component (currently internal to `ProjectCharactersTab.tsx` at lines 872-1047) into a standalone shared component.

The shared version should accept a `mode` prop or feature flags to control which features are enabled:
- Drag-and-drop between groups (project tab: yes, creator: yes)
- Group edit/delete actions (both pages)
- Select all/deselect per group (both pages)
- Character card rendering via render prop or children

```typescript
interface CharacterGroupSectionProps {
  sectionId?: string;
  group?: CharacterGroup;
  label?: string;
  characters: Character[];
  avatarMap: Map<number, string>;
  expanded: boolean;
  selectedCharIds: Set<number>;
  onCharSelect: (charId: number) => void;
  onSelectAll: (charIds: number[]) => void;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Render function for each character card */
  renderCard: (character: Character) => ReactNode;
  /** Drag-and-drop handlers (optional — omit to disable DnD) */
  dragHandlers?: {
    isDragOver: boolean;
    onCharDragStart: (e: React.DragEvent, characterId: number) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}
```

**Acceptance Criteria:**
- [ ] Component extracted to `features/characters/components/CharacterGroupSection.tsx`
- [ ] Renders collapsible section with character count, expand/collapse, select all
- [ ] Supports optional drag-and-drop via `dragHandlers` prop
- [ ] Supports optional group edit/delete via `onEdit`/`onDelete` props
- [ ] Uses `renderCard` for flexible card rendering
- [ ] Exported from `features/characters/components/index.ts`
- [ ] `npx tsc --noEmit` passes

### Task 1.2: Extract Character Filter Bar
**File:** `apps/frontend/src/features/characters/components/CharacterFilterBar.tsx`

Extract the filter/search/toggle bar pattern used in `ProjectCharactersTab` into a reusable component.

```typescript
interface CharacterFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  groupOptions: MultiSelectOption[];
  groupFilter: string[];
  onGroupFilterChange: (values: string[]) => void;
  showDisabled: boolean;
  onShowDisabledChange: () => void;
  /** Optional audit view toggle */
  auditView?: boolean;
  onAuditViewChange?: () => void;
  /** Optional project filter (admin mode) */
  projectOptions?: MultiSelectOption[];
  projectFilter?: string[];
  onProjectFilterChange?: (values: string[]) => void;
  /** Expand/collapse all */
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
  /** Selection count display */
  selectedCount?: number;
  onClearSelection?: () => void;
}
```

**Acceptance Criteria:**
- [ ] Component renders search input, group MultiSelect, collapse toggle, show disabled toggle
- [ ] Optional project filter shown when `projectOptions` is provided
- [ ] Optional audit view toggle shown when `onAuditViewChange` is provided
- [ ] Selection count + clear shown when `selectedCount > 0`
- [ ] All controls use `sm` size
- [ ] Vertical alignment matches existing pattern (self-end with pb-[3px])
- [ ] `npx tsc --noEmit` passes

### Task 1.3: Refactor ProjectCharactersTab to Use Shared Components
**File:** `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`

Replace the inline `GroupSection` and filter bar in `ProjectCharactersTab` with the extracted shared components. All existing functionality must be preserved.

**Acceptance Criteria:**
- [ ] `ProjectCharactersTab` imports and uses `CharacterGroupSection`
- [ ] `ProjectCharactersTab` imports and uses `CharacterFilterBar`
- [ ] All existing features work identically: search, group filter, collapse, DnD, selection, modals
- [ ] Import flow unchanged (drop zone, ImportConfirmModal)
- [ ] Video-related features (generation, scene cards) remain in place
- [ ] No visual or functional regression
- [ ] `npx tsc --noEmit` passes

### Task 1.4: Extract Base Character Import Hook (No Videos)
**File:** `apps/frontend/src/features/characters/hooks/useCharacterImportBase.ts`

Extract phases 0–3.5 from `use-character-import.ts` into a base hook that handles groups, characters, images, and metadata — but not videos.

The existing `useCharacterImport` should wrap this base hook and add Phase 4 (videos) on top.

```typescript
interface UseCharacterImportBaseOptions {
  projectId: number;
  /** Called when unmatched files are detected — returns user assignments */
  onUnmatchedFiles?: (characters: UnmatchedCharacterFiles[]) => Promise<FileAssignments>;
}

function useCharacterImportBase(options: UseCharacterImportBaseOptions) {
  // Phases 0-3.5: groups, characters, images, metadata
  // Returns same interface as useCharacterImport minus video-specific fields
}
```

**Acceptance Criteria:**
- [ ] Base hook handles phases 0–3.5 (groups → characters → images → metadata)
- [ ] Existing `useCharacterImport` wraps the base hook and adds Phase 4 (videos)
- [ ] No duplication of group/character/image/metadata logic
- [ ] Base hook accepts an `onUnmatchedFiles` callback for the FileAssignmentModal
- [ ] Both hooks share the same progress reporting interface
- [ ] `npx tsc --noEmit` passes

---

## Phase 2: File Assignment Modal

### Task 2.1: Create FileAssignmentModal Component
**File:** `apps/frontend/src/features/characters/components/FileAssignmentModal.tsx`

A modal with a per-character × category assignment grid for mapping unrecognised files to the correct categories.

```typescript
interface UnmatchedCharacterFiles {
  characterName: string;
  /** All unmatched image files in this character's folder */
  imageFiles: File[];
  /** All unmatched JSON files in this character's folder */
  jsonFiles: File[];
  /** Pre-matched files (from recognised names) — shown as locked */
  matched: {
    clothed?: File;
    topless?: File;
    bio?: File;
    tov?: File;
  };
}

interface FileAssignments {
  [characterName: string]: {
    clothed?: File;
    topless?: File;
    bio?: File;
    tov?: File;
  };
}

interface FileAssignmentModalProps {
  open: boolean;
  characters: UnmatchedCharacterFiles[];
  onConfirm: (assignments: FileAssignments) => void;
  onCancel: () => void;
}
```

Layout:
- Table with character name rows
- Columns: Character Name | Clothed Image | Topless Image | Bio JSON | ToV JSON
- Image cells: dropdown of available image files with 64×64 thumbnail previews
- JSON cells: dropdown of available JSON files with filename + document icon
- Pre-matched files shown as locked (greyed, non-editable)
- Duplicate guard: once a file is assigned, it's greyed out in all other dropdowns
- Validation warning if bio.json or tov.json is unassigned (yellow highlight, non-blocking)
- "Skip" option in every dropdown

**Acceptance Criteria:**
- [ ] Modal renders per-character rows with 4 category columns
- [ ] Image dropdowns show thumbnail previews (64×64)
- [ ] JSON dropdowns show filename with document icon
- [ ] Pre-matched files shown as locked/non-editable
- [ ] Same file cannot be assigned to multiple categories (duplicate guard)
- [ ] Warning shown when bio.json or tov.json is unassigned
- [ ] Missing files do NOT block confirmation
- [ ] "Skip" option available for each cell
- [ ] Confirm button returns the `FileAssignments` map
- [ ] `npx tsc --noEmit` passes

### Task 2.2: Integrate FileAssignmentModal into Import Flow
**File:** `apps/frontend/src/features/characters/hooks/useCharacterImportBase.ts`

Wire the `FileAssignmentModal` into the import flow. After folder drop and filename matching, if any character has unmatched files, open the modal before proceeding.

**Implementation:**
1. After scanning folders, partition files into matched (recognised names) and unmatched
2. If unmatched files exist, call the `onUnmatchedFiles` callback with the unmatched data
3. The callback opens the `FileAssignmentModal` and returns a promise that resolves with assignments
4. Merge assignments with auto-matched files and proceed with import

**Acceptance Criteria:**
- [ ] Import flow detects unmatched files after filename scanning
- [ ] `onUnmatchedFiles` callback is invoked with unmatched file data
- [ ] FileAssignmentModal opens and blocks import until user confirms or cancels
- [ ] User assignments are merged with auto-matched files
- [ ] Cancel aborts the import
- [ ] Characters with all files matched (by name) skip the modal entirely
- [ ] `npx tsc --noEmit` passes

---

## Phase 3: Character Creator Page

### Task 3.1: Rewrite CharactersPage to Creator Pattern
**File:** `apps/frontend/src/app/pages/CharactersPage.tsx`

Rewrite the existing `CharactersPage` (currently a picker) to the browse/creator pattern. Uses the shared `CharacterGroupSection`, `CharacterFilterBar`, `CharacterCard`, and `useCharacterImportBase`.

**Key differences from ProjectCharactersTab:**
- Admin: shows all characters across projects with project filter
- Project user: shows characters in assigned project only
- No video UI (no scene cards, no generation buttons)
- Uses `useCharacterImportBase` (no Phase 4 videos)
- Character cards show seed data completeness indicators (Task 3.2)

**Acceptance Criteria:**
- [ ] Page renders at `/content/characters`
- [ ] Admin users see characters from all projects with project filter
- [ ] Project users see only their project's characters (no project filter)
- [ ] Groups displayed using `CharacterGroupSection` with expand/collapse
- [ ] Filters: search, group MultiSelect, project MultiSelect (admin), show disabled toggle
- [ ] Actions: Import Folder, New Group, Add Character
- [ ] Drop zone for folder import using `useCharacterImportBase`
- [ ] ImportConfirmModal with re-import toggles
- [ ] No video-related UI
- [ ] `npx tsc --noEmit` passes

### Task 3.2: Add Seed Data Completeness Indicators to CharacterCard
**File:** `apps/frontend/src/features/projects/components/CharacterCard.tsx`

Add optional seed data completeness indicators that show which of the 4 required items (clothed image, topless image, bio.json, tov.json) are present.

```typescript
interface SeedDataStatus {
  hasClothedImage: boolean;
  hasToplessImage: boolean;
  hasBio: boolean;
  hasTov: boolean;
}

// Add to CharacterCardProps:
seedDataStatus?: SeedDataStatus;
```

Display: 4 small dots/icons in the card footer. Complete items are filled/green, missing items are empty/grey. Only shown when `seedDataStatus` prop is provided.

**Acceptance Criteria:**
- [ ] 4 indicator dots/icons shown when `seedDataStatus` is provided
- [ ] Complete items shown with filled indicator (green/success)
- [ ] Missing items shown with empty indicator (grey/muted)
- [ ] Indicators not shown when `seedDataStatus` is omitted (backwards compatible)
- [ ] Tooltip on each indicator shows the category name
- [ ] `npx tsc --noEmit` passes

### Task 3.3: Admin Project Auto-Creation Confirmation Modal
**File:** `apps/frontend/src/features/characters/components/ProjectConfirmModal.tsx`

When an admin drops a 3-level folder (`project/group/character`), show a confirmation modal listing the projects to be created.

```typescript
interface ProjectConfirmModalProps {
  open: boolean;
  /** Detected projects with their groups and character counts */
  projects: {
    name: string;
    exists: boolean;
    groups: { name: string; characterCount: number }[];
  }[];
  onConfirm: (selectedProjectNames: string[]) => void;
  onCancel: () => void;
}
```

**Acceptance Criteria:**
- [ ] Modal shows list of detected projects
- [ ] Existing projects shown with "Existing" badge (will add to, not recreate)
- [ ] New projects shown with "New" badge
- [ ] Each project row shows group count and total character count
- [ ] Checkboxes to deselect specific projects
- [ ] Confirm button proceeds with selected projects only
- [ ] Cancel aborts the import
- [ ] `npx tsc --noEmit` passes

### Task 3.4: Metadata Template Selector in Import Flow
**File:** `apps/frontend/src/features/characters/components/FileAssignmentModal.tsx` (or ImportConfirmModal)

Add a metadata template selector dropdown to the import confirmation flow.

**Acceptance Criteria:**
- [ ] Template selector dropdown shown in the import confirmation step
- [ ] Fetches available templates via existing `useMetadataTemplates` hook
- [ ] Defaults to the active/default template
- [ ] Selected template ID passed to the import hook for metadata field mapping
- [ ] `npx tsc --noEmit` passes

### Task 3.5: Wire Up Re-Import/Update Mode
**File:** `apps/frontend/src/app/pages/CharactersPage.tsx`

Ensure the ImportConfirmModal toggles (Import missing, Overwrite existing, New content only) work correctly in the Creator page context.

**Acceptance Criteria:**
- [ ] Existing characters detected by name match
- [ ] Duplicate characters shown with indicator
- [ ] "Import missing" toggle adds assets to existing characters
- [ ] "Overwrite existing" toggle replaces existing assets
- [ ] "New content only" toggle skips identical files (hash match)
- [ ] Same behaviour as existing project import flow
- [ ] `npx tsc --noEmit` passes

---

## Phase 4: Polish & Backport

### Task 4.1: Backport FileAssignmentModal to Project Import
**File:** `apps/frontend/src/features/projects/hooks/use-character-import.ts`

Wire the `FileAssignmentModal` into the existing project drop zone import flow (the one that includes videos). When image/JSON files don't match recognised names, the modal opens. Video files continue using the existing scene-type matching logic.

**Acceptance Criteria:**
- [ ] Project import detects unmatched image/JSON files
- [ ] FileAssignmentModal opens for unmatched files
- [ ] Video file matching unchanged (uses existing `matchDroppedVideos`)
- [ ] Assignments from modal merged into import payload
- [ ] No regression in existing import functionality
- [ ] `npx tsc --noEmit` passes

### Task 4.2: Make Characters Nav Entry Prominent
**File:** `apps/frontend/src/app/navigation.ts`

Add `prominent: true` to the Characters nav entry so it's visually highlighted.

**Acceptance Criteria:**
- [ ] Characters entry in Content nav section has `prominent: true`
- [ ] Renders with the same prominent styling as Scenes, Images, Library
- [ ] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/features/characters/components/CharacterGroupSection.tsx` | Extracted shared group section |
| `apps/frontend/src/features/characters/components/CharacterFilterBar.tsx` | Extracted shared filter bar |
| `apps/frontend/src/features/characters/components/FileAssignmentModal.tsx` | Unmatched file assignment grid |
| `apps/frontend/src/features/characters/components/ProjectConfirmModal.tsx` | Admin project creation confirmation |
| `apps/frontend/src/features/characters/hooks/useCharacterImportBase.ts` | Base import hook (no videos) |
| `apps/frontend/src/app/pages/CharactersPage.tsx` | Rewritten Creator page |
| `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx` | Refactored to use shared components |
| `apps/frontend/src/features/projects/components/CharacterCard.tsx` | Seed data completeness indicators |
| `apps/frontend/src/features/projects/hooks/use-character-import.ts` | Wraps base hook + adds videos |
| `apps/frontend/src/app/navigation.ts` | Prominent nav entry |

---

## Dependencies

### Existing Components to Reuse
- `CharacterCard` from `features/projects/components/CharacterCard.tsx`
- `ImportConfirmModal` from `features/projects/components/ImportConfirmModal.tsx`
- `ImportProgressBar` from `features/projects/components/ImportProgressBar.tsx`
- `FileDropZone` from `components/domain/FileDropZone.tsx`
- `MultiSelect`, `SearchInput`, `Toggle`, `Button` from `components/primitives`
- `Modal` from `components/composite`
- `useCharacterImport` phases 0–3.5 from `features/projects/hooks/use-character-import.ts`
- `useMetadataTemplates` from `features/settings/hooks/use-metadata-templates.ts`
- `useProjects` from `features/projects/hooks/use-projects.ts`
- `flattenMetadata`, `generateMetadata` from metadata utilities

### New Infrastructure Needed
- `CharacterGroupSection` shared component
- `CharacterFilterBar` shared component
- `FileAssignmentModal` component
- `ProjectConfirmModal` component
- `useCharacterImportBase` hook

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Shared Module Extraction — Tasks 1.1–1.4
2. Phase 2: File Assignment Modal — Tasks 2.1–2.2
3. Phase 3: Character Creator Page — Tasks 3.1–3.5
4. Phase 4: Polish & Backport — Tasks 4.1–4.2

**MVP Success Criteria:**
- Character Creator page renders at `/content/characters` with group/card layout
- Folder drop creates characters with seed images and metadata
- Unmatched files handled via assignment grid with thumbnail previews
- Admin users can auto-create projects from folder structure
- No duplication between Creator page and project characters tab
- Existing project import gains the file assignment grid

### Post-MVP Enhancements
- Speech text file support in folder import
- Inline metadata editing on Creator page
- Batch metadata generation via LLM refinement

---

## Notes

1. The shared module extraction (Phase 1) must be done first and verified before building the Creator page, to avoid diverging implementations.
2. `CharacterCard` gains an optional `seedDataStatus` prop — existing usages without it are unaffected.
3. The `useCharacterImportBase` hook should use the same `ImportProgress` type and phase reporting as the existing hook for UI consistency.
4. The `FileAssignmentModal` must generate thumbnail previews client-side using `URL.createObjectURL()` — no server round-trip needed.
5. Duplicate file guard in the assignment modal works by tracking which files are assigned and disabling them in other dropdowns.

---

## Version History

- **v1.0** (2026-03-16): Initial task list creation from PRD-135
