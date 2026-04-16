/**
 * Images content page — browse all image variants across avatars,
 * most recent first. Read-only list items with image preview
 * and navigation to avatar images tab.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState, BulkActionBar, BulkRejectDialog, BulkLabelDialog, ExportStatusPanel, ScanDirectoryDialog } from "@/components/domain";
import { TagFilter } from "@/components/domain/TagFilter";
import { NotesModal } from "@/components/domain/NotesModal";
import { TagInput } from "@/components/domain/TagInput";
import type { TagInfo } from "@/components/domain/TagChip";
import { Modal } from "@/components/composite";
import { api } from "@/lib/api";
import { PageHeader, Stack } from "@/components/layout";
import { Button, Checkbox, MultiFilterBar, Pagination, SearchInput, Toggle, ContextLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption } from "@/components/primitives";
import { ProgressiveImage } from "@/components/primitives";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import {
  useMediaVariantsBrowse,
  useBrowseApproveVariant,
  useBrowseUnapproveVariant,
  useBrowseRejectVariant,
  useBulkApproveVariants,
  useBulkRejectVariants,
  type MediaVariantBrowseItem,
} from "@/features/media/hooks/use-media-variants";
import {
  MEDIA_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  type MediaVariantStatusId,
  type Provenance,
} from "@/features/media/types";
import { variantMediaUrl, variantThumbnailUrl } from "@/features/media/utils";
import { formatBytes, formatDateTime, slugify } from "@/lib/format";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { toSelectOptions } from "@/lib/select-utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { Check, CheckCircle, ChevronLeft, ChevronRight, Download, FolderSearch, Image as ImageIcon, LayoutGrid, List, Maximize2, Minimize2, XCircle } from "@/tokens/icons";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Read-only browse item
   -------------------------------------------------------------------------- */

