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

import { useEffect, useMemo, useState } from "react";

import { useSetToggle } from "@/hooks/useSetToggle";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Checkbox, FilterSelect, Input, Select, Toggle } from "@/components/primitives";
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

  // Reset checked set when names change — auto-uncheck duplicates
  useEffect(() => {
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
    setCheckedExistingAssets(new Set());
    setImportMissing(false);
    setOverwrite(false);
    setNewContentOnly(false);
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

    // Compute badge content for this row
    const p = payloads?.[idx];
    const isChecking = hashSummary?.isHashing;
    let imgBadge: React.ReactNode = null;
    let vidBadge: React.ReactNode = null;
    let metaBadge: React.ReactNode = null;

    if (p) {
      const images = p.assets.filter((a) => a.kind === "image");
      const videos = p.assets.filter((a) => a.kind === "video");
      const metaCount = [p.bioJson, p.tovJson, p.metadataJson].filter(Boolean).length;

      if (isChecking) {
        if (images.length > 0) imgBadge = <Badge variant="default" size="sm">{images.length} img…</Badge>;
        if (videos.length > 0) vidBadge = <Badge variant="default" size="sm">{videos.length} vid…</Badge>;
        if (metaCount > 0) metaBadge = <Badge variant="info" size="sm">{metaCount} json</Badge>;
      } else {
        const identicalImages = images.filter((a) => a.isDuplicate);
        const newImgs = images.filter((a) => !a.isDuplicate);
        const imgUp = newContentOnly ? newImgs.length : images.length;
        const imgSk = newContentOnly ? identicalImages.length : 0;

        if (images.length > 0) {
          if (imgSk > 0 && imgUp > 0) imgBadge = <><Badge variant="success" size="sm">{imgUp}↑</Badge> <Badge variant="default" size="sm">{imgSk}✕</Badge></>;
          else if (imgSk > 0) imgBadge = <Badge variant="default" size="sm">{imgSk} identical</Badge>;
          else if (identicalImages.length > 0 && !newContentOnly) imgBadge = <Badge variant="warning" size="sm">{images.length} ({identicalImages.length}=)</Badge>;
          else imgBadge = <Badge variant="success" size="sm">{images.length} img</Badge>;
        }

        if (videos.length > 0) {
          const identicalVids = videos.filter((a) => a.isDuplicate);
          const newVids = videos.filter((a) => !a.isDuplicate);
          const vidUp = newContentOnly ? newVids.length : videos.length;
          const vidSk = newContentOnly ? identicalVids.length : 0;

          if (vidSk > 0 && vidUp > 0) vidBadge = <><Badge variant="success" size="sm">{vidUp}↑</Badge> <Badge variant="default" size="sm">{vidSk}✕</Badge></>;
          else if (vidSk > 0) vidBadge = <Badge variant="default" size="sm">{vidSk} identical</Badge>;
          else if (identicalVids.length > 0 && !newContentOnly) vidBadge = <Badge variant="warning" size="sm">{videos.length} ({identicalVids.length}=)</Badge>;
          else vidBadge = <Badge variant="success" size="sm">{videos.length} vid</Badge>;
        }

        if (metaCount > 0) metaBadge = <Badge variant="info" size="sm">{metaCount} json</Badge>;
      }
    }

    return (
      <div
        key={idx}
        className={cn(
          "grid items-center gap-x-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-1)]",
          payloads ? "grid-cols-[1fr_auto_auto_auto_auto]" : "grid-cols-[1fr_auto]",
          isDuplicate && !checkedExistingAssets.has(idx) && !(bulkMode && hasAssets)
            ? "opacity-50"
            : "hover:bg-[var(--color-surface-secondary)]",
        )}
      >
        <Checkbox
          checked={isDuplicate ? (bulkMode && hasAssets ? checkedExistingAssets.has(idx) : false) : checked.has(idx)}
          onChange={() => isDuplicate && bulkMode && hasAssets ? toggleExistingAssets(idx) : toggleItem(idx)}
          disabled={isDuplicate && !(bulkMode && hasAssets)}
          label={name}
        />

        {payloads && <span className="text-center min-w-[4.5rem]">{imgBadge}</span>}
        {payloads && <span className="text-center min-w-[4.5rem]">{vidBadge}</span>}
        {payloads && <span className="text-center min-w-[3.5rem]">{metaBadge}</span>}

        <span className={cn("text-xs text-right shrink-0",
          hashSummary?.isHashing
            ? "text-[var(--color-text-muted)]"
            : isDuplicate
              ? (bulkMode && hasAssets ? "text-[var(--color-text-success)]" : "text-[var(--color-text-warning)]")
              : checked.has(idx) ? "text-[var(--color-text-success)]" : "text-[var(--color-text-muted)]"
        )}>
          {hashSummary?.isHashing
            ? "checking…"
            : isDuplicate
              ? (bulkMode && hasAssets
                ? (importMissing ? "→ update" : "→ overwrite")
                : "exists")
              : checked.has(idx) ? "→ create" : "skip"
          }
        </span>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={isImporting ? () => {} : onClose} title="Import Characters" size="xl">
      <Stack gap={4}>
        {/* Target project indicator */}
        {projectName && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span>Importing into:</span>
            <Badge variant="info" size="sm">{projectName}</Badge>
          </div>
        )}

        {/* Project detection banner (grouped imports only) */}
        {isGroupedImport && detectedProjectName && (
          <div
            className={cn(
              "rounded-[var(--radius-md)] border px-[var(--spacing-3)] py-[var(--spacing-2)]",
              projectNameMatch
                ? "border-[var(--color-border-success)] bg-[var(--color-surface-success)]"
                : projectNameMatch === false
                  ? "border-[var(--color-border-warning)] bg-[var(--color-surface-warning)]"
                  : "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]",
            )}
          >
            <p
              className={cn(
                "text-sm",
                projectNameMatch
                  ? "text-[var(--color-text-success)]"
                  : projectNameMatch === false
                    ? "text-[var(--color-text-warning)]"
                    : "text-[var(--color-text-secondary)]",
              )}
            >
              {projectNameMatch
                ? `Folder matches project "${detectedProjectName}"`
                : projectNameMatch === false
                  ? `Folder "${detectedProjectName}" does not match current project "${projectName}"`
                  : `Importing from "${detectedProjectName}"`}
            </p>
          </div>
        )}

        {/* Hash deduplication summary */}
        {hashSummary && (
          <div
            className={cn(
              "rounded-[var(--radius-md)] border px-[var(--spacing-3)] py-[var(--spacing-2)]",
              hashSummary.isHashing
                ? "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]"
                : hashSummary.duplicateFiles > 0
                  ? "border-[var(--color-border-warning)] bg-[var(--color-surface-warning)]"
                  : "border-[var(--color-border-success)] bg-[var(--color-surface-success)]",
            )}
          >
            <p
              className={cn(
                "text-sm",
                hashSummary.isHashing
                  ? "text-[var(--color-text-secondary)]"
                  : hashSummary.duplicateFiles > 0
                    ? "text-[var(--color-text-warning)]"
                    : "text-[var(--color-text-success)]",
              )}
            >
              {hashSummary.isHashing
                ? `Checking ${hashSummary.totalFiles} file${hashSummary.totalFiles !== 1 ? "s" : ""} for duplicates...`
                : hashSummary.duplicateFiles > 0
                  ? `${hashSummary.newFiles} new file${hashSummary.newFiles !== 1 ? "s" : ""}, ${hashSummary.duplicateFiles} already imported (same content)`
                  : `All ${hashSummary.totalFiles} file${hashSummary.totalFiles !== 1 ? "s" : ""} are new`}
            </p>
          </div>
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
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-warning)] bg-[var(--color-surface-warning)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <p className="text-sm text-[var(--color-text-warning)]">
              {duplicateCount} {duplicateCount === 1 ? "name" : "names"} already{" "}
              {duplicateCount === 1 ? "exists" : "exist"}.
              {payloads
                ? importMissing
                  ? " Missing assets will be imported to existing characters."
                  : overwrite
                    ? " Existing assets will be overwritten."
                    : " Enable 'Import missing' or 'Overwrite existing' to update these characters."
                : " Duplicates will be skipped."}
            </p>
          </div>
        )}

        {/* Action summary */}
        {payloads && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <div className="flex flex-wrap gap-[var(--spacing-4)] text-sm text-[var(--color-text-secondary)]">
              {hashSummary?.isHashing ? (
                <span className="text-[var(--color-text-muted)]">Checking {hashSummary.totalFiles} files for duplicates…</span>
              ) : (
                <>
                  {selectedCount > 0 && (
                    <span><strong className="text-[var(--color-text-primary)]">{selectedCount}</strong> new {selectedCount === 1 ? "character" : "characters"} to create</span>
                  )}
                  {existingAssetsCount > 0 && (
                    <span><strong className="text-[var(--color-text-primary)]">{existingAssetsCount}</strong> existing to update</span>
                  )}
                  {duplicateCount > 0 && duplicateCount - existingAssetsCount > 0 && (
                    <span className="text-[var(--color-text-muted)]">{duplicateCount - existingAssetsCount} skipped (exist)</span>
                  )}
                  {hashSummary && hashSummary.duplicateFiles > 0 && (
                    <span className={newContentOnly ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-warning)]"}>
                      {hashSummary.duplicateFiles} identical {hashSummary.duplicateFiles === 1 ? "file" : "files"}
                      {newContentOnly ? " (will skip)" : " (same content)"}
                    </span>
                  )}
                  {hashSummary && newContentOnly && hashSummary.newFiles > 0 && (
                    <span className="text-[var(--color-text-success)]">{hashSummary.newFiles} new {hashSummary.newFiles === 1 ? "file" : "files"} to import</span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Name list */}
        <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
          {/* Select all header */}
          <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]">
            <Checkbox
              checked={importableCount > 0 && selectedCount === importableCount}
              indeterminate={selectedCount > 0 && selectedCount < importableCount}
              onChange={toggleAll}
              disabled={importableCount === 0}
              label={importableCount === 0 ? "All characters already exist" : `Select all (${importableCount})`}
            />
          </div>

          {isGroupedImport && groupedIndices ? (
            /* Grouped view — characters organized under group headers */
            [...groupedIndices.entries()].map(([groupName, indices]) => (
              <div key={groupName}>
                <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)] flex items-center gap-[var(--spacing-2)]">
                  <span className="font-medium text-sm text-[var(--color-text-primary)]">
                    {groupName || "Ungrouped"}
                  </span>
                  <Badge variant="default" size="sm">
                    {indices.length}
                  </Badge>
                  {groupName && (
                    <Badge
                      variant={existingGroupNameSet.has(groupName.toLowerCase()) ? "success" : "info"}
                      size="sm"
                    >
                      {existingGroupNameSet.has(groupName.toLowerCase()) ? "Exists" : "New group"}
                    </Badge>
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
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">
            {selectedCount} of {importableCount} selected
            {duplicateCount > 0 && ` (${duplicateCount} duplicates)`}
            {existingAssetsCount > 0 && ` + ${existingAssetsCount} asset uploads`}
          </span>
          <div className="flex gap-[var(--spacing-2)]">
            {isImporting ? (
              <Button variant="danger" onClick={onAbort}>
                Stop Import
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={totalActionCount === 0}
                  loading={loading}
                >
                  {selectedCount > 0 && (
                    <>Import {selectedCount} {selectedCount === 1 ? "Character" : "Characters"}</>
                  )}
                  {selectedCount > 0 && existingAssetsCount > 0 && " + "}
                  {existingAssetsCount > 0 && (
                    <>Upload to {existingAssetsCount}</>
                  )}
                  {totalActionCount === 0 && "Import"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
