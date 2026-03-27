import { Modal } from "@/components/composite/Modal";
import { Button, Input } from "@/components/primitives";
import { FolderSearch } from "@/tokens/icons";
import { useState } from "react";
import { useImportDirectory, type DirScanResult, type DirScanFolderPreview } from "./hooks/useClipManagement";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ScanDirectoryDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: number;
  onSuccess?: () => void;
}

/* --------------------------------------------------------------------------
   Folder preview row
   -------------------------------------------------------------------------- */

function FolderRow({ folder }: { folder: DirScanFolderPreview }) {
  const hasErrors = folder.errors.length > 0;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-default)]/30 last:border-b-0">
      <FolderSearch size={14} className={`shrink-0 ${hasErrors ? "text-red-400" : "text-[var(--color-text-muted)]"}`} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-[var(--color-text-primary)] truncate">{folder.folder_name}</div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
          {folder.avatar_name && <span className="text-cyan-400">{folder.avatar_name}</span>}
          {folder.scene_type && <><span className="opacity-30">|</span><span>{folder.scene_type}</span></>}
          {folder.track && <><span className="opacity-30">|</span><span>{folder.track}</span></>}
          {folder.version != null && <><span className="opacity-30">|</span><span>v{folder.version}</span></>}
          <span className="opacity-30">|</span>
          <span>{folder.file_count} file{folder.file_count !== 1 ? "s" : ""}</span>
          {folder.labels.length > 0 && (
            <><span className="opacity-30">|</span><span className="text-orange-400">{folder.labels.join(", ")}</span></>
          )}
        </div>
        {hasErrors && (
          <div className="font-mono text-[10px] text-red-400 mt-0.5">
            {folder.errors.join("; ")}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScanDirectoryDialog({ open, onClose, pipelineId, onSuccess }: ScanDirectoryDialogProps) {
  const [directoryPath, setDirectoryPath] = useState("");
  const [preview, setPreview] = useState<DirScanResult | null>(null);
  const [importResult, setImportResult] = useState<DirScanResult | null>(null);

  const importDir = useImportDirectory();

  const handleScan = () => {
    if (!directoryPath.trim()) return;
    importDir.mutate(
      { directory_path: directoryPath.trim(), pipeline_id: pipelineId, dry_run: true },
      { onSuccess: (data) => { setPreview(data); setImportResult(null); } },
    );
  };

  const handleImport = () => {
    if (!directoryPath.trim()) return;
    importDir.mutate(
      { directory_path: directoryPath.trim(), pipeline_id: pipelineId, dry_run: false },
      {
        onSuccess: (data) => {
          setImportResult(data);
          setPreview(null);
          onSuccess?.();
        },
      },
    );
  };

  const handleClose = () => {
    if (importDir.isPending) return;
    setDirectoryPath("");
    setPreview(null);
    setImportResult(null);
    onClose();
  };

  const scanData = preview ?? importResult;

  return (
    <Modal open={open} onClose={handleClose} title="Scan Directory" size="lg">
      <div className="flex flex-col gap-4">
        {/* Path input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              size="sm"
              label="Server directory path"
              value={directoryPath}
              onChange={(e) => setDirectoryPath(e.target.value)}
              placeholder="/mnt/d/Storage/phase_2_chunked"
            />
          </div>
          <div className="self-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleScan}
              disabled={!directoryPath.trim() || importDir.isPending}
              loading={importDir.isPending && preview === null && importResult === null}
            >
              Scan
            </Button>
          </div>
        </div>

        {/* Preview / Results */}
        {scanData && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--color-border-default)] bg-[#161b22]">
              <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                <span>{scanData.folder_count} folder{scanData.folder_count !== 1 ? "s" : ""}</span>
                <span className="opacity-30">|</span>
                <span>{scanData.file_count} file{scanData.file_count !== 1 ? "s" : ""}</span>
                {scanData.imported != null && (
                  <><span className="opacity-30">|</span><span className="text-green-400 normal-case">{scanData.imported} imported</span></>
                )}
                {scanData.failed != null && scanData.failed > 0 && (
                  <><span className="opacity-30">|</span><span className="text-red-400 normal-case">{scanData.failed} failed</span></>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {scanData.folders.map((folder) => (
                <FolderRow key={folder.folder_name} folder={folder} />
              ))}
            </div>
            {scanData.errors.length > 0 && (
              <div className="px-3 py-2 border-t border-[var(--color-border-default)]">
                {scanData.errors.map((err) => (
                  <div key={err} className="font-mono text-[10px] text-red-400">{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Import progress */}
        {importDir.isPending && importResult === null && preview !== null && (
          <div className="font-mono text-xs text-cyan-400 animate-pulse">
            Importing...
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={importDir.isPending}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {preview && !importResult && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleImport}
              disabled={importDir.isPending || preview.file_count === 0}
              loading={importDir.isPending}
            >
              Import All ({preview.file_count} files)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
