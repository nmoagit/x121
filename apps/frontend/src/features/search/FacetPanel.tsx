/**
 * Faceted filter panel for search results (PRD-20).
 *
 * Displays collapsible facet groups with counts for entity type, project,
 * status, and tags. Clicking a facet value toggles it as an active filter.
 */

import { useState, useCallback } from "react";

import { Badge, Button } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { entityTypeLabel, type SearchFacets, type FacetValue } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface ActiveFilters {
  entity_types?: string[];
  project?: string;
  status?: string;
  tags?: string[];
}

interface FacetPanelProps {
  facets: SearchFacets;
  activeFilters: ActiveFilters;
  onFilterChange: (filters: ActiveFilters) => void;
}

/* --------------------------------------------------------------------------
   FacetGroup sub-component
   -------------------------------------------------------------------------- */

interface FacetGroupProps {
  title: string;
  values: FacetValue[];
  activeValues: string[];
  onToggle: (value: string) => void;
  labelFn?: (value: string) => string;
}

function FacetGroup({
  title,
  values,
  activeValues,
  onToggle,
  labelFn,
}: FacetGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (values.length === 0) return null;

  return (
    <div className="border-b border-[var(--color-border-subtle)] pb-3">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between py-2 text-sm font-medium text-[var(--color-text-primary)]"
        aria-expanded={!collapsed}
      >
        <span>{title}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {collapsed ? "+" : "-"}
        </span>
      </button>

      {!collapsed && (
        <Stack direction="vertical" gap={1}>
          {values.map((facet) => {
            const isActive = activeValues.includes(facet.value);
            const label = labelFn ? labelFn(facet.value) : facet.value;
            return (
              <button
                key={facet.value}
                type="button"
                onClick={() => onToggle(facet.value)}
                className={`flex items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--color-action-primary)]/15 text-[var(--color-action-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                }`}
              >
                <span className="truncate">{label}</span>
                <Badge size="sm" variant={isActive ? "info" : "default"}>
                  {facet.count}
                </Badge>
              </button>
            );
          })}
        </Stack>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   FacetPanel
   -------------------------------------------------------------------------- */

export function FacetPanel({
  facets,
  activeFilters,
  onFilterChange,
}: FacetPanelProps) {
  const toggleEntityType = useCallback(
    (value: string) => {
      const current = activeFilters.entity_types ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      onFilterChange({ ...activeFilters, entity_types: next });
    },
    [activeFilters, onFilterChange],
  );

  const toggleProject = useCallback(
    (value: string) => {
      const next =
        activeFilters.project === value ? undefined : value;
      onFilterChange({ ...activeFilters, project: next });
    },
    [activeFilters, onFilterChange],
  );

  const hasActiveFilters =
    (activeFilters.entity_types?.length ?? 0) > 0 ||
    activeFilters.project !== undefined ||
    activeFilters.status !== undefined ||
    (activeFilters.tags?.length ?? 0) > 0;

  return (
    <aside className="w-60 shrink-0 space-y-1">
      {hasActiveFilters && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Active Filters
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFilterChange({})}
          >
            Clear all
          </Button>
        </div>
      )}

      <FacetGroup
        title="Entity Type"
        values={facets.entity_types}
        activeValues={activeFilters.entity_types ?? []}
        onToggle={toggleEntityType}
        labelFn={entityTypeLabel}
      />

      <FacetGroup
        title="Project"
        values={facets.projects}
        activeValues={activeFilters.project ? [activeFilters.project] : []}
        onToggle={toggleProject}
      />

      <FacetGroup
        title="Status"
        values={facets.statuses}
        activeValues={activeFilters.status ? [activeFilters.status] : []}
        onToggle={(value) =>
          onFilterChange({
            ...activeFilters,
            status: activeFilters.status === value ? undefined : value,
          })
        }
      />

      <FacetGroup
        title="Tags"
        values={facets.tags}
        activeValues={activeFilters.tags ?? []}
        onToggle={(value) => {
          const current = activeFilters.tags ?? [];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          onFilterChange({ ...activeFilters, tags: next });
        }}
      />
    </aside>
  );
}
