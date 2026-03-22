/**
 * Breadcrumb navigation for treemap drill-down (PRD-19).
 *
 * Shows the current hierarchy path (e.g. Root > Project > Avatar)
 * and allows clicking any ancestor to navigate up.
 */

import { ChevronRight } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface BreadcrumbItem {
  label: string;
  entityType?: string;
  entityId?: number;
}

interface TreemapBreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TreemapBreadcrumbs({ items, onNavigate }: TreemapBreadcrumbsProps) {
  return (
    <nav aria-label="Treemap breadcrumbs" className="flex items-center gap-1 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.entityType ?? "root"}-${item.entityId ?? 0}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight
                size={iconSizes.sm}
                className="text-[var(--color-text-muted)]"
                aria-hidden="true"
              />
            )}
            {isLast ? (
              <span className="font-medium text-[var(--color-text-primary)]">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(index)}
                className="text-[var(--color-action-primary)] hover:underline"
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
