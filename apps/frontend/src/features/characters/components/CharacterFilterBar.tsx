/**
 * Reusable filter bar for character grids (PRD-135).
 *
 * Extracted from ProjectCharactersTab so both the project tab and
 * Character Creator page can share the same filter controls.
 */

import { Button, MultiSelect, SearchInput, Toggle } from "@/components/primitives";
import type { MultiSelectOption } from "@/components/primitives";
import { INLINE_LINK_BTN } from "@/lib/ui-classes";
import { ChevronDown, ChevronUp } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface CharacterFilterBarProps {
  /** Current search query text. */
  searchQuery: string;
  /** Called when the search text changes. */
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  /** Group filter options for the MultiSelect. */
  groupOptions: MultiSelectOption[];
  /** Currently selected group filter values. */
  groupFilter: string[];
  /** Called when the group filter changes. */
  onGroupFilterChange: (values: string[]) => void;

  /** Whether all groups are currently collapsed. */
  allCollapsed: boolean;
  /** Toggle collapse/expand all groups. */
  onToggleCollapseAll: () => void;

  /** Whether disabled characters are shown. */
  showDisabled: boolean;
  /** Toggle the show-disabled flag. */
  onToggleShowDisabled: () => void;

  /** Whether audit view is active. Omit `onAuditViewChange` to hide the toggle. */
  auditView?: boolean;
  /** Called when audit view is toggled. Provide to show the audit view toggle. */
  onAuditViewChange?: () => void;

  /** Project filter options. Provide to show the project filter MultiSelect. */
  projectOptions?: MultiSelectOption[];
  /** Currently selected project filter values. */
  projectFilter?: string[];
  /** Called when the project filter changes. */
  onProjectFilterChange?: (values: string[]) => void;

  /** Number of selected characters. Show count + clear when > 0. */
  selectedCount?: number;
  /** Called when the user clicks "Clear" on the selection count. */
  onClearSelection?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterFilterBar({
  searchQuery,
  onSearchChange,
  groupOptions,
  groupFilter,
  onGroupFilterChange,
  allCollapsed,
  onToggleCollapseAll,
  showDisabled,
  onToggleShowDisabled,
  auditView,
  onAuditViewChange,
  projectOptions,
  projectFilter,
  onProjectFilterChange,
  selectedCount = 0,
  onClearSelection,
}: CharacterFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
      <SearchInput
        placeholder="Search characters..."
        value={searchQuery}
        onChange={onSearchChange}
        size="sm"
        className="flex-1 min-w-[200px] max-w-[280px]"
      />
      <MultiSelect
        options={groupOptions}
        selected={groupFilter}
        onChange={onGroupFilterChange}
        placeholder="All Groups"
        className="w-[160px]"
      />
      {projectOptions && onProjectFilterChange && (
        <MultiSelect
          options={projectOptions}
          selected={projectFilter ?? []}
          onChange={onProjectFilterChange}
          placeholder="All Projects"
          className="w-[160px]"
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={allCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        onClick={onToggleCollapseAll}
      >
        {allCollapsed ? "Expand All" : "Collapse All"}
      </Button>
      <div className="flex items-center gap-[var(--spacing-3)] self-end pb-[3px]">
        <Toggle
          checked={showDisabled}
          onChange={onToggleShowDisabled}
          label="Show disabled"
          size="sm"
        />
        {onAuditViewChange != null && (
          <Toggle
            checked={auditView ?? false}
            onChange={onAuditViewChange}
            label="Audit view"
            size="sm"
          />
        )}
        {selectedCount > 0 && onClearSelection && (
          <span className="text-sm text-[var(--color-text-muted)] flex items-center gap-[var(--spacing-2)]">
            {selectedCount} selected
            <button
              type="button"
              className={INLINE_LINK_BTN}
              onClick={onClearSelection}
            >
              Clear
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
