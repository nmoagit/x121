/** Modal for assigning unmatched files to avatars during import. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { FileAssignments, UnmatchedAvatarFiles } from "../hooks/useAvatarImportBase";
import { suggestImageCategory } from "../hooks/useAvatarImportBase";
import { ImageThumbnail, JsonFileCard } from "./FileAssignmentThumbnails";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SKIP_VALUE = "__skip__";

/** Fixed metadata columns that are always present. */
const JSON_COLUMNS = ["bio", "tov"] as const;

const JSON_COLUMN_LABELS: Record<string, string> = {
  bio: "Bio JSON",
  tov: "ToV JSON",
};

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
  unmatchedFiles: UnmatchedAvatarFiles[];
  onConfirm: (assignments: FileAssignments) => void;
  /** Image slot names from the pipeline's seed_slots (e.g. ["clothed", "topless"]). */
  imageSlotNames?: string[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileAssignmentModal({ open, onClose, unmatchedFiles, onConfirm, imageSlotNames }: FileAssignmentModalProps) {
  // Build dynamic columns: image slots + fixed JSON columns
  const imageColumns = useMemo(() => imageSlotNames ?? [], [imageSlotNames]);
  const allColumns = useMemo(() => [...imageColumns, ...JSON_COLUMNS], [imageColumns]);

  const [selections, setSelections] = useState<Map<string, Map<string, string>>>(new Map());

  const { fileLookup, preMatched } = useMemo(() => {
    const lookup = new Map<string, File>();
    const matched = new Map<string, Map<string, string>>();
    for (const entry of unmatchedFiles) {
      const charSel = new Map<string, string>();
      // Add pre-matched image slots
      for (const [key, file] of Object.entries(entry.matched.images)) {
        if (file) { const fk = fileKey(file); lookup.set(fk, file); charSel.set(key, fk); }
      }
      // Add pre-matched JSON slots
      if (entry.matched.bio) { const fk = fileKey(entry.matched.bio); lookup.set(fk, entry.matched.bio); charSel.set("bio", fk); }
      if (entry.matched.tov) { const fk = fileKey(entry.matched.tov); lookup.set(fk, entry.matched.tov); charSel.set("tov", fk); }
      for (const file of entry.imageFiles) lookup.set(fileKey(file), file);
      for (const file of entry.jsonFiles) lookup.set(fileKey(file), file);
      matched.set(entry.avatarName, charSel);
    }
    return { fileLookup: lookup, preMatched: matched };
  }, [unmatchedFiles]);

  useEffect(() => {
    const initial = new Map<string, Map<string, string>>();
    for (const [charName, charMatched] of preMatched) initial.set(charName, new Map(charMatched));

    // Pre-select suggestions based on filename hints
    for (const entry of unmatchedFiles) {
      const charSel = initial.get(entry.avatarName) ?? new Map<string, string>();
      const usedFks = new Set<string>([...charSel.values()]);

      for (const file of entry.imageFiles) {
        const suggestion = suggestImageCategory(file.name, imageColumns);
        if (suggestion && !charSel.has(suggestion)) {
          const fk = fileKey(file);
          if (!usedFks.has(fk)) {
            charSel.set(suggestion, fk);
            usedFks.add(fk);
          }
        }
      }
      initial.set(entry.avatarName, charSel);
    }

    setSelections(initial);
  }, [preMatched, unmatchedFiles, imageColumns]);

  // Track ALL assigned file keys (including within same avatar) for duplicate guard
  const assignedFileKeys = useMemo(() => {
    const usedFks = new Map<string, { charName: string; column: string }>();
    for (const [charName, charSel] of selections) {
      for (const [column, fk] of charSel) {
        if (fk === SKIP_VALUE) continue;
        usedFks.set(fk, { charName, column });
      }
    }
    return usedFks;
  }, [selections]);

  const handleToggle = useCallback((charName: string, column: string, fk: string) => {
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
      const images: Record<string, File> = {};
      let bio: File | undefined;
      let tov: File | undefined;
      for (const [column, fk] of charSel) {
        if (fk === SKIP_VALUE) continue;
        const file = fileLookup.get(fk);
        if (!file) continue;
        if (column === "bio") bio = file;
        else if (column === "tov") tov = file;
        else images[column] = file;
      }
      if (Object.keys(images).length > 0 || bio || tov) {
        assignments[charName] = { images, bio, tov };
      }
    }
    onConfirm(assignments);
  }, [selections, fileLookup, onConfirm]);

  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const entry of unmatchedFiles) {
      for (const file of entry.imageFiles) urls.set(fileKey(file), URL.createObjectURL(file));
      for (const file of Object.values(entry.matched.images)) {
        if (file) urls.set(fileKey(file), URL.createObjectURL(file));
      }
    }
    setPreviews(urls);
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, [unmatchedFiles]);

  const warningCount = useMemo(() => {
    let count = 0;
    for (const entry of unmatchedFiles) {
      const charSel = selections.get(entry.avatarName);
      if (!charSel?.has("bio") && !entry.matched.bio) count++;
      if (!charSel?.has("tov") && !entry.matched.tov) count++;
    }
    return count;
  }, [unmatchedFiles, selections]);

  /** Capitalize a slot name for display (e.g. "clothed" → "Clothed Image"). */
  function columnLabel(col: string): string {
    if (col in JSON_COLUMN_LABELS) return JSON_COLUMN_LABELS[col]!;
    return `${col.charAt(0).toUpperCase()}${col.slice(1)} Image`;
  }

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
          const charSel = selections.get(entry.avatarName);
          return (
            <div key={entry.avatarName} className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
              <h3 className="mb-3 text-xs font-mono font-semibold text-[var(--color-text-primary)]">{entry.avatarName}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {allColumns.map((col) => {
                  const isImage = imageColumns.includes(col);
                  const files = isImage ? entry.imageFiles : entry.jsonFiles;
                  const currentFk = charSel?.get(col);
                  const isJsonCol = (JSON_COLUMNS as readonly string[]).includes(col);
                  const hasWarning = isJsonCol && !currentFk && !preMatched.get(entry.avatarName)?.has(col);
                  const lockedFk = preMatched.get(entry.avatarName)?.get(col);

                  return (
                    <div key={col}>
                      <div className="mb-1.5 flex items-center gap-1">
                        <span className="text-xs font-mono text-[var(--color-text-secondary)]">{columnLabel(col)}</span>
                        {hasWarning && <span className="text-xs font-mono text-orange-400">!</span>}
                      </div>
                      <div className={cn("flex flex-col gap-1.5", isImage && "grid grid-cols-3 gap-1.5")}>
                        {files.map((file) => {
                          const fk = fileKey(file);
                          const isLocked = lockedFk === fk;
                          const isSelected = currentFk === fk;
                          const assignedTo = assignedFileKeys.get(fk);
                          const isUsed = !!assignedTo && !(assignedTo.charName === entry.avatarName && assignedTo.column === col);
                          const toggle = (key: string) => handleToggle(entry.avatarName, col, key);
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
