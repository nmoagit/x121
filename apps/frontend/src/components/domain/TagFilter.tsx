import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/primitives/Chip";
import { useCallback, useEffect, useState } from "react";
import { TagChip } from "./TagChip";
import type { TagWithCount } from "./TagChip";

type FilterLogic = "and" | "or";

interface TagFilterProps {
  /** Available tags to display. If not provided, fetched from the API. */
  availableTags?: TagWithCount[];
  /** Currently active tag filter IDs. */
  selectedTagIds: number[];
  /** Called when the selection changes. */
  onSelectionChange: (tagIds: number[]) => void;
  /** Current filter logic. Defaults to "or". */
  logic?: FilterLogic;
  /** Called when the filter logic changes. */
  onLogicChange?: (logic: FilterLogic) => void;
  /** Optional namespace filter for the available tags list. */
  namespace?: string;
  /** Pipeline ID for pipeline-scoped labels. */
  pipelineId?: number;
  className?: string;
}

/**
 * Tag filter panel for list views and search.
 *
 * Shows available tags as clickable chips. Selected tags are visually
 * highlighted and can be toggled on/off. An AND/OR logic toggle controls
 * whether entities must match all selected tags or any of them.
 */
export function TagFilter({
  availableTags: propTags,
  selectedTagIds,
  onSelectionChange,
  logic = "or",
  onLogicChange,
  namespace,
  pipelineId,
  className,
}: TagFilterProps) {
  const [fetchedTags, setFetchedTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(false);

  // Only show tags with usage_count > 0 (or currently selected)
  const tags = (propTags ?? fetchedTags).filter(
    (t) => t.usage_count > 0 || selectedTagIds.includes(t.id),
  );

  // Fetch available tags from the API if not provided via props.
  useEffect(() => {
    if (propTags) return;

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (namespace) params.set("namespace", namespace);
    if (pipelineId) params.set("pipeline_id", String(pipelineId));
    params.set("limit", "100");

    api
      .get<TagWithCount[]>(`/tags?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setFetchedTags(data);
      })
      .catch(() => {
        if (!cancelled) setFetchedTags([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propTags, namespace, pipelineId]);

  const toggleTag = useCallback(
    (tagId: number) => {
      if (selectedTagIds.includes(tagId)) {
        onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
      } else {
        onSelectionChange([...selectedTagIds, tagId]);
      }
    },
    [selectedTagIds, onSelectionChange],
  );

  const clearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const selectedSet = new Set(selectedTagIds);
  const hasSelection = selectedTagIds.length > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Header: logic toggle + clear */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Tags
        </span>
        <div className="flex items-center gap-2">
          {/* AND/OR toggle */}
          {onLogicChange && hasSelection && (
            <div
              className={cn(
                "flex items-center rounded-[var(--radius-full)]",
                "border border-[var(--color-border-default)]",
                "overflow-hidden text-xs",
              )}
            >
              <button
                type="button"
                onClick={() => onLogicChange("or")}
                className={cn(
                  "px-2 py-0.5 transition-colors duration-100",
                  logic === "or"
                    ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                    : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
                )}
              >
                OR
              </button>
              <button
                type="button"
                onClick={() => onLogicChange("and")}
                className={cn(
                  "px-2 py-0.5 transition-colors duration-100",
                  logic === "and"
                    ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                    : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
                )}
              >
                AND
              </button>
            </div>
          )}

          {/* Clear button */}
          {hasSelection && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-100"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tag list */}
      {loading ? (
        <div className="text-sm text-[var(--color-text-muted)]">Loading tags...</div>
      ) : tags.length === 0 ? (
        <div className="text-sm text-[var(--color-text-muted)]">No tags available</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const isSelected = selectedSet.has(tag.id);
            return (
              <Chip
                key={tag.id}
                size="sm"
                color={tag.color}
                active={isSelected}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.display_name}
                <span className="text-[0.6rem] leading-none opacity-50">{tag.usage_count}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {/* Active filters summary */}
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--color-border-default)]">
          <span className="text-xs text-[var(--color-text-muted)] mr-1">Active:</span>
          {selectedTagIds.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return <TagChip key={tag.id} tag={tag} size="sm" onRemove={() => toggleTag(tag.id)} />;
          })}
        </div>
      )}
    </div>
  );
}

export type { TagFilterProps, FilterLogic };
