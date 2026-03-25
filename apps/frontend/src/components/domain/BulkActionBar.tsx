import type { ReactNode } from "react";

import { Button } from "@/components/primitives";
import { CheckCircle, Download, Minus, Tag, X, XCircle } from "@/tokens/icons";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  selectAllMatching: boolean;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onAddLabel: () => void;
  onRemoveLabel: () => void;
  onExport: () => void;
  onClearSelection: () => void;
  onSelectAllMatching: () => void;
  isAllPageSelected: boolean;
  pageItemCount: number;
  /** Optional content rendered above the action row (e.g. ExportStatusPanel). */
  children?: ReactNode;
}

/**
 * Sticky action bar shown at the bottom of the viewport when items are
 * bulk-selected on browse pages. Provides approve, reject, label, and
 * export actions.
 */
export function BulkActionBar({
  selectedCount,
  totalCount,
  selectAllMatching,
  onApproveAll,
  onRejectAll,
  onAddLabel,
  onRemoveLabel,
  onExport,
  onClearSelection,
  onSelectAllMatching,
  isAllPageSelected,
  pageItemCount,
  children,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const showSelectAllBanner = isAllPageSelected && !selectAllMatching && totalCount > pageItemCount;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0d1117] border-t border-[var(--color-border-default)]">
      {/* "Select all matching" banner */}
      {showSelectAllBanner && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-[#161b22] border-b border-[var(--color-border-default)] font-mono text-xs text-[var(--color-text-muted)]">
          <span>All {pageItemCount} items on this page are selected.</span>
          <button
            type="button"
            onClick={onSelectAllMatching}
            className="text-[var(--color-action-primary)] hover:underline font-medium"
          >
            Select all {totalCount} matching
          </button>
        </div>
      )}

      {/* Optional slot (e.g. export status panel) */}
      {children}

      {/* Action row */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        {/* Selection count */}
        <span className="font-mono text-xs font-medium text-[var(--color-text-primary)] shrink-0">
          {selectAllMatching
            ? `All ${totalCount} matching selected`
            : `${selectedCount} selected`}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            icon={<CheckCircle size={12} />}
            onClick={onApproveAll}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<XCircle size={12} />}
            onClick={onRejectAll}
          >
            Reject
          </Button>
          <span className="w-px h-4 bg-[var(--color-border-default)]" />
          <Button
            variant="ghost"
            size="xs"
            icon={<Tag size={12} />}
            onClick={onAddLabel}
          >
            +Label
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<Minus size={12} />}
            onClick={onRemoveLabel}
          >
            -Label
          </Button>
          <span className="w-px h-4 bg-[var(--color-border-default)]" />
          <Button
            variant="ghost"
            size="xs"
            icon={<Download size={12} />}
            onClick={onExport}
          >
            Export
          </Button>
        </div>

        {/* Clear */}
        <Button
          variant="ghost"
          size="xs"
          icon={<X size={12} />}
          onClick={onClearSelection}
          className="shrink-0"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

export type { BulkActionBarProps };
