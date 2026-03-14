/**
 * Per-character deliverables section for the Project Overview tab.
 *
 * Two tabs:
 *   1. "Readiness" — table with image/scene counts, metadata, blocking reasons, readiness %.
 *   2. "Matrix"    — compact cartesian product of characters × columns (per-track images,
 *      scenes+tracks, metadata) showing colored status circles with real per-cell status
 *      from character dashboards.
 */

import { useState, useMemo } from "react";
import { Badge, Spinner, TabBar, Toggle } from "@/components/primitives";
import { useNavigate } from "@tanstack/react-router";
import { useCharacterDeliverables, useBatchSceneAssignments, useBatchVariantStatuses } from "../hooks/use-character-deliverables";
import type { BatchSceneAssignment, BatchVariantStatus } from "../hooks/use-character-deliverables";
import { useEnabledSceneTypes } from "@/features/production/hooks/use-production";
import { IMAGE_VARIANT_STATUS } from "@/features/images/types";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import type { Track } from "@/features/scene-catalogue/types";
import type { CharacterDeliverableRow } from "../types";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import { deduplicateSceneSlots, sceneSlotKey } from "@/features/production/types";
import type { EnabledSceneTypeEntry } from "@/features/production/types";
import { readinessPctToVariant } from "@/features/readiness/types";
import { metadataApprovalBadgeVariant, METADATA_APPROVAL_LABEL } from "@/features/characters/types";
import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Readiness tab (existing table)
   -------------------------------------------------------------------------- */

interface RowProps {
  row: CharacterDeliverableRow;
  onClick: () => void;
}

function DeliverableRow({ row, onClick }: RowProps) {
  return (
    <tr
      className="cursor-pointer border-b border-[var(--color-border-default)]
        hover:bg-[var(--color-surface-secondary)] transition-colors"
      onClick={onClick}
    >
      <td className="px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
        {row.name}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {row.images_approved}/{row.images_count}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {row.scenes_approved}/{row.scenes_with_video}/{row.scenes_total}
      </td>
      <td className="px-3 py-2 text-sm">
        {row.has_active_metadata ? (
          <Badge
            variant={metadataApprovalBadgeVariant(row.metadata_approval_status ?? "pending")}
            size="sm"
          >
            {METADATA_APPROVAL_LABEL[row.metadata_approval_status ?? "pending"]}
          </Badge>
        ) : (
          <Badge variant="default" size="sm">No</Badge>
        )}
      </td>
      <td className="px-3 py-2">
        {row.blocking_reasons.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.blocking_reasons.map((reason) => (
              <Badge key={reason} variant="warning" size="sm">{reason}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">&mdash;</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Badge variant={readinessPctToVariant(row.readiness_pct)} size="sm">
          {row.readiness_pct.toFixed(1)}%
        </Badge>
      </td>
    </tr>
  );
}

interface ReadinessTabProps {
  rows: CharacterDeliverableRow[];
  projectId: number;
}

function ReadinessTab({ rows, projectId }: ReadinessTabProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="px-3 py-2">Character</th>
            <th className="px-3 py-2">Images</th>
            <th className="px-3 py-2" title="Approved / With Video / Total">Scenes</th>
            <th className="px-3 py-2">Metadata</th>
            <th className="px-3 py-2">Blocking</th>
            <th className="px-3 py-2 text-right">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DeliverableRow
              key={row.id}
              row={row}
              onClick={() =>
                navigate({
                  to: "/projects/$projectId/characters/$characterId",
                  params: { projectId: String(projectId), characterId: String(row.id) },
                  search: { tab: undefined, scene: undefined },
                })
              }
            />
          ))}
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
    case IMAGE_VARIANT_STATUS.APPROVED:
      return "approved";
    case IMAGE_VARIANT_STATUS.GENERATING:
      return "generating";
    case IMAGE_VARIANT_STATUS.REJECTED:
      return "rejected";
    case IMAGE_VARIANT_STATUS.PENDING:
    case IMAGE_VARIANT_STATUS.GENERATED:
    case IMAGE_VARIANT_STATUS.EDITING:
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
): BatchVariantStatus | undefined {
  const matching = variants.filter(
    (v) => v.variant_type?.toLowerCase() === trackSlug.toLowerCase(),
  );
  if (matching.length === 0) return undefined;
  return (
    matching.find((v) => v.status_id === IMAGE_VARIANT_STATUS.APPROVED) ??
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
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className={cn(
        "w-3 h-3 rounded-full transition-transform hover:scale-150 cursor-pointer",
        DOT_COLORS[status],
      )}
      aria-label={tooltip}
    />
  );
}

interface MatrixTabProps {
  rows: CharacterDeliverableRow[];
  projectId: number;
}

