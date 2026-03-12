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
import { Badge, Button, Checkbox, Select, Toggle } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/characters/types";

import type { Character, CharacterDropPayload } from "../types";
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
  /** Detected project name from folder structure (for grouped imports). */
  detectedProjectName?: string;
  /** Current project name for matching against detectedProjectName. */
  projectName?: string;
  /** Names of existing groups for "exists" / "will be created" badges. */
  existingGroupNames?: string[];
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

/** Image diff badges: shows new/exists breakdown for duplicate rows. */
function DiffBadges({
  isDuplicate,
  overwrite,
  payload,
  displayName,
  duplicateCharMap,
  variantMap,
  variantLoading,
  totalImages,
}: {
  isDuplicate: boolean;
  overwrite: boolean;
  payload?: CharacterDropPayload;
  displayName: string;
  duplicateCharMap: Map<string, Character>;
  variantMap: Map<number, Set<string>>;
  variantLoading: boolean;
  totalImages: number;
}) {
  // Non-duplicate, overwrite on, or still loading: show simple total count
  if (!isDuplicate || !payload || overwrite || variantLoading) {
    return (
      <Badge variant="info" size="sm">
        {totalImages} {totalImages === 1 ? "image" : "images"}
      </Badge>
    );
  }

  // Compute new vs existing counts
  const char = duplicateCharMap.get(displayName.toLowerCase());
  const existingTypes = char ? variantMap.get(char.id) : undefined;
  if (!existingTypes || existingTypes.size === 0) {
    return (
      <Badge variant="info" size="sm">
        {totalImages} new
      </Badge>
    );
  }

  const imageAssets = payload.assets.filter((a) => a.kind === "image");
  let newCount = 0;
  let existCount = 0;
  for (const a of imageAssets) {
    if (existingTypes.has(a.category.toLowerCase())) {
      existCount++;
    } else {
      newCount++;
    }
  }

  return (
    <>
      {newCount > 0 && (
        <Badge variant="info" size="sm">
          {newCount} new
        </Badge>
      )}
      {existCount > 0 && (
        <Badge variant="default" size="sm">
          {existCount} {existCount === 1 ? "exists" : "exist"}
        </Badge>
      )}
    </>
  );
}

