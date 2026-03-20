/**
 * Confirmation modal shown after dropping a file to import characters.
 *
 * Displays a scrollable, checkable list of parsed names with options
 * to assign a group and apply title-case formatting.
 *
 * When `payloads` is provided (asset-aware mode), each row additionally
 * shows image/video asset counts and allows uploading assets to
 * existing (duplicate) characters.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useSetToggle } from "@/hooks/useSetToggle";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox, FilterSelect, Input, Select, Toggle } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { INLINE_LINK_BTN } from "@/lib/ui-classes";
import { useMetadataTemplates } from "@/features/settings/hooks/use-metadata-templates";


import type { ImportProgress } from "../hooks/use-character-import";
import type { Character, CharacterDropPayload, ImportHashSummary } from "../types";
import { ImportProgressBar } from "./ImportProgressBar";
import { useCreateGroup } from "../hooks/use-character-groups";
import { useDuplicateAssetInfo } from "../hooks/use-duplicate-asset-info";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImportConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Raw names (legacy name-only mode). */
  names: string[];
  /** Asset-aware payloads. When provided, takes precedence over `names`. */
  payloads?: CharacterDropPayload[];
  projectId: number;
  /** Names of characters that already exist (case-insensitive match). */
  existingNames?: string[];
  /** Full character objects for metadata presence checks + ID lookup. */
  characters?: Character[];
  /** Legacy callback — names only. */
  onConfirm: (names: string[], groupId?: number) => void;
  /** Asset-aware callback. When provided, used instead of onConfirm. */
  onConfirmWithAssets?: (
    newPayloads: CharacterDropPayload[],
    existingPayloads: CharacterDropPayload[],
    groupId?: number,
    overwrite?: boolean,
    skipExisting?: boolean,
  ) => void;
  loading?: boolean;
  /** Import progress state (shown as a progress bar while importing). */
  importProgress?: ImportProgress | null;
  /** Called to abort an in-progress import. */
  onAbort?: () => void;
  /** Detected project name from folder structure (for grouped imports). */
  detectedProjectName?: string;
  /** Current project name for matching against detectedProjectName. */
  projectName?: string;
  /** Names of existing groups for "exists" / "will be created" badges. */
  existingGroupNames?: string[];
  /** Hash-based deduplication summary (computed asynchronously after drop). */
  hashSummary?: ImportHashSummary | null;
  /** Currently selected metadata template ID. */
  metadataTemplateId?: string;
  /** Called when metadata template selection changes. */
  onMetadataTemplateChange?: (templateId: string) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** 2-char codes that are NOT initials (articles/prepositions). */
const NOT_INITIALS = new Set(["la", "le", "el", "de", "mr", "ms", "dr"]);

/**
 * Normalize a folder-style name into a display name.
 *
 * Handles edge cases ported from `batch_fix_metadata.py`:
 * - `carli_nicki`  -> `Carli Nicki`
 * - `cj_miles`     -> `CJ Miles`     (2-char initials uppercased)
 * - `maddy_o_reilly` -> `Maddy O'Reilly` (Irish/Scottish O')
 * - `miss_molly`   -> `Miss Molly`    (title preserved)
 * - `la_sirena_69` -> `La Sirena 69`  (article + number)
 */
export function normalizeCharacterName(raw: string): string {
  const rawParts = raw.replace(/[_-]/g, " ").split(/\s+/);

  // Title-case each part; uppercase 2-char alpha parts that aren't articles
  const parts: string[] = rawParts.map((p) => {
    if (
      p.length === 2 &&
      /^[a-zA-Z]{2}$/.test(p) &&
      !NOT_INITIALS.has(p.toLowerCase())
    ) {
      return p.toUpperCase(); // CJ, AJ, etc.
    }
    // If already all-uppercase (like "AJ"), keep it; otherwise title-case
    if (p === p.toUpperCase() && p.length > 1) return p;
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  });

  // Join Irish/Scottish "O" + NextName -> "O'NextName"
  const joined: string[] = [];
  let i = 0;
  while (i < parts.length) {
    if (
      parts[i] === "O" &&
      i + 1 < parts.length &&
      /^[A-Z]/.test(parts[i + 1]!)
    ) {
      joined.push(`O'${parts[i + 1]}`);
      i += 2;
    } else {
      joined.push(parts[i]!);
      i += 1;
    }
  }

  return joined.join(" ");
}

