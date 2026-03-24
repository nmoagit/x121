/**
 * Images content page — browse all image variants across avatars,
 * most recent first. Read-only list items with image preview
 * and navigation to avatar images tab.
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { Modal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Button, MultiFilterBar, Select, Toggle ,  WireframeLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption  } from "@/components/primitives";
import { ProgressiveImage  } from "@/components/primitives";
import {
  useImageVariantsBrowse,
  useBrowseApproveVariant,
  useBrowseUnapproveVariant,
  useBrowseRejectVariant,
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
import { Check, CheckCircle, ChevronLeft, ChevronRight, Image as ImageIcon, LayoutGrid, List, Maximize2, Minimize2, XCircle } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Read-only browse item
   -------------------------------------------------------------------------- */

function BrowseVariantItem({
  variant,
  onPreview,
  onNavigate,
  onApprove,
  onReject,
}: {
  variant: ImageVariantBrowseItem;
  onPreview: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
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

        {/* Approve / Reject */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onApprove}
            className={`p-1 rounded transition-colors ${variant.status_id === 2 ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400"}`}
            title={variant.status_id === 2 ? "Approved" : "Approve"}
          >
            <CheckCircle size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`p-1 rounded transition-colors ${variant.status_id === 3 ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400"}`}
            title={variant.status_id === 3 ? "Rejected" : "Reject"}
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Grid variant card
   -------------------------------------------------------------------------- */

function BrowseVariantCard({
  variant,
  onPreview,
  onNavigate,
  onApprove,
  onReject,
}: {
  variant: ImageVariantBrowseItem;
  onPreview: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusId = variant.status_id as ImageVariantStatusId;

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden transition-colors bg-[#0d1117] hover:bg-[#161b22] ${!variant.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}>
      {/* Image preview */}
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-square w-full cursor-pointer bg-[#161b22]"
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
            <ImageIcon size={24} />
          </div>
        )}
        {variant.is_hero && (
          <div className="absolute top-1 right-1 rounded-full bg-green-500 p-0.5">
            <Check size={10} className="text-white" />
          </div>
        )}
      </button>

      {/* Metadata + actions */}
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={onNavigate}
          className="min-w-0 flex-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="truncate font-medium text-[var(--color-text-primary)]">{variant.avatar_name}</span>
            {variant.variant_type && (
              <span className={`shrink-0 text-[10px] ${TRACK_TEXT_COLORS[variant.variant_type] ?? "text-[var(--color-text-muted)]"}`}>
                {variant.variant_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
            <span className={TERMINAL_STATUS_COLORS[(IMAGE_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()] ?? "text-cyan-400"}>
              {(IMAGE_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()}
            </span>
            <span>v{variant.version}</span>
            {variant.is_hero && <span className="text-green-400">hero</span>}
          </div>
        </button>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onApprove} className={`p-0.5 rounded transition-colors ${variant.status_id === 2 ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400"}`} title="Approve">
            <CheckCircle size={14} />
          </button>
          <button type="button" onClick={onReject} className={`p-0.5 rounded transition-colors ${variant.status_id === 3 ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400"}`} title="Reject">
            <XCircle size={14} />
          </button>
        </div>
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
  // Absolute index across all pages (0 to total-1)
  const [previewAbsIndex, setPreviewAbsIndex] = useState<number | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  // All filters passed server-side as comma-separated OR values
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: browseResult, isLoading } = useImageVariantsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    statusId: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    provenance: sourceFilter.length > 0 ? sourceFilter.join(",") : undefined,
    variantType: variantTypeFilter.length > 0 ? variantTypeFilter.join(",") : undefined,
    showDisabled,
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

  // All filtering is server-side; variants are the final filtered list
  const filteredVariants = variants ?? [];

  // When the modal navigates past the current page boundary, switch pages
  const pageOffset = page * pageSize;
  useEffect(() => {
    if (previewAbsIndex === null) return;
    const targetPage = Math.floor(previewAbsIndex / pageSize);
    if (targetPage !== page) setPage(targetPage);
  }, [previewAbsIndex, pageSize, page]);

  const previewLocalIndex = previewAbsIndex !== null ? previewAbsIndex - pageOffset : null;
  const previewVariantData = previewLocalIndex !== null && filteredVariants[previewLocalIndex]
    ? filteredVariants[previewLocalIndex]
    : null;

  const approveVarMut = useBrowseApproveVariant();
  const unapproveVarMut = useBrowseUnapproveVariant();
  const rejectVarMut = useBrowseRejectVariant();

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
        description="Browse all image variants across avatars, most recent first."
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
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="xs"
            icon={<LayoutGrid size={14} />}
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          />
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="xs"
            icon={<List size={14} />}
            onClick={() => setViewMode("list")}
            aria-label="List view"
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
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {filteredVariants.map((variant, i) => (
            <BrowseVariantItem
              key={variant.id}
              variant={variant}
              onPreview={() => setPreviewAbsIndex(pageOffset + i)}
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
              onApprove={() => variant.status_id === 2 ? unapproveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id }) : approveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id })}
              onReject={() => variant.status_id === 3 ? unapproveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id }) : rejectVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id })}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 min-[1500px]:grid-cols-10 gap-3">
          {filteredVariants.map((variant, i) => (
            <BrowseVariantCard
              key={variant.id}
              variant={variant}
              onPreview={() => setPreviewAbsIndex(pageOffset + i)}
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
              onApprove={() => variant.status_id === 2 ? unapproveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id }) : approveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id })}
              onReject={() => variant.status_id === 3 ? unapproveVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id }) : rejectVarMut.mutate({ avatarId: variant.avatar_id, id: variant.id })}
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
              size="sm"
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
      <ImagePreviewModal
        variant={previewVariantData}
        onClose={() => setPreviewAbsIndex(null)}
        onPrev={previewAbsIndex !== null && previewAbsIndex > 0 ? () => setPreviewAbsIndex(previewAbsIndex - 1) : undefined}
        onNext={previewAbsIndex !== null && previewAbsIndex < total - 1 ? () => setPreviewAbsIndex(previewAbsIndex + 1) : undefined}
        onApprove={previewVariantData ? () => previewVariantData.status_id === 2 ? unapproveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : approveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : undefined}
        onReject={previewVariantData ? () => previewVariantData.status_id === 3 ? unapproveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : rejectVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : undefined}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Image preview modal with prev/next
   -------------------------------------------------------------------------- */

