/**
 * Bulk speech import modal for project-level multi-character import (PRD-136 Task 7.5).
 *
 * Supports file upload (.json, .csv) or direct paste with format auto-detection.
 * Shows a preview of matched vs unmatched characters before importing.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Select } from "@/components/primitives";
import type { BulkImportReport, Language } from "@/features/characters/types";
import { cn } from "@/lib/cn";
import { readFileText } from "@/lib/file-types";
import { TEXTAREA_BASE } from "@/lib/ui-classes";
import { Upload } from "@/tokens/icons";

import { useBulkImportSpeeches } from "../hooks/use-project-speech-import";

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
   Props
   -------------------------------------------------------------------------- */

interface BulkSpeechImportModalProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  languages?: Language[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BulkSpeechImportModal({
  open,
  onClose,
  projectId,
  languages,
}: BulkSpeechImportModalProps) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [defaultLanguageId, setDefaultLanguageId] = useState("1");
  const importMutation = useBulkImportSpeeches(projectId);
  const result = importMutation.data as BulkImportReport | undefined;

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
    const langId = Number(defaultLanguageId);
    importMutation.mutate({
      format,
      data: text,
      default_language_id: langId > 0 ? langId : undefined,
    });
  }

  function handleClose() {
    setText("");
    setFilename(undefined);
    setDefaultLanguageId("1");
    importMutation.reset();
    onClose();
  }

  const languageOptions = (languages ?? []).map((l) => ({
    value: String(l.id),
    label: `${l.name} (${l.code})`,
  }));

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Import Speeches" size="xl">
      <Stack gap={4}>
        <p className="text-sm text-[var(--color-text-muted)]">
          Import speech entries for multiple characters at once. The file should contain
          character names/slugs with their speech data. Characters are matched by name.
        </p>

        {languageOptions.length > 0 && (
          <Select
            label="Default language for imported entries"
            options={languageOptions}
            value={defaultLanguageId}
            onChange={setDefaultLanguageId}
          />
        )}

        <div>
          <label
            htmlFor="bulk-speech-import-file"
            className="flex items-center gap-[var(--spacing-2)] cursor-pointer text-sm font-medium text-[var(--color-text-secondary)] mb-[var(--spacing-2)]"
          >
            <Upload size={16} />
            Upload file (.csv or .json)
          </label>
          <input
            id="bulk-speech-import-file"
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
          <Stack gap={3}>
            <div className="flex items-center gap-[var(--spacing-2)] flex-wrap">
              <Badge variant="success" size="sm">
                {result.imported} imported
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="warning" size="sm">
                  {result.skipped} skipped
                </Badge>
              )}
            </div>

            {result.characters_matched.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Matched characters ({result.characters_matched.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.characters_matched.map((name) => (
                    <Badge key={name} variant="success" size="sm">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.characters_unmatched.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Unmatched characters ({result.characters_unmatched.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.characters_unmatched.map((name) => (
                    <Badge key={name} variant="warning" size="sm">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

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
              loading={importMutation.isPending}
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
