/**
 * Import modal for character speeches (PRD-124).
 *
 * Supports CSV and JSON file upload or paste, with format auto-detection.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { readFileText } from "@/lib/file-types";
import { TEXTAREA_BASE } from "@/lib/ui-classes";
import { Upload } from "@/tokens/icons";

import type { ImportSpeechesResponse } from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SpeechImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (input: { format: string; data: string }) => void;
  importing: boolean;
  result: ImportSpeechesResponse | null;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function detectFormat(text: string, filename?: string): string {
  if (filename?.endsWith(".json")) return "json";
  if (filename?.endsWith(".csv")) return "csv";
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  return "csv";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SpeechImportModal({
  open,
  onClose,
  onImport,
  importing,
  result,
}: SpeechImportModalProps) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const content = await readFileText(file);
    setText(content);
  }, []);

  function handleImport() {
    if (!text.trim()) return;
    const format = detectFormat(text, filename);
    onImport({ format, data: text });
  }

  function handleClose() {
    setText("");
    setFilename(undefined);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Speeches" size="lg">
      <Stack gap={4}>
        <div>
          <label
            htmlFor="speech-import-file"
            className="flex items-center gap-[var(--spacing-2)] cursor-pointer text-sm font-medium text-[var(--color-text-secondary)] mb-[var(--spacing-2)]"
          >
            <Upload size={16} />
            Upload file (.csv or .json)
          </label>
          <input
            id="speech-import-file"
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            className="text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Or paste content directly
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste CSV or JSON data here..."
            className={cn(TEXTAREA_BASE, "placeholder:text-[var(--color-text-muted)]")}
          />
        </div>

        {filename && (
          <p className="text-xs text-[var(--color-text-muted)]">
            File: {filename} (detected format: {detectFormat(text, filename)})
          </p>
        )}

        {/* Import result */}
        {result && (
          <Stack gap={2}>
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Badge variant="success" size="sm">
                {result.imported} imported
              </Badge>
              {result.created_types.length > 0 && (
                <Badge variant="info" size="sm">
                  {result.created_types.length} new type{result.created_types.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="text-sm text-[var(--color-action-danger)]">
                {result.errors.map((err) => (
                  <p key={err}>{err}</p>
                ))}
              </div>
            )}
          </Stack>
        )}

        <div className="flex gap-[var(--spacing-2)] justify-end">
          <Button variant="secondary" onClick={handleClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              loading={importing}
              disabled={!text.trim()}
              icon={<Upload size={16} />}
            >
              Import
            </Button>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
