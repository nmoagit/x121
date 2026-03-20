/** Modal for assigning unmatched files to characters during import. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { FileAssignments, UnmatchedCharacterFiles } from "../hooks/useCharacterImportBase";
import { suggestImageCategory } from "../hooks/useCharacterImportBase";
import { ImageThumbnail, JsonFileCard } from "./FileAssignmentThumbnails";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FileAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  unmatchedFiles: UnmatchedCharacterFiles[];
  onConfirm: (assignments: FileAssignments) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileAssignmentModal({ open, onClose, unmatchedFiles, onConfirm }: FileAssignmentModalProps) {
  const [selections, setSelections] = useState<Map<string, Map<ColumnKey, string>>>(new Map());

  const { fileLookup, preMatched } = useMemo(() => {
    const lookup = new Map<string, File>();
    const matched = new Map<string, Map<ColumnKey, string>>();
    for (const entry of unmatchedFiles) {
      const charSel = new Map<ColumnKey, string>();
      for (const [key, file] of Object.entries(entry.matched)) {
        if (file) { const fk = fileKey(file); lookup.set(fk, file); charSel.set(key as ColumnKey, fk); }
      }
      for (const file of entry.imageFiles) lookup.set(fileKey(file), file);
      for (const file of entry.jsonFiles) lookup.set(fileKey(file), file);
      matched.set(entry.characterName, charSel);
    }
    return { fileLookup: lookup, preMatched: matched };
  }, [unmatchedFiles]);

  useEffect(() => {
    const initial = new Map<string, Map<ColumnKey, string>>();
    for (const [charName, charMatched] of preMatched) initial.set(charName, new Map(charMatched));

    // Pre-select suggestions based on filename hints
    for (const entry of unmatchedFiles) {
      const charSel = initial.get(entry.characterName) ?? new Map<ColumnKey, string>();
      const usedFks = new Set<string>([...charSel.values()]);

      for (const file of entry.imageFiles) {
        const suggestion = suggestImageCategory(file.name);
        if (suggestion && !charSel.has(suggestion)) {
          const fk = fileKey(file);
          if (!usedFks.has(fk)) {
            charSel.set(suggestion, fk);
            usedFks.add(fk);
          }
        }
      }
      initial.set(entry.characterName, charSel);
    }

    setSelections(initial);
  }, [preMatched, unmatchedFiles]);

  // Track ALL assigned file keys (including within same character) for duplicate guard
  const assignedFileKeys = useMemo(() => {
    const assigned = new Map<string, { charName: string; column: ColumnKey }>();
    for (const [charName, charSel] of selections) {
      for (const [column, fk] of charSel) {
        if (fk === SKIP_VALUE) continue;
        const isLocked = preMatched.get(charName)?.get(column as ColumnKey) === fk;
        if (!isLocked) assigned.set(`${charName}::${column}::${fk}`, { charName, column: column as ColumnKey });
      }
    }
    // Also build a simple set of all assigned fks for cross-cell duplicate detection
    const usedFks = new Map<string, { charName: string; column: ColumnKey }>();
    for (const [charName, charSel] of selections) {
      for (const [column, fk] of charSel) {
        if (fk === SKIP_VALUE) continue;
        usedFks.set(fk, { charName, column: column as ColumnKey });
      }
    }
    return usedFks;
  }, [selections, preMatched]);

  const handleToggle = useCallback((charName: string, column: ColumnKey, fk: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const charMap = new Map(next.get(charName) ?? new Map());
      charMap.get(column) === fk ? charMap.delete(column) : charMap.set(column, fk);
      next.set(charName, charMap);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const assignments: FileAssignments = {};
    for (const [charName, charSel] of selections) {
      const entry: FileAssignments[string] = {};
      for (const [column, fk] of charSel) {
        if (fk === SKIP_VALUE) continue;
        const file = fileLookup.get(fk);
        if (file) entry[column as ColumnKey] = file;
      }
      if (Object.keys(entry).length > 0) assignments[charName] = entry;
    }
    onConfirm(assignments);
  }, [selections, fileLookup, onConfirm]);

  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const entry of unmatchedFiles) {
      for (const file of entry.imageFiles) urls.set(fileKey(file), URL.createObjectURL(file));
      if (entry.matched.clothed) urls.set(fileKey(entry.matched.clothed), URL.createObjectURL(entry.matched.clothed));
      if (entry.matched.topless) urls.set(fileKey(entry.matched.topless), URL.createObjectURL(entry.matched.topless));
    }
    setPreviews(urls);
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, [unmatchedFiles]);

  const warningCount = useMemo(() => {
    let count = 0;
    for (const entry of unmatchedFiles) {
      const charSel = selections.get(entry.characterName);
      if (!charSel?.has("bio") && !entry.matched.bio) count++;
      if (!charSel?.has("tov") && !entry.matched.tov) count++;
    }
    return count;
  }, [unmatchedFiles, selections]);

  return (
    <Modal open={open} onClose={onClose} title="Assign Unmatched Files" size="3xl">
      <Stack gap={4}>
        {warningCount > 0 && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] border-l-2 border-l-orange-400 px-[var(--spacing-3)] py-[var(--spacing-2)]">
            <p className="text-xs font-mono text-orange-400">
              {warningCount} metadata {warningCount === 1 ? "file" : "files"} unassigned (bio.json / tov.json). This is non-blocking.
            </p>
          </div>
        )}

        {unmatchedFiles.map((entry) => {
          const charSel = selections.get(entry.characterName);
          return (
            <div key={entry.characterName} className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
              <h3 className="mb-3 text-xs font-mono font-semibold text-[var(--color-text-primary)]">{entry.characterName}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {COLUMNS.map((col) => {
                  const isImage = IMAGE_COLUMNS.includes(col);
                  const files = isImage ? entry.imageFiles : entry.jsonFiles;
                  const currentFk = charSel?.get(col);
                  const hasWarning = JSON_COLUMNS.includes(col) && !currentFk && !preMatched.get(entry.characterName)?.has(col);
                  const lockedFk = preMatched.get(entry.characterName)?.get(col);

                  return (
                    <div key={col}>
                      <div className="mb-1.5 flex items-center gap-1">
                        <span className="text-xs font-mono text-[var(--color-text-secondary)]">{COLUMN_LABELS[col]}</span>
                        {hasWarning && <span className="text-xs font-mono text-orange-400">!</span>}
                      </div>
                      <div className={cn("flex flex-col gap-1.5", isImage && "grid grid-cols-3 gap-1.5")}>
                        {files.map((file) => {
                          const fk = fileKey(file);
                          const isLocked = lockedFk === fk;
                          const isSelected = currentFk === fk;
                          const assignedTo = assignedFileKeys.get(fk);
                          const isUsed = !!assignedTo && !(assignedTo.charName === entry.characterName && assignedTo.column === col);
                          const toggle = (key: string) => handleToggle(entry.characterName, col, key);
                          const Comp = isImage ? ImageThumbnail : JsonFileCard;
                          return <Comp key={fk} fk={fk} file={file} previewUrl={previews.get(fk)} isSelected={isSelected} isLocked={isLocked} isAssignedElsewhere={isUsed} onToggle={toggle} />;
                        })}
                        {lockedFk && !files.some((f) => fileKey(f) === lockedFk) && fileLookup.get(lockedFk) && (() => {
                          const file = fileLookup.get(lockedFk)!;
                          const Comp = isImage ? ImageThumbnail : JsonFileCard;
                          return <Comp fk={lockedFk} file={file} previewUrl={previews.get(lockedFk)} isSelected isLocked isAssignedElsewhere={false} onToggle={() => {}} />;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm}>Confirm Assignments</Button>
        </div>
      </Stack>
    </Modal>
  );
}
