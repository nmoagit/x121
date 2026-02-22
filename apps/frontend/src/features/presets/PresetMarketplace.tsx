/**
 * Marketplace catalog for browsing and applying shared presets (PRD-27).
 */

import { useState } from "react";

import { Badge, Button } from "@/components";
import { cn } from "@/lib/cn";
import { Star, Layers } from "lucide-react";

import { useMarketplace } from "./hooks/use-presets";
import type { MarketplaceSortBy, PresetWithRating, Scope } from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface StarRatingProps {
  rating: number | null;
  count: number;
}

function StarRating({ rating, count }: StarRatingProps) {
  const display = rating !== null ? rating.toFixed(1) : "---";
  return (
    <span
      className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
      data-testid="star-rating"
    >
      <Star size={14} className="text-yellow-400" aria-hidden="true" />
      {display} ({count})
    </span>
  );
}

const SCOPE_VARIANT: Record<Scope, "default" | "info" | "success"> = {
  personal: "default",
  project: "info",
  studio: "success",
};

interface PresetCardProps {
  preset: PresetWithRating;
  onApply?: (preset: PresetWithRating) => void;
}

function PresetCard({ preset, onApply }: PresetCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "hover:border-[var(--color-border-hover)]",
        "transition-colors flex flex-col",
      )}
      data-testid={`preset-card-${preset.id}`}
    >
      {/* Header: name + scope badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {preset.name}
        </h4>
        <Badge variant={SCOPE_VARIANT[preset.scope]} size="sm">
          {preset.scope}
        </Badge>
      </div>

      {/* Description */}
      {preset.description && (
        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mb-3">
          {preset.description}
        </p>
      )}

      {/* Footer: rating, usage count, apply button */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border-default)]">
        <div className="flex items-center gap-3">
          <StarRating rating={preset.avg_rating} count={preset.rating_count} />
          <span
            className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
            data-testid="usage-count"
          >
            <Layers size={14} aria-hidden="true" />
            {preset.usage_count}
          </span>
        </div>
        {onApply && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onApply(preset)}
            data-testid="apply-button"
          >
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface PresetMarketplaceProps {
  onApply?: (preset: PresetWithRating) => void;
}

export function PresetMarketplace({ onApply }: PresetMarketplaceProps) {
  const [sortBy, setSortBy] = useState<MarketplaceSortBy>("popular");
  const { data: presets, isPending, isError } = useMarketplace(sortBy);

  return (
    <div data-testid="preset-marketplace">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Preset Marketplace
        </h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as MarketplaceSortBy)}
          className={cn(
            "text-sm rounded-[var(--radius-md)] px-2 py-1",
            "bg-[var(--color-surface-secondary)]",
            "text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)]",
          )}
          data-testid="sort-select"
        >
          <option value="popular">Most Popular</option>
          <option value="rating">Highest Rated</option>
          <option value="recent">Most Recent</option>
        </select>
      </div>

      {/* States */}
      {isPending && (
        <p className="text-sm text-[var(--color-text-muted)]">Loading presets...</p>
      )}
      {isError && (
        <p className="text-sm text-[var(--color-action-danger)]">
          Failed to load presets.
        </p>
      )}

      {/* Grid */}
      {presets && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="preset-grid"
        >
          {presets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} onApply={onApply} />
          ))}
          {presets.length === 0 && (
            <p className="col-span-full text-sm text-[var(--color-text-muted)]">
              No presets available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
