/**
 * Modal for assigning unmatched files to characters during import.
 *
 * Displays a per-character assignment grid with dropdowns for
 * clothed/topless images and bio/tov JSON files.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { FileAssignments, UnmatchedCharacterFiles } from "../hooks/useCharacterImportBase";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SKIP_VALUE = "__skip__";
const COLUMNS = ["clothed", "topless", "bio", "tov"] as const;
type ColumnKey = (typeof COLUMNS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  clothed: "Clothed Image",
  topless: "Topless Image",
  bio: "Bio JSON",
  tov: "ToV JSON",
};

const IMAGE_COLUMNS: ColumnKey[] = ["clothed", "topless"];
const JSON_COLUMNS: ColumnKey[] = ["bio", "tov"];

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build a unique file key for deduplication. */
function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FileAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  /** Characters with unmatched files to assign. */
  unmatchedFiles: UnmatchedCharacterFiles[];
  /** Called with final assignments when user confirms. */
  onConfirm: (assignments: FileAssignments) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FileAssignmentModal({
  open,
  onClose,
  unmatchedFiles,
  onConfirm,
}: FileAssignmentModalProps) {
  // State: characterName -> columnKey -> fileKey (or SKIP_VALUE)
  const [selections, setSelections] = useState<Map<string, Map<ColumnKey, string>>>(new Map());

  // Build file lookup maps and pre-populate with matched files
  const { fileLookup, preMatched } = useMemo(() => {
    const lookup = new Map<string, File>();
    const matched = new Map<string, Map<ColumnKey, string>>();

    for (const entry of unmatchedFiles) {
      const charSelections = new Map<ColumnKey, string>();

      // Register matched files as locked
      for (const [key, file] of Object.entries(entry.matched)) {
        if (file) {
          const fk = fileKey(file);
          lookup.set(fk, file);
          charSelections.set(key as ColumnKey, fk);
        }
      }

      // Register unmatched files
      for (const file of entry.imageFiles) {
        lookup.set(fileKey(file), file);
      }
      for (const file of entry.jsonFiles) {
        lookup.set(fileKey(file), file);
      }

      matched.set(entry.characterName, charSelections);
    }

    return { fileLookup: lookup, preMatched: matched };
  }, [unmatchedFiles]);

  // Initialize selections from pre-matched data
  useEffect(() => {
    const initial = new Map<string, Map<ColumnKey, string>>();
    for (const [charName, charMatched] of preMatched) {
      initial.set(charName, new Map(charMatched));
    }
    setSelections(initial);
  }, [preMatched]);

  // Collect all assigned file keys (excluding locked/pre-matched) for duplicate guard
  const assignedFileKeys = useMemo(() => {
    const assigned = new Map<string, { charName: string; column: ColumnKey }>();
    for (const [charName, charSelections] of selections) {
      for (const [column, fk] of charSelections) {
        if (fk === SKIP_VALUE) continue;
        // Only track user selections, not pre-matched (locked) ones
        const isLocked = preMatched.get(charName)?.get(column as ColumnKey) === fk;
        if (!isLocked) {
          assigned.set(fk, { charName, column: column as ColumnKey });
        }
      }
    }
    return assigned;
  }, [selections, preMatched]);

  const handleSelect = useCallback(
    (charName: string, column: ColumnKey, value: string) => {
      setSelections((prev) => {
        const next = new Map(prev);
        const charMap = new Map(next.get(charName) ?? new Map());
        if (value === SKIP_VALUE || value === "") {
          charMap.delete(column);
        } else {
          charMap.set(column, value);
        }
        next.set(charName, charMap);
        return next;
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    const assignments: FileAssignments = {};
    for (const [charName, charSelections] of selections) {
      const entry: FileAssignments[string] = {};
      for (const [column, fk] of charSelections) {
        if (fk === SKIP_VALUE) continue;
        const file = fileLookup.get(fk);
        if (file) {
          entry[column as ColumnKey] = file;
        }
      }
      if (Object.keys(entry).length > 0) {
        assignments[charName] = entry;
      }
    }
    onConfirm(assignments);
  }, [selections, fileLookup, onConfirm]);

  // Thumbnail previews (created object URLs, cleaned up on unmount)
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const entry of unmatchedFiles) {
      for (const file of entry.imageFiles) {
        const fk = fileKey(file);
        urls.set(fk, URL.createObjectURL(file));
      }
      // Also create previews for matched image files
      if (entry.matched.clothed) {
        const fk = fileKey(entry.matched.clothed);
        urls.set(fk, URL.createObjectURL(entry.matched.clothed));
      }
      if (entry.matched.topless) {
        const fk = fileKey(entry.matched.topless);
        urls.set(fk, URL.createObjectURL(entry.matched.topless));
      }
    }
    setPreviews(urls);
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, [unmatchedFiles]);

  // Count unassigned bio/tov warnings
  const warningCount = useMemo(() => {
    let count = 0;
    for (const entry of unmatchedFiles) {
      const charSelections = selections.get(entry.characterName);
      if (!charSelections?.has("bio") && !entry.matched.bio) count++;
      if (!charSelections?.has("tov") && !entry.matched.tov) count++;
    }
    return count;
  }, [unmatchedFiles, selections]);

  return (
    <Modal open={open} onClose={onClose} title="Assign Unmatched Files" size="3xl">
      <Stack gap={4}>
        {warningCount > 0 && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-warning)] bg-[var(--color-surface-warning)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <p className="text-sm text-[var(--color-text-warning)]">
              {warningCount} metadata {warningCount === 1 ? "file" : "files"} unassigned (bio.json / tov.json). This is non-blocking.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="text-left py-2 px-2 font-medium text-[var(--color-text-secondary)]">Character</th>
                {COLUMNS.map((col) => (
                  <th key={col} className="text-left py-2 px-2 font-medium text-[var(--color-text-secondary)]">
                    {COLUMN_LABELS[col]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unmatchedFiles.map((entry) => {
                const charSelections = selections.get(entry.characterName);
                return (
                  <tr key={entry.characterName} className="border-b border-[var(--color-border-default)]">
                    <td className="py-2 px-2 font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                      {entry.characterName}
                    </td>
                    {COLUMNS.map((col) => {
                      const isImage = IMAGE_COLUMNS.includes(col);
                      const isJson = JSON_COLUMNS.includes(col);
                      const isLocked = preMatched.get(entry.characterName)?.has(col) ?? false;
                      const currentValue = charSelections?.get(col) ?? "";
                      const availableFiles = isImage ? entry.imageFiles : entry.jsonFiles;

                      return (
                        <td key={col} className="py-2 px-2">
                          {isLocked ? (
                            <div className="flex items-center gap-2">
                              {isImage && currentValue && previews.get(currentValue) && (
                                <img
                                  src={previews.get(currentValue)}
                                  alt=""
                                  className="w-8 h-8 object-cover rounded"
                                />
                              )}
                              <Badge variant="default" size="sm">
                                {fileLookup.get(currentValue)?.name ?? "matched"}
                              </Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {isImage && currentValue && currentValue !== SKIP_VALUE && previews.get(currentValue) && (
                                <img
                                  src={previews.get(currentValue)}
                                  alt=""
                                  className="w-8 h-8 object-cover rounded"
                                />
                              )}
                              <select
                                value={currentValue || SKIP_VALUE}
                                onChange={(e) => handleSelect(entry.characterName, col, e.target.value)}
                                className={cn(
                                  "w-full appearance-none px-2 py-1 text-sm",
                                  "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
                                  "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
                                  "focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]",
                                )}
                              >
                                <option value={SKIP_VALUE}>-- Skip --</option>
                                {availableFiles.map((file) => {
                                  const fk = fileKey(file);
                                  const isUsed = assignedFileKeys.has(fk) &&
                                    !(assignedFileKeys.get(fk)?.charName === entry.characterName &&
                                      assignedFileKeys.get(fk)?.column === col);
                                  return (
                                    <option key={fk} value={fk} disabled={isUsed}>
                                      {file.name}{isUsed ? " (assigned)" : ""}
                                    </option>
                                  );
                                })}
                              </select>
                              {isJson && !currentValue && (
                                <Badge variant="warning" size="sm" className="shrink-0">!</Badge>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-[var(--spacing-2)]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm Assignments</Button>
        </div>
      </Stack>
    </Modal>
  );
}
