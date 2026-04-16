/**
 * Preview and result sub-components for ScanDirectoryDialog (PRD-155).
 */

import type {
  FileCategory,
  ImportResult,
  ScanResponse,
  ScannedFileResponse,
} from "@/hooks/useDirectoryScan";
import { cn } from "@/lib/cn";
import { ScanAvatarGroup, ScanUnresolvedGroup } from "./ScanFileRow";
import { TYPO_DATA, TYPO_LABEL} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Toggle category helpers
   -------------------------------------------------------------------------- */

export const TOGGLE_CATEGORIES = [
  { key: "image" as const, summaryKey: "images" as const, label: "Images" },
  { key: "metadata" as const, summaryKey: "metadata" as const, label: "Metadata" },
  { key: "speech" as const, summaryKey: null, label: "Speech" },
  { key: "video_clip" as const, summaryKey: "video_clips" as const, label: "Clips" },
] as const;

export type ToggleKey = (typeof TOGGLE_CATEGORIES)[number]["key"];

function isSpeechCategory(c: FileCategory): boolean {
  return c === "speech_json" || c === "speech_csv" || c === "voice_csv";
}

export function matchesToggle(category: FileCategory, toggle: ToggleKey): boolean {
  if (toggle === "speech") return isSpeechCategory(category);
  return category === toggle;
}

/* --------------------------------------------------------------------------
   ScanPreview
   -------------------------------------------------------------------------- */

export function ScanPreview({
  scanResult,
  enabledCategories,
  onToggleCategory,
  fileActions,
  onSetFileAction,
  filterFiles,
  speechCount,
}: {
  scanResult: ScanResponse;
  enabledCategories: Set<ToggleKey>;
  onToggleCategory: (key: ToggleKey) => void;
  fileActions: Map<string, "import" | "skip" | "replace">;
  onSetFileAction: (path: string, action: "import" | "skip" | "replace") => void;
  filterFiles: (files: ScannedFileResponse[]) => ScannedFileResponse[];
  speechCount: number;
}) {
  const { summary } = scanResult;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <div className={`flex items-center gap-3 ${TYPO_LABEL}`}>
          <span>{summary.total_files} file{summary.total_files !== 1 ? "s" : ""}</span>
          <span className="opacity-30">|</span>
          <span>{scanResult.avatars.length} avatar{scanResult.avatars.length !== 1 ? "s" : ""}</span>
          {scanResult.unresolved.length > 0 && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-data-orange)]">{scanResult.unresolved.length} unresolved</span>
            </>
          )}
        </div>
      </div>

      {/* Category toggles */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-border-default)]/50 bg-[var(--color-surface-primary)]">
        {TOGGLE_CATEGORIES.map((cat) => {
          const count = cat.summaryKey != null ? summary[cat.summaryKey] : speechCount;
          const active = enabledCategories.has(cat.key);
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onToggleCategory(cat.key)}
              className={cn(
                "px-2 py-0.5 rounded font-mono text-[10px] transition-colors",
                active
                  ? "bg-[var(--color-action-primary)] text-white"
                  : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Avatar groups */}
      <div className="max-h-80 overflow-y-auto">
        {scanResult.avatars.map((group) => (
          <ScanAvatarGroup
            key={group.avatar_slug}
            group={group}
            filterFiles={filterFiles}
            fileActions={fileActions}
            onSetFileAction={onSetFileAction}
          />
        ))}
        {scanResult.unresolved.length > 0 && (
          <ScanUnresolvedGroup
            files={filterFiles(scanResult.unresolved)}
            fileActions={fileActions}
            onSetFileAction={onSetFileAction}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   ImportResultSummary
   -------------------------------------------------------------------------- */

export function ImportResultSummary({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <div className={TYPO_DATA}>
          Import Complete
        </div>
      </div>
      <div className="px-3 py-3">
        <div className={`flex items-center gap-4 ${TYPO_DATA}`}>
          <span className="text-[var(--color-data-green)]">{result.imported} imported</span>
          <span className="text-[var(--color-text-muted)]">{result.skipped} skipped</span>
          <span className="text-yellow-400">{result.replaced} replaced</span>
          {result.failed > 0 && (
            <span className="text-[var(--color-data-red)]">{result.failed} failed</span>
          )}
        </div>
        {result.failed > 0 && result.details.filter((d) => d.error).length > 0 && (
          <div className="mt-2 max-h-32 overflow-y-auto">
            {result.details
              .filter((d) => d.error)
              .map((d) => (
                <div key={d.path} className="font-mono text-[10px] text-[var(--color-data-red)]">
                  {d.path}: {d.error}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
