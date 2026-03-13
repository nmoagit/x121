/**
 * Generic drag-and-drop zone for importing character names from files.
 *
 * Supports:
 * - `.txt` files: split by newlines
 * - `.csv` files: first column as names (auto-detects headers)
 * - Directories: collect subfolder names via `webkitGetAsEntry`
 * - Asset-aware mode: when `onFolderDropped` is provided, collects files
 *   from dropped directories and classifies them as images/videos.
 *
 * Wraps children and overlays a visual indicator on drag-over.
 */

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { CharacterDropPayload, DroppedAsset, FolderDropResult } from "@/features/projects/types";
import { cn } from "@/lib/cn";
import { isImageFile, isVideoFile, readFileText, stripExtension } from "@/lib/file-types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FileDropZoneProps {
  children: ReactNode;
  onNamesDropped: (names: string[]) => void;
  /** When provided and directories are dropped, called instead of onNamesDropped. */
  onFolderDropped?: (result: FolderDropResult) => void;
  /** Optional ref callback to receive the browseFolder function. */
  browseFolderRef?: React.MutableRefObject<(() => void) | null>;
}

/* --------------------------------------------------------------------------
   Helpers — text parsing (unchanged)
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

/* --------------------------------------------------------------------------
   Helpers — directory reading
   -------------------------------------------------------------------------- */

/**
 * Read all entries from a directory reader, handling the browser quirk
 * where `readEntries()` returns max ~100 entries per call.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const allEntries: FileSystemEntry[] = [];

    function readBatch() {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        },
        reject,
      );
    }

    readBatch();
  });
}

/** Convert a FileSystemFileEntry to a File. */
function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/**
 * Recursively collect all Files from a directory entry.
 */
async function collectFilesFromDirectory(
  dirEntry: FileSystemDirectoryEntry,
): Promise<File[]> {
  const entries = await readAllEntries(dirEntry.createReader());
  const files: File[] = [];

  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await entryToFile(entry as FileSystemFileEntry));
    }
    // Ignore nested subdirectories within a character folder
  }

  return files;
}

/** Get the webkitRelativePath from a File (non-standard property). */
function relativePath(file: File): string {
  return relativePath(file);
}

/** Strip extension from a filename and return the lowercased stem. */
function filenameStem(filename: string): string {
  return stripExtension(filename).toLowerCase();
}

/** Classify a list of files from a character folder into a CharacterDropPayload. */
function classifyCharacterFiles(
  characterName: string,
  files: File[],
): CharacterDropPayload {
  const assets: DroppedAsset[] = [];
  let bioJson: File | undefined;
  let tovJson: File | undefined;
  let metadataJson: File | undefined;

  for (const file of files) {
    const lower = file.name.toLowerCase();

    // Collect known JSON metadata files
    if (lower === "bio.json") {
      bioJson = file;
    } else if (lower === "tov.json") {
      tovJson = file;
    } else if (lower === "metadata.json") {
      metadataJson = file;
    } else if (isImageFile(file.name)) {
      assets.push({
        file,
        category: filenameStem(file.name),
        kind: "image",
      });
    } else if (isVideoFile(file.name)) {
      assets.push({
        file,
        category: filenameStem(file.name),
        kind: "video",
      });
    }
  }

  return { rawName: characterName, assets, bioJson, tovJson, metadataJson };
}

/**
 * Read a dropped directory and detect its structure.
 *
 * Detects three structures:
 * - Flat: single character folder or batch (subdirs with only files)
 * - Grouped: subdirs contain sub-subdirs ({group}/{character}/*.*)
 * - Project: same as grouped but top-level dir name is a potential project name
 */
