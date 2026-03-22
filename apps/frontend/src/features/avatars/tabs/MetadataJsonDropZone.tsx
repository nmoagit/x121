/**
 * JSON file drop zone for bio.json / tov.json / metadata.json uploads.
 *
 * When a file is loaded, shows a collapsible JSON preview beneath the drop area.
 */

import { useCallback, useRef, useState } from "react";

import { ChevronDown, ChevronRight, Upload, X } from "@/tokens/icons";

interface MetadataJsonDropZoneProps {
  label: string;
  value: Record<string, unknown> | null;
  onChange: (data: Record<string, unknown> | null) => void;
  /** When true, the inline JSON preview beneath the drop zone is suppressed. */
  hidePreview?: boolean;
}

export function MetadataJsonDropZone({
  label,
  value,
  onChange,
  hidePreview = false,
}: MetadataJsonDropZoneProps) {
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(value != null);
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
          setShowPreview(true);
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
    setShowPreview(false);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  // Display name: use uploaded filename or fall back to label
  const displayName = filename ?? label;

  // Compact mode: value exists (from API or upload)
  if (value) {
    return (
      <div className="flex flex-col gap-0">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[#161b22] font-mono text-xs transition-colors ${
            isDragOver ? "border-[var(--color-action-primary)]" : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">{label}:</span>
          <span className="text-green-400">{displayName}</span>
          {!hidePreview && (
            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[var(--color-text-muted)] hover:text-cyan-400 transition-colors"
            aria-label={`Replace ${label}`}
          >
            <Upload size={12} />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
            aria-label={`Clear ${label}`}
          >
            <X size={12} />
          </button>
        </div>

        {showPreview && !hidePreview && (
          <pre className="max-h-[200px] overflow-auto rounded-b-[var(--radius-md)] border border-t-0 border-[var(--color-border-default)] bg-[#0d1117] px-3 py-2 font-mono text-[10px] leading-relaxed text-cyan-400">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}

        <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFileInput} />
      </div>
    );
  }

  // Empty state: full drop zone
  return (
    <div>
      <div
        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-[var(--radius-md)] border-2 border-dashed transition-colors ${
          isDragOver
            ? "border-[var(--color-action-primary)] bg-[#161b22]"
            : "border-[var(--color-border-default)] bg-[#0d1117]"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload size={20} className="text-[var(--color-text-muted)]" aria-hidden />
        <span className="text-xs font-mono text-[var(--color-text-muted)]">
          Drop {label} or{" "}
          <button
            type="button"
            className="text-cyan-400 hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </span>
        {error && (
          <span className="text-xs font-mono text-red-400">{error}</span>
        )}
        <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFileInput} />
      </div>
    </div>
  );
}
