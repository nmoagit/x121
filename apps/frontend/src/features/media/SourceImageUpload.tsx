/**
 * Drag-and-drop source image upload component (PRD-21).
 *
 * Accepts PNG, JPEG, and WebP files. Shows a preview with metadata
 * (dimensions, format, file size) after upload.
 */

import { useCallback, useRef, useState } from "react";

import { Stack } from "@/components/layout";
import { Button ,  ContextLoader } from "@/components/primitives";
import { formatBytes } from "@/lib/format";
import { TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_PANEL } from "@/lib/ui-classes";
import { Image as ImageIcon, Upload } from "@/tokens/icons";

import { VALID_IMAGE_FORMATS } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface UploadResult {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  format: string;
  fileSizeBytes: number;
}

interface SourceImageUploadProps {
  avatarId: number;
  onUploaded: (result: UploadResult) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const ACCEPT_TYPES = VALID_IMAGE_FORMATS.map((f) =>
  f === "jpg" ? "" : `image/${f}`,
)
  .filter(Boolean)
  .join(",");

function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SourceImageUpload({ avatarId: _avatarId, onUploaded }: SourceImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);

      const ext = getFileExtension(file.name);
      if (!VALID_IMAGE_FORMATS.includes(ext as (typeof VALID_IMAGE_FORMATS)[number])) {
        setError(`Unsupported format ".${ext}". Supported: png, jpeg, jpg, webp`);
        setIsProcessing(false);
        return;
      }

      // Load image to extract dimensions
      const url = URL.createObjectURL(file);
      const img = new window.Image();

      img.onload = () => {
        const result: UploadResult = {
          file,
          previewUrl: url,
          width: img.naturalWidth,
          height: img.naturalHeight,
          format: ext,
          fileSizeBytes: file.size,
        };
        setPreview(result);
        setIsProcessing(false);
        onUploaded(result);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Failed to load image. The file may be corrupted.");
        setIsProcessing(false);
      };

      img.src = url;
    },
    [onUploaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Source Image</span>
      </div>
      <div className={TERMINAL_BODY}>
      <Stack gap={4}>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={[
            "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed p-8 transition-colors cursor-pointer",
            isDragging
              ? "border-[var(--color-border-focus)] bg-[var(--color-surface-secondary)]"
              : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]",
          ].join(" ")}
        >
          {isProcessing ? (
            <ContextLoader size={48} />
          ) : preview ? (
            <img
              src={preview.previewUrl}
              alt="Source image preview"
              className="max-h-48 rounded-[var(--radius-sm)] object-contain"
            />
          ) : (
            <>
              <Upload size={32} className="text-[var(--color-text-muted)]" />
              <p className="text-sm text-[var(--color-text-muted)]">
                Drag & drop an image, or click to browse
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Supported: PNG, JPEG, WebP
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_TYPES}
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload source image"
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-[var(--color-action-danger)]" role="alert">
            {error}
          </p>
        )}

        {/* Metadata display */}
        {preview && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="flex items-center gap-1 text-cyan-400">
              <ImageIcon size={12} />
              {preview.width} x {preview.height}
            </span>
            <span className="opacity-30">|</span>
            <span className="text-[var(--color-text-muted)]">{preview.format.toUpperCase()}</span>
            <span className="opacity-30">|</span>
            <span className="text-[var(--color-text-muted)]">{formatBytes(preview.fileSizeBytes)}</span>
            <Button
              variant="secondary"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setPreview(null);
                setError(null);
              }}
            >
              Replace
            </Button>
          </div>
        )}
      </Stack>
      </div>
    </div>
  );
}
