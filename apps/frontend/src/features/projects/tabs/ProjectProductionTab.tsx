/**
 * Project production tab (PRD-112, PRD-57).
 *
 * Shows production runs with a character × scene-type matrix grid,
 * progress dashboard, and queue outstanding action.
 *
 * Archived characters (status_id === 3) are excluded from the production view.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Modal, useToast } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, Checkbox, Input, LoadingPane, Toggle } from "@/components/primitives";
import { ChevronDown, Eye, List, Play, Plus, RefreshCw, Trash2, XCircle, Zap } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { MatrixGrid } from "@/features/production/MatrixGrid";
import { ProductionProgress } from "@/features/production/ProductionProgress";
import {
  useProductionRuns,
  useCreateProductionRun,
  useCancelCells,
  useCancelCharacterCells,
  useCancelProductionRun,
  useDeleteCharacterCells,
  useDeleteCells,
  useDeleteProductionRun,
  useEnabledSceneTypes,
  useProductionMatrix,
  useProductionProgress,
  useResubmitFailed,
} from "@/features/production/hooks/use-production";
import { RUN_STATUS_LABELS, RUN_STATUS_VARIANT, deduplicateSceneSlots, sceneSlotKey } from "@/features/production/types";
import type { ProductionRun } from "@/features/production/types";
import { useQueueStatus } from "@/features/queue/hooks/use-queue";

import { useProjectCharacters } from "../hooks/use-project-characters";
import { useCharacterGroups } from "../hooks/use-character-groups";
import { QueueOutstandingModal } from "../components/QueueOutstandingModal";
import { CHARACTER_STATUS_ID_ARCHIVED } from "../types";
import type { Character, CharacterGroup } from "../types";

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
            <div className="flex items-center gap-2">
              <Badge variant="info" size="sm">
                {queueStatus.total_queued} queued
              </Badge>
              <Badge variant="default" size="sm">
                {queueStatus.total_running} running
              </Badge>
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
          description="Create a production run to generate scenes for your characters."
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
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] divide-y divide-[var(--color-border-default)]">
          {runs.map((run) => {
            const statusLabel = RUN_STATUS_LABELS[run.status_id] ?? "Unknown";
            const statusVariant = RUN_STATUS_VARIANT[run.status_id] ?? "default";
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
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-secondary)] ${
                  isSelected ? "bg-[var(--color-surface-secondary)]" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelected && <Eye size={14} className="text-[var(--color-action-primary)] shrink-0" />}
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">
                      {run.name}
                    </span>
                    {run.description && (
                      <span className="text-xs text-[var(--color-text-muted)] truncate block">
                        {run.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusVariant} size="sm">
                    {statusLabel}
                  </Badge>
                  <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                    {run.completed_cells}/{run.total_cells} ({pct}%)
                  </span>
                  {run.failed_cells > 0 && (
                    <Badge variant="danger" size="sm">
                      {run.failed_cells} failed
                    </Badge>
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
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<number>>(new Set());
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [retrospective, setRetrospective] = useState(true);

  const { data: allCharacters } = useProjectCharacters(projectId);
  const { data: groups } = useCharacterGroups(projectId);
  const createRun = useCreateProductionRun();
  const toast = useToast();

  // Non-archived characters
  const characters = useMemo(
    () => (allCharacters ?? []).filter((c) => c.status_id !== CHARACTER_STATUS_ID_ARCHIVED),
    [allCharacters],
  );

  // Group characters by group_id (null → "Ungrouped")
  const charactersByGroup = useMemo(() => {
    const sortedGroups = (groups ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const groupMap = new Map<number | null, { group: CharacterGroup | null; chars: Character[] }>();
    for (const g of sortedGroups) {
      groupMap.set(g.id, { group: g, chars: [] });
    }
    groupMap.set(null, { group: null, chars: [] });
    for (const c of characters) {
      const entry = groupMap.get(c.group_id) ?? groupMap.get(null)!;
      entry.chars.push(c);
    }
    return Array.from(groupMap.values()).filter((e) => e.chars.length > 0);
  }, [characters, groups]);

  // Determine which character IDs to query enabled scene types for
  const activeCharacterIds = useMemo(() => {
    if (selectedCharacterIds.size > 0) return Array.from(selectedCharacterIds);
    return characters.map((c) => c.id);
  }, [selectedCharacterIds, characters]);

  // Fetch enabled scene types for selected characters
  const { data: enabledEntries } = useEnabledSceneTypes(projectId, activeCharacterIds);

  // Build the list of scene slots (scene_type+track+clothes_off) from enabled entries (union).
  const sceneSlots = useMemo(() => {
    if (!enabledEntries || activeCharacterIds.length === 0) return [];
    return deduplicateSceneSlots(enabledEntries);
  }, [enabledEntries, activeCharacterIds]);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    setSelectedCharacterIds(new Set());
    setSelectedSlotKeys(new Set());
    setRetrospective(true);
    onClose();
  }, [onClose]);

  const toggleCharacter = useCallback((id: number, checked: boolean) => {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    // Clear slot selection when characters change (enabled list may differ)
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
  const allCharsSelected = characters.length > 0 && selectedCharacterIds.size === characters.length;
  const allSlotsSelected = sceneSlots.length > 0 && selectedSlotKeys.size === sceneSlots.length;

  const toggleAllCharacters = useCallback(
    (checked: boolean) => {
      setSelectedCharacterIds(checked ? new Set(characters.map((c) => c.id)) : new Set());
      setSelectedSlotKeys(new Set());
    },
    [characters],
  );

  const toggleAllSlots = useCallback(
    (checked: boolean) => {
      setSelectedSlotKeys(checked ? new Set(sceneSlots.map((s) => s.key)) : new Set());
    },
    [sceneSlots],
  );

  const handleCreate = useCallback(() => {
    const charIds = selectedCharacterIds.size > 0
      ? Array.from(selectedCharacterIds)
      : characters.map((c) => c.id);

    // Derive unique scene_type_ids from selected slots (or all slots if none selected)
    const activeSlots = selectedSlotKeys.size > 0
      ? sceneSlots.filter((s) => selectedSlotKeys.has(s.key))
      : sceneSlots;
    const stIds = [...new Set(activeSlots.map((s) => s.scene_type_id))];

    if (charIds.length === 0 || stIds.length === 0) {
      toast.addToast({ message: "Select at least one character and one scene.", variant: "warning" });
      return;
    }

    createRun.mutate(
      {
        project_id: projectId,
        name: name.trim() || `Run ${new Date().toLocaleDateString()}`,
        description: description.trim() || undefined,
        character_ids: charIds,
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
  }, [name, description, selectedCharacterIds, selectedSlotKeys, characters, sceneSlots, projectId, retrospective, createRun, toast, onCreated, handleClose]);

  const slotCount = selectedSlotKeys.size || sceneSlots.length;
  const cellCount = (selectedCharacterIds.size || characters.length) * slotCount;

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

        {/* Character selection — grouped */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Characters ({selectedCharacterIds.size || characters.length} selected)
            </span>
            <Checkbox
              label="Select all"
              checked={allCharsSelected}
              indeterminate={selectedCharacterIds.size > 0 && !allCharsSelected}
              onChange={toggleAllCharacters}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1.5 space-y-2">
            {charactersByGroup.map(({ group, chars }) => {
              const groupCharIds = chars.map((c) => c.id);
              const allInGroupSelected = groupCharIds.every((id) => selectedCharacterIds.has(id));
              const someInGroupSelected = groupCharIds.some((id) => selectedCharacterIds.has(id));
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
                        setSelectedCharacterIds((prev) => {
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
                        checked={selectedCharacterIds.has(c.id)}
                        onChange={(checked) => toggleCharacter(c.id, checked)}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {characters.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-2 text-center">No characters in this project.</p>
            )}
          </div>
        </div>

        {/* Scene slot selection — scene_type+track+clothes_off combos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Scenes ({selectedSlotKeys.size || sceneSlots.length} selected)
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
          <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1.5">
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
                {activeCharacterIds.length === 0
                  ? "Select characters first to see available scenes."
                  : "No scenes enabled for the selected characters."}
              </p>
            )}
          </div>
        </div>

        {/* Retrospective matching */}
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1.5">
          <Toggle
            label="Include existing approved scenes (retrospective)"
            checked={retrospective}
            onChange={setRetrospective}
            size="sm"
          />
          <p className="mt-1 ml-7 text-xs text-[var(--color-text-muted)]">
            Pre-marks cells as completed where an approved video already exists for the character + scene type.
          </p>
        </div>

        {/* Summary and actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-default)]">
          <span className="text-sm text-[var(--color-text-muted)]">
            {cellCount} cell{cellCount !== 1 ? "s" : ""} will be created
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={createRun.isPending}
              disabled={sceneSlots.length === 0 || characters.length === 0}
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
  const { data: allCharacters } = useProjectCharacters(projectId);
  const resubmitFailed = useResubmitFailed(run.id);
  const cancelRun = useCancelProductionRun(projectId);
  const deleteRun = useDeleteProductionRun(projectId);
  const cancelCells = useCancelCells(run.id);
  const deleteCells = useDeleteCells(run.id, projectId);
  const cancelCharacterCells = useCancelCharacterCells(run.id);
  const deleteCharacterCells = useDeleteCharacterCells(run.id, projectId);
  const navigate = useNavigate();
  const toast = useToast();

  // Filter to characters in this run's matrix config
  const characters = useMemo(() => {
    if (!allCharacters) return [];
    const configIds = new Set(run.matrix_config?.character_ids ?? []);
    return allCharacters
      .filter((c) => c.status_id !== CHARACTER_STATUS_ID_ARCHIVED)
      .filter((c) => configIds.size === 0 || configIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
  }, [allCharacters, run.matrix_config]);

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

  const handleCancelCharacter = useCallback(
    (characterId: number) => {
      const charName = characters.find((c) => c.id === characterId)?.name ?? "Model";
      cancelCharacterCells.mutate(characterId, {
        onSuccess: () => toast.addToast({ message: `${charName} cells cancelled.`, variant: "info" }),
        onError: () => toast.addToast({ message: `Failed to cancel ${charName} cells.`, variant: "error" }),
      });
    },
    [cancelCharacterCells, characters, toast],
  );

  const handleDeleteCharacter = useCallback(
    (characterId: number) => {
      const charName = characters.find((c) => c.id === characterId)?.name ?? "Model";
      deleteCharacterCells.mutate(characterId, {
        onSuccess: () => toast.addToast({ message: `${charName} removed from run.`, variant: "info" }),
        onError: () => toast.addToast({ message: `Failed to remove ${charName}.`, variant: "error" }),
      });
    },
    [deleteCharacterCells, characters, toast],
  );

  const handleCharacterClick = useCallback(
    (characterId: number) => {
      navigate({
        to: `/projects/${projectId}/models/${characterId}`,
        search: { tab: "scenes" },
      });
    },
    [navigate, projectId],
  );

  const handleCellClick = useCallback(
    (cell: { character_id: number; scene_type_id: number; track_id: number | null; scene_id: number | null }) => {
      navigate({
        to: `/projects/${projectId}/models/${cell.character_id}`,
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
  const statusVariant = RUN_STATUS_VARIANT[run.status_id] ?? "default";

  return (
    <Stack gap={5}>
      {/* Run header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            {run.name}
          </h3>
          <Badge variant={statusVariant} size="sm">{statusLabel}</Badge>
          {run.failed_cells > 0 && (
            <Badge variant="danger" size="sm">{run.failed_cells} failed</Badge>
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

      {!cellsLoading && cells && characters.length > 0 && columns.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
            Character × Scene Matrix
          </h4>
          <MatrixGrid
            cells={cells}
            characters={characters}
            columns={columns}
            onCharacterClick={handleCharacterClick}
            onCellClick={handleCellClick}
            onCancelCell={handleCancelCell}
            onDeleteCell={handleDeleteCell}
            onCancelCharacter={handleCancelCharacter}
            onDeleteCharacter={handleDeleteCharacter}
          />
        </div>
      )}

      {!cellsLoading && cells && cells.length === 0 && (
        <EmptyState
          title="No cells in this run"
          description="This production run has no character/scene combinations."
        />
      )}
    </Stack>
  );
}
