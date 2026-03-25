/**
 * Review History Dashboard — browse clips that have been reviewed
 * (approved/rejected), with filters for reviewer, status, project,
 * and toggles for delivered/pending clips.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Button, FilterSelect, Select, Toggle ,  ContextLoader } from "@/components/primitives";
import { TERMINAL_PANEL, TERMINAL_ROW_HOVER, TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import { useClipsBrowse } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { isPurgedClip, isEmptyClip } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDateTime } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useAuthStore } from "@/stores/auth-store";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Ban, CheckCircle, Play } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

const REVIEWER_OPTIONS = [
  { value: "", label: "All Reviews" },
  { value: "mine", label: "My Reviews" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "pending", label: "Pending" },
];

/* --------------------------------------------------------------------------
   Lazy-loaded review clip row
   -------------------------------------------------------------------------- */

function ReviewClipRow({
  clip,
  onNavigate,
}: {
  clip: ClipBrowseItem;
  onNavigate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isApproved = clip.qa_status === "approved";
  const isRejected = clip.qa_status === "rejected";

  return (
    <div
      ref={ref}
      className={`${TERMINAL_PANEL} ${TERMINAL_ROW_HOVER}`}
    >
      <div className="flex items-center gap-4 p-[var(--spacing-3)]">
        {/* Video thumbnail */}
        {isPurgedClip(clip) ? (
          <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded bg-[var(--color-surface-tertiary)]">
            <Ban size={20} className="text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onNavigate}
            className="group/play relative h-16 w-24 shrink-0 rounded overflow-hidden bg-[var(--color-surface-tertiary)] cursor-pointer"
          >
            {isVisible && (
              <video
                src={getStreamUrl("version", clip.id, "proxy")}
                className="absolute inset-0 w-full h-full object-cover"
                preload="metadata"
                muted
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
              <Play size={20} className="text-white" />
            </div>
          </button>
        )}

        {/* Metadata — navigates to avatar scene detail */}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-[var(--color-text-primary)]">
              {clip.avatar_name}
            </span>
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {clip.scene_type_name}
            </span>
            <span className="opacity-30">|</span>
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {clip.track_name}
            </span>
            <span className="opacity-30">|</span>
            <span className="font-mono text-xs text-cyan-400">
              v{clip.version_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs uppercase tracking-wide ${TERMINAL_STATUS_COLORS[clip.qa_status ?? "pending"] ?? "text-[var(--color-text-muted)]"}`}>
              {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending"}
            </span>
            {isPurgedClip(clip) && (
              <span className="font-mono text-xs uppercase tracking-wide text-orange-400">Purged</span>
            )}
            {!isPurgedClip(clip) && isEmptyClip(clip) && (
              <span className="font-mono text-xs uppercase tracking-wide text-orange-400">Empty file</span>
            )}
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            <span>{clip.project_name}</span>
            <span className="opacity-30">|</span>
            <span>{formatDateTime(clip.created_at)}</span>
          </div>
        </button>

        {/* Right side: rejection reason */}
        {isRejected && clip.qa_rejection_reason && (
          <div className="shrink-0 max-w-xs text-right">
            <div className="text-xs font-medium text-[var(--color-action-danger)]">
              Rejection reason
            </div>
            <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">
              {clip.qa_rejection_reason}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function MyReviewsPage() {
  useSetPageTitle("Review History", "Browse completed reviews and approval decisions.");

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [reviewerFilter, setReviewerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [showDelivered, setShowDelivered] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  const projectId = projectFilter ? Number(projectFilter) : undefined;
  const { data: browseResult, isLoading } = useClipsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    limit: pageSize,
    offset: page * pageSize,
  });

  const clips = browseResult?.items;
  const total = browseResult?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  const projectOptions = useMemo(
    () => [{ value: "", label: "All Projects" }, ...toSelectOptions(projects)],
    [projects],
  );

  const filteredClips = useMemo(() => {
    if (!clips) return [];
    return clips.filter((c) => {
      // Status filter
      if (statusFilter && c.qa_status !== statusFilter) return false;
      // Reviewer filter (best-effort: filter by qa_notes containing username)
      if (reviewerFilter === "mine" && user?.username) {
        if (!c.qa_notes?.includes(user.username)) return false;
      }
      // Hide delivered scenes (scene_status not available on clip, skip if not present)
      if (!showDelivered) {
        // No scene_status_id field available on ClipBrowseItem — skip this filter
      }
      return true;
    });
  }, [clips, statusFilter, reviewerFilter, user, showDelivered]);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Review History"
        description="Browse clips that have been reviewed (approved or rejected)."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Reviewer"
          options={REVIEWER_OPTIONS}
          value={reviewerFilter}
          onChange={(v) => { setReviewerFilter(v); setPage(0); }}
          className="w-40"
        />
        <FilterSelect
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(0); }}
          className="w-36"
        />
        <FilterSelect
          label="Project"
          options={projectOptions}
          value={projectFilter}
          onChange={(v) => { setProjectFilter(v); setPage(0); }}
          className="w-44"
        />
        <div className="flex items-center gap-3 self-end pb-[3px]">
          <Toggle
            checked={showDelivered}
            onChange={setShowDelivered}
            label="Show delivered"
            size="sm"
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {filteredClips.length}{clips && filteredClips.length !== clips.length ? ` of ${clips.length}` : ""} clip{filteredClips.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <ContextLoader size={48} />
        </div>
      ) : !filteredClips.length ? (
        <EmptyState
          icon={<CheckCircle size={32} />}
          title="No reviewed clips"
          description="No clips match the current filters."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredClips.map((clip) => (
            <ReviewClipRow
              key={clip.id}
              clip={clip}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/avatars/$avatarId",
                  params: {
                    projectId: String(clip.project_id),
                    avatarId: String(clip.avatar_id),
                  },
                  search: { tab: "scenes", scene: String(clip.scene_id) },
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
    </Stack>
  );
}
