/**
 * Generic drag-and-drop zone for importing character names from files.
 *
 * Supports:
 * - `.txt` files: split by newlines
 * - `.csv` files: first column as names (auto-detects headers)
 * - Directories: collect subfolder names via `webkitGetAsEntry`
 *
 * Wraps children and overlays a visual indicator on drag-over.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FileDropZoneProps {
  children: ReactNode;
  onNamesDropped: (names: string[]) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Parse a plain text file into trimmed, non-empty lines. */
function parseTxt(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Parse a CSV file, taking the first column as names.
 *  Skips a header row if the first cell looks like a label. */
function parseCsv(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Heuristic: skip header if first cell matches common label patterns
  const firstCell = lines[0]!.split(",")[0]!.trim().toLowerCase();
  const headerPatterns = ["name", "character", "label", "title", "id", "#"];
  const hasHeader = headerPatterns.some(
    (p) => firstCell === p || firstCell.startsWith(p),
  );

  const startIdx = hasHeader ? 1 : 0;
  return lines
    .slice(startIdx)
    .map((line) => {
      // Handle quoted CSV values
      const match = line.match(/^"([^"]*)"/) ?? line.match(/^([^,]*)/);
      return match?.[1]?.trim() ?? "";
    })
    .filter(Boolean);
}

/** Recursively read directory entries and collect top-level subfolder names. */
async function readDirectoryNames(
  entry: FileSystemDirectoryEntry,
): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader();
    const names: string[] = [];

    reader.readEntries((entries) => {
      for (const e of entries) {
        if (e.isDirectory) {
          names.push(e.name);
        }
      }
      // If no subdirectories, fall back to file names (without extension)
      if (names.length === 0) {
        for (const e of entries) {
          if (e.isFile) {
            const stem = e.name.replace(/\.[^.]+$/, "");
            if (stem) names.push(stem);
          }
        }
      }
      resolve(names);
    });
  });
}

/** Read a File's text content. */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FileDropZone({ children, onNamesDropped }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const items = e.dataTransfer.items;
      const allNames: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || item.kind !== "file") continue;

        // Check if it's a directory via webkitGetAsEntry
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const dirNames = await readDirectoryNames(
            entry as FileSystemDirectoryEntry,
          );
          allNames.push(...dirNames);
          continue;
        }

        // Regular file
        const file = item.getAsFile();
        if (!file) continue;

        const text = await readFileText(file);
        const ext = file.name.split(".").pop()?.toLowerCase();

        if (ext === "csv") {
          allNames.push(...parseCsv(text));
        } else {
          // Treat as plain text (.txt or any other)
          allNames.push(...parseTxt(text));
        }
      }

      // Deduplicate while preserving order
      const unique = [...new Set(allNames)];
      if (unique.length > 0) {
        onNamesDropped(unique);
      }
    },
    [onNamesDropped],
  );

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragOver && (
        <div
          className={cn(
            "absolute inset-0 z-40 flex items-center justify-center",
            "rounded-[var(--radius-lg)] border-2 border-dashed",
            "border-[var(--color-border-accent)] bg-[var(--color-surface-overlay)]",
            "pointer-events-none",
          )}
        >
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Drop file to import characters
          </p>
        </div>
      )}
    </div>
  );
}
