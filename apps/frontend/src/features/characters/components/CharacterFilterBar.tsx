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

  /** Whether characters with all-green readiness indicators are hidden. */
  hideComplete?: boolean;
  /** Toggle the hide-complete flag. Omit to hide this toggle. */
  onToggleHideComplete?: () => void;

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
  /** Called when the user clicks "Clear filters". Resets search, project, and group filters. */
  onClearFilters?: () => void;
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
  hideComplete,
  onToggleHideComplete,
  auditView,
  onAuditViewChange,
  projectOptions,
  projectFilter,
  onProjectFilterChange,
  selectedCount = 0,
  onClearSelection,
  onClearFilters,
}: CharacterFilterBarProps) {
  // Build active filter summary
  const activeFilters: string[] = [];
  if (searchQuery.trim()) {
    activeFilters.push(`"${searchQuery.trim()}"`);
  }
  if (projectOptions && (projectFilter?.length ?? 0) > 0) {
    const names = projectFilter!.map((v) => projectOptions.find((o) => o.value === v)?.label ?? v);
    activeFilters.push(names.join(", "));
  }
  if (groupFilter.length > 0) {
    const names = groupFilter.map((v) => groupOptions.find((o) => o.value === v)?.label ?? v);
    activeFilters.push(names.join(", "));
  }
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
      <SearchInput
        placeholder="Search models..."
        value={searchQuery}
        onChange={onSearchChange}
        size="sm"
        className="flex-1 min-w-[200px] max-w-[280px]"
      />
      {projectOptions && onProjectFilterChange && (
        <MultiSelect
          options={projectOptions}
          selected={projectFilter ?? []}
          onChange={onProjectFilterChange}
          placeholder="All Projects"
          showChips={false}
          className="w-[160px]"
        />
      )}
      <MultiSelect
        options={groupOptions}
        selected={groupFilter}
        onChange={onGroupFilterChange}
        placeholder="All Groups"
        showChips={false}
        disabled={!!projectOptions && (projectFilter?.length ?? 0) === 0}
        className="w-[160px]"
      />
      <Button
        size="sm"
        variant="ghost"
        icon={allCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        onClick={onToggleCollapseAll}
      >
        {allCollapsed ? "Expand All" : "Collapse All"}
      </Button>
      <div className="flex items-center gap-[var(--spacing-3)]">
        <Toggle
          checked={showDisabled}
          onChange={onToggleShowDisabled}
          label="Show disabled"
          size="sm"
        />
        {onToggleHideComplete != null && (
          <Toggle
            checked={hideComplete ?? false}
            onChange={onToggleHideComplete}
            label="Hide complete"
            size="sm"
          />
        )}
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
    {/* Active filter summary — fixed height to prevent shift */}
    <div className="h-5 text-xs text-[var(--color-text-muted)] flex items-center gap-2">
      <span className="truncate">
        {hasActiveFilters ? activeFilters.join(" · ") : "\u00A0"}
      </span>
      {hasActiveFilters && onClearFilters && (
        <button
          type="button"
          className={INLINE_LINK_BTN + " shrink-0"}
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
    </div>
  );
}
