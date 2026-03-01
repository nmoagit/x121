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

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FileDropZoneProps {
  children: ReactNode;
  onNamesDropped: (names: string[]) => void;
  /** Optional ref callback to receive the browseFolder function. */
  browseFolderRef?: React.MutableRefObject<(() => void) | null>;
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

/**
 * Read a dropped directory and extract character names.
 *
 * - If the directory contains subdirectories, each subdirectory name
 *   is a character (e.g. dropping `batch5/videos/` yields `carli_nicki`,
 *   `cj_miles`, etc. from its subfolders).
 * - If the directory contains only files (no subdirectories), the
 *   directory's own name is the character (e.g. dropping `carli_nicki/`
 *   yields `carli_nicki`).
 */
async function readDirectoryNames(
  entry: FileSystemDirectoryEntry,
): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader();
    const subfolderNames: string[] = [];

    reader.readEntries((entries) => {
      for (const e of entries) {
        if (e.isDirectory) {
          subfolderNames.push(e.name);
        }
      }

      if (subfolderNames.length > 0) {
        // Parent directory with character subfolders
        resolve(subfolderNames);
      } else {
        // Leaf character folder — use the folder's own name
        resolve([entry.name]);
      }
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

/** Extract names from a list of files selected via the folder picker. */
function namesFromFolderFiles(files: FileList): string[] {
  // Collect unique top-level subfolder names from relative paths
  const folderNames = new Set<string>();
  const fileNames: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const parts = rel.split("/");
    // parts[0] = selected root folder, parts[1] = subfolder or file
    if (parts.length >= 3 && parts[1]) {
      // Has subdirectories — use subfolder name
      folderNames.add(parts[1]);
    } else if (parts.length === 2 && parts[1]) {
      // Direct file in root — use filename without extension
      const stem = parts[1].replace(/\.[^.]+$/, "");
      if (stem) fileNames.push(stem);
    }
  }

  // Prefer subfolder names; fall back to filenames if no subdirs
  if (folderNames.size > 0) return [...folderNames];
  return [...new Set(fileNames)];
}

export function FileDropZone({
  children,
  onNamesDropped,
  browseFolderRef,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  /** Open the native folder picker dialog. Consumers call this via button. */
  const browseFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  // Expose browseFolder to the parent
  if (browseFolderRef) {
    browseFolderRef.current = browseFolder;
  }

  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      const names = namesFromFolderFiles(e.target.files);
      const unique = [...new Set(names)];
      if (unique.length > 0) onNamesDropped(unique);
      // Reset so the same folder can be re-selected
      e.target.value = "";
    },
    [onNamesDropped],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only activate for external file drops, not internal element drags
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      // Ignore internal element drags (e.g. character card reordering)
      if (!e.dataTransfer.types.includes("Files")) return;
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

      {/* Hidden folder input for browse button */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderInput}
        // @ts-expect-error -- webkitdirectory is non-standard
        webkitdirectory=""
        multiple
      />

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
            Drop files or folders to import characters
          </p>
        </div>
      )}
    </div>
  );
}
