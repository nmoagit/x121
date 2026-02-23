/**
 * Step 1: Upload — file upload and CSV upload (PRD-67).
 *
 * Allows the user to either drag-and-drop source images or upload a CSV
 * file defining character names. Each file creates one character entry.
 */

import { useState } from "react";

import { Badge, Button } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface StepUploadProps {
  /** Current step data from the session. */
  stepData: Record<string, unknown>;
  /** Callback to update step data. */
  onUpdateStepData: (data: Record<string, unknown>) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StepUpload({ stepData, onUpdateStepData }: StepUploadProps) {
  const [mode, setMode] = useState<"images" | "csv">("images");

  const files = (stepData.files as string[] | undefined) ?? [];
  const csvCharacters =
    (stepData.csv_characters as Array<{ name: string }> | undefined) ?? [];

  const hasData = files.length > 0 || csvCharacters.length > 0;

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).map((f) => f.name);
    onUpdateStepData({
      ...stepData,
      files: [...files, ...droppedFiles],
    });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files
      ? Array.from(e.target.files).map((f) => f.name)
      : [];
    onUpdateStepData({
      ...stepData,
      files: [...files, ...selectedFiles],
    });
  }

  function handleCsvPaste(text: string) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const characters = lines.map((name) => ({ name }));
    onUpdateStepData({
      ...stepData,
      csv_characters: [...csvCharacters, ...characters],
    });
  }

  function handleRemoveFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    onUpdateStepData({ ...stepData, files: updated });
  }

  function handleRemoveCsvChar(index: number) {
    const updated = csvCharacters.filter((_, i) => i !== index);
    onUpdateStepData({ ...stepData, csv_characters: updated });
  }

  return (
    <div data-testid="step-upload" className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Upload Characters
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Upload source images or a CSV/text file with character names. Each
        entry creates one character.
      </p>

      {/* Mode toggle */}
      <div data-testid="upload-mode-toggle" className="flex gap-2">
        <Button
          variant={mode === "images" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("images")}
        >
          Image Upload
        </Button>
        <Button
          variant={mode === "csv" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("csv")}
        >
          CSV / Text Upload
        </Button>
      </div>

      {/* Image upload mode */}
      {mode === "images" && (
        <div
          data-testid="image-drop-zone"
          className="flex min-h-[120px] items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <div className="text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Drag and drop source images here
            </p>
            <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-[var(--color-action-primary)]">
              or browse files
              <input
                type="file"
                data-testid="file-input"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>
        </div>
      )}

      {/* CSV upload mode */}
      {mode === "csv" && (
        <div data-testid="csv-upload-zone" className="space-y-2">
          <textarea
            data-testid="csv-textarea"
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-sm text-[var(--color-text-primary)]"
            rows={5}
            placeholder="Enter character names, one per line"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleCsvPaste(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Press Ctrl+Enter to add characters
          </p>
        </div>
      )}

      {/* File preview list */}
      {files.length > 0 && (
        <div data-testid="file-preview-list" className="space-y-1">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Images ({files.length})
          </p>
          {files.map((file, i) => (
            <div
              key={`file-${i}`}
              data-testid={`file-item-${i}`}
              className="flex items-center justify-between rounded bg-[var(--color-surface-secondary)] px-3 py-1.5 text-sm"
            >
              <span className="text-[var(--color-text-primary)]">{file}</span>
              <button
                type="button"
                data-testid={`remove-file-${i}`}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
                onClick={() => handleRemoveFile(i)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CSV character preview list */}
      {csvCharacters.length > 0 && (
        <div data-testid="csv-preview-list" className="space-y-1">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Characters from CSV ({csvCharacters.length})
          </p>
          {csvCharacters.map((char, i) => (
            <div
              key={`csv-${i}`}
              data-testid={`csv-item-${i}`}
              className="flex items-center justify-between rounded bg-[var(--color-surface-secondary)] px-3 py-1.5 text-sm"
            >
              <span className="text-[var(--color-text-primary)]">
                {char.name}
              </span>
              <button
                type="button"
                data-testid={`remove-csv-${i}`}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
                onClick={() => handleRemoveCsvChar(i)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Status badge */}
      <div data-testid="upload-status">
        {hasData ? (
          <Badge variant="success" size="sm">
            Ready to advance
          </Badge>
        ) : (
          <Badge variant="default" size="sm">
            Upload files or enter character names to continue
          </Badge>
        )}
      </div>
    </div>
  );
}
