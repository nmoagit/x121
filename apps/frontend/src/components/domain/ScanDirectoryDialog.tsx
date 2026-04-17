/**
 * Unified directory scan dialog (PRD-155).
 *
 * Three states: Input -> Preview -> Results.
 * Supports all file types: images, metadata, speech, clips, voice CSVs.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Modal } from "@/components/composite/Modal";
import { Button, Input, Select } from "@/components/primitives";
import {
  useDirectoryScan,
  useDirectoryImport,
  useScanSources,
  type ImportSelection,
  type ImportResult,
  type ScanResponse,
  type ScannedFileResponse,
} from "@/hooks/useDirectoryScan";
import {
  ScanPreview,
  ImportResultSummary,
  TOGGLE_CATEGORIES,
  matchesToggle,
  type ToggleKey,
} from "./ScanDirectoryPreview";
import { TYPO_DATA_CYAN } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ScanDirectoryDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: number;
  projectId?: number;
  avatarId?: number;
  onSuccess?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/**
 * Validate a scan path. Returns an error message string when invalid,
 * or `null` when the path can be submitted. Accepts local absolute paths
 * (POSIX or Windows-style) and well-formed `s3://bucket/...` URIs.
 */
function validateScanPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null; // empty = disabled scan button, no error shown
  if (trimmed.startsWith("s3://")) {
    const rest = trimmed.slice(5);
    const slash = rest.indexOf("/");
    const bucket = slash === -1 ? rest : rest.slice(0, slash);
    if (!bucket) {
      return "Invalid S3 URI: missing bucket";
    }
    // Basic S3 bucket name sanity — letters, digits, dots, hyphens.
    if (!/^[a-z0-9.\-]+$/i.test(bucket)) {
      return "Invalid S3 bucket name";
    }
    return null;
  }
  // Local path: accept POSIX / and Windows drive-letter paths.
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return null;
  }
  return "Path must be absolute (starts with /) or an s3:// URI";
}

