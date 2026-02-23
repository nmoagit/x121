/**
 * Missing item tags component (PRD-107).
 *
 * Displays a compact list of missing item tags for a character.
 */

import { Badge } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MissingItemTagsProps {
  /** List of missing item labels (e.g. "source_image", "a2c4_model"). */
  items: string[];
  /** Maximum number of tags to show before "+N more". */
  maxVisible?: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatLabel(item: string): string {
  return item.replace(/_/g, " ");
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MissingItemTags({
  items,
  maxVisible = 5,
}: MissingItemTagsProps) {
  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <div data-testid="missing-item-tags" className="flex flex-wrap gap-1">
      {visible.map((item) => (
        <span key={item} data-testid={`missing-tag-${item}`}>
          <Badge variant="default" size="sm">
            {formatLabel(item)}
          </Badge>
        </span>
      ))}
      {remaining > 0 && (
        <span data-testid="missing-tag-overflow">
          <Badge variant="default" size="sm">
            +{remaining} more
          </Badge>
        </span>
      )}
    </div>
  );
}
