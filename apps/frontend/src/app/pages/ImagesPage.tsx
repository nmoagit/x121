/**
 * Images content page — browse all image variants across avatars,
 * most recent first. Read-only list items with image preview
 * and navigation to avatar images tab.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { Modal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Button, MultiFilterBar, Select, Toggle ,  WireframeLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption  } from "@/components/primitives";
import { ProgressiveImage  } from "@/components/primitives";
import {
  useImageVariantsBrowse,
  type ImageVariantBrowseItem,
} from "@/features/images/hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  type ImageVariantStatusId,
  type Provenance,
} from "@/features/images/types";
import { variantImageUrl, variantThumbnailUrl } from "@/features/images/utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { toSelectOptions } from "@/lib/select-utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { Check, Image as ImageIcon } from "@/tokens/icons";

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
    <div className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] transition-colors bg-[#0d1117] hover:bg-[#161b22] ${!variant.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Clickable image thumbnail */}
        <button
          type="button"
          onClick={onPreview}
          className="group/preview relative h-14 w-14 shrink-0 rounded overflow-hidden bg-[#161b22] cursor-pointer"
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
              <ImageIcon size={18} />
            </div>
          )}
          {variant.is_hero && (
            <div className="absolute top-0.5 right-0.5 rounded-full bg-green-500 p-0.5">
              <Check size={8} className="text-white" />
            </div>
          )}
        </button>

        {/* Clickable metadata area */}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left cursor-pointer font-mono text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">
              {variant.avatar_name}
            </span>
            {variant.variant_type && (
              <span className={TRACK_TEXT_COLORS[variant.variant_type] ?? "text-[var(--color-text-muted)]"}>
                {variant.variant_type}
              </span>
            )}
            {variant.is_hero && <span className="text-green-400">hero</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className={TERMINAL_STATUS_COLORS[(IMAGE_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()] ?? "text-cyan-400"}>
              {(IMAGE_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()}
            </span>
            <span className="opacity-30">|</span>
            <span>{(PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance).toLowerCase()}</span>
            <span className="opacity-30">|</span>
            <span>v{variant.version}</span>
            {variant.width && variant.height && (
              <><span className="opacity-30">|</span><span>{variant.width}x{variant.height}</span></>
            )}
            {variant.file_size_bytes != null && (
              <><span className="opacity-30">|</span><span>{formatBytes(variant.file_size_bytes)}</span></>
            )}
            <span className="opacity-30">|</span>
            <span>{variant.project_name}</span>
            <span className="opacity-30">|</span>
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
   Pagination constants
   -------------------------------------------------------------------------- */

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: browseResult, isLoading } = useImageVariantsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    limit: pageSize,
    offset: page * pageSize,
  });

  const variants = browseResult?.items;
  const total = browseResult?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const variantTypeOptions = useMemo(() => buildVariantTypeOptions(variants), [variants]);

  const filteredVariants = useMemo(() => {
    if (!variants) return [];
    return variants.filter((v) => {
      if (!showDisabled && !v.avatar_is_enabled) return false;
      if (projectFilter.length > 0 && !projectFilter.includes(String(v.project_id))) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(String(v.status_id))) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(v.provenance)) return false;
      if (variantTypeFilter.length > 0 && !variantTypeFilter.includes(v.variant_type ?? "")) return false;
      return true;
    });
  }, [variants, showDisabled, projectFilter, statusFilter, sourceFilter, variantTypeFilter]);

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: (v: string[]) => { setProjectFilter(v); setPage(0); }, width: "w-44" },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: (v: string[]) => { setStatusFilter(v); setPage(0); } },
    { key: "source", label: "Source", options: SOURCE_OPTIONS, selected: sourceFilter, onChange: (v: string[]) => { setSourceFilter(v); setPage(0); } },
    { key: "type", label: "Type", options: variantTypeOptions, selected: variantTypeFilter, onChange: (v: string[]) => { setVariantTypeFilter(v); setPage(0); } },
  ], [projectOptions, projectFilter, statusFilter, sourceFilter, variantTypeOptions, variantTypeFilter]);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Images"
        description="Browse all image variants across models, most recent first."
      />

      {/* Filter bar */}
      <MultiFilterBar filters={filters}>
        <div className="flex items-center gap-3">
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
          <WireframeLoader size={48} />
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
                  to: "/projects/$projectId/avatars/$avatarId",
                  params: {
                    projectId: String(variant.project_id),
                    avatarId: String(variant.avatar_id),
                  },
                  search: { tab: "images", scene: undefined },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-default)]/30 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            <span>
              Showing {page * pageSize + 1}
              {" - "}
              {Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <Select
              value={String(pageSize)}
              onChange={(val) => {
                setPageSize(Number(val));
                setPage(0);
              }}
              options={PAGE_SIZES.map((s) => ({
                value: String(s),
                label: `${s} per page`,
              }))}
            />
          </div>

          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
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
            <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
              <span className={TERMINAL_STATUS_COLORS[(IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id as ImageVariantStatusId] ?? "unknown").toLowerCase()] ?? "text-cyan-400"}>
                {(IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id as ImageVariantStatusId] ?? "unknown").toLowerCase()}
              </span>
              <span className="opacity-30">|</span>
              <span>{(PROVENANCE_LABEL[previewVariant.provenance as Provenance] ?? previewVariant.provenance).toLowerCase()}</span>
              {previewVariant.width && previewVariant.height && (
                <><span className="opacity-30">|</span><span>{previewVariant.width}x{previewVariant.height}</span></>
              )}
              {previewVariant.format && (
                <><span className="opacity-30">|</span><span>{previewVariant.format.toUpperCase()}</span></>
              )}
              <span className="opacity-30">|</span>
              <span>v{previewVariant.version}</span>
              {previewVariant.is_hero && (
                <><span className="opacity-30">|</span><span className="text-green-400">hero</span></>
              )}
            </div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              {previewVariant.avatar_name} · {previewVariant.project_name}
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
