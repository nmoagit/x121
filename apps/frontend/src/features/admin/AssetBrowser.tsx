import { useMemo, useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Input, Select, Spinner } from "@/components/primitives";
import { useAssets } from "@/features/admin/hooks/use-assets";
import type { AssetSearchParams, AssetWithStats } from "@/features/admin/hooks/use-assets";
import { formatBytes } from "@/lib/format";
import { File } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ASSET_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "1", label: "Model" },
  { value: "2", label: "LoRA" },
  { value: "3", label: "Custom Node" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "1", label: "Active" },
  { value: "2", label: "Deprecated" },
  { value: "3", label: "Removed" },
];

const TYPE_BADGE_VARIANT: Record<string, "default" | "info" | "success" | "warning"> = {
  model: "info",
  lora: "success",
  custom_node: "warning",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return "\u2605".repeat(full) + "\u2606".repeat(5 - full);
}

/* --------------------------------------------------------------------------
   AssetCard sub-component
   -------------------------------------------------------------------------- */

interface AssetCardProps {
  asset: AssetWithStats;
  onSelect: (id: number) => void;
}

function AssetCard({ asset, onSelect }: AssetCardProps) {
  const variant = TYPE_BADGE_VARIANT[asset.type_name] ?? "default";

  return (
    <button
      type="button"
      onClick={() => onSelect(asset.id)}
      className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-surface-secondary)] p-[var(--spacing-4)] text-left transition-colors hover:border-[var(--color-action-primary)]"
    >
      <div className="flex items-start justify-between gap-[var(--spacing-2)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
          {asset.name}
        </h3>
        <Badge variant={variant} size="sm">
          {asset.type_name}
        </Badge>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">v{asset.version}</p>

      {asset.description && (
        <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
          {asset.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-[var(--spacing-2)]">
        <span
          className="text-xs text-[var(--color-action-warning)]"
          title={`${asset.avg_rating.toFixed(1)} / 5`}
        >
          {renderStars(asset.avg_rating)}
          <span className="ml-1 text-[var(--color-text-muted)]">({asset.rating_count})</span>
        </span>

        <div className="flex items-center gap-[var(--spacing-2)]">
          {asset.dependency_count > 0 && (
            <Badge variant="default" size="sm">
              {asset.dependency_count} dep{asset.dependency_count !== 1 ? "s" : ""}
            </Badge>
          )}
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatBytes(asset.file_size_bytes)}
          </span>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------------------
   AssetBrowser component
   -------------------------------------------------------------------------- */

interface AssetBrowserProps {
  onSelectAsset?: (id: number) => void;
}

export function AssetBrowser({ onSelectAsset }: AssetBrowserProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const params: AssetSearchParams = useMemo(
    () => ({
      name: search || undefined,
      asset_type_id: typeFilter ? Number(typeFilter) : undefined,
      status_id: statusFilter ? Number(statusFilter) : undefined,
    }),
    [search, typeFilter, statusFilter],
  );

  const { data: assets, isLoading } = useAssets(params);

  function handleSelect(id: number) {
    onSelectAsset?.(id);
  }

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] p-[var(--spacing-6)]">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Asset Registry</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Browse registered models, LoRAs, and custom nodes.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-4)]">
          <div className="min-w-[200px] flex-1">
            <Input
              label="Search"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Select
              label="Type"
              value={typeFilter}
              onChange={(val) => setTypeFilter(val)}
              options={ASSET_TYPE_OPTIONS}
            />
          </div>
          <div className="w-[160px]">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>

        {/* Asset grid */}
        {!assets || assets.length === 0 ? (
          <EmptyState
            icon={<File size={40} />}
            title="No assets found"
            description="No assets match the current filters. Try adjusting your search or register a new asset."
          />
        ) : (
          <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </Stack>
    </div>
  );
}