function MatrixTab({ rows, projectId }: MatrixTabProps) {
  const navigate = useNavigate();

  const characterIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Fetch tracks (for image columns)
  const { data: tracks, isLoading: tracksLoading } = useTracks();

  // Fetch enabled scene types (for scene columns)
  const { data: enabledEntries, isLoading: scenesLoading } = useEnabledSceneTypes(projectId, characterIds);

  // Batch-fetch variant statuses for all characters in one request
  const { data: batchVariants, isLoading: variantsLoading } = useBatchVariantStatuses(projectId);

  // Batch-fetch scene assignments for all characters in one request
  const { data: batchAssignments, isLoading: assignmentsLoading } = useBatchSceneAssignments(projectId);

  // Build character → variants map
  const variantsByCharacter = useMemo(() => {
    const map = new Map<number, BatchVariantStatus[]>();
    if (!batchVariants) return map;
    for (const v of batchVariants) {
      let list = map.get(v.character_id);
      if (!list) {
        list = [];
        map.set(v.character_id, list);
      }
      list.push(v);
    }
    return map;
  }, [batchVariants]);

  // Build character → scene assignments map (keyed by scene_type_id-track_id)
  const sceneStatusMap = useMemo(() => {
    const map = new Map<number, Map<string, BatchSceneAssignment>>();
    if (!batchAssignments) return map;
    for (const sa of batchAssignments) {
      let inner = map.get(sa.character_id);
      if (!inner) {
        inner = new Map();
        map.set(sa.character_id, inner);
      }
      inner.set(sceneSlotKey(sa.scene_type_id, sa.track_id), sa);
    }
    return map;
  }, [batchAssignments]);

  // Build character → enabled scene slot keys set (from enabledEntries)
  const enabledByCharacter = useMemo(() => {
    const map = new Map<number, Set<string>>();
    if (!enabledEntries) return map;
    for (const entry of enabledEntries) {
      let set = map.get(entry.character_id);
      if (!set) {
        set = new Set();
        map.set(entry.character_id, set);
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
    characterId: number,
    col: MatrixColumnDef,
  ) => {
    const params = { projectId: String(projectId), characterId: String(characterId) };

    if (col.kind === "image") {
      navigate({
        to: "/projects/$projectId/characters/$characterId",
        params,
        search: { tab: "images", scene: undefined },
      });
    } else if (col.kind === "scene") {
      // scene_type and track are picked up by useSearch({ strict: false }) in CharacterDetailPage
      const url = `/projects/${projectId}/characters/${characterId}?tab=scenes&scene_type=${col.scene_type_id}${col.track_id != null ? `&track=${col.track_id}` : ""}`;
      navigate({ to: url });
    } else {
      navigate({
        to: "/projects/$projectId/characters/$characterId",
        params,
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
        <Spinner size="md" />
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
          <tr className="border-b border-[var(--color-border-default)]">
            <th className="px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap sticky left-0 bg-[var(--color-surface-primary)] z-10">
              Character
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
                  className="px-0.5 py-1.5 text-center text-[10px] font-medium text-[var(--color-text-muted)]"
                >
                  {col.kind === "image" ? (
                    <div title={`Image: ${col.label}`}>
                      <div className="truncate">Image</div>
                      <div className="truncate text-[9px] font-normal opacity-60">{col.label}</div>
                    </div>
                  ) : col.kind === "scene" ? (
                    <div title={col.label}>
                      <div className="truncate">{col.sceneName}</div>
                      {col.trackLabel && (
                        <div className="truncate text-[9px] font-normal opacity-60">{col.trackLabel}</div>
                      )}
                    </div>
                  ) : (
                    <div className="truncate" title={col.label}>{col.label}</div>
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
              className="border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)] transition-colors"
            >
              <td className="px-2 py-1.5 text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap sticky left-0 bg-[var(--color-surface-primary)] z-10">
                <button
                  type="button"
                  className="hover:underline cursor-pointer text-left"
                  onClick={() => navigate({
                    to: "/projects/$projectId/characters/$characterId",
                    params: { projectId: String(projectId), characterId: String(row.id) },
                    search: { tab: undefined, scene: undefined },
                  })}
                >
                  {row.name}
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
                  const variants = variantsByCharacter.get(row.id) ?? [];
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
                  const isEnabled = enabledByCharacter.get(row.id)?.has(saKey) ?? false;
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

interface CharacterDeliverablesGridProps {
  projectId: number;
}

export function CharacterDeliverablesGrid({ projectId }: CharacterDeliverablesGridProps) {
  const { data: rows, isLoading } = useCharacterDeliverables(projectId);
  const { groups } = useGroupSelectOptions(projectId);
  const [activeTab, setActiveTab] = useState<DeliverableTabKey>("readiness");
  const [hideComplete, setHideComplete] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());

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
    const complete = base.filter((r) => r.readiness_pct >= 100 && r.blocking_reasons.length === 0);
    return {
      filtered: hideComplete
        ? base.filter((r) => r.readiness_pct < 100 || r.blocking_reasons.length > 0)
        : base,
      completeCount: complete.length,
    };
  }, [rows, hideComplete, selectedGroups]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No characters in this project.
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
                    "px-2 py-0.5 text-[11px] font-medium rounded-[var(--radius-full)] transition-colors cursor-pointer border",
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
        <ReadinessTab rows={filtered} projectId={projectId} />
      )}

      {activeTab === "matrix" && (
        <MatrixTab rows={filtered} projectId={projectId} />
      )}
    </div>
  );
}