function ImagePreviewModal({
  variant,
  onClose,
  onPrev,
  onNext,
  onApprove,
  onReject,
}: {
  variant: ImageVariantBrowseItem | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!variant) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [variant, onPrev, onNext]);

  return (
    <Modal
      open={variant !== null}
      onClose={onClose}
      title={variant?.variant_label ?? ""}
      size={expanded ? "full" : "lg"}
    >
      {variant && (
        <Stack gap={4}>
          {/* Expand toggle — top right */}
          <div className="flex justify-end -mb-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
              title={expanded ? "Compact" : "Expand"}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex min-w-0 flex-1 justify-center">
              {variant.file_path ? (
                <img
                  src={variantImageUrl(variant.file_path)}
                  alt={variant.variant_label}
                  className="max-h-[60vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-[var(--color-text-muted)]">
                  No image available
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className={TERMINAL_STATUS_COLORS[(IMAGE_VARIANT_STATUS_LABEL[variant.status_id as ImageVariantStatusId] ?? "unknown").toLowerCase()] ?? "text-cyan-400"}>
              {(IMAGE_VARIANT_STATUS_LABEL[variant.status_id as ImageVariantStatusId] ?? "unknown").toLowerCase()}
            </span>
            <span className="opacity-30">|</span>
            <span>{(PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance).toLowerCase()}</span>
            {variant.width && variant.height && (
              <><span className="opacity-30">|</span><span>{variant.width}x{variant.height}</span></>
            )}
            {variant.format && (
              <><span className="opacity-30">|</span><span>{variant.format.toUpperCase()}</span></>
            )}
            <span className="opacity-30">|</span>
            <span>v{variant.version}</span>
            {variant.is_hero && (
              <><span className="opacity-30">|</span><span className="text-green-400">hero</span></>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              {variant.avatar_name} · {variant.project_name}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onApprove}
                disabled={!onApprove}
                className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${variant.status_id === 2 ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400 hover:bg-[#161b22]"}`}
                title={variant.status_id === 2 ? "Approved" : "Approve"}
              >
                <CheckCircle size={14} />
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={!onReject}
                className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${variant.status_id === 3 ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[#161b22]"}`}
                title={variant.status_id === 3 ? "Rejected" : "Reject"}
              >
                <XCircle size={14} />
              </button>
            </div>
          </div>
        </Stack>
      )}
    </Modal>
  );
}
