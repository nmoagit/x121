/**
 * File row and related sub-components for the scan directory preview (PRD-155).
 */

import { CollapsibleSection } from "@/components/composite/CollapsibleSection";
import type {
  AvatarScanGroup,
  FileCategory,
  ScannedFileResponse,
} from "@/hooks/useDirectoryScan";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { File, FileText, Film, Image, MessageSquare, Mic } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CATEGORY_ICONS: Record<FileCategory, React.ReactNode> = {
  image: <Image size={12} />,
  metadata: <FileText size={12} />,
  speech_json: <MessageSquare size={12} />,
  speech_csv: <MessageSquare size={12} />,
  voice_csv: <Mic size={12} />,
  video_clip: <Film size={12} />,
  unknown: <File size={12} />,
};

/* --------------------------------------------------------------------------
   ConflictBadge
   -------------------------------------------------------------------------- */

function ConflictBadge({ status }: { status: string }) {
  const color =
    status === "new"
      ? "text-[var(--color-data-green)] bg-green-400/10"
      : status === "exists"
        ? "text-yellow-400 bg-yellow-400/10"
        : "text-[var(--color-data-red)] bg-red-400/10";
  return (
    <span className={cn("px-1.5 py-0.5 rounded font-mono text-[10px]", color)}>
      {status}
    </span>
  );
}

/* --------------------------------------------------------------------------
   FileRow
   -------------------------------------------------------------------------- */

export function ScanFileRow({
  file,
  action,
  onActionChange,
}: {
  file: ScannedFileResponse;
  action: "import" | "skip" | "replace";
  onActionChange: (a: "import" | "skip" | "replace") => void;
}) {
  const ctx = file.resolved;
  const contextParts: string[] = [];
  if (ctx.variant_type) contextParts.push(ctx.variant_type);
  if (ctx.scene_type_slug) contextParts.push(ctx.scene_type_slug);
  if (ctx.track_slug) contextParts.push(ctx.track_slug);
  if (ctx.version != null) contextParts.push(`v${ctx.version}`);
  if (ctx.clip_index != null) contextParts.push(`#${ctx.clip_index}`);
  if (ctx.metadata_key) contextParts.push(ctx.metadata_key);

  return (
    <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-default)]/30 last:border-b-0">
      <span className="shrink-0 text-[var(--color-text-muted)]">
        {CATEGORY_ICONS[file.category]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] text-[var(--color-text-primary)] truncate">
          {file.filename}
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-[var(--color-text-muted)]">
          <span>{formatBytes(file.size_bytes)}</span>
          {contextParts.length > 0 && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-data-cyan)]">{contextParts.join(" \u00b7 ")}</span>
            </>
          )}
          {file.resolved.labels.length > 0 && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-data-orange)]">{file.resolved.labels.join(", ")}</span>
            </>
          )}
        </div>
      </div>
      <ConflictBadge status={file.conflict} />
      {file.conflict === "exists" && (
        <select
          className="font-mono text-[10px] bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded px-1 py-0.5"
          value={action}
          onChange={(e) => onActionChange(e.target.value as "import" | "skip" | "replace")}
        >
          <option value="import">Import</option>
          <option value="skip">Skip</option>
          <option value="replace">Replace</option>
        </select>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   AvatarGroupSection
   -------------------------------------------------------------------------- */

export function ScanAvatarGroup({
  group,
  filterFiles,
  fileActions,
  onSetFileAction,
}: {
  group: AvatarScanGroup;
  filterFiles: (files: ScannedFileResponse[]) => ScannedFileResponse[];
  fileActions: Map<string, "import" | "skip" | "replace">;
  onSetFileAction: (path: string, action: "import" | "skip" | "replace") => void;
}) {
  const visible = filterFiles(group.files);
  if (visible.length === 0) return null;

  const title = group.avatar_name
    ? `${group.avatar_name} (${visible.length})`
    : `${group.avatar_slug} (${visible.length})`;

  return (
    <CollapsibleSection title={title} defaultOpen card={false}>
      {visible.map((file) => (
        <ScanFileRow
          key={file.path}
          file={file}
          action={fileActions.get(file.path) ?? (file.conflict === "exists" ? "skip" : "import")}
          onActionChange={(a) => onSetFileAction(file.path, a)}
        />
      ))}
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   UnresolvedSection
   -------------------------------------------------------------------------- */

export function ScanUnresolvedGroup({
  files,
  fileActions,
  onSetFileAction,
}: {
  files: ScannedFileResponse[];
  fileActions: Map<string, "import" | "skip" | "replace">;
  onSetFileAction: (path: string, action: "import" | "skip" | "replace") => void;
}) {
  if (files.length === 0) return null;

  return (
    <CollapsibleSection title={`Unresolved (${files.length})`} defaultOpen card={false}>
      {files.map((file) => (
        <ScanFileRow
          key={file.path}
          file={file}
          action={fileActions.get(file.path) ?? (file.conflict === "exists" ? "skip" : "import")}
          onActionChange={(a) => onSetFileAction(file.path, a)}
        />
      ))}
    </CollapsibleSection>
  );
}
