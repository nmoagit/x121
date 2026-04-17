/**
 * Path-only scan dialog for the unified scan → confirm → SSE import flow
 * (PRD-165).
 *
 * Unlike `ScanDirectoryDialog`, this dialog stops after the scan call
 * returns — the page layer is expected to hand the `ScanResponse` to
 * `ImportConfirmModal` via `useScanImportFlow`. No per-file preview, no
 * legacy `/directory-scan/import` call.
 */

import { useCallback, useMemo, useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { Button, Input, Select } from "@/components/primitives";
import { type ScanResponse, useDirectoryScan, useScanSources } from "@/hooks/useDirectoryScan";

// ---------------------------------------------------------------------------
// Path validation (shared logic mirrors ScanDirectoryDialog)
// ---------------------------------------------------------------------------

function validateScanPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("s3://")) {
    const rest = trimmed.slice(5);
    const slash = rest.indexOf("/");
    const bucket = slash === -1 ? rest : rest.slice(0, slash);
    if (!bucket) return "Invalid S3 URI: missing bucket";
    if (!/^[a-z0-9.\-]+$/i.test(bucket)) return "Invalid S3 bucket name";
    return null;
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return null;
  }
  return "Path must be absolute (starts with /) or an s3:// URI";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ScanInputDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: number;
  projectId?: number;
  /** Called when the scan completes — the caller maps the result to payloads. */
  onScanSuccess: (result: ScanResponse) => void;
}

export function ScanInputDialog({
  open,
  onClose,
  pipelineId,
  projectId,
  onScanSuccess,
}: ScanInputDialogProps) {
  const [directoryPath, setDirectoryPath] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  const scanMut = useDirectoryScan();
  const scanSourcesQuery = useScanSources();

  const pathError = useMemo(() => validateScanPath(directoryPath), [directoryPath]);
  const pathIsValid = !pathError && directoryPath.trim().length > 0;

  const sourceOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: "", label: "Local path" }];
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
        setDirectoryPath("");
      }
    },
    [directoryPath],
  );

  const handleScan = useCallback(() => {
    if (!pathIsValid) return;
    scanMut.mutate(
      { path: directoryPath.trim(), pipeline_id: pipelineId, project_id: projectId },
      {
        onSuccess: (data) => {
          onScanSuccess(data);
        },
      },
    );
  }, [pathIsValid, directoryPath, pipelineId, projectId, scanMut, onScanSuccess]);

  const handleClose = useCallback(() => {
    if (scanMut.isPending) return;
    setDirectoryPath("");
    setSelectedSource("");
    onClose();
  }, [scanMut.isPending, onClose]);

  return (
    <Modal open={open} onClose={handleClose} title="Scan Directory" size="lg">
      <div className="flex flex-col gap-4">
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
              label={selectedSource ? "S3 prefix (optional)" : "Server directory path"}
              value={directoryPath}
              onChange={(e) => setDirectoryPath(e.target.value)}
              placeholder={selectedSource ? "s3://bucket/prefix/" : "/mnt/d/Storage/avatars"}
              error={pathError ?? undefined}
              onKeyDown={(e) => e.key === "Enter" && pathIsValid && handleScan()}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={scanMut.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleScan}
            disabled={!pathIsValid || scanMut.isPending}
            loading={scanMut.isPending}
          >
            Scan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
