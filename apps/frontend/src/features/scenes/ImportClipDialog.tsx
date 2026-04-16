import { Modal } from "@/components/composite/Modal";
import { Button } from "@/components/primitives/Button";
import { MAX_VIDEO_FILE_SIZE, VIDEO_EXTENSIONS } from "@/lib/file-types";
import { formatBytes } from "@/lib/format";
import { FileVideo, Upload } from "@/tokens/icons";
import { useCallback, useRef, useState } from "react";
import { useImportClip } from "./hooks/useClipManagement";
import { TYPO_DATA, TYPO_DATA_DANGER, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

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
    <Modal open={isOpen} onClose={handleClose} title="Import Clip" size="lg">
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
              <span className={`${TYPO_DATA} font-medium text-[var(--color-text-primary)]`}>
                {file.name}
              </span>
              <span className={TYPO_DATA_MUTED}>
                {formatBytes(file.size)}
              </span>
            </>
          ) : (
            <>
              <Upload size={32} className="text-[var(--color-text-muted)]" />
              <span className={TYPO_DATA_MUTED}>
                Drag & drop a video file here
              </span>
              <span className={TYPO_DATA_MUTED}>
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

        {error && <p className={TYPO_DATA_DANGER}>{error}</p>}

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <span className={`${TYPO_DATA} font-medium text-[var(--color-text-muted)] uppercase tracking-wide`}>
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe this clip..."
            rows={2}
            className={`w-full rounded-[var(--radius-md)] border p-2
              border-[var(--color-border-default)]
              bg-[var(--color-surface-primary)]
              ${TYPO_DATA}
              placeholder:text-[var(--color-text-muted)]
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
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
