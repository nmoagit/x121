/**
 * Drag-and-drop zone for folder imports (PRD-016).
 *
 * Supports both drag-and-drop and a file input fallback. Preserves
 * folder structure using the webkitdirectory attribute.
 */

import { useCallback, useRef, useState } from "react";

import { Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useUploadFolder } from "./hooks/use-importer";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FolderDropZoneProps {
  projectId: number;
  onUploadComplete: (sessionId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FolderDropZone({
  projectId,
  onUploadComplete,
}: FolderDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFolder();

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const sourceName =
        (files[0] as File & { webkitRelativePath?: string })
          .webkitRelativePath?.split("/")[0] ?? "folder-upload";

      const result = await uploadMutation.mutateAsync({
        projectId,
        sourceName,
        files,
      });

      onUploadComplete(result.session_id);
    },
    [projectId, onUploadComplete, uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const fileList: File[] = [];
      const items = e.dataTransfer.items;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item?.kind === "file") {
          const file = item.getAsFile();
          if (file) fileList.push(file);
        }
      }

      handleFiles(fileList);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = Array.from(e.target.files ?? []);
      handleFiles(fileList);
    },
    [handleFiles],
  );

  const isUploading = uploadMutation.isPending;

  return (
    <div
      data-testid="folder-drop-zone"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border-2 border-dashed p-8 transition-colors ${
        isDragOver
          ? "border-[var(--color-border-accent)] bg-[var(--color-surface-secondary)]"
          : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]"
      }`}
    >
      {isUploading ? (
        <Stack align="center" gap={3}>
          <Spinner size="lg" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Uploading files...
          </p>
        </Stack>
      ) : (
        <>
          <p className="text-base text-[var(--color-text-primary)]">
            Drag a folder here to import characters
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            or
          </p>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse folder
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInputChange}
            // @ts-expect-error -- webkitdirectory is non-standard
            webkitdirectory=""
            multiple
          />
        </>
      )}

      {uploadMutation.isError && (
        <p className="text-sm text-[var(--color-text-danger)]">
          {uploadMutation.error.message}
        </p>
      )}
    </div>
  );
}