/* --------------------------------------------------------------------------
   Diff badge helpers
   -------------------------------------------------------------------------- */


/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportConfirmModal({
  open,
  onClose,
  names,
  payloads,
  projectId,
  existingNames = [],
  characters = [],
  onConfirm,
  onConfirmWithAssets,
  loading,
  importProgress,
  onAbort,
  detectedProjectName,
  projectName,
  existingGroupNames = [],
  hashSummary,
  metadataTemplateId,
  onMetadataTemplateChange,
}: ImportConfirmModalProps) {
  const { options: groupOptions } = useGroupSelectOptions(projectId);
  const { data: metadataTemplates } = useMetadataTemplates();

  const templateOptions = useMemo(() => {
    if (!metadataTemplates) return [];
    return metadataTemplates.map((t) => ({ value: String(t.id), label: t.name }));
  }, [metadataTemplates]);

  // Grouped import detection
  const isGroupedImport = payloads?.some((p) => p.groupName) ?? false;

  const existingGroupNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const n of existingGroupNames) set.add(n.toLowerCase());
    return set;
  }, [existingGroupNames]);

  // Group indices by groupName for grouped rendering
  const groupedIndices = useMemo(() => {
    if (!isGroupedImport || !payloads) return null;
    const map = new Map<string, number[]>();
    for (let i = 0; i < payloads.length; i++) {
      const gName = payloads[i]!.groupName ?? "";
      const arr = map.get(gName) ?? [];
      arr.push(i);
      map.set(gName, arr);
    }
    return map;
  }, [payloads, isGroupedImport]);

  const projectNameMatch =
    detectedProjectName && projectName
      ? detectedProjectName.toLowerCase() === projectName.toLowerCase()
      : undefined;

  // Derive effective names from payloads or raw names
  const effectiveNames = useMemo(
    () => (payloads ? payloads.map((p) => p.rawName) : names),
    [payloads, names],
  );

  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(effectiveNames.map((_, i) => i)),
  );
  const [normalize, setNormalize] = useState(true);
  const [groupId, setGroupId] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const createGroup = useCreateGroup(projectId);
  const [overwrite, setOverwrite] = useState(false);
  /** Existing characters whose assets should be uploaded. */
  const [checkedExistingAssets, toggleExistingAssets, setCheckedExistingAssets] = useSetToggle<number>();
  const [importMissing, setImportMissing] = useState(false);
  const [newContentOnly, setNewContentOnly] = useState(false);

  const displayNames = useMemo(
    () => (normalize ? effectiveNames.map(normalizeCharacterName) : effectiveNames),
    [effectiveNames, normalize],
  );

  // Build set of existing names for O(1) duplicate lookup
  const existingSet = useMemo(() => {
    const set = new Set<string>();
    for (const n of existingNames) {
      set.add(n.toLowerCase());
    }
    return set;
  }, [existingNames]);

  // Map lowercase display name → Character for duplicate rows
  const duplicateCharMap = useMemo(() => {
    const map = new Map<string, Character>();
    for (const c of characters) {
      map.set(c.name.toLowerCase(), c);
    }
    return map;
  }, [characters]);

  // Compute which indices are duplicates (against existing + title-case)
  const duplicateIndices = useMemo(() => {
    const dupes = new Set<number>();
    for (let i = 0; i < displayNames.length; i++) {
      if (existingSet.has(displayNames[i]!.toLowerCase())) {
        dupes.add(i);
      }
    }
    return dupes;
  }, [displayNames, existingSet]);

  const duplicateCount = duplicateIndices.size;

  // Unique non-null group IDs from characters that match duplicate names
  const existingGroups = useMemo(() => {
    const groupIds = new Set<number>();
    for (const idx of duplicateIndices) {
      const name = displayNames[idx]!;
      const char = duplicateCharMap.get(name.toLowerCase());
      if (char?.group_id != null) groupIds.add(char.group_id);
    }
    return [...groupIds];
  }, [duplicateIndices, displayNames, duplicateCharMap]);

  const hasNewCharacters = effectiveNames.length - duplicateCount > 0;

  // IDs of duplicate characters for fetching existing variant data
  const duplicateCharIds = useMemo(() => {
    const ids: number[] = [];
    for (const idx of duplicateIndices) {
      const name = displayNames[idx]!;
      const char = duplicateCharMap.get(name.toLowerCase());
      if (char) ids.push(char.id);
    }
    return ids;
  }, [duplicateIndices, displayNames, duplicateCharMap]);

  // Fetch variant types for duplicate characters (used by asset skip logic in import handler)
  useDuplicateAssetInfo(open, duplicateCharIds);

  // Asset counts per character (only in asset-aware mode)
  const assetCounts = useMemo(() => {
    if (!payloads) return null;
    return payloads.map((p) => ({
      images: p.assets.filter((a) => a.kind === "image").length,
      videos: p.assets.filter((a) => a.kind === "video").length,
      metadata: [p.bioJson, p.tovJson, p.metadataJson].filter(Boolean).length,
    }));
  }, [payloads]);

  // Duplicate indices that have importable assets
  const duplicatesWithAssets = useMemo(() => {
    if (!assetCounts) return new Set<number>();
    const result = new Set<number>();
    for (const idx of duplicateIndices) {
      const c = assetCounts[idx];
      if (c && (c.images > 0 || c.videos > 0 || c.metadata > 0)) {
        result.add(idx);
      }
    }
    return result;
  }, [duplicateIndices, assetCounts]);

  // Reset checked set when the NAME LIST changes (modal opens with new data).
  // Do NOT reset when existingSet changes during import — that causes the
  // "deselects everything" bug when newly created characters update the list.
  const prevNamesRef = useRef<string[]>([]);
  useEffect(() => {
    // Only reset if the actual names being imported changed
    const key = effectiveNames.join("\0");
    const prevKey = prevNamesRef.current.join("\0");
    if (key === prevKey) return;
    prevNamesRef.current = effectiveNames;

    const initial = new Set<number>();
    for (let i = 0; i < effectiveNames.length; i++) {
      const display = normalize
        ? normalizeCharacterName(effectiveNames[i]!)
        : effectiveNames[i]!;
      if (!existingSet.has(display.toLowerCase())) {
        initial.add(i);
      }
    }
    setChecked(initial);
    setOverwrite(false);
    setNewContentOnly(false);

    // Auto-enable "Import missing" when ALL entries are duplicates (existing characters).
    // This is the common case when dropping onto a character detail page or re-importing.
    const allAreDuplicates = initial.size === 0 && effectiveNames.length > 0;
    setImportMissing(allAreDuplicates);
    setCheckedExistingAssets(allAreDuplicates ? new Set(duplicatesWithAssets) : new Set());
  }, [effectiveNames, existingSet, normalize]);

  // Pre-fill group selector when all duplicates share a single group
  useEffect(() => {
    if (existingGroups.length === 1) {
      setGroupId(String(existingGroups[0]));
    }
  }, [existingGroups]);

  // When "Import missing", "Overwrite", or "New content only" is toggled, auto-select all duplicates with assets
  useEffect(() => {
    if (importMissing || overwrite || newContentOnly) {
      setCheckedExistingAssets(new Set(duplicatesWithAssets));
    } else {
      setCheckedExistingAssets(new Set());
    }
  }, [importMissing, overwrite, newContentOnly, duplicatesWithAssets]);

  // "New content only" implies importing to existing characters
  useEffect(() => {
    if (newContentOnly && !importMissing) {
      setImportMissing(true);
    }
  }, [newContentOnly]);

  // Count only non-duplicate selected items
  const selectedCount = [...checked].filter(
    (i) => !duplicateIndices.has(i),
  ).length;

  const existingAssetsCount = checkedExistingAssets.size;

  function toggleItem(idx: number) {
    // Don't allow checking duplicates for creation
    if (duplicateIndices.has(idx)) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function toggleAll() {
    const nonDuplicates = effectiveNames
      .map((_, i) => i)
      .filter((i) => !duplicateIndices.has(i));
    const allChecked = nonDuplicates.every((i) => checked.has(i));
    if (allChecked) {
      setChecked(new Set());
    } else {
      setChecked(new Set(nonDuplicates));
    }
  }

  function handleConfirm() {
    if (payloads && onConfirmWithAssets) {
      // Asset-aware path
      const newPayloads: CharacterDropPayload[] = [];
      const existingPayloads: CharacterDropPayload[] = [];

      for (let i = 0; i < payloads.length; i++) {
        const payload = payloads[i]!;
        const display = displayNames[i]!;

        // Filter out content-duplicate assets when "new content only" is on
        const assets = newContentOnly
          ? payload.assets.filter((a) => !a.isDuplicate)
          : payload.assets;

        // Skip character entirely if no assets remain after filtering
        if (newContentOnly && assets.length === 0 && !payload.bioJson && !payload.tovJson && !payload.metadataJson) {
          continue;
        }

        // Apply normalized name
        const normalizedPayload: CharacterDropPayload = {
          ...payload,
          rawName: display,
          assets,
        };

        if (duplicateIndices.has(i)) {
          // Existing character — include only if asset upload is checked
          if (checkedExistingAssets.has(i)) {
            existingPayloads.push(normalizedPayload);
          }
        } else if (checked.has(i)) {
          newPayloads.push(normalizedPayload);
        }
      }

      onConfirmWithAssets(
        newPayloads,
        existingPayloads,
        groupId ? Number(groupId) : undefined,
        importMissing && !newContentOnly ? false : overwrite,
        importMissing && !newContentOnly,
      );
    } else {
      // Legacy name-only path
      const selected = displayNames.filter(
        (_, i) => checked.has(i) && !duplicateIndices.has(i),
      );
      onConfirm(selected, groupId ? Number(groupId) : undefined);
    }
  }

  const importableCount = effectiveNames.length - duplicateCount;
  const totalActionCount = selectedCount + existingAssetsCount;
  const isImporting = importProgress != null && importProgress.phase !== "done";

  /** Render a single character row (shared by flat and grouped views). */
  const renderCharacterRow = (idx: number) => {
    const name = displayNames[idx]!;
    const isDuplicate = duplicateIndices.has(idx);
    const counts = assetCounts?.[idx];
    const hasAssets = counts && (counts.images > 0 || counts.videos > 0 || counts.metadata > 0);
    const bulkMode = importMissing || overwrite;

    // Compute monospace asset indicators for this row
    const p = payloads?.[idx];
    const isChecking = hashSummary?.isHashing;
    let imgLabel: React.ReactNode = null;
    let vidLabel: React.ReactNode = null;
    let metaLabel: React.ReactNode = null;

    if (p) {
      const images = p.assets.filter((a) => a.kind === "image");
      const videos = p.assets.filter((a) => a.kind === "video");
      const metaCount = [p.bioJson, p.tovJson, p.metadataJson].filter(Boolean).length;

      if (isChecking) {
        if (images.length > 0) imgLabel = <span className="text-[var(--color-text-muted)]">{images.length} img…</span>;
        if (videos.length > 0) vidLabel = <span className="text-[var(--color-text-muted)]">{videos.length} vid…</span>;
        if (metaCount > 0) metaLabel = <span className="text-cyan-400">{metaCount} json</span>;
      } else {
        const identicalImages = images.filter((a) => a.isDuplicate);
        const newImgs = images.filter((a) => !a.isDuplicate);
        const imgUp = newContentOnly ? newImgs.length : images.length;
        const imgSk = newContentOnly ? identicalImages.length : 0;

        if (images.length > 0) {
          if (imgSk > 0 && imgUp > 0) imgLabel = <><span className="text-green-400">{imgUp}↑</span> <span className="text-[var(--color-text-muted)]">{imgSk}✕</span></>;
          else if (imgSk > 0) imgLabel = <span className="text-[var(--color-text-muted)]">{imgSk} =</span>;
          else if (identicalImages.length > 0 && !newContentOnly) imgLabel = <span className="text-orange-400">{images.length} ({identicalImages.length}=)</span>;
          else imgLabel = <span className="text-green-400">{images.length} img</span>;
        }

        if (videos.length > 0) {
          const identicalVids = videos.filter((a) => a.isDuplicate);
          const newVids = videos.filter((a) => !a.isDuplicate);
          const vidUp = newContentOnly ? newVids.length : videos.length;
          const vidSk = newContentOnly ? identicalVids.length : 0;

          if (vidSk > 0 && vidUp > 0) vidLabel = <><span className="text-green-400">{vidUp}↑</span> <span className="text-[var(--color-text-muted)]">{vidSk}✕</span></>;
          else if (vidSk > 0) vidLabel = <span className="text-[var(--color-text-muted)]">{vidSk} =</span>;
          else if (identicalVids.length > 0 && !newContentOnly) vidLabel = <span className="text-orange-400">{videos.length} ({identicalVids.length}=)</span>;
          else vidLabel = <span className="text-green-400">{videos.length} vid</span>;
        }

        if (metaCount > 0) metaLabel = <span className="text-cyan-400">{metaCount} json</span>;
      }
    }

    return (
      <div
        key={idx}
        className={cn(
          "grid items-center gap-x-2 px-2 py-0.5 font-mono text-xs",
          payloads ? "grid-cols-[1fr_auto_auto_auto_auto]" : "grid-cols-[1fr_auto]",
          isDuplicate && !checkedExistingAssets.has(idx) && !(bulkMode && hasAssets)
            ? "opacity-40"
            : "hover:bg-[#161b22]",
          "border-b border-white/5 last:border-b-0",
        )}
      >
        <Checkbox
          checked={isDuplicate ? (bulkMode && hasAssets ? checkedExistingAssets.has(idx) : false) : checked.has(idx)}
          onChange={() => isDuplicate && bulkMode && hasAssets ? toggleExistingAssets(idx) : toggleItem(idx)}
          disabled={isDuplicate && !(bulkMode && hasAssets)}
          label={name}
        />

        {payloads && <span className="text-center min-w-[3.5rem]">{imgLabel}</span>}
        {payloads && <span className="text-center min-w-[3.5rem]">{vidLabel}</span>}
        {payloads && <span className="text-center min-w-[3rem]">{metaLabel}</span>}

        <span className={cn("text-right shrink-0",
          hashSummary?.isHashing
            ? "text-[var(--color-text-muted)]"
            : isDuplicate
              ? (bulkMode && hasAssets ? "text-green-400" : "text-orange-400")
              : checked.has(idx) ? "text-green-400" : "text-[var(--color-text-muted)]"
        )}>
          {hashSummary?.isHashing
            ? "…"
            : isDuplicate
              ? (bulkMode && hasAssets
                ? (importMissing ? "update" : "overwrite")
                : "exists")
              : checked.has(idx) ? "create" : "skip"
          }
        </span>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={isImporting ? () => {} : onClose} title="Import Models" size="xl">
      <Stack gap={3}>
        {/* Target project indicator */}
        {projectName && (
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            <span>target</span>
            <span className="text-cyan-400">{projectName}</span>
          </div>
        )}

        {/* Project detection banner (grouped imports only) */}
        {isGroupedImport && detectedProjectName && (
          <p className={cn(
            "font-mono text-xs border-l-2 pl-2 py-0.5",
            projectNameMatch
              ? "border-green-400 text-green-400"
              : projectNameMatch === false
                ? "border-orange-400 text-orange-400"
                : "border-[var(--color-border-default)] text-[var(--color-text-muted)]",
          )}>
            {projectNameMatch
              ? `folder matches "${detectedProjectName}"`
              : projectNameMatch === false
                ? `folder "${detectedProjectName}" ≠ project "${projectName}"`
                : `importing from "${detectedProjectName}"`}
          </p>
        )}

        {/* Hash deduplication summary */}
        {hashSummary && (
          <p className={cn(
            "font-mono text-xs border-l-2 pl-2 py-0.5",
            hashSummary.isHashing
              ? "border-[var(--color-border-default)] text-[var(--color-text-muted)]"
              : hashSummary.duplicateFiles > 0
                ? "border-orange-400 text-orange-400"
                : "border-green-400 text-green-400",
          )}>
            {hashSummary.isHashing
              ? `checking ${hashSummary.totalFiles} file${hashSummary.totalFiles !== 1 ? "s" : ""} for duplicates...`
              : hashSummary.duplicateFiles > 0
                ? `${hashSummary.newFiles} new, ${hashSummary.duplicateFiles} already imported (same content)`
                : `all ${hashSummary.totalFiles} file${hashSummary.totalFiles !== 1 ? "s" : ""} are new`}
          </p>
        )}

        {/* Group selector row */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
          {isGroupedImport ? (
            <div className="w-[200px]">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
                Groups
              </label>
              <span className="text-sm text-[var(--color-text-secondary)]">
                from folder structure
              </span>
            </div>
          ) : existingGroups.length > 1 ? (
            <div className="w-[200px]">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
                Assign to group
              </label>
              <span className="text-sm text-[var(--color-text-secondary)]">
                (multiple groups)
              </span>
            </div>
          ) : (
            <div>
              <Select
                label="Assign to group"
                options={groupOptions}
                value={groupId}
                onChange={setGroupId}
                disabled={existingGroups.length === 1 && !hasNewCharacters}
              />
              {hasNewCharacters && (
                !showNewGroup ? (
                  <button
                    type="button"
                    className={cn("mt-[var(--spacing-1)]", INLINE_LINK_BTN)}
                    onClick={() => setShowNewGroup(true)}
                  >
                    + Create new group
                  </button>
                ) : (
                  <div className="mt-[var(--spacing-2)] flex items-end gap-[var(--spacing-2)]">
                    <div className="flex-1">
                      <Input
                        placeholder="New group name"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const name = newGroupName.trim();
                        if (!name) return;
                        createGroup.mutate(
                          { name },
                          {
                            onSuccess: (created) => {
                              setGroupId(String(created.id));
                              setNewGroupName("");
                              setShowNewGroup(false);
                            },
                          },
                        );
                      }}
                      loading={createGroup.isPending}
                      disabled={!newGroupName.trim()}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowNewGroup(false);
                        setNewGroupName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Toggles row */}
        <div className="flex flex-wrap items-center gap-[var(--spacing-4)]">
          <Toggle
            checked={normalize}
            onChange={setNormalize}
            label="Normalize names"
            size="sm"
          />
          {duplicatesWithAssets.size > 0 && payloads && (
            <Toggle
              checked={importMissing}
              onChange={setImportMissing}
              label="Import missing"
              size="sm"
            />
          )}
          {duplicateCount > 0 && payloads && !importMissing && (
            <Toggle
              checked={overwrite}
              onChange={setOverwrite}
              label="Overwrite existing"
              size="sm"
            />
          )}
          {hashSummary && !hashSummary.isHashing && hashSummary.duplicateFiles > 0 && (
            <Toggle
              checked={newContentOnly}
              onChange={setNewContentOnly}
              label={`New content only (skip ${hashSummary.duplicateFiles} identical)`}
              size="sm"
            />
          )}
          {onMetadataTemplateChange && templateOptions.length > 0 && (
            <FilterSelect
              options={templateOptions}
              value={metadataTemplateId ?? ""}
              onChange={onMetadataTemplateChange}
              placeholder="Metadata template"
              size="sm"
              className="w-[180px]"
            />
          )}
        </div>

        {/* Duplicate warning */}
        {duplicateCount > 0 && (
          <p className="font-mono text-xs border-l-2 border-orange-400 pl-2 py-0.5 text-orange-400">
            {duplicateCount} {duplicateCount === 1 ? "name" : "names"} already{" "}
            {duplicateCount === 1 ? "exists" : "exist"}.
            {payloads
              ? importMissing
                ? " missing assets will be imported."
                : overwrite
                  ? " existing assets will be overwritten."
                  : " enable 'Import missing' or 'Overwrite existing' to update."
              : " duplicates will be skipped."}
          </p>
        )}

        {/* Action summary */}
        {payloads && (
          <div className="flex flex-wrap gap-3 font-mono text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border-default)] pt-2">
            {hashSummary?.isHashing ? (
              <span>checking {hashSummary.totalFiles} files…</span>
            ) : (
              <>
                {selectedCount > 0 && (
                  <span><span className="text-green-400">{selectedCount}</span> new</span>
                )}
                {existingAssetsCount > 0 && (
                  <span><span className="text-cyan-400">{existingAssetsCount}</span> update</span>
                )}
                {duplicateCount > 0 && duplicateCount - existingAssetsCount > 0 && (
                  <span>{duplicateCount - existingAssetsCount} skip</span>
                )}
                {hashSummary && hashSummary.duplicateFiles > 0 && (
                  <span className={newContentOnly ? "" : "text-orange-400"}>
                    {hashSummary.duplicateFiles} identical
                    {newContentOnly ? " (skip)" : ""}
                  </span>
                )}
                {hashSummary && newContentOnly && hashSummary.newFiles > 0 && (
                  <span className="text-green-400">{hashSummary.newFiles} new</span>
                )}
              </>
            )}
          </div>
        )}

        {/* Name list */}
        <div className="max-h-[320px] overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
          {/* Select all header */}
          <div className="px-2 py-1.5 border-b border-[var(--color-border-default)] bg-[#161b22]">
            <Checkbox
              checked={totalActionCount > 0 && selectedCount === importableCount && (duplicatesWithAssets.size === 0 || existingAssetsCount === duplicatesWithAssets.size)}
              indeterminate={totalActionCount > 0 && (selectedCount < importableCount || (duplicatesWithAssets.size > 0 && existingAssetsCount < duplicatesWithAssets.size))}
              onChange={() => {
                toggleAll();
                // Also toggle all existing asset checkboxes when in bulk mode
                if (importMissing || overwrite) {
                  const allNewChecked = importableCount > 0 && selectedCount === importableCount;
                  const allExistChecked = duplicatesWithAssets.size > 0 && existingAssetsCount === duplicatesWithAssets.size;
                  if (allNewChecked && allExistChecked) {
                    setCheckedExistingAssets(new Set());
                  } else {
                    setCheckedExistingAssets(new Set(duplicatesWithAssets));
                  }
                }
              }}
              disabled={importableCount === 0 && duplicatesWithAssets.size === 0}
              label={importableCount === 0 && duplicatesWithAssets.size === 0 ? "All models already exist" : `Select all (${importableCount + ((importMissing || overwrite) ? duplicatesWithAssets.size : 0)})`}
            />
          </div>

          {isGroupedImport && groupedIndices ? (
            /* Grouped view — characters organized under group headers */
            [...groupedIndices.entries()].map(([groupName, indices]) => (
              <div key={groupName}>
                <div className="px-2 py-1.5 bg-[#161b22] border-b border-[var(--color-border-default)] flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-[var(--color-text-primary)]">
                    {groupName || "Ungrouped"}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{indices.length}</span>
                  {groupName && (
                    <span className={cn("font-mono text-[10px]", existingGroupNameSet.has(groupName.toLowerCase()) ? "text-green-400" : "text-cyan-400")}>
                      {existingGroupNameSet.has(groupName.toLowerCase()) ? "exists" : "new"}
                    </span>
                  )}
                </div>
                {indices.map((idx) => renderCharacterRow(idx))}
              </div>
            ))
          ) : (
            /* Flat view — simple character list */
            displayNames.map((_, idx) => renderCharacterRow(idx))
          )}
        </div>

        {/* Import progress */}
        {importProgress && importProgress.phase !== "done" && (
          <ImportProgressBar progress={importProgress} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-default)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {selectedCount > 0 && <><span className="text-green-400">{selectedCount}</span> new</>}
            {selectedCount > 0 && existingAssetsCount > 0 && " · "}
            {existingAssetsCount > 0 && <><span className="text-cyan-400">{existingAssetsCount}</span> update</>}
            {totalActionCount === 0 && "0 selected"}
            {duplicateCount > 0 && totalActionCount === 0 && ` · ${duplicateCount} already exist`}
          </span>
          <div className="flex gap-2">
            {isImporting ? (
              <Button variant="danger" size="sm" onClick={onAbort}>
                Stop
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={totalActionCount === 0}
                  loading={loading}
                >
                  {selectedCount > 0 && existingAssetsCount > 0
                    ? `Import ${selectedCount} + Update ${existingAssetsCount}`
                    : selectedCount > 0
                      ? `Import ${selectedCount} Model${selectedCount !== 1 ? "s" : ""}`
                      : existingAssetsCount > 0
                        ? `Update ${existingAssetsCount} Model${existingAssetsCount !== 1 ? "s" : ""}`
                        : "Import"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
