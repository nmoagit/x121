/**
 * Per-avatar deliverables section for the Project Overview tab.
 *
 * Two tabs:
 *   1. "Readiness" — table with image/scene counts, metadata, blocking reasons, readiness %.
 *   2. "Matrix"    — compact cartesian product of avatars × columns (per-track images,
 *      scenes+tracks, metadata) showing colored status circles with real per-cell status
 *      from avatar dashboards.
 */

import { useState, useMemo } from "react";
import { TabBar, Toggle ,  ContextLoader } from "@/components/primitives";
import { Tooltip } from "@/components/primitives/Tooltip";
import { AlertTriangle, FileText, Film, Image, Mic } from "@/tokens/icons";
import { variantThumbnailUrl } from "@/features/media/utils";
import { useNavigate } from "@tanstack/react-router";
import { useAvatarPath } from "@/hooks/usePipelinePath";
import { useAvatarDeliverables, useBatchSceneAssignments, useBatchVariantStatuses } from "../hooks/use-avatar-deliverables";
import type { BatchSceneAssignment, BatchVariantStatus } from "../hooks/use-avatar-deliverables";
import { useEnabledSceneTypes } from "@/features/production/hooks/use-production";
import { MEDIA_VARIANT_STATUS } from "@/features/media/types";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import type { Track } from "@/features/scene-catalogue/types";
import type { AvatarDeliverableRow } from "../types";
import { computeReadinessPct, filterBlockingReasons } from "../types";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import { useAvatarGroups } from "../hooks/use-avatar-groups";
import { useProject } from "../hooks/use-projects";
import { useSetting } from "@/features/settings/hooks/use-settings";
import { deduplicateSceneSlots, sceneSlotKey } from "@/features/production/types";
import type { EnabledSceneTypeEntry } from "@/features/production/types";
import { METADATA_APPROVAL_LABEL } from "@/features/avatars/types";
import { cn } from "@/lib/cn";
import { TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Avatar name with thumbnail tooltip
   -------------------------------------------------------------------------- */

function AvatarNameWithThumb({ name, heroVariantId }: { name: string; heroVariantId: number | null }) {
  if (!heroVariantId) return <>{name}</>;
  return (
    <Tooltip
      side="bottom"
      content={
        <img
          src={variantThumbnailUrl(heroVariantId, 256)}
          alt={name}
          className="block h-32 w-32 rounded-[var(--radius-md)] object-cover"
        />
      }
    >
      <span className="cursor-default">{name}</span>
    </Tooltip>
  );
}

/* --------------------------------------------------------------------------
   Readiness tab (existing table)
   -------------------------------------------------------------------------- */

const BLOCKING_ICON_MAP: Record<string, typeof FileText> = {
  "Missing Seed Image": Image,
  "Images Not Approved": Image,
  "No Scenes": Film,
  "Videos Not Approved": Film,
  "Missing Metadata": FileText,
  "Metadata Not Approved": FileText,
  "Missing Speech": Mic,
  "Speech Not Approved": Mic,
};

const BLOCKING_REASON_TAB: Record<string, string> = {
  "Missing Seed Image": "images",
  "Images Not Approved": "images",
  "No Scenes": "scenes",
  "Videos Not Approved": "scenes",
  "Missing Metadata": "metadata",
  "Metadata Not Approved": "metadata",
  "Missing Speech": "speech",
  "Speech Not Approved": "speech",
};

interface RowProps {
  row: AvatarDeliverableRow;
  projectId: number;
  /** Blocking reasons filtered by the avatar's resolved blocking deliverables. */
  filteredBlockingReasons: string[];
  /** Readiness percentage computed from blocking deliverables. */
  readinessPct: number;
  onClick: () => void;
}

function DeliverableRow({ row, projectId, filteredBlockingReasons, readinessPct, onClick }: RowProps) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();
  return (
    <tr
      className={`cursor-pointer ${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
      onClick={onClick}
    >
      <td className={`px-3 py-2 ${TYPO_DATA} font-medium text-[var(--color-text-primary)]`}>
        <AvatarNameWithThumb name={row.name} heroVariantId={row.hero_variant_id} />
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${row.images_approved >= row.required_images_count && row.required_images_count > 0 ? "text-[var(--color-data-green)] font-medium" : "text-[var(--color-data-cyan)]"}`}>
        {row.images_approved}/{row.required_images_count}
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${row.scenes_total > 0 && row.scenes_approved >= row.scenes_total ? "text-[var(--color-data-green)] font-medium" : "text-[var(--color-data-cyan)]"}`}>
        {row.scenes_approved}/{row.scenes_with_video}/{row.scenes_total}
      </td>
      <td className={`px-3 py-2 ${TYPO_DATA}`}>
        {row.has_active_metadata ? (
          <span className={
            row.metadata_approval_status === "approved" ? "text-[var(--color-data-green)]"
              : row.metadata_approval_status === "rejected" ? "text-[var(--color-data-red)]"
              : "text-[var(--color-data-orange)]"
          }>
            {METADATA_APPROVAL_LABEL[row.metadata_approval_status ?? "pending"]}
          </span>
        ) : (
          <span className="text-[var(--color-text-muted)]">No</span>
        )}
      </td>
      <td className="px-3 py-2">
        {filteredBlockingReasons.length > 0 ? (
          <div className="flex items-center gap-1">
            {filteredBlockingReasons.map((reason) => {
              const Icon = BLOCKING_ICON_MAP[reason] ?? AlertTriangle;
              const tab = BLOCKING_REASON_TAB[reason];
              return (
                <Tooltip key={reason} content={reason} side="top">
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex items-center justify-center size-[18px] rounded-full bg-orange-500/20 ring-1 ring-orange-500 cursor-pointer hover:scale-110 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tab) {
                        navigate({
                          to: avatarPath(projectId, row.id) as string,
                          search: { tab },
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && tab) {
                        e.stopPropagation();
                        navigate({
                          to: avatarPath(projectId, row.id) as string,
                          search: { tab },
                        });
                      }
                    }}
                  >
                    <Icon size={10} className="text-orange-500" aria-hidden />
                  </span>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">&mdash;</span>
        )}
      </td>
      <td className={`px-3 py-2 text-right ${TYPO_DATA}`}>
        <span className={readinessPct >= 100 ? "text-[var(--color-data-green)]" : readinessPct >= 50 ? "text-[var(--color-data-cyan)]" : "text-[var(--color-data-orange)]"}>
          {readinessPct.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}

interface ReadinessTabProps {
  rows: AvatarDeliverableRow[];
  projectId: number;
  /** Resolve blocking deliverables for a given row (avatar). */
  resolveBlockingDeliverables: (row: AvatarDeliverableRow) => string[] | undefined;
}

function ReadinessTab({ rows, projectId, resolveBlockingDeliverables }: ReadinessTabProps) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className={TERMINAL_DIVIDER}>
            <th className={`${TERMINAL_TH} px-3 py-2`}>Model</th>
            <th className={`${TERMINAL_TH} px-3 py-2`}>Images</th>
            <th className={`${TERMINAL_TH} px-3 py-2`}>
              <Tooltip content="Approved / With Video / Total"><span>Scenes</span></Tooltip>
            </th>
            <th className={`${TERMINAL_TH} px-3 py-2`}>Metadata</th>
            <th className={`${TERMINAL_TH} px-3 py-2`}>Blocking</th>
            <th className={`${TERMINAL_TH} px-3 py-2 text-right`}>Readiness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bd = resolveBlockingDeliverables(row);
            return (
              <DeliverableRow
                key={row.id}
                row={row}
                projectId={projectId}
                filteredBlockingReasons={filterBlockingReasons(row.blocking_reasons, bd)}
                readinessPct={computeReadinessPct(row, bd)}
                onClick={() =>
                  navigate({
                    to: avatarPath(projectId, row.id) as string,
                    search: { tab: undefined, scene: undefined },
                  })
                }
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Matrix tab
   -------------------------------------------------------------------------- */

/** Dot status — maps to production-matrix-aligned colors. */
type DotStatus = "approved" | "pending" | "generating" | "rejected" | "not_started" | "skipped";

const DOT_COLORS: Record<DotStatus, string> = {
  approved: "bg-green-500",
  pending: "bg-yellow-500",
  generating: "bg-blue-500",
  rejected: "bg-red-500",
  not_started: "bg-neutral-500",
  skipped: "bg-neutral-700/40",
};

const DOT_LABELS: Record<DotStatus, string> = {
  approved: "Approved",
  pending: "Pending",
  generating: "Generating",
  rejected: "Rejected",
  not_started: "Not Started",
  skipped: "Disabled",
};

/** A column definition in the readiness matrix. */
type MatrixColumnDef =
  | { kind: "image"; trackSlug: string; label: string }
  | { kind: "scene"; scene_type_id: number; track_id: number | null; label: string; sceneName: string; trackLabel: string | null; has_clothes_off_transition: boolean }
  | { kind: "metadata"; label: string };

/** Map image variant status_id to dot status. */
function imageStatusToDot(statusId: number): DotStatus {
  switch (statusId) {
    case MEDIA_VARIANT_STATUS.APPROVED:
      return "approved";
    case MEDIA_VARIANT_STATUS.GENERATING:
      return "generating";
    case MEDIA_VARIANT_STATUS.REJECTED:
      return "rejected";
    case MEDIA_VARIANT_STATUS.PENDING:
    case MEDIA_VARIANT_STATUS.GENERATED:
    case MEDIA_VARIANT_STATUS.EDITING:
      return "pending";
    default:
      return "not_started";
  }
}

/**
 * Pick the best variant for a track from a flat list of batch variant statuses.
 * Prefers approved, then falls back to the most recently created (highest id).
 */
function findBestBatchVariant(
  variants: BatchVariantStatus[],
  trackSlug: string,
  matchTypes?: Set<string>,
): BatchVariantStatus | undefined {
  const types = matchTypes ?? new Set([trackSlug.toLowerCase()]);
  const matching = variants.filter(
    (v) => v.variant_type != null && types.has(v.variant_type.toLowerCase()),
  );
  if (matching.length === 0) return undefined;
  return (
    matching.find((v) => v.status_id === MEDIA_VARIANT_STATUS.APPROVED) ??
    matching.sort((a, b) => b.id - a.id)[0]
  );
}

/** Map scene assignment status string to dot status. */
function sceneStatusToDot(assignment: BatchSceneAssignment): DotStatus {
  // If no scene record exists yet, it's not started
  if (!assignment.scene_id) return "not_started";
  const s = assignment.status.toLowerCase();
  if (s === "approved" || s === "delivered") return "approved";
  if (s === "generating") return "generating";
  if (s === "rejected") return "rejected";
  if (s === "review" || s === "generated" || s === "imported" || s === "pending") return "pending";
  return "not_started";
}

/** Clickable status dot. */
function StatusDot({
  status,
  tooltip,
  onClick,
}: {
  status: DotStatus;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={tooltip} side="top">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-3 h-3 rounded-full transition-transform hover:scale-150 cursor-pointer",
          DOT_COLORS[status],
        )}
        aria-label={tooltip}
      />
    </Tooltip>
  );
}

interface MatrixTabProps {
  rows: AvatarDeliverableRow[];
  projectId: number;
}

function MatrixTab({ rows, projectId }: MatrixTabProps) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();

  const avatarIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Fetch tracks (for image columns)
  const pipelineCtx = usePipelineContextSafe();
  const { data: tracks, isLoading: tracksLoading } = useTracks(false, pipelineCtx?.pipelineId);

  // Fetch enabled scene types (for scene columns)
  const { data: enabledEntries, isLoading: scenesLoading } = useEnabledSceneTypes(projectId, avatarIds);

  // Batch-fetch variant statuses for all avatars in one request
  const { data: batchVariants, isLoading: variantsLoading } = useBatchVariantStatuses(projectId);

  // Batch-fetch scene assignments for all avatars in one request
  const { data: batchAssignments, isLoading: assignmentsLoading } = useBatchSceneAssignments(projectId);

  // Build avatar → variants map
  const variantsByAvatar = useMemo(() => {
    const map = new Map<number, BatchVariantStatus[]>();
    if (!batchVariants) return map;
    for (const v of batchVariants) {
      let list = map.get(v.avatar_id);
      if (!list) {
        list = [];
        map.set(v.avatar_id, list);
      }
      list.push(v);
    }
    return map;
  }, [batchVariants]);

  // Build avatar → scene assignments map (keyed by scene_type_id-track_id)
  const sceneStatusMap = useMemo(() => {
    const map = new Map<number, Map<string, BatchSceneAssignment>>();
    if (!batchAssignments) return map;
    for (const sa of batchAssignments) {
      let inner = map.get(sa.avatar_id);
      if (!inner) {
        inner = new Map();
        map.set(sa.avatar_id, inner);
      }
      inner.set(sceneSlotKey(sa.scene_type_id, sa.track_id), sa);
    }
    return map;
  }, [batchAssignments]);

  // Build avatar → enabled scene slot keys set (from enabledEntries)
  const enabledByAvatar = useMemo(() => {
    const map = new Map<number, Set<string>>();
    if (!enabledEntries) return map;
    for (const entry of enabledEntries) {
      let set = map.get(entry.avatar_id);
      if (!set) {
        set = new Set();
        map.set(entry.avatar_id, set);
      }
      set.add(sceneSlotKey(entry.scene_type_id, entry.track_id));
    }
    return map;
  }, [enabledEntries]);

  // Image columns — one per active track
  const imageColumns: MatrixColumnDef[] = useMemo(() => {
    if (!tracks) return [];
    return tracks
      .filter((t: Track) => t.is_active)
      .sort((a: Track, b: Track) => a.sort_order - b.sort_order)
      .map((t: Track) => ({
        kind: "image" as const,
        trackSlug: t.slug,
        label: t.name,
      }));
  }, [tracks]);

  // Scene columns — deduplicated from enabled entries, with separate name/track for two-line headers
  const sceneColumns: MatrixColumnDef[] = useMemo(() => {
    if (!enabledEntries) return [];
    const slots = deduplicateSceneSlots(enabledEntries);
    const entryByKey = new Map<string, EnabledSceneTypeEntry>();
    for (const entry of enabledEntries) {
      const key = sceneSlotKey(entry.scene_type_id, entry.track_id);
      if (!entryByKey.has(key)) entryByKey.set(key, entry);
    }
    return slots.map((slot) => {
      const entry = entryByKey.get(slot.key);
      let trackLabel: string | null = null;
      if (slot.has_clothes_off_transition) {
        trackLabel = "Clothes Off";
      } else if (entry?.track_name) {
        trackLabel = entry.track_name;
      }
      return {
        kind: "scene" as const,
        scene_type_id: slot.scene_type_id,
        track_id: slot.track_id,
        label: slot.label,
        sceneName: entry?.scene_type_name ?? slot.label,
        trackLabel,
        has_clothes_off_transition: slot.has_clothes_off_transition,
      };
    });
  }, [enabledEntries]);

  // All columns: image tracks | scene slots | metadata
  const columns: MatrixColumnDef[] = useMemo(
    () => [...imageColumns, ...sceneColumns, { kind: "metadata", label: "Metadata" }],
    [imageColumns, sceneColumns],
  );

  const navigateToCell = (
    aid: number,
    col: MatrixColumnDef,
  ) => {
    if (col.kind === "image") {
      navigate({
        to: avatarPath(projectId, aid) as string,
        search: { tab: "images", scene: undefined },
      });
    } else if (col.kind === "scene") {
      const base = avatarPath(projectId, aid);
      const url = `${base}?tab=scenes&scene_type=${col.scene_type_id}${col.track_id != null ? `&track=${col.track_id}` : ""}`;
      navigate({ to: url });
    } else {
      navigate({
        to: avatarPath(projectId, aid) as string,
        search: { tab: "metadata", scene: undefined },
      });
    }
  };

  // Show spinner only while columns are loading (tracks + scene types)
  // Once columns are ready, show skeleton grid while cell data loads
  const columnsLoading = tracksLoading || scenesLoading;
  const cellsLoading = variantsLoading || assignmentsLoading;

  if (columnsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        {(["approved", "pending", "generating", "rejected", "not_started", "skipped"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", DOT_COLORS[s])} />
            <span className="text-[10px] text-[var(--color-text-muted)]">{DOT_LABELS[s]}</span>
          </div>
        ))}
      </div>

      <table className="w-full table-fixed">
        <colgroup>
          <col style={{ width: 120 }} />
          {columns.map((_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr className={TERMINAL_DIVIDER}>
            <th className={`${TERMINAL_TH} px-2 py-1.5 whitespace-nowrap sticky left-0 bg-[var(--color-surface-primary)] z-10`}>
              Model
            </th>
            {columns.map((col) => {
              const key =
                col.kind === "scene"
                  ? `scene-${col.scene_type_id}-${col.track_id}`
                  : col.kind === "image"
                    ? `img-${col.trackSlug}`
                    : "metadata";
              return (
                <th
                  key={key}
                  className={`${TERMINAL_TH} px-0.5 py-1.5 text-center`}
                >
                  {col.kind === "image" ? (
                    <Tooltip content={`Image: ${col.label}`}>
                      <div>
                        <div className="truncate">Image</div>
                        <div className="truncate text-[9px] font-normal opacity-60">{col.label}</div>
                      </div>
                    </Tooltip>
                  ) : col.kind === "scene" ? (
                    <Tooltip content={col.label}>
                      <div>
                        <div className="truncate">{col.sceneName}</div>
                        {col.trackLabel && (
                          <div className="truncate text-[9px] font-normal opacity-60">{col.trackLabel}</div>
                        )}
                      </div>
                    </Tooltip>
                  ) : (
                    <Tooltip content={col.label}>
                      <div className="truncate">{col.label}</div>
                    </Tooltip>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
            >
              <td className={`px-2 py-1.5 ${TYPO_DATA} font-medium text-[var(--color-text-primary)] whitespace-nowrap sticky left-0 bg-[var(--color-surface-primary)] z-10`}>
                <button
                  type="button"
                  className="hover:underline cursor-pointer text-left"
                  onClick={() => navigate({
                    to: avatarPath(projectId, row.id) as string,
                    search: { tab: undefined, scene: undefined },
                  })}
                >
                  <AvatarNameWithThumb name={row.name} heroVariantId={row.hero_variant_id} />
                </button>
              </td>
              {columns.map((col) => {
                const cellKey =
                  col.kind === "scene"
                    ? `scene-${col.scene_type_id}-${col.track_id}`
                    : col.kind === "image"
                      ? `img-${col.trackSlug}`
                      : "metadata";

                // Show skeleton dot while cell data is loading
                if (cellsLoading) {
                  return (
                    <td key={cellKey} className="px-0.5 py-1.5 text-center">
                      <div className="flex justify-center">
                        <span className="w-3 h-3 rounded-full bg-neutral-700/20 animate-pulse" />
                      </div>
                    </td>
                  );
                }

                let status: DotStatus;
                let tooltip: string;

                if (col.kind === "image") {
                  const variants = variantsByAvatar.get(row.id) ?? [];
                  const best = findBestBatchVariant(variants, col.trackSlug);
                  if (!best) {
                    status = "not_started";
                    tooltip = `${col.label}: No image`;
                  } else {
                    status = imageStatusToDot(best.status_id);
                    tooltip = `${col.label}: ${DOT_LABELS[status]}`;
                  }
                } else if (col.kind === "metadata") {
                  if (!row.has_active_metadata) {
                    status = "not_started";
                    tooltip = "Metadata: Not started";
                  } else if (row.metadata_approval_status === "approved") {
                    status = "approved";
                    tooltip = "Metadata: Approved";
                  } else if (row.metadata_approval_status === "rejected") {
                    status = "rejected";
                    tooltip = "Metadata: Rejected";
                  } else {
                    status = "pending";
                    tooltip = "Metadata: Pending Approval";
                  }
                } else {
                  // Scene — look up real status from batch scene assignments
                  const charScenes = sceneStatusMap.get(row.id);
                  const saKey = sceneSlotKey(col.scene_type_id, col.track_id);
                  const assignment = charScenes?.get(saKey);
                  const isEnabled = enabledByAvatar.get(row.id)?.has(saKey) ?? false;
                  if (assignment) {
                    status = sceneStatusToDot(assignment);
                    tooltip = `${col.label}: ${DOT_LABELS[status]}`;
                    if (assignment.final_video_count > 0 && status !== "approved") {
                      tooltip += ` (${assignment.final_video_count} final)`;
                    }
                  } else if (isEnabled) {
                    status = "not_started";
                    tooltip = `${col.label}: Not Started`;
                  } else {
                    status = "skipped";
                    tooltip = `${col.label}: Disabled`;
                  }
                }

                return (
                  <td key={cellKey} className="px-0.5 py-1.5 text-center">
                    <div className="flex justify-center">
                      <StatusDot
                        status={status}
                        tooltip={tooltip}
                        onClick={() => navigateToCell(row.id, col)}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

type DeliverableTabKey = "readiness" | "matrix";

const DELIVERABLE_TABS: { key: string; label: string }[] = [
  { key: "readiness", label: "Readiness" },
  { key: "matrix", label: "Matrix" },
];

interface AvatarDeliverablesGridProps {
  projectId: number;
}

export function AvatarDeliverablesGrid({ projectId }: AvatarDeliverablesGridProps) {
  const { data: rows, isLoading } = useAvatarDeliverables(projectId);
  const { groups } = useGroupSelectOptions(projectId);
  const { data: charGroups } = useAvatarGroups(projectId);
  const { data: project } = useProject(projectId);
  const { data: studioSetting } = useSetting("blocking_deliverables");
  const [activeTab, setActiveTab] = useState<DeliverableTabKey>("readiness");
  const [hideComplete, setHideComplete] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());

  /** Resolve blocking deliverables per avatar: avatar → group → project → studio. */
  const resolveBlockingDeliverables = useMemo(() => {
    const studioDefault = studioSetting?.value
      ? studioSetting.value.split(",").map((s: string) => s.trim()).filter(Boolean)
      : ["metadata", "images", "scenes"];
    const projectBd = project?.blocking_deliverables ?? studioDefault;

    const groupBdMap = new Map<number, string[]>();
    if (charGroups) {
      for (const g of charGroups) {
        if (g.blocking_deliverables) {
          groupBdMap.set(g.id, g.blocking_deliverables);
        }
      }
    }

    return (row: AvatarDeliverableRow): string[] | undefined => {
      // Note: AvatarDeliverableRow doesn't have blocking_deliverables from the avatar
      // itself (it's not in the SQL query), so we only resolve group → project → studio.
      if (row.group_id && groupBdMap.has(row.group_id)) return groupBdMap.get(row.group_id);
      return projectBd;
    };
  }, [charGroups, project?.blocking_deliverables, studioSetting?.value]);

  const toggleGroup = (gid: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const { filtered, completeCount } = useMemo(() => {
    if (!rows) return { filtered: [], completeCount: 0 };
    const base = selectedGroups.size > 0
      ? rows.filter((r) => r.group_id != null && selectedGroups.has(r.group_id))
      : rows;
    const isComplete = (r: AvatarDeliverableRow) => {
      const bd = resolveBlockingDeliverables(r);
      return computeReadinessPct(r, bd) >= 100 && filterBlockingReasons(r.blocking_reasons, bd).length === 0;
    };
    const complete = base.filter(isComplete);
    return {
      filtered: hideComplete ? base.filter((r) => !isComplete(r)) : base,
      completeCount: complete.length,
    };
  }, [rows, hideComplete, selectedGroups, resolveBlockingDeliverables]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No avatars in this project.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <TabBar tabs={DELIVERABLE_TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as DeliverableTabKey)} variant="pills" />
          <span className="text-xs text-[var(--color-text-muted)]">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(groups ?? []).length > 1 && (
            <div className="flex items-center gap-1">
              {(groups ?? []).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide rounded-[3px] transition-colors cursor-pointer border",
                    selectedGroups.has(g.id)
                      ? "bg-[var(--color-action-primary)] text-white border-[var(--color-action-primary)]"
                      : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]",
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {completeCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Toggle
                checked={hideComplete}
                onChange={setHideComplete}
                size="sm"
              />
              <span className="text-xs text-[var(--color-text-muted)]">
                Hide complete ({completeCount})
              </span>
            </div>
          )}
        </div>
      </div>

      {activeTab === "readiness" && (
        <ReadinessTab rows={filtered} projectId={projectId} resolveBlockingDeliverables={resolveBlockingDeliverables} />
      )}

      {activeTab === "matrix" && (
        <MatrixTab rows={filtered} projectId={projectId} />
      )}
    </div>
  );
}
