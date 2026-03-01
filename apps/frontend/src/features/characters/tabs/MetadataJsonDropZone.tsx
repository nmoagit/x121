/**
 * JSON file drop zone for bio.json / tov.json uploads.
 */

import { useCallback, useRef, useState } from "react";

import { Upload, X } from "@/tokens/icons";

interface MetadataJsonDropZoneProps {
  label: string;
  value: Record<string, unknown> | null;
  onChange: (data: Record<string, unknown> | null) => void;
}

export function MetadataJsonDropZone({
  label,
  value,
  onChange,
}: MetadataJsonDropZoneProps) {
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        setError("Only .json files are accepted");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (typeof parsed !== "object" || Array.isArray(parsed)) {
            setError("JSON must be an object");
            return;
          }
          setFilename(file.name);
          setError(null);
          onChange(parsed);
        } catch {
          setError("Invalid JSON");
        }
      };
      reader.readAsText(file);
    },
    [onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleClear = useCallback(() => {
    setFilename(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-4 transition-colors ${
        isDragOver
          ? "border-[var(--color-action-primary)] bg-[var(--color-surface-tertiary)]"
          : "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {value && filename ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {filename}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
            aria-label={`Clear ${label}`}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <Upload
            size={20}
            className="text-[var(--color-text-muted)]"
            aria-hidden
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            Drop {label} or{" "}
            <button
              type="button"
              className="text-[var(--color-action-primary)] hover:underline"
              onClick={() => inputRef.current?.click()}
            >
              browse
            </button>
          </span>
        </>
      )}
      {error && (
        <span className="text-xs text-[var(--color-action-danger)]">
          {error}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
