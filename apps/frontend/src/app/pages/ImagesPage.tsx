/**
 * Images content page — browse all image variants across characters,
 * most recent first. Read-only list items with image preview
 * and navigation to character images tab.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { Modal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Badge, MultiFilterBar, Spinner, Toggle } from "@/components/primitives";
import type { FilterConfig, FilterOption } from "@/components/primitives";
import { ProgressiveImage } from "@/components/primitives";
import {
  useImageVariantsBrowse,
  type ImageVariantBrowseItem,
} from "@/features/images/hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  statusBadgeVariant,
  type ImageVariantStatusId,
  type Provenance,
} from "@/features/images/types";
import { variantImageUrl, variantThumbnailUrl } from "@/features/images/utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { Check, Image as ImageIcon, Star } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Read-only browse item
   -------------------------------------------------------------------------- */

function BrowseVariantItem({
  variant,
  onPreview,
  onNavigate,
}: {
  variant: ImageVariantBrowseItem;
  onPreview: () => void;
  onNavigate: () => void;
}) {
  const statusId = variant.status_id as ImageVariantStatusId;

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${!variant.character_is_enabled ? "opacity-70 grayscale" : ""}`}>
      <div className="flex items-center gap-4 p-4">
        {/* Clickable image thumbnail */}
        <button
          type="button"
          onClick={onPreview}
          className="group/preview relative h-16 w-16 shrink-0 rounded overflow-hidden
            bg-[var(--color-surface-tertiary)] cursor-pointer"
        >
          {variant.file_path ? (
            <ProgressiveImage
              lowSrc={variantThumbnailUrl(variant.id, 64)}
              highSrc={variantThumbnailUrl(variant.id, 256)}
              alt={variant.variant_label}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--color-text-muted)]">
              <ImageIcon size={20} />
            </div>
          )}
          {variant.is_hero && (
            <div className="absolute top-0.5 right-0.5 rounded-full bg-[var(--color-action-success)] p-0.5">
              <Check size={10} className="text-white" />
            </div>
          )}
        </button>

        {/* Clickable metadata area — navigates to character images tab */}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {variant.character_name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {variant.variant_label}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusBadgeVariant(statusId)} size="sm">
              {IMAGE_VARIANT_STATUS_LABEL[statusId] ?? "Unknown"}
            </Badge>
            <Badge variant="default" size="sm">
              {PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance}
            </Badge>
            {variant.variant_type && (
              <Badge variant="info" size="sm">
                {variant.variant_type}
              </Badge>
            )}
            <Badge variant="default" size="sm">
              v{variant.version}
            </Badge>
            {variant.is_hero && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium
                  bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
              >
                <Star size={12} /> Hero
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{variant.project_name}</span>
            {variant.width && variant.height && (
              <span>{variant.width}&times;{variant.height}</span>
            )}
            <span>{variant.file_size_bytes != null ? formatBytes(variant.file_size_bytes) : "\u2014"}</span>
            <span>{formatDateTime(variant.created_at)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Filter option constants
   -------------------------------------------------------------------------- */

const STATUS_OPTIONS: FilterOption[] = [
  { value: "1", label: "Pending" },
  { value: "2", label: "Approved" },
  { value: "3", label: "Rejected" },
  { value: "4", label: "Generating" },
  { value: "5", label: "Generated" },
  { value: "6", label: "Editing" },
];

const SOURCE_OPTIONS: FilterOption[] = [
  { value: "generated", label: "Generated" },
  { value: "manually_edited", label: "Manually Edited" },
  { value: "manual_upload", label: "Manual Upload" },
];

function buildVariantTypeOptions(items: ImageVariantBrowseItem[] | undefined): FilterOption[] {
  if (!items) return [];
  const types = [...new Set(items.map((v) => v.variant_type).filter((t): t is string => t != null))].sort();
  return types.map((t) => ({ value: t, label: t }));
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function ImagesPage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [variantTypeFilter, setVariantTypeFilter] = useState<string[]>([]);
  const [previewVariant, setPreviewVariant] = useState<ImageVariantBrowseItem | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  const { data: projects } = useProjects();
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: variants, isLoading } = useImageVariantsBrowse(projectId);

  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const variantTypeOptions = useMemo(() => buildVariantTypeOptions(variants), [variants]);

  const filteredVariants = useMemo(() => {
    if (!variants) return [];
    return variants.filter((v) => {
      if (!showDisabled && !v.character_is_enabled) return false;
      if (projectFilter.length > 0 && !projectFilter.includes(String(v.project_id))) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(String(v.status_id))) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(v.provenance)) return false;
      if (variantTypeFilter.length > 0 && !variantTypeFilter.includes(v.variant_type ?? "")) return false;
      return true;
    });
  }, [variants, showDisabled, projectFilter, statusFilter, sourceFilter, variantTypeFilter]);

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: setProjectFilter, width: "w-44" },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: setStatusFilter },
    { key: "source", label: "Source", options: SOURCE_OPTIONS, selected: sourceFilter, onChange: setSourceFilter },
    { key: "type", label: "Type", options: variantTypeOptions, selected: variantTypeFilter, onChange: setVariantTypeFilter },
  ], [projectOptions, projectFilter, statusFilter, sourceFilter, variantTypeOptions, variantTypeFilter]);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Images"
        description="Browse all image variants across models, most recent first."
      />

      {/* Filter bar */}
      <MultiFilterBar filters={filters}>
        <div className="flex items-center gap-3 self-end pb-[3px]">
          <Toggle
            checked={showDisabled}
            onChange={setShowDisabled}
            label="Show disabled"
            size="sm"
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {filteredVariants.length}{variants && filteredVariants.length !== variants.length ? ` of ${variants.length}` : ""} variant{filteredVariants.length !== 1 ? "s" : ""}
          </span>
        </div>
      </MultiFilterBar>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !filteredVariants.length ? (
        <EmptyState
          icon={<ImageIcon size={32} />}
          title="No variants found"
          description="No image variants match the current filters."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredVariants.map((variant) => (
            <BrowseVariantItem
              key={variant.id}
              variant={variant}
              onPreview={() => setPreviewVariant(variant)}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/models/$characterId",
                  params: {
                    projectId: String(variant.project_id),
                    characterId: String(variant.character_id),
                  },
                  search: { tab: "images", scene: undefined },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Image preview modal */}
      <Modal
        open={previewVariant !== null}
        onClose={() => setPreviewVariant(null)}
        title={previewVariant?.variant_label ?? ""}
        size="lg"
      >
        {previewVariant && (
          <Stack gap={4}>
            <div className="flex justify-center">
              {previewVariant.file_path ? (
                <img
                  src={variantImageUrl(previewVariant.file_path)}
                  alt={previewVariant.variant_label}
                  className="max-h-[60vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-[var(--color-text-muted)]">
                  No image available
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusBadgeVariant(previewVariant.status_id as ImageVariantStatusId)} size="sm">
                {IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id as ImageVariantStatusId]}
              </Badge>
              <Badge variant="default" size="sm">
                {PROVENANCE_LABEL[previewVariant.provenance as Provenance] ?? previewVariant.provenance}
              </Badge>
              {previewVariant.width && previewVariant.height && (
                <Badge variant="info" size="sm">
                  {previewVariant.width} &times; {previewVariant.height}
                </Badge>
              )}
              {previewVariant.format && (
                <Badge variant="default" size="sm">
                  {previewVariant.format.toUpperCase()}
                </Badge>
              )}
              <Badge variant="default" size="sm">
                v{previewVariant.version}
              </Badge>
              {previewVariant.is_hero && (
                <Badge variant="success" size="sm">Hero</Badge>
              )}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {previewVariant.character_name} &middot; {previewVariant.project_name}
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