export function ScanDirectoryDialog({
  open,
  onClose,
  pipelineId,
  projectId,
  avatarId: _avatarId,
  onSuccess,
}: ScanDirectoryDialogProps) {
  const queryClient = useQueryClient();
  const [directoryPath, setDirectoryPath] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<Set<ToggleKey>>(
    new Set(TOGGLE_CATEGORIES.map((t) => t.key)),
  );
  const [fileActions, setFileActions] = useState<Map<string, "import" | "skip" | "replace">>(
    new Map(),
  );

  const scanMut = useDirectoryScan();
  const importMut = useDirectoryImport();
  const scanSourcesQuery = useScanSources();

  const pathError = useMemo(() => validateScanPath(directoryPath), [directoryPath]);
  const pathIsValid = !pathError && directoryPath.trim().length > 0;

  const sourceOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "", label: "Local path" },
    ];
    for (const src of scanSourcesQuery.data ?? []) {
      opts.push({
        value: `s3://${src.bucket}/`,
        label: `S3: ${src.name} (${src.bucket})`,
      });
    }
    return opts;
  }, [scanSourcesQuery.data]);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSelectedSource(value);
      if (value) {
        setDirectoryPath(value);
      } else if (directoryPath.startsWith("s3://")) {
        // Switching back to Local clears any lingering S3 URI.
        setDirectoryPath("");
      }
    },
    [directoryPath],
  );

  const handleScan = useCallback(() => {
    if (!directoryPath.trim()) return;
    scanMut.mutate(
      { path: directoryPath.trim(), pipeline_id: pipelineId, project_id: projectId },
      {
        onSuccess: (data) => {
          setScanResult(data);
          setImportResult(null);
          setFileActions(new Map());
          setEnabledCategories(new Set(TOGGLE_CATEGORIES.map((t) => t.key)));
        },
      },
    );
  }, [directoryPath, pipelineId, projectId, scanMut]);

  /** Build import selections from scan result. */
  const selections = useMemo((): ImportSelection[] => {
    if (!scanResult) return [];
    const result: ImportSelection[] = [];

    const processFile = (file: ScannedFileResponse, avatarId: number | null) => {
      const isEnabled = Array.from(enabledCategories).some((t) =>
        matchesToggle(file.category, t),
      );
      if (!isEnabled) return;

      const action =
        fileActions.get(file.path) ?? (file.conflict === "exists" ? "skip" : "import");
      result.push({
        file_path: file.path,
        category: file.category,
        action,
        avatar_id: avatarId,
        resolved: file.resolved,
      });
    };

    for (const group of scanResult.avatars) {
      for (const file of group.files) processFile(file, group.avatar_id);
    }
    for (const file of scanResult.unresolved) processFile(file, null);
    return result;
  }, [scanResult, enabledCategories, fileActions]);

  const importCount = useMemo(
    () => selections.filter((s) => s.action !== "skip").length,
    [selections],
  );

  const handleImport = useCallback(() => {
    if (importCount === 0) return;
    importMut.mutate(
      { pipeline_id: pipelineId, selections },
      {
        onSuccess: (data) => {
          setImportResult(data);
          setScanResult(null);
          queryClient.invalidateQueries();
          onSuccess?.();
        },
      },
    );
  }, [importCount, importMut, pipelineId, selections, queryClient, onSuccess]);

  const handleClose = useCallback(() => {
    if (scanMut.isPending || importMut.isPending) return;
    setDirectoryPath("");
    setScanResult(null);
    setImportResult(null);
    setFileActions(new Map());
    onClose();
  }, [scanMut.isPending, importMut.isPending, onClose]);

  const toggleCategory = useCallback((key: ToggleKey) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setFileAction = useCallback(
    (path: string, action: "import" | "skip" | "replace") => {
      setFileActions((prev) => new Map(prev).set(path, action));
    },
    [],
  );

  const speechCount = scanResult
    ? scanResult.summary.speech_json +
      scanResult.summary.speech_csv +
      scanResult.summary.voice_csv
    : 0;

  const filterFiles = useCallback(
    (files: ScannedFileResponse[]) =>
      files.filter((f) =>
        Array.from(enabledCategories).some((t) => matchesToggle(f.category, t)),
      ),
    [enabledCategories],
  );

  return (
    <Modal open={open} onClose={handleClose} title="Scan Directory" size="xl">
      <div className="flex flex-col gap-4">
        {/* Source + path input */}
        <div className="flex gap-2">
          {sourceOptions.length > 1 && (
            <div className="w-[200px]">
              <Select
                size="xs"
                label="Source"
                options={sourceOptions}
                value={selectedSource}
                onChange={handleSourceChange}
              />
            </div>
          )}
          <div className="flex-1">
            <Input
              size="xs"
              label={
                selectedSource
                  ? "S3 prefix (optional)"
                  : "Server directory path"
              }
              value={directoryPath}
              onChange={(e) => setDirectoryPath(e.target.value)}
              placeholder={
                selectedSource
                  ? "s3://bucket/prefix/"
                  : "/mnt/d/Storage/avatars"
              }
              error={pathError ?? undefined}
              onKeyDown={(e) => e.key === "Enter" && pathIsValid && handleScan()}
            />
          </div>
          <div className="self-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleScan}
              disabled={!pathIsValid || scanMut.isPending}
              loading={scanMut.isPending}
            >
              Scan
            </Button>
          </div>
        </div>

        {/* Preview */}
        {scanResult && !importResult && (
          <ScanPreview
            scanResult={scanResult}
            enabledCategories={enabledCategories}
            onToggleCategory={toggleCategory}
            fileActions={fileActions}
            onSetFileAction={setFileAction}
            filterFiles={filterFiles}
            speechCount={speechCount}
          />
        )}

        {/* Import progress */}
        {importMut.isPending && (
          <div className={`${TYPO_DATA_CYAN} animate-pulse`}>Importing...</div>
        )}

        {/* Results */}
        {importResult && <ImportResultSummary result={importResult} />}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={scanMut.isPending || importMut.isPending}
          >
            {importResult ? "Close" : "Cancel"}
          </Button>
          {scanResult && !importResult && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleImport}
              disabled={importMut.isPending || importCount === 0}
              loading={importMut.isPending}
            >
              Import Selected ({importCount})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
