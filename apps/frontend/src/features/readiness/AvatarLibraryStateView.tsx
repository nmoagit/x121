/**
 * Avatar library state view component (PRD-107).
 *
 * Displays a table of avatars with their readiness state, missing items,
 * and filtering/sorting controls. Integrates as a tab within the avatar
 * library (PRD-60).
 */

import { useState } from "react";

import { Button, Select } from "@/components";

import { MissingItemTags } from "./MissingItemTags";
import { ReadinessStateBadge } from "./ReadinessStateBadge";
import { ReadinessSummaryBar } from "./ReadinessSummaryBar";
import type { AvatarReadinessCache, ReadinessState, ReadinessSummary } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AvatarRow {
  id: number;
  name: string;
  thumbnail_path?: string | null;
  readiness?: AvatarReadinessCache;
}

interface AvatarLibraryStateViewProps {
  /** Avatar rows with optional readiness data. */
  avatars: AvatarRow[];
  /** Readiness summary for the header bar. */
  summary?: ReadinessSummary;
  /** Callback when a missing item tag is clicked. */
  onMissingItemClick?: (avatarId: number, item: string) => void;
  /** Callback when a avatar row is clicked. */
  onAvatarClick?: (avatarId: number) => void;
}

/* --------------------------------------------------------------------------
   Sort options
   -------------------------------------------------------------------------- */

type SortField = "name" | "readiness_pct" | "state";
type SortDir = "asc" | "desc";

const STATE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All states" },
  { value: "ready", label: "Ready" },
  { value: "partially_ready", label: "Partially Ready" },
  { value: "not_started", label: "Not Started" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarLibraryStateView({
  avatars,
  summary,
  onMissingItemClick,
  onAvatarClick,
}: AvatarLibraryStateViewProps) {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("readiness_pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filter avatars.
  const filtered =
    stateFilter === "all"
      ? avatars
      : avatars.filter((c) => c.readiness?.state === stateFilter);

  // Sort avatars.
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;

    if (sortField === "name") {
      return a.name.localeCompare(b.name) * dir;
    }
    if (sortField === "readiness_pct") {
      const aPct = a.readiness?.readiness_pct ?? -1;
      const bPct = b.readiness?.readiness_pct ?? -1;
      return (aPct - bPct) * dir;
    }
    // state ordering: not_started < partially_ready < ready
    const stateOrder: Record<ReadinessState, number> = {
      not_started: 0,
      partially_ready: 1,
      ready: 2,
    };
    const aOrd = a.readiness ? stateOrder[a.readiness.state] : -1;
    const bOrd = b.readiness ? stateOrder[b.readiness.state] : -1;
    return (aOrd - bOrd) * dir;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div data-testid="avatar-library-state-view" className="space-y-4">
      {/* Summary bar */}
      {summary && <ReadinessSummaryBar summary={summary} />}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div data-testid="state-filter" className="w-48">
          <Select
            value={stateFilter}
            onChange={(value) => setStateFilter(value)}
            options={STATE_FILTER_OPTIONS}
          />
        </div>

        <Button
          data-testid="sort-name-btn"
          variant="secondary"
          size="sm"
          onClick={() => toggleSort("name")}
        >
          Name {sortField === "name" ? (sortDir === "asc" ? "^" : "v") : ""}
        </Button>
        <Button
          data-testid="sort-pct-btn"
          variant="secondary"
          size="sm"
          onClick={() => toggleSort("readiness_pct")}
        >
          % Ready{" "}
          {sortField === "readiness_pct"
            ? sortDir === "asc"
              ? "^"
              : "v"
            : ""}
        </Button>
      </div>

      {/* Avatar list */}
      <div data-testid="avatar-list" className="space-y-2">
        {sorted.length === 0 && (
          <p
            data-testid="empty-state"
            className="py-4 text-center text-sm text-[var(--color-text-muted)]"
          >
            No avatars match the current filter.
          </p>
        )}

        {sorted.map((avatar) => (
          <div
            key={avatar.id}
            data-testid={`avatar-row-${avatar.id}`}
            className="flex items-center gap-3 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
          >
            {/* Thumbnail */}
            {avatar.thumbnail_path && (
              <img
                src={avatar.thumbnail_path}
                alt={avatar.name}
                className="h-10 w-10 rounded object-cover"
              />
            )}

            {/* Name */}
            <button
              type="button"
              data-testid={`avatar-name-${avatar.id}`}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--color-text-primary)]"
              onClick={() => onAvatarClick?.(avatar.id)}
            >
              {avatar.name}
            </button>

            {/* Readiness badge */}
            {avatar.readiness ? (
              <ReadinessStateBadge
                state={avatar.readiness.state}
                missingItems={avatar.readiness.missing_items}
              />
            ) : (
              <span className="text-xs text-[var(--color-text-muted)]">
                No data
              </span>
            )}

            {/* Missing item tags */}
            {avatar.readiness &&
              avatar.readiness.missing_items.length > 0 && (
                <div
                  className="flex flex-wrap gap-1"
                  onClick={(e) => {
                    const tag = (e.target as HTMLElement).closest(
                      "[data-testid^='missing-tag-']",
                    );
                    if (tag) {
                      const item = tag
                        .getAttribute("data-testid")
                        ?.replace("missing-tag-", "");
                      if (item) onMissingItemClick?.(avatar.id, item);
                    }
                  }}
                >
                  <MissingItemTags
                    items={avatar.readiness.missing_items}
                    maxVisible={3}
                  />
                </div>
              )}

            {/* Percentage */}
            {avatar.readiness && (
              <span
                data-testid={`readiness-pct-${avatar.id}`}
                className="text-xs tabular-nums text-[var(--color-text-muted)]"
              >
                {avatar.readiness.readiness_pct}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
