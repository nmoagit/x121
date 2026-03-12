import { Modal } from "@/components/composite/Modal";
import { Button } from "@/components/primitives/Button";
import { MAX_VIDEO_FILE_SIZE, VIDEO_EXTENSIONS } from "@/lib/file-types";
import { formatBytes } from "@/lib/format";
import { FileVideo, Upload } from "@/tokens/icons";
import { useCallback, useRef, useState } from "react";
import { useImportClip } from "./hooks/useClipManagement";

interface ImportClipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: number;
  onSuccess: () => void;
}

export function ImportClipDialog({ isOpen, onClose, sceneId, onSuccess }: ImportClipDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportClip(sceneId);

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    if (!VIDEO_EXTENSIONS.includes(`.${ext}`)) {
      return `Unsupported format .${ext}. Accepted: ${VIDEO_EXTENSIONS.join(", ")}`;
    }
    if (f.size > MAX_VIDEO_FILE_SIZE) {
      return "File exceeds 500 MB limit";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        setError(err);
        setFile(null);
      } else {
        setError(null);
        setFile(f);
      }
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleSubmit = async () => {
    if (!file) return;
    try {
      await importMutation.mutateAsync({
        file,
        notes: notes || undefined,
      });
      setFile(null);
      setNotes("");
      setError(null);
      onSuccess();
      onClose();
    } catch {
      setError("Upload failed. Please try again.");
    }
  };

  const handleClose = () => {
    if (importMutation.isPending) return;
    setFile(null);
    setNotes("");
    setError(null);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Import Clip">
      <div className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed p-8 transition-colors"
          style={{
            borderColor: dragOver ? "var(--color-action-primary)" : "var(--color-border-default)",
            backgroundColor: dragOver
              ? "var(--color-surface-secondary)"
              : "var(--color-surface-primary)",
          }}
        >
          {file ? (
            <>
              <FileVideo size={32} className="text-[var(--color-action-primary)]" />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {file.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatBytes(file.size)}
              </span>
            </>
          ) : (
            <>
              <Upload size={32} className="text-[var(--color-text-muted)]" />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Drag & drop a video file here
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                Accepted: .mp4, .webm, .mov (max 500 MB)
              </span>
            </>
          )}
        </div>

        {/* File picker fallback */}
        <div className="flex justify-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.webm,.mov"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            Browse files
          </Button>
        </div>

        {error && <p className="text-sm text-[var(--color-action-danger)]">{error}</p>}

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe this clip..."
            rows={2}
            className="w-full rounded-[var(--radius-md)] border p-2 text-sm
              border-[var(--color-border-default)]
              bg-[var(--color-surface-secondary)]
              text-[var(--color-text-primary)]
              placeholder:text-[var(--color-text-muted)]
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!file || importMutation.isPending}
            loading={importMutation.isPending}
          >
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}
