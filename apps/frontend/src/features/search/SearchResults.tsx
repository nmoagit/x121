/**
 * Search results list component (PRD-20).
 *
 * Displays ranked search results with entity type badges, highlighted
 * matching text, and pagination controls.
 */

import { Badge, Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Card } from "@/components/composite/Card";
import { entityTypeLabel, type SearchResponse, type SearchResultRow } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SearchResultsProps {
  data: SearchResponse | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onResultClick?: (result: SearchResultRow) => void;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BADGE_VARIANT_MAP: Record<string, "info" | "success" | "warning"> = {
  character: "info",
  project: "success",
  scene_type: "warning",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SearchResults({
  data,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onResultClick,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <p className="text-lg">No results found</p>
        <p className="text-sm mt-1">Try adjusting your search terms or filters</p>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total_count / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, data.total_count);

  return (
    <div className="flex-1 space-y-3">
      {/* Result count and timing */}
      <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
        <span>
          Showing {startItem}-{endItem} of {data.total_count} results
        </span>
        <span>{data.query_duration_ms}ms</span>
      </div>

      {/* Results list */}
      <Stack direction="vertical" gap={2}>
        {data.results.map((result) => (
          <div
            key={`${result.entity_type}-${result.entity_id}`}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => onResultClick?.(result)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onResultClick?.(result);
            }}
          >
            <Card className="transition-colors hover:bg-[var(--color-surface-tertiary)]">
              <Stack direction="horizontal" gap={2} align="center" className="mb-1">
                <Badge
                  size="sm"
                  variant={BADGE_VARIANT_MAP[result.entity_type] ?? "default"}
                >
                  {entityTypeLabel(result.entity_type)}
                </Badge>
                <span className="text-base font-medium text-[var(--color-text-primary)]">
                  {result.name}
                </span>
              </Stack>

              {result.headline ? (
                <p
                  className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: result.headline }}
                />
              ) : result.description ? (
                <p className="text-sm text-[var(--color-text-secondary)] mt-1 line-clamp-2">
                  {result.description}
                </p>
              ) : null}
            </Card>
          </div>
        ))}
      </Stack>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
