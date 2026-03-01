/**
 * Confirmation modal shown after dropping a file to import characters.
 *
 * Displays a scrollable, checkable list of parsed names with options
 * to assign a group and apply title-case formatting.
 */

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Select, Toggle } from "@/components/primitives";
import { toSelectOptions } from "@/lib/select-utils";

import { useCharacterGroups } from "../hooks/use-character-groups";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImportConfirmModalProps {
  open: boolean;
  onClose: () => void;
  names: string[];
  projectId: number;
  /** Names of characters that already exist (case-insensitive match). */
  existingNames?: string[];
  onConfirm: (names: string[], groupId?: number) => void;
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
 * - `carli_nicki`  → `Carli Nicki`
 * - `cj_miles`     → `CJ Miles`     (2-char initials uppercased)
 * - `maddy_o_reilly` → `Maddy O'Reilly` (Irish/Scottish O')
 * - `miss_molly`   → `Miss Molly`    (title preserved)
 * - `la_sirena_69` → `La Sirena 69`  (article + number)
 */
function normalizeCharacterName(raw: string): string {
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

  // Join Irish/Scottish "O" + NextName → "O'NextName"
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
  projectId,
  existingNames = [],
  onConfirm,
  loading,
}: ImportConfirmModalProps) {
  const { data: groups } = useCharacterGroups(projectId);

  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(names.map((_, i) => i)),
  );
  const [normalize, setNormalize] = useState(true);
  const [groupId, setGroupId] = useState("");

  const displayNames = useMemo(
    () => (normalize ? names.map(normalizeCharacterName) : names),
    [names, normalize],
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

  // Reset checked set when names change — auto-uncheck duplicates
  useEffect(() => {
    const initial = new Set<number>();
    for (let i = 0; i < names.length; i++) {
      // Don't check duplicates by default (they'll need explicit opt-in)
      const display = normalize ? normalizeCharacterName(names[i]!) : names[i]!;
      if (!existingSet.has(display.toLowerCase())) {
        initial.add(i);
      }
    }
    setChecked(initial);
  }, [names, existingSet, normalize]);

  const groupOptions = useMemo(
    () => [{ value: "", label: "No group" }, ...toSelectOptions(groups)],
    [groups],
  );

  // Count only non-duplicate selected items
  const selectedCount = [...checked].filter(
    (i) => !duplicateIndices.has(i),
  ).length;

  function toggleItem(idx: number) {
    // Don't allow checking duplicates
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
    const nonDuplicates = names
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
    const selected = displayNames.filter(
      (_, i) => checked.has(i) && !duplicateIndices.has(i),
    );
    onConfirm(selected, groupId ? Number(groupId) : undefined);
  }

  const importableCount = names.length - duplicateCount;

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
              {duplicateCount === 1 ? "exists" : "exist"} and will be skipped.
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
            return (
              <div
                key={idx}
                className={`flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-1)] ${
                  isDuplicate
                    ? "opacity-50"
                    : "hover:bg-[var(--color-surface-secondary)]"
                }`}
              >
                <Checkbox
                  checked={checked.has(idx)}
                  onChange={() => toggleItem(idx)}
                  disabled={isDuplicate}
                  label={name}
                />
                {isDuplicate && (
                  <span className="text-xs text-[var(--color-text-warning)] ml-auto shrink-0">
                    already exists
                  </span>
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
          </span>
          <div className="flex gap-[var(--spacing-2)]">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              loading={loading}
            >
              Import {selectedCount} {selectedCount === 1 ? "Character" : "Characters"}
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}