function BrowseVariantItem({
  variant,
  onPreview,
  onNavigate,
  onApprove,
  onReject,
  selected,
  onToggleSelect,
}: {
  variant: MediaVariantBrowseItem;
  onPreview: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const statusId = variant.status_id as MediaVariantStatusId;

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${selected ? "ring-2 ring-blue-500/50" : ""} ${!variant.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Selection checkbox */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
        </div>

        {/* Clickable image thumbnail */}
        <button
          type="button"
          onClick={onPreview}
          className="group/preview relative h-14 w-14 shrink-0 rounded overflow-hidden bg-[var(--color-surface-secondary)] cursor-pointer"
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
          className={`flex min-w-0 flex-1 flex-col gap-0.5 text-left cursor-pointer ${TYPO_DATA}`}
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
            {variant.is_hero && <span className="text-[var(--color-data-green)]">hero</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className={TERMINAL_STATUS_COLORS[(MEDIA_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()] ?? "text-[var(--color-data-cyan)]"}>
              {(MEDIA_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()}
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
            className={`p-1 rounded transition-colors ${variant.status_id === 2 ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)]"}`}
            title={variant.status_id === 2 ? "Approved" : "Approve"}
          >
            <CheckCircle size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`p-1 rounded transition-colors ${variant.status_id === 3 ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)]"}`}
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
  selected,
  onToggleSelect,
}: {
  variant: MediaVariantBrowseItem;
  onPreview: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const statusId = variant.status_id as MediaVariantStatusId;

  return (
    <div className={`relative rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${selected ? "ring-2 ring-blue-500/50" : ""} ${!variant.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}>
      {/* Selection checkbox overlay */}
      <div
        className="absolute top-1 left-1 z-10 rounded bg-[var(--color-surface-badge-overlay)] p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
      </div>

      {/* Image preview */}
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-square w-full cursor-pointer bg-[var(--color-surface-secondary)]"
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
          <div className={`flex items-center gap-1.5 ${TYPO_DATA}`}>
            <span className="truncate font-medium text-[var(--color-text-primary)]">{variant.avatar_name}</span>
            {variant.variant_type && (
              <span className={`shrink-0 text-[10px] ${TRACK_TEXT_COLORS[variant.variant_type] ?? "text-[var(--color-text-muted)]"}`}>
                {variant.variant_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
            <span className={TERMINAL_STATUS_COLORS[(MEDIA_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()] ?? "text-[var(--color-data-cyan)]"}>
              {(MEDIA_VARIANT_STATUS_LABEL[statusId] ?? "unknown").toLowerCase()}
            </span>
            <span>v{variant.version}</span>
            {variant.is_hero && <span className="text-[var(--color-data-green)]">hero</span>}
          </div>
        </button>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onApprove} className={`p-0.5 rounded transition-colors ${variant.status_id === 2 ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)]"}`} title="Approve">
            <CheckCircle size={14} />
          </button>
          <button type="button" onClick={onReject} className={`p-0.5 rounded transition-colors ${variant.status_id === 3 ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)]"}`} title="Reject">
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

const MEDIA_KIND_OPTIONS: FilterOption[] = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
];

function buildVariantTypeOptions(items: MediaVariantBrowseItem[] | undefined): FilterOption[] {
  if (!items) return [];
  const types = [...new Set(items.map((v) => v.variant_type).filter((t): t is string => t != null))].sort();
  return types.map((t) => ({ value: t, label: t }));
}

/* --------------------------------------------------------------------------
   Pagination constants
   -------------------------------------------------------------------------- */

const DEFAULT_PAGE_SIZE = 25;

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function MediaPage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [variantTypeFilter, setVariantTypeFilter] = useState<string[]>([]);
  const [mediaKindFilter, setMediaKindFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<number[]>([]);
  const [excludeLabelFilter, setExcludeLabelFilter] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  // Absolute index across all pages (0 to total-1)
  const [previewAbsIndex, setPreviewAbsIndex] = useState<number | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [noTags, setNoTags] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Bulk selection — reset key serializes all filter state
  const bulkResetKey = useMemo(
    () => JSON.stringify({ projectFilter, statusFilter, sourceFilter, variantTypeFilter, mediaKindFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled }),
    [projectFilter, statusFilter, sourceFilter, variantTypeFilter, mediaKindFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled],
  );
  const bulk = useBulkSelection(bulkResetKey);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  // All filters passed server-side as comma-separated OR values
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: browseResult, isLoading } = useMediaVariantsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    statusId: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    provenance: sourceFilter.length > 0 ? sourceFilter.join(",") : undefined,
    variantType: variantTypeFilter.length > 0 ? variantTypeFilter.join(",") : undefined,
    mediaKind: mediaKindFilter.length > 0 ? mediaKindFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
    noTags: noTags || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const variants = browseResult?.items;
  const total = browseResult?.total ?? 0;

  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const variantTypeOptions = useMemo(() => buildVariantTypeOptions(variants), [variants]);

  // All filtering is server-side; variants are the final filtered list
  const filteredVariants = variants ?? [];
  const pageIds = useMemo(() => filteredVariants.map((v) => v.id), [filteredVariants]);

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
  const bulkApproveMut = useBulkApproveVariants();
  const bulkRejectMut = useBulkRejectVariants();
  // Bulk operations (shared hook eliminates ~130 lines of duplication with ScenesPage)
  const buildFilters = useCallback(() => ({
    projectId: projectFilter.length === 1 ? Number(projectFilter[0]) : undefined,
    pipelineId: pipelineCtx?.pipelineId,
    statusId: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    provenance: sourceFilter.length > 0 ? sourceFilter.join(",") : undefined,
    variantType: variantTypeFilter.length > 0 ? variantTypeFilter.join(",") : undefined,
    mediaKind: mediaKindFilter.length > 0 ? mediaKindFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
  }), [projectFilter, pipelineCtx?.pipelineId, statusFilter, sourceFilter, variantTypeFilter, mediaKindFilter, showDisabled, labelFilter, excludeLabelFilter, debouncedSearch]);

  const bulkOps = useBulkOperations({
    entityType: "media_variant",
    entityNoun: "variant",
    bulk,
    total,
    buildFilters,
    approveMut: bulkApproveMut,
    rejectMut: bulkRejectMut,
    pipelineId: pipelineCtx?.pipelineId,
  });

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: (v: string[]) => { setProjectFilter(v); setPage(0); }, width: "w-44" },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: (v: string[]) => { setStatusFilter(v); setPage(0); } },
    { key: "source", label: "Source", options: SOURCE_OPTIONS, selected: sourceFilter, onChange: (v: string[]) => { setSourceFilter(v); setPage(0); } },
    { key: "type", label: "Type", options: variantTypeOptions, selected: variantTypeFilter, onChange: (v: string[]) => { setVariantTypeFilter(v); setPage(0); } },
    { key: "mediaKind", label: "Kind", options: MEDIA_KIND_OPTIONS, selected: mediaKindFilter, onChange: (v: string[]) => { setMediaKindFilter(v); setPage(0); } },
  ], [projectOptions, projectFilter, statusFilter, sourceFilter, variantTypeOptions, variantTypeFilter, mediaKindFilter]);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Media"
        description="Browse all media variants across avatars, most recent first."
        actions={pipelineCtx?.pipelineId ? (
          <Button size="sm" variant="secondary" icon={<FolderSearch size={14} />} onClick={() => setScanOpen(true)}>
            Scan Directory
          </Button>
        ) : undefined}
      />

      {/* Search */}
      <SearchInput
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by avatar, variant type, project..."
        size="sm"
      />

      {/* Filter bar */}
      <MultiFilterBar filters={filters} size="xs">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={bulk.isAllPageSelected(pageIds)}
            indeterminate={bulk.isIndeterminate(pageIds)}
            onChange={(checked) => checked ? bulk.selectPage(pageIds) : bulk.deselectPage(pageIds)}
            label="Select all"
            size="sm"
          />
          <Toggle
            checked={showDisabled}
            onChange={setShowDisabled}
            label="Show disabled"
            size="sm"
          />
          <Toggle
            checked={noTags}
            onChange={(v) => { setNoTags(v); setPage(0); }}
            label="No tags"
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

      {/* Label filter */}
      <TagFilter
        selectedTagIds={labelFilter}
        onSelectionChange={(ids) => { setLabelFilter(ids); setPage(0); }}
        excludedTagIds={excludeLabelFilter}
        onExclusionChange={(ids) => { setExcludeLabelFilter(ids); setPage(0); }}
        pipelineId={pipelineCtx?.pipelineId}
        entityType="media_variant"
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <ContextLoader size={48} />
        </div>
      ) : !filteredVariants.length ? (
        <EmptyState
          icon={<ImageIcon size={32} />}
          title="No variants found"
          description="No media variants match the current filters."
        />
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {filteredVariants.map((variant, i) => (
            <BrowseVariantItem
              key={variant.id}
              variant={variant}
              selected={bulk.isSelected(variant.id)}
              onToggleSelect={() => bulk.toggle(variant.id)}
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
              selected={bulk.isSelected(variant.id)}
              onToggleSelect={() => bulk.toggle(variant.id)}
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

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Image preview modal */}
      <ImagePreviewModal
        variant={previewVariantData}
        onClose={() => setPreviewAbsIndex(null)}
        onPrev={previewAbsIndex !== null && previewAbsIndex > 0 ? () => setPreviewAbsIndex(previewAbsIndex - 1) : undefined}
        onNext={previewAbsIndex !== null && previewAbsIndex < total - 1 ? () => setPreviewAbsIndex(previewAbsIndex + 1) : undefined}
        onApprove={previewVariantData ? () => previewVariantData.status_id === 2 ? unapproveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : approveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : undefined}
        onReject={previewVariantData ? () => previewVariantData.status_id === 3 ? unapproveVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : rejectVarMut.mutate({ avatarId: previewVariantData.avatar_id, id: previewVariantData.id }) : undefined}
        pipelineId={pipelineCtx?.pipelineId}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={bulk.selectedCount}
        totalCount={total}
        selectAllMatching={bulk.selectAllMatching}
        onApproveAll={bulkOps.handleBulkApprove}
        onRejectAll={() => bulkOps.setRejectDialogOpen(true)}
        onAddLabel={() => bulkOps.setLabelDialogOpen("add")}
        onRemoveLabel={() => bulkOps.setLabelDialogOpen("remove")}
        onExport={bulkOps.handleExport}
        onClearSelection={bulk.clearAll}
        onSelectAllMatching={() => bulk.selectAll(total)}
        isAllPageSelected={bulk.isAllPageSelected(pageIds)}
        pageItemCount={filteredVariants.length}
      >
        {bulkOps.exportJob && (
          <ExportStatusPanel job={bulkOps.exportJob} onDismiss={bulkOps.dismissExport} />
        )}
      </BulkActionBar>

      {/* Bulk reject dialog */}
      <BulkRejectDialog
        open={bulkOps.rejectDialogOpen}
        count={bulk.selectedCount}
        onConfirm={bulkOps.handleBulkRejectConfirm}
        onCancel={() => bulkOps.setRejectDialogOpen(false)}
        loading={bulkOps.rejectLoading}
      />

      {/* Bulk label dialog */}
      <BulkLabelDialog
        open={bulkOps.labelDialogOpen !== null}
        mode={bulkOps.labelDialogOpen ?? "add"}
        count={bulk.selectedCount}
        pipelineId={pipelineCtx?.pipelineId}
        entityType="media_variant"
        entityIds={Array.from(bulk.selectedIds)}
        onConfirm={bulkOps.handleBulkAddLabel}
        onConfirmRemove={bulkOps.handleBulkRemoveLabel}
        onCancel={() => bulkOps.setLabelDialogOpen(null)}
      />

      {pipelineCtx?.pipelineId && (
        <ScanDirectoryDialog
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          pipelineId={pipelineCtx.pipelineId}
        />
      )}

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
  pipelineId,
}: {
  variant: MediaVariantBrowseItem | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  pipelineId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [variantTags, setVariantTags] = useState<TagInfo[]>([]);
  const [variantNotes, setVariantNotes] = useState("");
  const [variantNotesSaving, setVariantNotesSaving] = useState(false);

  // Load tags + notes when variant changes
  useEffect(() => {
    if (!variant) { setVariantTags([]); setVariantNotes(""); return; }
    setVariantNotes(variant.notes ?? "");
    api.get<TagInfo[]>(`/entities/media_variant/${variant.id}/tags`)
      .then(setVariantTags)
      .catch(() => setVariantTags([]));
  }, [variant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      title={variant ? `${variant.project_name} / ${variant.avatar_name} — ${variant.variant_label}` : ""}
      size={expanded ? "full" : "3xl"}
    >
      {variant && (
        <Stack gap={4}>
          {/* Image with expand overlay */}
          <div className="group/img relative" onDoubleClick={() => setExpanded((v) => !v)}>
            <div className="flex min-w-0 flex-1 justify-center">
              {variant.file_path ? (
                <img
                  src={variantMediaUrl(variant.file_path)}
                  alt={variant.variant_label}
                  className="max-h-[60vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-[var(--color-text-muted)]">
                  No image available
                </div>
              )}
            </div>
            {/* Expand toggle — overlays top-right of image */}
            <button
              type="button"
              className="absolute top-2 right-2 p-1 rounded bg-[var(--color-surface-badge-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] opacity-0 group-hover/img:opacity-100 transition-opacity"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Compact" : "Expand"}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className={TERMINAL_STATUS_COLORS[(MEDIA_VARIANT_STATUS_LABEL[variant.status_id as MediaVariantStatusId] ?? "unknown").toLowerCase()] ?? "text-[var(--color-data-cyan)]"}>
              {(MEDIA_VARIANT_STATUS_LABEL[variant.status_id as MediaVariantStatusId] ?? "unknown").toLowerCase()}
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
              <><span className="opacity-30">|</span><span className="text-[var(--color-data-green)]">hero</span></>
            )}
            <span className="opacity-30">|</span>
            <span>{variant.avatar_name} · {variant.project_name}</span>
          </div>

          {/* Toolbar: download, approve/reject, spacer, prev/next */}
          <div className="flex items-center gap-[var(--spacing-2)]">
            <button
              type="button"
              onClick={() => {
                if (!variant.file_path) return;
                const ext = variant.file_path.split(".").pop() ?? "png";
                const labelSuffix = variantTags.length > 0 ? `_[${variantTags.map((t) => slugify(t.display_name)).join(",")}]` : "";
                const filename = `${slugify(variant.project_name)}_${slugify(variant.avatar_name)}_${slugify(variant.variant_type ?? "other")}_${slugify(variant.variant_label)}${labelSuffix}.${ext}`;
                const a = document.createElement("a");
                a.href = variantMediaUrl(variant.file_path);
                a.download = filename;
                a.click();
              }}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
              title="Download"
            >
              <Download size={14} />
            </button>

            <div className="w-px h-4 bg-[var(--color-border-default)]" />

            <button
              type="button"
              onClick={onApprove}
              disabled={!onApprove}
              className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${variant.status_id === 2 ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)] hover:bg-[var(--color-surface-secondary)]"}`}
              title={variant.status_id === 2 ? "Approved" : "Approve"}
            >
              <CheckCircle size={14} />
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={!onReject}
              className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${variant.status_id === 3 ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)] hover:bg-[var(--color-surface-secondary)]"}`}
              title={variant.status_id === 3 ? "Rejected" : "Reject"}
            >
              <XCircle size={14} />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                title="Previous image"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                title="Next image"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Labels */}
          <TagInput
            entityType="media_variant"
            entityId={variant.id}
            existingTags={variantTags}
            onTagsChange={setVariantTags}
            pipelineId={pipelineId}
          />

          {/* Notes */}
          <NotesModal
            value={variantNotes}
            onChange={setVariantNotes}
            onSave={(value) => {
              setVariantNotesSaving(true);
              api.put(`/avatars/${variant.avatar_id}/media-variants/${variant.id}`, { notes: value })
                .finally(() => setVariantNotesSaving(false));
            }}
            saving={variantNotesSaving}
            title={`${variant.avatar_name} — ${variant.variant_label}`}
          />
        </Stack>
      )}
    </Modal>
  );
}