/** Metadata diff badges: shows new/exists per json file for duplicate rows. */
function MetadataDiffBadges({
  isDuplicate,
  payload,
  displayName,
  duplicateCharMap,
}: {
  isDuplicate: boolean;
  payload?: CharacterDropPayload;
  displayName: string;
  duplicateCharMap: Map<string, Character>;
}) {
  if (!isDuplicate || !payload) {
    const count = [payload?.bioJson, payload?.tovJson, payload?.metadataJson].filter(Boolean).length;
    return (
      <Badge variant="success" size="sm">
        {count} json
      </Badge>
    );
  }

  const char = duplicateCharMap.get(displayName.toLowerCase());
  const meta = char?.metadata;
  const hasBio = meta && SOURCE_KEY_BIO in meta;
  const hasTov = meta && SOURCE_KEY_TOV in meta;

  const badges: { label: string; isNew: boolean }[] = [];
  if (payload.bioJson) badges.push({ label: "bio", isNew: !hasBio });
  if (payload.tovJson) badges.push({ label: "tov", isNew: !hasTov });
  if (payload.metadataJson) badges.push({ label: "meta", isNew: true }); // metadata.json always overwrites

  return (
    <>
      {badges.map((b) => (
        <Badge key={b.label} variant={b.isNew ? "success" : "default"} size="sm">
          {b.label} {b.isNew ? "new" : "exists"}
        </Badge>
      ))}
    </>
  );
}

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
  detectedProjectName,
  projectName,
  existingGroupNames = [],
}: ImportConfirmModalProps) {
  const { options: groupOptions } = useGroupSelectOptions(projectId);

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
  const [overwrite, setOverwrite] = useState(false);
  /** Existing characters whose assets should be uploaded. */
  const [checkedExistingAssets, toggleExistingAssets, setCheckedExistingAssets] = useSetToggle<number>();
  const [importMissing, setImportMissing] = useState(false);

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

  const { variantMap, loading: variantLoading } = useDuplicateAssetInfo(open, duplicateCharIds);

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
  }, [effectiveNames, existingSet, normalize]);

  // Pre-fill group selector when all duplicates share a single group
  useEffect(() => {
    if (existingGroups.length === 1) {
      setGroupId(String(existingGroups[0]));
    }
  }, [existingGroups]);

  // When "Import missing" or "Overwrite" is toggled, auto-select all duplicates with assets
  useEffect(() => {
    if (importMissing || overwrite) {
      setCheckedExistingAssets(new Set(duplicatesWithAssets));
    } else {
      setCheckedExistingAssets(new Set());
    }
  }, [importMissing, overwrite, duplicatesWithAssets]);

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

        // Apply normalized name
        const normalizedPayload: CharacterDropPayload = {
          ...payload,
          rawName: display,
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
        importMissing ? false : overwrite,
        importMissing,
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

  /** Render a single character row (shared by flat and grouped views). */
  const renderCharacterRow = (idx: number) => {
    const name = displayNames[idx]!;
    const isDuplicate = duplicateIndices.has(idx);
    const counts = assetCounts?.[idx];
    const hasAssets = counts && (counts.images > 0 || counts.videos > 0 || counts.metadata > 0);
    const bulkMode = importMissing || overwrite;

    return (
      <div
        key={idx}
        className={`flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-1)] ${
          isDuplicate && !checkedExistingAssets.has(idx) && !(bulkMode && hasAssets)
            ? "opacity-50"
            : "hover:bg-[var(--color-surface-secondary)]"
        }`}
      >
        {isDuplicate && hasAssets && bulkMode ? (
          <Checkbox
            checked={checkedExistingAssets.has(idx)}
            onChange={() => toggleExistingAssets(idx)}
            label={name}
          />
        ) : (
          <Checkbox
            checked={isDuplicate ? false : checked.has(idx)}
            onChange={() => toggleItem(idx)}
            disabled={isDuplicate}
            label={name}
          />
        )}

        {counts && counts.images > 0 && (
          <DiffBadges
            isDuplicate={isDuplicate}
            overwrite={overwrite}
            payload={payloads?.[idx]}
            displayName={name}
            duplicateCharMap={duplicateCharMap}
            variantMap={variantMap}
            variantLoading={variantLoading}
            totalImages={counts.images}
          />
        )}
        {counts && counts.videos > 0 && (
          <Badge variant="default" size="sm">
            {counts.videos} {counts.videos === 1 ? "video" : "videos"}
          </Badge>
        )}
        {counts && counts.metadata > 0 && (
          <MetadataDiffBadges
            isDuplicate={isDuplicate}
            payload={payloads?.[idx]}
            displayName={name}
            duplicateCharMap={duplicateCharMap}
          />
        )}

        {isDuplicate && !hasAssets && (
          <span className="text-xs text-[var(--color-text-warning)] ml-auto shrink-0">
            already exists
          </span>
        )}

        {isDuplicate && hasAssets && !bulkMode && (
          <div className="ml-auto shrink-0 flex items-center gap-[var(--spacing-2)]">
            <span className="text-xs text-[var(--color-text-warning)]">
              exists
            </span>
            <Toggle
              checked={checkedExistingAssets.has(idx)}
              onChange={() => toggleExistingAssets(idx)}
              label="Upload assets"
              size="sm"
            />
          </div>
        )}
        {isDuplicate && hasAssets && bulkMode && (
          <span className="ml-auto shrink-0 text-xs text-[var(--color-text-success)]">
            {importMissing ? "import missing" : "overwrite"}
          </span>
        )}
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Characters" size="lg">
      <Stack gap={4}>
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

        {/* Options bar */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
          {/* Group selector — hidden for grouped imports (groups from folder structure) */}
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
            <div className="w-[200px]">
              <Select
                label="Assign to group"
                options={groupOptions}
                value={groupId}
                onChange={setGroupId}
                disabled={existingGroups.length === 1 && !hasNewCharacters}
              />
            </div>
          )}
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
                    : " Toggle 'Upload assets' to add files to existing characters."
                : " Duplicates will be skipped."}
            </p>
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

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">
            {selectedCount} of {importableCount} selected
            {duplicateCount > 0 && ` (${duplicateCount} duplicates)`}
            {existingAssetsCount > 0 && ` + ${existingAssetsCount} asset uploads`}
          </span>
          <div className="flex gap-[var(--spacing-2)]">
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
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
