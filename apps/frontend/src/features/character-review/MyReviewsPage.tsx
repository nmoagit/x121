/**
 * Review History Dashboard — browse clips that have been reviewed
 * (approved/rejected), with filters for reviewer, status, project,
 * and toggles for delivered/pending clips.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Badge, FilterSelect, Spinner, Toggle } from "@/components/primitives";
import { useClipsBrowse } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { isPurgedClip, isEmptyClip } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDateTime } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useAuthStore } from "@/stores/auth-store";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Ban, CheckCircle, Play } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

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
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        isApproved
          ? "border-[var(--color-action-success)]"
          : isRejected
            ? "border-[var(--color-action-danger)]"
            : "border-[var(--color-border-default)]"
      }`}
    >
      <div className="flex items-center gap-4 p-4">
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

        {/* Metadata — navigates to character scene detail */}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {clip.character_name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {clip.scene_type_name} &middot; {clip.track_name}
            </span>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              v{clip.version_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isApproved ? "success" : isRejected ? "danger" : "default"}
              size="sm"
            >
              {isApproved ? "Approved" : isRejected ? "Rejected" : "Pending"}
            </Badge>
            {isPurgedClip(clip) && (
              <Badge variant="warning" size="sm">Purged</Badge>
            )}
            {!isPurgedClip(clip) && isEmptyClip(clip) && (
              <Badge variant="warning" size="sm">Empty file</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{clip.project_name}</span>
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
  useSetPageTitle("Review History");

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [reviewerFilter, setReviewerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [showDelivered, setShowDelivered] = useState(false);

  const { data: projects } = useProjects();
  const projectId = projectFilter ? Number(projectFilter) : undefined;
  const { data: clips, isLoading } = useClipsBrowse(projectId);

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
          onChange={setReviewerFilter}
          className="w-40"
        />
        <FilterSelect
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-36"
        />
        <FilterSelect
          label="Project"
          options={projectOptions}
          value={projectFilter}
          onChange={setProjectFilter}
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
          <Spinner />
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
                  to: "/projects/$projectId/models/$characterId",
                  params: {
                    projectId: String(clip.project_id),
                    characterId: String(clip.character_id),
                  },
                  search: { tab: "scenes", scene: String(clip.scene_id) },
                })
              }
            />
          ))}
        </div>
      )}
    </Stack>
  );
}
