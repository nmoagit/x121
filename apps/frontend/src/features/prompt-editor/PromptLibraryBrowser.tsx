/**
 * Prompt library browser component (PRD-63).
 *
 * Displays a searchable list of prompt library entries with name, tags,
 * rating, usage count, and a "Copy to editor" action.
 */

import { useState } from "react";

import { Badge } from "@/components";

import type { PromptLibraryEntry } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PromptLibraryBrowserProps {
  /** Array of library entries to display. */
  entries: PromptLibraryEntry[];
  /** Callback when the user selects an entry to copy. */
  onSelect?: (entry: PromptLibraryEntry) => void;
  /** Current search term (controlled externally). */
  search?: string;
  /** Callback when the search input changes. */
  onSearchChange?: (value: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PromptLibraryBrowser({
  entries,
  onSelect,
  search = "",
  onSearchChange,
}: PromptLibraryBrowserProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div data-testid="prompt-library-browser" className="space-y-3">
      {/* Search input */}
      <input
        data-testid="library-search-input"
        type="text"
        value={search}
        onChange={(e) => onSearchChange?.(e.target.value)}
        className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
        placeholder="Search prompt library..."
      />

      {/* Empty state */}
      {entries.length === 0 && (
        <p
          data-testid="empty-state"
          className="py-6 text-center text-sm text-[var(--color-text-muted)]"
        >
          No prompt library entries found.
        </p>
      )}

      {/* Entry list */}
      {entries.map((entry) => (
        <div
          key={entry.id}
          data-testid={`library-entry-${entry.id}`}
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            {/* Info */}
            <div
              className="flex-1 cursor-pointer"
              onClick={() =>
                setExpandedId((prev) => (prev === entry.id ? null : entry.id))
              }
            >
              <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
                {entry.name}
              </h4>

              {/* Tags */}
              {entry.tags && entry.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="mt-1 flex gap-3 text-xs text-[var(--color-text-muted)]">
                {entry.avg_rating != null && (
                  <span data-testid={`rating-${entry.id}`}>
                    Rating: {entry.avg_rating.toFixed(1)}
                  </span>
                )}
                <span data-testid={`usage-${entry.id}`}>
                  Used: {entry.usage_count}x
                </span>
              </div>
            </div>

            {/* Copy button */}
            {onSelect && (
              <button
                data-testid={`select-btn-${entry.id}`}
                type="button"
                onClick={() => onSelect(entry)}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                Copy to Editor
              </button>
            )}
          </div>

          {/* Expanded details */}
          {expandedId === entry.id && (
            <div
              data-testid={`library-entry-details-${entry.id}`}
              className="mt-3 space-y-2 border-t border-[var(--color-border-subtle)] pt-3"
            >
              {entry.description && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {entry.description}
                </p>
              )}
              <div>
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Positive:
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-text-primary)]">
                  {entry.positive_prompt}
                </p>
              </div>
              {entry.negative_prompt && (
                <div>
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Negative:
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-text-primary)]">
                    {entry.negative_prompt}
                  </p>
                </div>
              )}
              {entry.model_compatibility && entry.model_compatibility.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Models:
                  </span>
                  {entry.model_compatibility.map((model) => (
                    <Badge key={model} variant="info">
                      {model}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