async function readDirectoryStructure(
  entry: FileSystemDirectoryEntry,
): Promise<FolderDropResult> {
  const entries = await readAllEntries(entry.createReader());
  const subdirs = entries.filter((e) => e.isDirectory) as FileSystemDirectoryEntry[];

  // No subdirs → flat single character folder
  if (subdirs.length === 0) {
    const files = await collectFilesFromDirectory(entry);
    const payload = classifyCharacterFiles(entry.name, files);
    return {
      structure: "flat",
      groupedPayloads: new Map([["", [payload]]]),
    };
  }

  // Peek into each subdir to check for sub-subdirectories
  const subdirEntryMap = new Map<string, FileSystemEntry[]>();
  let subdirsWithChildren = 0;

  for (const sub of subdirs) {
    const subEntries = await readAllEntries(sub.createReader());
    subdirEntryMap.set(sub.name, subEntries);
    if (subEntries.some((e) => e.isDirectory)) {
      subdirsWithChildren++;
    }
  }

  // No subdirs have sub-subdirs → flat batch (backward compatible)
  if (subdirsWithChildren === 0) {
    const payloads: CharacterDropPayload[] = [];
    for (const sub of subdirs) {
      const files = await collectFilesFromDirectory(sub);
      payloads.push(classifyCharacterFiles(sub.name, files));
    }
    return {
      structure: "flat",
      groupedPayloads: new Map([["", payloads]]),
    };
  }

  // Majority have sub-subdirs → grouped structure
  // Each top-level subdir = group, each sub-subdir = character
  const groupedPayloads = new Map<string, CharacterDropPayload[]>();

  for (const sub of subdirs) {
    const subEntries = subdirEntryMap.get(sub.name) ?? [];
    const charDirs = subEntries.filter((e) => e.isDirectory) as FileSystemDirectoryEntry[];

    if (charDirs.length === 0) {
      // Subdir has only files → treat as ungrouped character
      const files = await collectFilesFromDirectory(sub);
      const payload = classifyCharacterFiles(sub.name, files);
      const ungrouped = groupedPayloads.get("") ?? [];
      ungrouped.push(payload);
      groupedPayloads.set("", ungrouped);
    } else {
      const payloads: CharacterDropPayload[] = [];
      for (const charDir of charDirs) {
        const files = await collectFilesFromDirectory(charDir);
        const payload = classifyCharacterFiles(charDir.name, files);
        payload.groupName = sub.name;
        payloads.push(payload);
      }
      groupedPayloads.set(sub.name, payloads);
    }
  }

  return {
    structure: "grouped",
    detectedProjectName: entry.name,
    groupedPayloads,
  };
}

/**
 * Read a dropped directory and extract character names (legacy path).
 */
async function readDirectoryNames(
  entry: FileSystemDirectoryEntry,
): Promise<string[]> {
  const entries = await readAllEntries(entry.createReader());
  const subfolderNames = entries.filter((e) => e.isDirectory).map((e) => e.name);

  if (subfolderNames.length > 0) {
    return subfolderNames;
  }

  return [entry.name];
}

/* --------------------------------------------------------------------------
   Helpers — folder picker (browse button)
   -------------------------------------------------------------------------- */

/** Extract names from a list of files selected via the folder picker. */
function namesFromFolderFiles(files: FileList): string[] {
  const folderNames = new Set<string>();
  const fileNames: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const rel =
      relativePath(file);
    const parts = rel.split("/");
    if (parts.length >= 3 && parts[1]) {
      folderNames.add(parts[1]);
    } else if (parts.length === 2 && parts[1]) {
      const stem = parts[1].replace(/\.[^.]+$/, "");
      if (stem) fileNames.push(stem);
    }
  }

  if (folderNames.size > 0) return [...folderNames];
  return [...new Set(fileNames)];
}

/** Get root folder name from a FileList with webkitRelativePath. */
function getRootFolderName(files: FileList): string {
  const first = files[0];
  if (!first) return "";
  const rel = (first as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return rel.split("/")[0] ?? "";
}

/**
 * Build a FolderDropResult from browse-folder file picker results.
 *
 * Detects structure depth from webkitRelativePath segment count:
 * - depth ≤ 3: flat (Root/[Character/]file.ext)
 * - depth ≥ 4: grouped (Root/Group/Character/file.ext)
 */
function folderResultFromFiles(files: FileList): FolderDropResult {
  // Determine max depth from webkitRelativePath segments
  let maxDepth = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const rel = relativePath(file);
    const depth = rel.split("/").length;
    if (depth > maxDepth) maxDepth = depth;
  }

  // depth ≤ 3: flat mode (backward compatible)
  if (maxDepth < 4) {
    const payloads = flatPayloadsFromFiles(files);
    return {
      structure: "flat",
      groupedPayloads: new Map([["", payloads]]),
    };
  }

  // depth ≥ 4: grouped mode (Root/Group/Character/file.ext)
  const rootName = getRootFolderName(files);
  const groupCharFiles = new Map<string, Map<string, File[]>>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const rel = relativePath(file);
    const parts = rel.split("/");

    if (parts.length >= 4) {
      // parts[0] = root, parts[1] = group, parts[2] = character, parts[3+] = file path
      const groupName = parts[1]!;
      const charName = parts[2]!;
      if (!groupCharFiles.has(groupName)) groupCharFiles.set(groupName, new Map());
      const charMap = groupCharFiles.get(groupName)!;
      if (!charMap.has(charName)) charMap.set(charName, []);
      charMap.get(charName)!.push(file);
    }
  }

  const groupedPayloads = new Map<string, CharacterDropPayload[]>();
  for (const [groupName, charMap] of groupCharFiles) {
    const payloads: CharacterDropPayload[] = [];
    for (const [charName, charFiles] of charMap) {
      const payload = classifyCharacterFiles(charName, charFiles);
      payload.groupName = groupName;
      payloads.push(payload);
    }
    groupedPayloads.set(groupName, payloads);
  }

  return {
    structure: "grouped",
    detectedProjectName: rootName,
    groupedPayloads,
  };
}

