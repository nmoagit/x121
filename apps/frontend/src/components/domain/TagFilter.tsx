import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/primitives/Chip";
import { Settings } from "@/tokens/icons";

import { LabelManagerModal } from "./LabelManagerModal";
import { TagChip } from "./TagChip";
import type { TagWithCount } from "./TagChip";

/** Shared query key factory for tags. Invalidate with `queryClient.invalidateQueries({ queryKey: tagKeys.list() })`. */
export const tagKeys = {
  list: (pipelineId?: number, namespace?: string) =>
    ["tags", "list", pipelineId ?? null, namespace ?? null] as const,
};

type FilterLogic = "and" | "or";

/** Tag filter state: neutral (not filtered), include (show only), exclude (hide). */
type TagFilterState = "neutral" | "include" | "exclude";

interface TagFilterProps {
  /** Available tags to display. If not provided, fetched from the API. */
  availableTags?: TagWithCount[];
  /** Currently included tag filter IDs. */
  selectedTagIds: number[];
  /** Called when the include selection changes. */
  onSelectionChange: (tagIds: number[]) => void;
  /** Currently excluded tag filter IDs. */
  excludedTagIds?: number[];
  /** Called when the exclude selection changes. */
  onExclusionChange?: (tagIds: number[]) => void;
  /** Current filter logic. Defaults to "or". */
  logic?: FilterLogic;
  /** Called when the filter logic changes. */
  onLogicChange?: (logic: FilterLogic) => void;
  /** Optional namespace filter for the available tags list. */
  namespace?: string;
  /** Pipeline ID for pipeline-scoped labels. */
  pipelineId?: number;
  /** When set, only show tags with usage on this entity type (e.g., "scene_video_version", "media_variant"). */
  entityType?: string;
  className?: string;
}

/**
 * Tag filter panel for list views and search.
 *
 * Tags cycle through three states on click:
 * - **Neutral** → not filtering
 * - **Include** (active/green) → show items with this tag
 * - **Exclude** (red/strikethrough) → hide items with this tag
 *
 * Click cycles: neutral → include → exclude → neutral.
 */
export function TagFilter({
  availableTags: propTags,
  selectedTagIds,
  onSelectionChange,
  excludedTagIds = [],
  onExclusionChange,
  logic = "or",
  onLogicChange,
  namespace,
  pipelineId,
  entityType,
  className,
}: TagFilterProps) {
  const queryClient = useQueryClient();
  const [managerOpen, setManagerOpen] = useState(false);

  const { data: fetchedTags = [], isLoading: loading } = useQuery({
    queryKey: [...tagKeys.list(pipelineId, namespace), entityType ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (namespace) params.set("namespace", namespace);
      if (pipelineId) params.set("pipeline_id", String(pipelineId));
      if (entityType) params.set("entity_type", entityType);
      params.set("limit", "200");
      return api.get<TagWithCount[]>(`/tags?${params.toString()}`);
    },
    enabled: !propTags,
  });

  const tags = (propTags ?? fetchedTags).filter(
    (t) => t.usage_count > 0 || selectedTagIds.includes(t.id) || excludedTagIds.includes(t.id),
  );

  /** Get the current filter state for a tag. */
  const getTagState = useCallback(
    (tagId: number): TagFilterState => {
      if (selectedTagIds.includes(tagId)) return "include";
      if (excludedTagIds.includes(tagId)) return "exclude";
      return "neutral";
    },
    [selectedTagIds, excludedTagIds],
  );

  /** Cycle tag state: neutral → include → exclude → neutral. */
  const cycleTag = useCallback(
    (tagId: number) => {
      const state = getTagState(tagId);
      if (state === "neutral") {
        // → include
        onSelectionChange([...selectedTagIds, tagId]);
      } else if (state === "include") {
        // → exclude (if exclusion is supported, otherwise → neutral)
        onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
        if (onExclusionChange) {
          onExclusionChange([...excludedTagIds, tagId]);
        }
      } else {
        // exclude → neutral
        if (onExclusionChange) {
          onExclusionChange(excludedTagIds.filter((id) => id !== tagId));
        }
      }
    },
    [getTagState, selectedTagIds, excludedTagIds, onSelectionChange, onExclusionChange],
  );

  const clearAll = useCallback(() => {
    onSelectionChange([]);
    onExclusionChange?.([]);
  }, [onSelectionChange, onExclusionChange]);

  const hasSelection = selectedTagIds.length > 0 || excludedTagIds.length > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Header: logic toggle + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Tags
          </span>
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
            title="Manage tags"
          >
            <Settings size={12} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* AND/OR toggle */}
          {onLogicChange && selectedTagIds.length > 0 && (
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
            const state = getTagState(tag.id);
            return (
              <Chip
                key={tag.id}
                size="sm"
                color={state === "exclude" ? undefined : tag.color}
                active={state === "include"}
                onClick={() => cycleTag(tag.id)}
                className={cn(
                  state === "exclude" && "border-red-500/60 text-red-400/70 line-through",
                )}
              >
                {state === "exclude" && (
                  <span className="text-red-400 no-underline mr-0.5">−</span>
                )}
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
          {selectedTagIds.length > 0 && (
            <>
              <span className="text-xs text-[var(--color-text-muted)] mr-1">Include:</span>
              {selectedTagIds.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return <TagChip key={tag.id} tag={tag} size="sm" onRemove={() => cycleTag(tag.id)} />;
              })}
            </>
          )}
          {excludedTagIds.length > 0 && (
            <>
              <span className="text-xs text-red-400/70 mr-1">{selectedTagIds.length > 0 ? "| Exclude:" : "Exclude:"}</span>
              {excludedTagIds.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <TagChip
                    key={tag.id}
                    tag={{ ...tag, color: null }}
                    size="sm"
                    onRemove={() => cycleTag(tag.id)}
                    className="line-through text-red-400/70"
                  />
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Tag manager modal */}
      <LabelManagerModal
        open={managerOpen}
        onClose={() => {
          setManagerOpen(false);
          queryClient.invalidateQueries({ queryKey: tagKeys.list(pipelineId, namespace) });
        }}
        pipelineId={pipelineId}
      />
    </div>
  );
}

export type { TagFilterProps, FilterLogic };
