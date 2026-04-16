/**
 * Project production tab (PRD-112, PRD-57).
 *
 * Shows production runs with a avatar × scene-type matrix grid,
 * progress dashboard, and queue outstanding action.
 *
 * Archived avatars (status_id === 3) are excluded from the production view.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAvatarPath } from "@/hooks/usePipelinePath";
import { Modal, useToast } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Input, LoadingPane, Toggle } from "@/components/primitives";
import { ChevronDown, Eye, List, Play, Plus, RefreshCw, Trash2, XCircle, Zap } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { MatrixGrid } from "@/features/production/MatrixGrid";
import { ProductionProgress } from "@/features/production/ProductionProgress";
import {
  useProductionRuns,
  useCreateProductionRun,
  useCancelCells,
  useCancelAvatarCells,
  useCancelProductionRun,
  useDeleteAvatarCells,
  useDeleteCells,
  useDeleteProductionRun,
  useEnabledSceneTypes,
  useProductionMatrix,
  useProductionProgress,
  useResubmitFailed,
} from "@/features/production/hooks/use-production";
import { RUN_STATUS_LABELS, deduplicateSceneSlots, sceneSlotKey } from "@/features/production/types";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_BODY, TERMINAL_ROW_HOVER, TERMINAL_DIVIDER, TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import type { ProductionRun } from "@/features/production/types";
import { useQueueStatus } from "@/features/queue/hooks/use-queue";

import { useProjectAvatars } from "../hooks/use-project-avatars";
import { useAvatarGroups } from "../hooks/use-avatar-groups";
import { QueueOutstandingModal } from "../components/QueueOutstandingModal";
import { CHARACTER_STATUS_ID_ARCHIVED } from "../types";
import type { Avatar, AvatarGroup } from "../types";
import { TYPO_DATA, TYPO_SECTION_TITLE, TYPO_TIMESTAMP} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectProductionTabProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectProductionTab({ projectId }: ProjectProductionTabProps) {
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const { data: queueStatus } = useQueueStatus();
  const { data: runs, isLoading: runsLoading } = useProductionRuns(projectId);

  // Auto-select latest run when data loads
  const activeRun = useMemo(() => {
    if (selectedRunId) return runs?.find((r) => r.id === selectedRunId) ?? null;
    if (runs && runs.length > 0) return runs[0];
    return null;
  }, [runs, selectedRunId]);

  return (
    <Stack gap={6}>
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button onClick={() => setCreateModalOpen(true)} icon={<Plus size={iconSizes.sm} />}>
            Create Run
          </Button>
          <Button variant="secondary" onClick={() => setQueueModalOpen(true)} icon={<Play size={iconSizes.sm} />}>
            Queue Outstanding
          </Button>

          {queueStatus && (
            <div className={`flex items-center gap-2 ${TYPO_DATA}`}>
              <span className="text-[var(--color-data-orange)]">{queueStatus.total_queued} queued</span>
              <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>
              <span className="text-[var(--color-data-cyan)]">{queueStatus.total_running} running</span>
            </div>
          )}
        </div>
      </div>

      {/* Production runs list */}
      {runsLoading && <LoadingPane />}

      {!runsLoading && (!runs || runs.length === 0) && (
        <EmptyState
          icon={<Zap size={32} />}
          title="No production runs yet"
          description="Create a production run to generate scenes for your avatars."
        />
      )}

      {!runsLoading && runs && runs.length > 0 && (
        <>
          {/* Run selector */}
          <RunSelector
            runs={runs}
            selectedRunId={activeRun?.id ?? null}
            onSelect={setSelectedRunId}
          />

          {/* Selected run detail */}
          {activeRun && (
            <RunDetail
              run={activeRun}
              projectId={projectId}
              onDeleted={() => setSelectedRunId(null)}
            />
          )}
        </>
      )}

      {/* Queue Outstanding Modal */}
      <QueueOutstandingModal
        open={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        projectId={projectId}
      />

      {/* Create Run Modal */}
      <CreateRunModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        projectId={projectId}
        onCreated={(id) => setSelectedRunId(id)}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Run selector
   -------------------------------------------------------------------------- */

function RunSelector({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: ProductionRun[];
  selectedRunId: number | null;
  onSelect: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (runs.length === 1) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"
      >
        <List size={iconSizes.sm} />
        Production Runs ({runs.length})
        <ChevronDown
          size={14}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className={TERMINAL_PANEL}>
          {runs.map((run, idx) => {
            const statusLabel = RUN_STATUS_LABELS[run.status_id] ?? "Unknown";
            const statusColor = TERMINAL_STATUS_COLORS[statusLabel.toLowerCase()] ?? "text-[var(--color-text-muted)]";
            const pct =
              run.total_cells > 0 ? Math.round((run.completed_cells / run.total_cells) * 100) : 0;
            const isSelected = run.id === selectedRunId;

            return (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  onSelect(run.id);
                  setExpanded(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${TERMINAL_ROW_HOVER} ${
                  isSelected ? "bg-[var(--color-surface-secondary)]" : ""
                } ${idx > 0 ? TERMINAL_DIVIDER : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelected && <Eye size={14} className="text-[var(--color-action-primary)] shrink-0" />}
                  <div className="min-w-0">
                    <span className="text-xs font-medium font-mono text-[var(--color-text-primary)] truncate block">
                      {run.name}
                    </span>
                    {run.description && (
                      <span className={`truncate block ${TYPO_TIMESTAMP}`}>
                        {run.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`flex items-center gap-2 shrink-0 ${TYPO_DATA}`}>
                  <span className={statusColor}>{statusLabel}</span>
                  <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>
                  <span className="text-[var(--color-data-cyan)] tabular-nums">
                    {run.completed_cells}/{run.total_cells} ({pct}%)
                  </span>
                  {run.failed_cells > 0 && (
                    <>
                      <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>
                      <span className="text-[var(--color-data-red)]">{run.failed_cells} failed</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Create run modal
   -------------------------------------------------------------------------- */

function CreateRunModal({
  open,
  onClose,
  projectId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAvatarIds, setSelectedAvatarIds] = useState<Set<number>>(new Set());
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [retrospective, setRetrospective] = useState(true);

  const { data: allAvatars } = useProjectAvatars(projectId);
  const { data: groups } = useAvatarGroups(projectId);
  const createRun = useCreateProductionRun();
  const toast = useToast();

  // Non-archived avatars
  const avatars = useMemo(
    () => (allAvatars ?? []).filter((c) => c.status_id !== CHARACTER_STATUS_ID_ARCHIVED),
    [allAvatars],
  );

  // Group avatars by group_id (null → "Ungrouped")
  const avatarsByGroup = useMemo(() => {
    const sortedGroups = (groups ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const groupMap = new Map<number | null, { group: AvatarGroup | null; chars: Avatar[] }>();
    for (const g of sortedGroups) {
      groupMap.set(g.id, { group: g, chars: [] });
    }
    groupMap.set(null, { group: null, chars: [] });
    for (const c of avatars) {
      const entry = groupMap.get(c.group_id) ?? groupMap.get(null)!;
      entry.chars.push(c);
    }
    return Array.from(groupMap.values()).filter((e) => e.chars.length > 0);
  }, [avatars, groups]);

  // Determine which avatar IDs to query enabled scene types for
  const activeAvatarIds = useMemo(() => {
    if (selectedAvatarIds.size > 0) return Array.from(selectedAvatarIds);
    return avatars.map((c) => c.id);
  }, [selectedAvatarIds, avatars]);

  // Fetch enabled scene types for selected avatars
  const { data: enabledEntries } = useEnabledSceneTypes(projectId, activeAvatarIds);

  // Build the list of scene slots (scene_type+track+clothes_off) from enabled entries (union).
  const sceneSlots = useMemo(() => {
    if (!enabledEntries || activeAvatarIds.length === 0) return [];
    return deduplicateSceneSlots(enabledEntries);
  }, [enabledEntries, activeAvatarIds]);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    setSelectedAvatarIds(new Set());
    setSelectedSlotKeys(new Set());
    setRetrospective(true);
    onClose();
  }, [onClose]);

  const toggleAvatar = useCallback((id: number, checked: boolean) => {
    setSelectedAvatarIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    // Clear slot selection when avatars change (enabled list may differ)
    setSelectedSlotKeys(new Set());
  }, []);

  const toggleSlot = useCallback((key: string, checked: boolean) => {
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Select all / none helpers
  const allCharsSelected = avatars.length > 0 && selectedAvatarIds.size === avatars.length;
  const allSlotsSelected = sceneSlots.length > 0 && selectedSlotKeys.size === sceneSlots.length;

  const toggleAllAvatars = useCallback(
    (checked: boolean) => {
      setSelectedAvatarIds(checked ? new Set(avatars.map((c) => c.id)) : new Set());
      setSelectedSlotKeys(new Set());
    },
    [avatars],
  );

  const toggleAllSlots = useCallback(
    (checked: boolean) => {
      setSelectedSlotKeys(checked ? new Set(sceneSlots.map((s) => s.key)) : new Set());
    },
    [sceneSlots],
  );

  const handleCreate = useCallback(() => {
    const charIds = selectedAvatarIds.size > 0
      ? Array.from(selectedAvatarIds)
      : avatars.map((c) => c.id);

    // Derive unique scene_type_ids from selected slots (or all slots if none selected)
    const activeSlots = selectedSlotKeys.size > 0
      ? sceneSlots.filter((s) => selectedSlotKeys.has(s.key))
      : sceneSlots;
    const stIds = [...new Set(activeSlots.map((s) => s.scene_type_id))];

    if (charIds.length === 0 || stIds.length === 0) {
      toast.addToast({ message: "Select at least one avatar and one scene.", variant: "warning" });
      return;
    }

    createRun.mutate(
      {
        project_id: projectId,
        name: name.trim() || `Run ${new Date().toLocaleDateString()}`,
        description: description.trim() || undefined,
        avatar_ids: charIds,
        scene_type_ids: stIds,
        retrospective,
      },
      {
        onSuccess: (run) => {
          const retroMsg = run.completed_cells > 0
            ? ` (${run.completed_cells} pre-matched from existing approved scenes)`
            : "";
          toast.addToast({
            message: `Production run "${run.name}" created with ${run.total_cells} cells.${retroMsg}`,
            variant: "success",
          });
          onCreated(run.id);
          handleClose();
        },
        onError: () => {
          toast.addToast({ message: "Failed to create production run.", variant: "error" });
        },
      },
    );
  }, [name, description, selectedAvatarIds, selectedSlotKeys, avatars, sceneSlots, projectId, retrospective, createRun, toast, onCreated, handleClose]);

  const slotCount = selectedSlotKeys.size || sceneSlots.length;
  const cellCount = (selectedAvatarIds.size || avatars.length) * slotCount;

  return (
    <Modal open={open} onClose={handleClose} title="Create Production Run" size="xl">
      <Stack gap={4}>
        {/* Run name */}
        <Input
          label="Run Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Run ${new Date().toLocaleDateString()}`}
        />

        {/* Description */}
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes about this production run"
        />

        {/* Avatar selection — grouped */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
              Avatars (<span className="text-[var(--color-data-cyan)]">{selectedAvatarIds.size || avatars.length}</span> selected)
            </span>
            <Checkbox
              label="Select all"
              checked={allCharsSelected}
              indeterminate={selectedAvatarIds.size > 0 && !allCharsSelected}
              onChange={toggleAllAvatars}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-1.5 space-y-2">
            {avatarsByGroup.map(({ group, chars }) => {
              const groupCharIds = chars.map((c) => c.id);
              const allInGroupSelected = groupCharIds.every((id) => selectedAvatarIds.has(id));
              const someInGroupSelected = groupCharIds.some((id) => selectedAvatarIds.has(id));
              return (
                <div key={group?.id ?? "ungrouped"}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                      {group?.name ?? "Ungrouped"}
                    </span>
                    <Checkbox
                      label="All"
                      checked={allInGroupSelected}
                      indeterminate={someInGroupSelected && !allInGroupSelected}
                      onChange={(checked) => {
                        setSelectedAvatarIds((prev) => {
                          const next = new Set(prev);
                          for (const id of groupCharIds) {
                            if (checked) next.add(id);
                            else next.delete(id);
                          }
                          return next;
                        });
                        setSelectedSlotKeys(new Set());
                      }}
                      size="sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {chars.map((c) => (
                      <Checkbox
                        key={c.id}
                        label={c.name}
                        checked={selectedAvatarIds.has(c.id)}
                        onChange={(checked) => toggleAvatar(c.id, checked)}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {avatars.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-2 text-center">No avatars in this project.</p>
            )}
          </div>
        </div>

        {/* Scene slot selection — scene_type+track+clothes_off combos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
              Scenes (<span className="text-[var(--color-data-cyan)]">{selectedSlotKeys.size || sceneSlots.length}</span> selected)
            </span>
            {sceneSlots.length > 0 && (
              <Checkbox
                label="Select all"
                checked={allSlotsSelected}
                indeterminate={selectedSlotKeys.size > 0 && !allSlotsSelected}
                onChange={toggleAllSlots}
              />
            )}
          </div>
          <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-1.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {sceneSlots.map((slot) => (
                <Checkbox
                  key={slot.key}
                  label={slot.label}
                  checked={selectedSlotKeys.has(slot.key)}
                  onChange={(checked) => toggleSlot(slot.key, checked)}
                  size="sm"
                />
              ))}
            </div>
            {sceneSlots.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-2 text-center">
                {activeAvatarIds.length === 0
                  ? "Select avatars first to see available scenes."
                  : "No scenes enabled for the selected avatars."}
              </p>
            )}
          </div>
        </div>

        {/* Retrospective matching */}
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-1.5">
          <Toggle
            label="Include existing approved scenes (retrospective)"
            checked={retrospective}
            onChange={setRetrospective}
            size="sm"
          />
          <p className="mt-1 ml-7 text-xs font-mono text-[var(--color-text-muted)]">
            Pre-marks cells as completed where an approved video already exists for the avatar + scene type.
          </p>
        </div>

        {/* Summary and actions */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-default)]">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            <span className="text-[var(--color-data-cyan)]">{cellCount}</span> cell{cellCount !== 1 ? "s" : ""} will be created
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              loading={createRun.isPending}
              disabled={sceneSlots.length === 0 || avatars.length === 0}
            >
              Create Run
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Run detail with matrix and progress
   -------------------------------------------------------------------------- */

function RunDetail({
  run,
  projectId,
  onDeleted,
}: {
  run: ProductionRun;
  projectId: number;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: cells, isLoading: cellsLoading } = useProductionMatrix(run.id);
  const { data: progress } = useProductionProgress(run.id);
  const { data: allAvatars } = useProjectAvatars(projectId);
  const resubmitFailed = useResubmitFailed(run.id);
  const cancelRun = useCancelProductionRun(projectId);
  const deleteRun = useDeleteProductionRun(projectId);
  const cancelCells = useCancelCells(run.id);
  const deleteCells = useDeleteCells(run.id, projectId);
  const cancelAvatarCells = useCancelAvatarCells(run.id);
  const deleteAvatarCells = useDeleteAvatarCells(run.id, projectId);
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();
  const toast = useToast();

  // Filter to avatars in this run's matrix config
  const avatars = useMemo(() => {
    if (!allAvatars) return [];
    const configIds = new Set(run.matrix_config?.avatar_ids ?? []);
    return allAvatars
      .filter((c) => c.status_id !== CHARACTER_STATUS_ID_ARCHIVED)
      .filter((c) => configIds.size === 0 || configIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
  }, [allAvatars, run.matrix_config]);

  // Build columns from cells — each unique (scene_type_id, track_id) pair
  const columns = useMemo(() => {
    if (!cells) return [];
    const seen = new Map<string, { scene_type_id: number; scene_type_name: string; track_id: number | null; track_name: string | null; has_clothes_off_transition: boolean }>();
    for (const cell of cells) {
      const key = sceneSlotKey(cell.scene_type_id, cell.track_id);
      if (!seen.has(key)) {
        seen.set(key, {
          scene_type_id: cell.scene_type_id,
          scene_type_name: cell.scene_type_name ?? `Type ${cell.scene_type_id}`,
          track_id: cell.track_id,
          track_name: cell.track_name ?? null,
          has_clothes_off_transition: cell.has_clothes_off_transition ?? false,
        });
      }
    }
    return Array.from(seen.values());
  }, [cells]);

  const handleCancelCell = useCallback(
    (cellId: number) => {
      cancelCells.mutate([cellId], {
        onSuccess: () => toast.addToast({ message: "Cell cancelled.", variant: "info" }),
        onError: () => toast.addToast({ message: "Failed to cancel cell.", variant: "error" }),
      });
    },
    [cancelCells, toast],
  );

  const handleDeleteCell = useCallback(
    (cellId: number) => {
      deleteCells.mutate([cellId], {
        onSuccess: () => toast.addToast({ message: "Cell deleted.", variant: "info" }),
        onError: () => toast.addToast({ message: "Failed to delete cell.", variant: "error" }),
      });
    },
    [deleteCells, toast],
  );

  const handleCancelAvatar = useCallback(
    (avatarId: number) => {
      const charName = avatars.find((c) => c.id === avatarId)?.name ?? "Model";
      cancelAvatarCells.mutate(avatarId, {
        onSuccess: () => toast.addToast({ message: `${charName} cells cancelled.`, variant: "info" }),
        onError: () => toast.addToast({ message: `Failed to cancel ${charName} cells.`, variant: "error" }),
      });
    },
    [cancelAvatarCells, avatars, toast],
  );

  const handleDeleteAvatar = useCallback(
    (avatarId: number) => {
      const charName = avatars.find((c) => c.id === avatarId)?.name ?? "Model";
      deleteAvatarCells.mutate(avatarId, {
        onSuccess: () => toast.addToast({ message: `${charName} removed from run.`, variant: "info" }),
        onError: () => toast.addToast({ message: `Failed to remove ${charName}.`, variant: "error" }),
      });
    },
    [deleteAvatarCells, avatars, toast],
  );

  const handleAvatarClick = useCallback(
    (avatarId: number) => {
      navigate({
        to: avatarPath(projectId, avatarId) as string,
        search: { tab: "scenes" },
      });
    },
    [navigate, projectId],
  );

  const handleCellClick = useCallback(
    (cell: { avatar_id: number; scene_type_id: number; track_id: number | null; scene_id: number | null }) => {
      navigate({
        to: avatarPath(projectId, cell.avatar_id) as string,
        search: {
          tab: "scenes",
          ...(cell.scene_id
            ? { scene: String(cell.scene_id) }
            : { scene_type: String(cell.scene_type_id), ...(cell.track_id != null ? { track: String(cell.track_id) } : {}) }),
        },
      });
    },
    [navigate, projectId],
  );

  const statusLabel = RUN_STATUS_LABELS[run.status_id] ?? "Unknown";
  const statusColor = TERMINAL_STATUS_COLORS[statusLabel.toLowerCase()] ?? "text-[var(--color-text-muted)]";

  return (
    <Stack gap={5}>
      {/* Run header */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-3 ${TYPO_DATA}`}>
          <h3 className={TYPO_SECTION_TITLE}>
            {run.name}
          </h3>
          <span className={statusColor}>{statusLabel}</span>
          {run.failed_cells > 0 && (
            <>
              <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>
              <span className="text-[var(--color-data-red)]">{run.failed_cells} failed</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run.failed_cells > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={iconSizes.sm} />}
              onClick={() => resubmitFailed.mutate()}
              loading={resubmitFailed.isPending}
            >
              Resubmit Failed
            </Button>
          )}
          {/* Cancel — only for draft/in-progress runs */}
          {(run.status_id === 1 || run.status_id === 2) && (
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircle size={iconSizes.sm} />}
              onClick={() =>
                cancelRun.mutate(run.id, {
                  onSuccess: () => toast.addToast({ message: `Run "${run.name}" cancelled.`, variant: "info" }),
                  onError: () => toast.addToast({ message: "Failed to cancel run.", variant: "error" }),
                })
              }
              loading={cancelRun.isPending}
            >
              Cancel
            </Button>
          )}
          {/* Delete — with confirmation */}
          {!confirmDelete ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  deleteRun.mutate(run.id, {
                    onSuccess: () => {
                      toast.addToast({ message: `Run "${run.name}" deleted.`, variant: "info" });
                      onDeleted();
                    },
                    onError: () => toast.addToast({ message: "Failed to delete run.", variant: "error" }),
                  })
                }
                loading={deleteRun.isPending}
              >
                Confirm
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Progress dashboard */}
      {progress && <ProductionProgress progress={progress} />}

      {/* Matrix grid */}
      {cellsLoading && <LoadingPane />}

      {!cellsLoading && cells && avatars.length > 0 && columns.length > 0 && (
        <div className={TERMINAL_PANEL}>
          <div className={TERMINAL_HEADER}>
            <span className={TERMINAL_HEADER_TITLE}>Avatar x Scene Matrix</span>
          </div>
          <div className={TERMINAL_BODY}>
          <MatrixGrid
            cells={cells}
            avatars={avatars}
            columns={columns}
            onAvatarClick={handleAvatarClick}
            onCellClick={handleCellClick}
            onCancelCell={handleCancelCell}
            onDeleteCell={handleDeleteCell}
            onCancelAvatar={handleCancelAvatar}
            onDeleteAvatar={handleDeleteAvatar}
          />
          </div>
        </div>
      )}

      {!cellsLoading && cells && cells.length === 0 && (
        <EmptyState
          title="No cells in this run"
          description="This production run has no avatar/scene combinations."
        />
      )}
    </Stack>
  );
}
