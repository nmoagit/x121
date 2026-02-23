/**
 * Test shot gallery component (PRD-58).
 *
 * Displays a grid of test shot cards with video thumbnails, quality badges,
 * parameter tooltips, and promote/delete actions. Supports filtering by
 * character and sorting by date or quality.
 */

import { useState } from "react";

import { Badge } from "@/components";

import type { TestShot, TestShotStatus } from "./types";
import { TEST_SHOT_STATUS_LABELS, testShotStatusVariant } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

type SortField = "date" | "quality";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TestShotGalleryProps {
  /** Array of test shots to display. */
  testShots: TestShot[];
  /** Callback when the promote button is clicked. */
  onPromote?: (id: number) => void;
  /** Callback when the delete button is clicked. */
  onDelete?: (id: number) => void;
  /** Whether a promote mutation is currently in-flight. */
  isPromoting?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TestShotGallery({
  testShots,
  onPromote,
  onDelete,
  isPromoting = false,
}: TestShotGalleryProps) {
  const [characterFilter, setCharacterFilter] = useState<number | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortField>("date");

  // Derive unique character IDs for filter options.
  const characterIds = [
    ...new Set(testShots.map((ts) => ts.character_id)),
  ].sort((a, b) => a - b);

  // Filter.
  const filtered =
    characterFilter === "all"
      ? testShots
      : testShots.filter((ts) => ts.character_id === characterFilter);

  // Sort.
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "quality") {
      return (b.quality_score ?? 0) - (a.quality_score ?? 0);
    }
    // Default: newest first.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div data-testid="test-shot-gallery" className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Character filter */}
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          Character:
          <select
            data-testid="character-filter"
            value={characterFilter}
            onChange={(e) =>
              setCharacterFilter(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {characterIds.map((cid) => (
              <option key={cid} value={cid}>
                Character {cid}
              </option>
            ))}
          </select>
        </label>

        {/* Sort control */}
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          Sort by:
          <select
            data-testid="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm"
          >
            <option value="date">Date</option>
            <option value="quality">Quality</option>
          </select>
        </label>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <p
          data-testid="empty-state"
          className="py-8 text-center text-sm text-[var(--color-text-muted)]"
        >
          No test shots yet. Generate one to get started.
        </p>
      )}

      {/* Grid */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((shot) => (
            <TestShotCard
              key={shot.id}
              shot={shot}
              onPromote={onPromote}
              onDelete={onDelete}
              isPromoting={isPromoting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Card component
   -------------------------------------------------------------------------- */

interface TestShotCardProps {
  shot: TestShot;
  onPromote?: (id: number) => void;
  onDelete?: (id: number) => void;
  isPromoting: boolean;
}

function TestShotCard({
  shot,
  onPromote,
  onDelete,
  isPromoting,
}: TestShotCardProps) {
  const status = deriveStatus(shot);
  const qualityPct =
    shot.quality_score != null ? Math.round(shot.quality_score * 100) : null;

  return (
    <div
      data-testid={`test-shot-card-${shot.id}`}
      className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)]"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-[var(--color-surface-tertiary)]">
        {shot.last_frame_path ? (
          <img
            src={shot.last_frame_path}
            alt={`Test shot ${shot.id} preview`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-muted)]">
            No preview
          </div>
        )}

        {/* Quality badge overlay */}
        {qualityPct != null && (
          <span
            data-testid={`quality-score-${shot.id}`}
            className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white"
          >
            {qualityPct}%
          </span>
        )}
      </div>

      {/* Info area */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <Badge variant={testShotStatusVariant(status)}>
            {TEST_SHOT_STATUS_LABELS[status]}
          </Badge>
          {shot.is_promoted && (
            <Badge data-testid={`promoted-badge-${shot.id}`} variant="success">
              Promoted
            </Badge>
          )}
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          <p>Character: {shot.character_id}</p>
          {shot.duration_secs != null && (
            <p>Duration: {shot.duration_secs.toFixed(1)}s</p>
          )}
          <p title={JSON.stringify(shot.parameters, null, 2)}>
            Params: {Object.keys(shot.parameters).length} keys
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!shot.is_promoted && onPromote && (
            <button
              data-testid={`promote-btn-${shot.id}`}
              type="button"
              disabled={isPromoting}
              onClick={() => onPromote(shot.id)}
              className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Promote
            </button>
          )}
          {onDelete && (
            <button
              data-testid={`delete-btn-${shot.id}`}
              type="button"
              onClick={() => onDelete(shot.id)}
              className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Derive the display status from a test shot's fields. */
function deriveStatus(shot: TestShot): TestShotStatus {
  if (shot.is_promoted) return "promoted";
  if (shot.output_video_path) return "completed";
  // If no output yet, treat as pending (actual generating state would
  // come from a job status in production).
  return "pending";
}
