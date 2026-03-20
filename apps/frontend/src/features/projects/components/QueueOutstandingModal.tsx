/**
 * Queue Outstanding Modal (PRD-112, Amendments A.1, A.2, A.3).
 *
 * Displays all ungenerated scene-character combinations for a project,
 * allowing the user to select items for batch generation. Blocked items
 * (missing readiness requirements) are greyed out with a reason.
 *
 * Amendment A.2: "Include Already Generated" toggle reveals items with
 * existing final versions, showing a "vN exists" indicator.
 *
 * Amendment A.3: Archived characters (status_id === 3) are excluded.
 */

import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox, LoadingPane, Toggle } from "@/components/primitives";

import { useSetToggle } from "@/hooks/useSetToggle";
import { api } from "@/lib/api";
import { Play } from "@/tokens/icons";

import { useProjectCharacters } from "../hooks/use-project-characters";
import { CHARACTER_STATUS_ID_ARCHIVED, type Character } from "../types";

import { useBatchGenerate } from "@/features/generation/hooks/use-generation";
import type { CharacterReadinessCache } from "@/features/readiness/types";
import { useProjectSceneSettings } from "@/features/scene-catalogue/hooks/use-project-scene-settings";
import type { EffectiveSceneSetting } from "@/features/scene-catalogue/types";
import type { Scene, SceneVideoVersion } from "@/features/scenes/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** A single scene-character combination to display in the modal. */
interface QueueItem {
  /** Unique key for the item. */
  key: string;
  character: Character;
  setting: EffectiveSceneSetting;
  /** The scene record, if it exists. */
  scene: Scene | null;
  /** Whether a final version exists. */
  hasFinalVersion: boolean;
  /** The highest version number, if any versions exist. */
  latestVersion: number | null;
  /** Blocking reason (null = not blocked). */
  blockingReason: string | null;
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QueueOutstandingModalProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  /** When set, scope to a single character instead of the entire project. */
  characterId?: number;
}

/* --------------------------------------------------------------------------
   Sub-hooks
   -------------------------------------------------------------------------- */

/**
 * Generic batch-fetch hook: runs one query per ID and collects results into
 * a `Map<number, T>`.  Eliminates the repetitive useQueries+useMemo+isLoading
 * boilerplate that was tripled for scenes, readiness, and versions.
 */
