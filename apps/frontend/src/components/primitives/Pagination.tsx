/**
 * Shared pagination controls — page-size selector, numbered page buttons,
 * and "Showing X - Y of Z" summary.
 *
 * Replaces inline pagination across all paginated pages for consistency.
 */

import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_PAGE_SIZES = [25, 50, 100] as const;

/** Max page buttons to show before collapsing with ellipsis. */
const MAX_VISIBLE_PAGES = 7;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PaginationProps {
  /** Current 0-based page index. */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total item count. */
  total: number;
  /** Called when the page changes. */
  onPageChange: (page: number) => void;
  /** Called when page size changes. Resets page to 0 internally. */
  onPageSizeChange: (size: number) => void;
  /** Available page sizes. @default [25, 50, 100] */
  pageSizes?: readonly number[];
  /** Additional class for the wrapper. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Build the array of page numbers / ellipsis markers to render.
 * Always shows first, last, and a window around the current page.
 */
function buildPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages: (number | "ellipsis")[] = [];
  const leftBound = Math.max(1, currentPage - 1);
  const rightBound = Math.min(totalPages - 2, currentPage + 1);

  // Always show first page
  pages.push(0);

  if (leftBound > 1) pages.push("ellipsis");

  for (let i = leftBound; i <= rightBound; i++) {
    pages.push(i);
  }

  if (rightBound < totalPages - 2) pages.push("ellipsis");

  // Always show last page
  if (totalPages > 1) pages.push(totalPages - 1);

  return pages;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  const pageNumbers = useMemo(
    () => buildPageNumbers(page, totalPages),
    [page, totalPages],
  );

  if (total === 0) return null;

  const btnBase =
    "flex items-center justify-center h-6 min-w-6 px-1.5 rounded-[var(--radius-sm)] font-mono text-[11px] transition-colors";
  const btnInactive =
    "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]";
  const btnActive =
    "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]";
  const btnDisabled = "opacity-30 pointer-events-none";

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-[var(--color-border-default)]/30 px-4 py-2",
        className,
      )}
    >
      {/* Left: summary + page-size selector */}
      <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--color-text-muted)]">
        <span>
          {from}–{to} of {total}
        </span>
        <select
          value={String(pageSize)}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(0);
          }}
          className={cn(
            "appearance-none bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)] rounded-[var(--radius-sm)]",
            "px-1.5 py-0.5 pr-5 text-[11px] font-mono",
            "focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]",
          )}
        >
          {pageSizes.map((s) => (
            <option key={s} value={String(s)}>
              {s} / page
            </option>
          ))}
        </select>
      </div>

      {/* Right: page navigation */}
      <div className="flex items-center gap-0.5">
        {/* Previous */}
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className={cn(btnBase, page === 0 ? btnDisabled : btnInactive)}
          aria-label="Previous page"
        >
          <ChevronLeft size={12} />
        </button>

        {/* Numbered pages */}
        {pageNumbers.map((item, idx) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex items-center justify-center h-6 w-4 font-mono text-[11px] text-[var(--color-text-muted)]"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={cn(btnBase, item === page ? btnActive : btnInactive)}
              aria-label={`Page ${item + 1}`}
              aria-current={item === page ? "page" : undefined}
            >
              {item + 1}
            </button>
          ),
        )}

        {/* Next */}
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className={cn(btnBase, page >= totalPages - 1 ? btnDisabled : btnInactive)}
          aria-label="Next page"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
