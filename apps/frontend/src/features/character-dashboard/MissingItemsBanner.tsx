/**
 * Missing items banner component (PRD-108).
 *
 * Displays a prominent banner listing missing configuration items
 * for a character, with action buttons to resolve each one.
 */

import { Badge, Button } from "@/components";

import type { MissingItem } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MissingItemsBannerProps {
  /** List of missing items to display. */
  items: MissingItem[];
  /** Called when an action button is clicked. */
  onAction?: (item: MissingItem) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const CATEGORY_LABELS: Record<string, string> = {
  source_image: "Source Image",
  approved_variant: "Approved Variant",
  metadata_complete: "Metadata",
  pipeline_setting: "Setting",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MissingItemsBanner({
  items,
  onAction,
}: MissingItemsBannerProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="missing-items-banner"
      className="rounded-lg border border-[var(--color-border-warning)] bg-[var(--color-bg-warning)] p-4"
    >
      <p
        data-testid="missing-items-count"
        className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]"
      >
        {items.length} missing {items.length === 1 ? "item" : "items"} to resolve
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={`${item.category}-${item.label}`}
            data-testid={`missing-item-${item.category}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <Badge variant="warning" size="sm">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </Badge>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {item.label}
              </span>
            </span>
            {onAction && (
              <Button
                data-testid={`action-btn-${item.category}`}
                variant="ghost"
                size="sm"
                onClick={() => onAction(item)}
              >
                Resolve
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