/** Build flat CharacterDropPayloads from browse-folder results (depth ≤ 3). */
function flatPayloadsFromFiles(files: FileList): CharacterDropPayload[] {
  const charFilesMap = new Map<string, File[]>();
  let hasSubdirs = false;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const rel =
      relativePath(file);
    const parts = rel.split("/");

    if (parts.length >= 3 && parts[1]) {
      hasSubdirs = true;
      const charName = parts[1];
      const arr = charFilesMap.get(charName);
      if (arr) arr.push(file);
      else charFilesMap.set(charName, [file]);
    } else if (parts.length === 2 && parts[0]) {
      const charName = parts[0];
      const arr = charFilesMap.get(charName);
      if (arr) arr.push(file);
      else charFilesMap.set(charName, [file]);
    }
  }

  if (!hasSubdirs) {
    const rootName = getRootFolderName(files);
    if (rootName) {
      const allFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (files[i]) allFiles.push(files[i]!);
      }
      return [classifyCharacterFiles(rootName, allFiles)];
    }
  }

  const payloads: CharacterDropPayload[] = [];
  for (const [name, charFiles] of charFilesMap) {
    payloads.push(classifyCharacterFiles(name, charFiles));
  }
  return payloads;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FileDropZone({
  children,
  onNamesDropped,
  onFolderDropped,
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

      if (onFolderDropped) {
        const result = folderResultFromFiles(e.target.files);
        const totalPayloads = [...result.groupedPayloads.values()].reduce(
          (sum, p) => sum + p.length,
          0,
        );
        if (totalPayloads > 0) onFolderDropped(result);
      } else {
        const names = namesFromFolderFiles(e.target.files);
        const unique = [...new Set(names)];
        if (unique.length > 0) onNamesDropped(unique);
      }
      // Reset so the same folder can be re-selected
      e.target.value = "";
    },
    [onNamesDropped, onFolderDropped],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only activate for external file drops, not internal element drags
    if (!e.dataTransfer.types.includes("Files")) return;
    // Ignore internal character card drags (browsers may add "Files" for img elements)
    if (e.dataTransfer.types.includes("application/x-character-drag")) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    if (e.dataTransfer.types.includes("application/x-character-drag")) return;
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      // Ignore internal element drags (e.g. character card reordering)
      if (!e.dataTransfer.types.includes("Files")) return;
      if (e.dataTransfer.types.includes("application/x-character-drag")) return;
      e.preventDefault();
      setIsDragOver(false);

      // Collect all entries and files SYNCHRONOUSLY before any async work.
      // Browsers invalidate `e.dataTransfer.items` after the first await,
      // so a second loop iteration would see an empty/stale list.
      const dirEntries: FileSystemDirectoryEntry[] = [];
      const plainFiles: File[] = [];

      const items = e.dataTransfer.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || item.kind !== "file") continue;

        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          dirEntries.push(entry as FileSystemDirectoryEntry);
        } else {
          const file = item.getAsFile();
          if (file) plainFiles.push(file);
        }
      }

      // Asset-aware directory path
      if (dirEntries.length > 0 && onFolderDropped) {
        if (dirEntries.length === 1) {
          // Single directory — detect structure
          const result = await readDirectoryStructure(dirEntries[0]!);
          // Deduplicate by rawName within each group
          for (const [key, payloads] of result.groupedPayloads) {
            const seen = new Set<string>();
            result.groupedPayloads.set(
              key,
              payloads.filter((p) => {
                if (seen.has(p.rawName)) return false;
                seen.add(p.rawName);
                return true;
              }),
            );
          }
          onFolderDropped(result);
        } else {
          // Multiple directories dropped — merge all as flat
          const allPayloads: CharacterDropPayload[] = [];
          for (const dirEntry of dirEntries) {
            const result = await readDirectoryStructure(dirEntry);
            for (const payloads of result.groupedPayloads.values()) {
              allPayloads.push(...payloads);
            }
          }
          const seen = new Set<string>();
          const unique = allPayloads.filter((p) => {
            if (seen.has(p.rawName)) return false;
            seen.add(p.rawName);
            return true;
          });
          if (unique.length > 0) {
            onFolderDropped({
              structure: "flat",
              groupedPayloads: new Map([["", unique]]),
            });
          }
        }
        return;
      }

      // Legacy name-only path (directories without onFolderDropped, or text/csv files)
      const allNames: string[] = [];

      for (const dirEntry of dirEntries) {
        const dirNames = await readDirectoryNames(dirEntry);
        allNames.push(...dirNames);
      }

      for (const file of plainFiles) {
        const text = await readFileText(file);
        const ext = file.name.split(".").pop()?.toLowerCase();

        if (ext === "csv") {
          allNames.push(...parseCsv(text));
        } else {
          allNames.push(...parseTxt(text));
        }
      }

      const unique = [...new Set(allNames)];
      if (unique.length > 0) {
        onNamesDropped(unique);
      }
    },
    [onNamesDropped, onFolderDropped],
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