function useBatchQueryMap<T>(
  ids: number[],
  queryKeyPrefix: string[],
  urlFn: (id: number) => string,
  enabled: boolean,
): { map: Map<number, T>; isLoading: boolean } {
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: [...queryKeyPrefix, id],
      queryFn: () => api.get<T>(urlFn(id)),
      enabled: enabled && id > 0,
    })),
  });

  const map = useMemo(() => {
    const m = new Map<number, T>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const data = queries[i]?.data;
      if (data && id !== undefined) m.set(id, data);
    }
    return m;
  }, [ids, queries]);

  const isLoading = queries.some((q) => q.isLoading);
  return { map, isLoading };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QueueOutstandingModal({
  open,
  onClose,
  projectId,
  characterId,
}: QueueOutstandingModalProps) {
  /* --- toggle state (A.2) --- */
  const [includeGenerated, setIncludeGenerated] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);

  /* --- reset toggle when modal opens --- */
  useEffect(() => {
    if (open) {
      setIncludeGenerated(false);
      setForceOverride(false);
    }
  }, [open]);

  /* --- fetch project characters --- */
  const { data: allCharacters, isLoading: charsLoading } = useProjectCharacters(projectId);

  /* --- filter out archived characters (A.3) and optionally scope to single character --- */
  const activeCharacters = useMemo(() => {
    if (!allCharacters) return [];
    return allCharacters.filter((c) => {
      if (c.status_id === CHARACTER_STATUS_ID_ARCHIVED) return false;
      if (characterId != null && c.id !== characterId) return false;
      return true;
    });
  }, [allCharacters, characterId]);

  const characterIds = useMemo(() => activeCharacters.map((c) => c.id), [activeCharacters]);

  /* --- fetch project scene settings (enabled scenes) --- */
  const { data: sceneSettings, isLoading: settingsLoading } = useProjectSceneSettings(projectId);

  const enabledSettings = useMemo(
    () => (sceneSettings ?? []).filter((s) => s.is_enabled),
    [sceneSettings],
  );

  /* --- batch fetch scenes per character --- */
  const { map: scenesMap, isLoading: scenesLoading } = useBatchQueryMap<Scene[]>(
    characterIds,
    ["scenes", "character"],
    (cid) => `/characters/${cid}/scenes`,
    open && characterIds.length > 0,
  );

  /* --- batch fetch readiness per character --- */
  const { map: readinessMap, isLoading: readinessLoading } = useBatchQueryMap<CharacterReadinessCache>(
    characterIds,
    ["readiness", "character"],
    (cid) => `/characters/${cid}/readiness`,
    open && characterIds.length > 0,
  );

  /* --- collect all existing scene IDs for version fetching --- */
  const allSceneIds = useMemo(() => {
    const ids: number[] = [];
    for (const scenes of scenesMap.values()) {
      for (const s of scenes) ids.push(s.id);
    }
    return ids;
  }, [scenesMap]);

  /* --- batch fetch versions for all scenes --- */
  const { map: versionsMap, isLoading: versionsLoading } = useBatchQueryMap<SceneVideoVersion[]>(
    allSceneIds,
    ["scene-versions", "list"],
    (sid) => `/scenes/${sid}/versions`,
    open && allSceneIds.length > 0,
  );

  /* --- build queue items --- */
  const allItems = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];

    for (const character of activeCharacters) {
      const readiness = readinessMap.get(character.id);
      const scenes = scenesMap.get(character.id) ?? [];

      for (const setting of enabledSettings) {
        // Find matching scene
        const scene =
          scenes.find(
            (s) =>
              s.scene_type_id === setting.scene_type_id &&
              (s.track_id ?? null) === (setting.track_id ?? null),
          ) ?? null;

        // Determine version info
        let hasFinalVersion = false;
        let latestVersion: number | null = null;

        if (scene) {
          const versions = versionsMap.get(scene.id) ?? [];
          if (versions.length > 0) {
            latestVersion = Math.max(...versions.map((v) => v.version_number));
            hasFinalVersion = versions.some((v) => v.is_final);
          }
        }

        // Determine blocking reason
        let blockingReason: string | null = null;
        if (readiness && readiness.state === "not_started") {
          blockingReason =
            readiness.missing_items.length > 0 ? readiness.missing_items.join(", ") : "Not ready";
        } else if (readiness && readiness.state === "partially_ready") {
          // Partially ready characters can still generate, but flag missing items
          if (readiness.missing_items.length > 0) {
            blockingReason = readiness.missing_items.join(", ");
          }
        }

        const key = `${character.id}::${setting.scene_type_id}::${setting.track_id ?? "null"}`;

        items.push({
          key,
          character,
          setting,
          scene,
          hasFinalVersion,
          latestVersion,
          blockingReason,
        });
      }
    }

    return items;
  }, [activeCharacters, enabledSettings, scenesMap, readinessMap, versionsMap]);

  /* --- filter items based on "Include Already Generated" toggle --- */
  const visibleItems = useMemo(() => {
    if (includeGenerated) return allItems;
    return allItems.filter((item) => !item.hasFinalVersion);
  }, [allItems, includeGenerated]);

  /* --- selection state --- */
  const [selected, toggleSelected, setSelected] = useSetToggle<string>();

  /* --- reset selection when items change --- */
  useEffect(() => {
    if (!open) return;
    // Auto-select all non-blocked items
    const initial = new Set<string>();
    for (const item of visibleItems) {
      if (!isItemBlocked(item)) {
        initial.add(item.key);
      }
    }
    setSelected(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibleItems, setSelected, forceOverride]);

  /* --- counts --- */
  const isItemBlocked = (item: QueueItem) => !forceOverride && item.blockingReason !== null;
  const blockedCount = visibleItems.filter((i) => isItemBlocked(i)).length;
  const readyCount = visibleItems.length - blockedCount;
  const selectedCount = [...selected].filter((key) =>
    visibleItems.some((i) => i.key === key && !isItemBlocked(i)),
  ).length;

  /* --- batch generate mutation --- */
  const batchGenerate = useBatchGenerate();

  function handleQueue() {
    // Collect scene IDs from selected items. For items without a scene,
    // the scene would need to be auto-created first (similar to CharacterScenesTab).
    const sceneIds: number[] = [];
    for (const item of visibleItems) {
      if (!selected.has(item.key)) continue;
      if (isItemBlocked(item)) continue;
      if (item.scene) {
        sceneIds.push(item.scene.id);
      }
      // Items without scenes are skipped for now — they need auto-creation
      // which is handled by the production run system.
    }

    if (sceneIds.length > 0) {
      batchGenerate.mutate(
        { scene_ids: sceneIds },
        {
          onSuccess: () => {
            onClose();
          },
        },
      );
    }
  }

  /* --- toggle all --- */
  function toggleAll() {
    const selectableKeys = visibleItems.filter((i) => !isItemBlocked(i)).map((i) => i.key);

    const allChecked = selectableKeys.every((k) => selected.has(k));
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableKeys));
    }
  }

  const selectableCount = visibleItems.filter((i) => !isItemBlocked(i)).length;
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;
  const someSelected = selectedCount > 0 && !allSelected;

  const isLoading =
    charsLoading || settingsLoading || scenesLoading || readinessLoading || versionsLoading;

  return (
    <Modal open={open} onClose={onClose} title="Queue Outstanding Generations" size="xl">
      <Stack gap={4}>
        {/* Controls bar */}
        <div className="flex items-center justify-between gap-[var(--spacing-3)]">
          <div className="flex items-center gap-[var(--spacing-4)]">
            <Toggle
              checked={includeGenerated}
              onChange={setIncludeGenerated}
              label="Include Already Generated"
              size="sm"
            />
            <Toggle
              checked={forceOverride}
              onChange={setForceOverride}
              label="Force Override"
              size="sm"
            />
          </div>
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            <span className="text-green-400">{readyCount}</span> of {visibleItems.length} ready to queue
            {blockedCount > 0 && <> (<span className="text-orange-400">{blockedCount} blocked</span>)</>}
          </span>
        </div>

        {forceOverride && (
          <p className="text-xs text-[var(--color-action-danger)]">
            Forcing blocked items may produce errors. Proceed with caution.
          </p>
        )}

        {/* Loading state */}
        {isLoading && <LoadingPane />}

        {/* Item list */}
        {!isLoading && visibleItems.length === 0 && (
          <div className="py-8 text-center text-xs font-mono text-[var(--color-text-muted)]">
            {includeGenerated
              ? "No scene-character combinations found."
              : "All scenes have been generated. Enable 'Include Already Generated' to see them."}
          </div>
        )}

        {!isLoading && visibleItems.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
            {/* Select all header */}
            <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                disabled={selectableCount === 0}
                label={
                  selectableCount === 0
                    ? "All items are blocked"
                    : `Select all (${selectableCount})`
                }
              />
            </div>

            {visibleItems.map((item) => {
              const blocked = isItemBlocked(item);
              const isChecked = !blocked && selected.has(item.key);

              return (
                <div
                  key={item.key}
                  className={`flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-1.5)] border-b border-white/5 ${
                    blocked ? "opacity-50" : "hover:bg-[#161b22]"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onChange={() => toggleSelected(item.key)}
                    disabled={blocked}
                    label={`${item.character.name} - ${item.setting.name}${item.setting.track_name ? ` (${item.setting.track_name})` : ""}`}
                  />

                  <div className="flex items-center gap-2 ml-auto shrink-0 font-mono text-xs">
                    {/* Version indicator (A.2) */}
                    {item.latestVersion !== null && (
                      <span className="text-[var(--color-text-muted)]">v{item.latestVersion} exists</span>
                    )}

                    {item.hasFinalVersion && (
                      <span className="text-green-400">Final</span>
                    )}

                    {/* Blocking reason */}
                    {item.blockingReason !== null && (
                      <span className={forceOverride ? "text-cyan-400" : "text-orange-400"}>
                        {item.blockingReason}
                      </span>
                    )}

                    {/* No scene yet */}
                    {!item.scene && !blocked && (
                      <span className="text-cyan-400">New</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-default)]">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">{selectedCount} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleQueue}
              disabled={selectedCount === 0}
              loading={batchGenerate.isPending}
              icon={<Play size={14} />}
            >
              Queue {selectedCount > 0 ? selectedCount : ""} Selected
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
