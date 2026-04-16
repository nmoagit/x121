import { Modal } from "@/components/composite/Modal";
import { TYPO_LABEL } from "@/lib/typography-tokens";
import { Button } from "@/components/primitives/Button";
import { MAX_VIDEO_FILE_SIZE, VIDEO_EXTENSIONS } from "@/lib/file-types";
import { formatBytes } from "@/lib/format";
import { FileVideo, Upload, X } from "@/tokens/icons";
import { useCallback, useRef, useState } from "react";
import { postClipImportWithParent } from "./hooks/useClipManagement";
import { useQueryClient } from "@tanstack/react-query";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CLIP_INDEX_RE = /_clip(\d+)/i;

function parseClipIndex(filename: string): number | null {
  const match = CLIP_INDEX_RE.exec(filename);
  return match ? Number(match[1]) : null;
}

function validateVideoFile(f: File): string | null {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (!VIDEO_EXTENSIONS.includes(`.${ext}`)) {
    return `Unsupported format .${ext}. Accepted: ${VIDEO_EXTENSIONS.join(", ")}`;
  }
  if (f.size > MAX_VIDEO_FILE_SIZE) {
    return `${f.name} exceeds 500 MB limit`;
  }
  return null;
}

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: number;
  parentVersionId?: number;
  onSuccess?: () => void;
  /** Pre-selected files (e.g., from drag-and-drop on parent component). */
  initialFiles?: File[];
}

interface FileEntry {
  file: File;
  clipIndex: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BulkImportDialog({ open, onClose, sceneId, parentVersionId, onSuccess, initialFiles }: BulkImportDialogProps) {
  const [files, setFiles] = useState<FileEntry[]>(() => {
    if (!initialFiles?.length) return [];
    return initialFiles.map((file, i) => {
      const match = file.name.match(/_clip(\d+)/i);
      return { file, clipIndex: match?.[1] ? Number.parseInt(match[1], 10) : i, status: "pending" as const };
    });
  });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const addFiles = useCallback((fileList: FileList) => {
    const newEntries: FileEntry[] = [];
    const errors: string[] = [];
    for (const f of Array.from(fileList)) {
      const err = validateVideoFile(f);
      if (err) {
        errors.push(err);
        continue;
      }
      const parsed = parseClipIndex(f.name);
      const clipIndex = parsed ?? newEntries.length + files.length;
      newEntries.push({ file: f, clipIndex, status: "pending" });
    }
    if (errors.length > 0) setError(errors.join("; "));
    else setError(null);
    setFiles((prev) => [...prev, ...newEntries]);
  }, [files.length]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setProgress({ current: 0, total: files.length });

    const results = [...files];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < results.length; i++) {
      const entry = results[i]!;
      results[i] = { ...entry, status: "uploading" };
      setFiles([...results]);
      setProgress({ current: i + 1, total: results.length });

      try {
        await postClipImportWithParent(sceneId, entry.file, {
          parentVersionId,
          clipIndex: entry.clipIndex,
        });
        results[i] = { ...entry, status: "success" };
        successCount++;
      } catch {
        results[i] = { ...entry, status: "error", error: "Upload failed" };
        failCount++;
      }
      setFiles([...results]);
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["scene-versions"] });
    queryClient.invalidateQueries({ queryKey: ["scenes"] });

    if (failCount === 0) {
      onSuccess?.();
      handleClose();
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFiles([]);
    setError(null);
    setProgress({ current: 0, total: 0 });
    onClose();
  };

  const successCount = files.filter((f) => f.status === "success").length;
  const failCount = files.filter((f) => f.status === "error").length;
  const done = files.length > 0 && files.every((f) => f.status === "success" || f.status === "error");

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Import Clips" size="lg">
      <div className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed p-6 transition-colors"
          style={{
            borderColor: dragOver ? "var(--color-action-primary)" : "var(--color-border-default)",
            backgroundColor: dragOver ? "var(--color-surface-secondary)" : "var(--color-surface-primary)",
          }}
        >
          <Upload size={28} className="text-[var(--color-text-muted)]" />
          <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
            Drag & drop video files here (multiple)
          </span>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            Accepted: .mp4, .webm, .mov (max 500 MB each)
          </span>
        </div>

        {/* File picker fallback */}
        <div className="flex justify-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.webm,.mov"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            Browse files
          </Button>
        </div>

        {error && <p className="font-mono text-[10px] text-[var(--color-data-red)]">{error}</p>}

        {/* File list */}
        {files.length > 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
              <span className={TYPO_LABEL}>
                {files.length} file{files.length !== 1 ? "s" : ""}
                {parentVersionId != null && <> — parent v{parentVersionId}</>}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {files.map((entry, i) => (
                <div key={`${entry.file.name}-${i}`} className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-default)]/30 last:border-b-0">
                  <FileVideo size={12} className="shrink-0 text-[var(--color-text-muted)]" />
                  <span className="font-mono text-[10px] text-[var(--color-text-primary)] truncate flex-1">{entry.file.name}</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)] shrink-0">{formatBytes(entry.file.size)}</span>
                  <span className="font-mono text-[10px] text-[var(--color-data-cyan)] shrink-0">#{entry.clipIndex}</span>
                  {entry.status === "success" && <span className="font-mono text-[10px] text-[var(--color-data-green)] shrink-0">ok</span>}
                  {entry.status === "error" && <span className="font-mono text-[10px] text-[var(--color-data-red)] shrink-0">fail</span>}
                  {entry.status === "uploading" && <span className="font-mono text-[10px] text-[var(--color-data-cyan)] shrink-0 animate-pulse">...</span>}
                  {entry.status === "pending" && !uploading && (
                    <button type="button" onClick={() => removeFile(i)} className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-data-red)] transition-colors">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="font-mono text-[10px] text-[var(--color-data-cyan)]">
            Uploading {progress.current}/{progress.total}...
          </div>
        )}

        {/* Results */}
        {done && (
          <div className="font-mono text-[10px]">
            <span className="text-[var(--color-data-green)]">{successCount} imported</span>
            {failCount > 0 && <>, <span className="text-[var(--color-data-red)]">{failCount} failed</span></>}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={uploading}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              disabled={files.length === 0 || uploading}
              loading={uploading}
            >
              Import {files.length} file{files.length !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
