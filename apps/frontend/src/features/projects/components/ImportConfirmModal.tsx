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

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Checkbox, Select, Toggle } from "@/components/primitives";

import type { CharacterDropPayload } from "../types";
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
  /** Legacy callback — names only. */
  onConfirm: (names: string[], groupId?: number) => void;
  /** Asset-aware callback. When provided, used instead of onConfirm. */
  onConfirmWithAssets?: (
    newPayloads: CharacterDropPayload[],
    existingPayloads: CharacterDropPayload[],
    groupId?: number,
  ) => void;
  loading?: boolean;
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
   Component
   -------------------------------------------------------------------------- */

export function ImportConfirmModal({
  open,
  onClose,
  names,
  payloads,
  projectId,
  existingNames = [],
  onConfirm,
  onConfirmWithAssets,
  loading,
}: ImportConfirmModalProps) {
  const { options: groupOptions } = useGroupSelectOptions(projectId);

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
  /** Existing characters whose assets should be uploaded. */
  const [checkedExistingAssets, setCheckedExistingAssets] = useState<Set<number>>(new Set());

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

  // Asset counts per character (only in asset-aware mode)
  const assetCounts = useMemo(() => {
    if (!payloads) return null;
    return payloads.map((p) => ({
      images: p.assets.filter((a) => a.kind === "image").length,
      videos: p.assets.filter((a) => a.kind === "video").length,
    }));
  }, [payloads]);

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
  }, [effectiveNames, existingSet, normalize]);

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

  function toggleExistingAssets(idx: number) {
    setCheckedExistingAssets((prev) => {
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

  return (
    <Modal open={open} onClose={onClose} title="Import Characters" size="lg">
      <Stack gap={4}>
        {/* Options bar */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
          <div className="w-[200px]">
            <Select
              label="Assign to group"
              options={groupOptions}
              value={groupId}
              onChange={setGroupId}
            />
          </div>
          <Toggle
            checked={normalize}
            onChange={setNormalize}
            label="Normalize names"
            size="sm"
          />
        </div>

        {/* Duplicate warning */}
        {duplicateCount > 0 && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-warning)] bg-[var(--color-surface-warning)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <p className="text-sm text-[var(--color-text-warning)]">
              {duplicateCount} {duplicateCount === 1 ? "name" : "names"} already{" "}
              {duplicateCount === 1 ? "exists" : "exist"}.
              {payloads
                ? " Toggle 'Upload assets' to add files to existing characters."
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
              label={`Select all (${importableCount})`}
            />
          </div>

          {displayNames.map((name, idx) => {
            const isDuplicate = duplicateIndices.has(idx);
            const counts = assetCounts?.[idx];
            const hasAssets = counts && (counts.images > 0 || counts.videos > 0);

            return (
              <div
                key={idx}
                className={`flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-1)] ${
                  isDuplicate && !checkedExistingAssets.has(idx)
                    ? "opacity-50"
                    : "hover:bg-[var(--color-surface-secondary)]"
                }`}
              >
                <Checkbox
                  checked={isDuplicate ? false : checked.has(idx)}
                  onChange={() => toggleItem(idx)}
                  disabled={isDuplicate}
                  label={name}
                />

                {/* Asset count badges */}
                {counts && counts.images > 0 && (
                  <Badge variant="info" size="sm">
                    {counts.images} {counts.images === 1 ? "image" : "images"}
                  </Badge>
                )}
                {counts && counts.videos > 0 && (
                  <Badge variant="default" size="sm">
                    {counts.videos} {counts.videos === 1 ? "video" : "videos"}
                  </Badge>
                )}

                {isDuplicate && !hasAssets && (
                  <span className="text-xs text-[var(--color-text-warning)] ml-auto shrink-0">
                    already exists
                  </span>
                )}

                {/* Upload assets toggle for existing characters with assets */}
                {isDuplicate && hasAssets && (
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
              </div>
            );
          })}
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
