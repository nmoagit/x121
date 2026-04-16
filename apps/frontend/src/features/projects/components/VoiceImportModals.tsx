/**
 * Shared voice ID import confirmation and result modals.
 *
 * Used by ProjectOverviewTab, ProjectAvatarsTab, and AvatarsPage
 * to show a preview of voice ID CSV imports and their results.
 */

import { Modal } from "@/components/composite";
import type { VoiceIdEntry } from "@/components/domain/FileDropZone";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { getVoiceId } from "@/features/avatars/types";
import { generateSnakeSlug } from "@/lib/format";

import type { BulkVoiceImportResult, VoiceImportMode } from "../hooks/use-project-speech-import";
import type { Avatar } from "../types";
import { TYPO_DATA, TYPO_DATA_DANGER, TYPO_DATA_SUCCESS, TYPO_INPUT_LABEL} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Confirmation modal
   -------------------------------------------------------------------------- */

interface VoiceImportConfirmModalProps {
  open: boolean;
  onClose: () => void;
  entries: VoiceIdEntry[];
  avatars: Avatar[];
  mode: VoiceImportMode;
  onModeChange: (mode: VoiceImportMode) => void;
  loading: boolean;
  onConfirm: () => void;
}

export function VoiceImportConfirmModal({
  open,
  onClose,
  entries,
  avatars,
  mode,
  onModeChange,
  loading,
  onConfirm,
}: VoiceImportConfirmModalProps) {
  const charMap = new Map(avatars.map((c) => [generateSnakeSlug(c.name), c]));

  const rows = entries.map((e) => {
    const char = charMap.get(generateSnakeSlug(e.slug));
    const existingVoiceId = char ? getVoiceId(char.settings as Record<string, unknown> | null) : null;
    return {
      ...e,
      matched: !!char,
      existingVoiceId,
    };
  });

  const matchedCount = rows.filter((r) => r.matched).length;
  const newCount = rows.filter((r) => r.matched && !r.existingVoiceId).length;
  const overwriteCount = rows.filter((r) => r.matched && r.existingVoiceId).length;
  const willImport = mode === "overwrite" ? matchedCount : newCount;

  return (
    <Modal open={open} onClose={onClose} title="Import Voice IDs" size="lg">
      <Stack gap={3}>
        <p className="text-xs font-mono">
          <span className="text-[var(--color-text-primary)]">{rows.length}</span> voice IDs found.
          {" "}<span className="text-[var(--color-text-muted)]">
            (<span className="text-[var(--color-data-green)]">{matchedCount} matched</span>, <span className="text-[var(--color-data-orange)]">{rows.length - matchedCount} unmatched</span>)
          </span>
        </p>

        {/* Import mode toggle */}
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className={TYPO_INPUT_LABEL}>Mode:</span>
          <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border-default)] overflow-hidden">
            <button
              type="button"
              onClick={() => onModeChange("new_only")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mode === "new_only"
                  ? "bg-[var(--color-action-primary)] text-white"
                  : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              New only
            </button>
            <button
              type="button"
              onClick={() => onModeChange("overwrite")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                mode === "overwrite"
                  ? "bg-[var(--color-action-primary)] text-white"
                  : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Overwrite all
            </button>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            {mode === "new_only"
              ? `${newCount} new, ${overwriteCount} skipped (already set)`
              : `${willImport} will be updated`}
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto rounded border border-[var(--color-border-default)]">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-[var(--color-surface-secondary)]">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Avatar</th>
                <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">New Voice ID</th>
                <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Current</th>
                <th className="text-center px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const willSkip = !row.matched || (mode === "new_only" && !!row.existingVoiceId);
                return (
                  <tr
                    key={i}
                    className={`border-b border-white/5 hover:bg-[var(--color-surface-secondary)] ${willSkip ? "opacity-50" : ""}`}
                  >
                    <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.slug}</td>
                    <td className="px-2 py-1 text-[var(--color-text-muted)] truncate max-w-[160px]">{row.voice_id}</td>
                    <td className="px-2 py-1 text-[var(--color-text-muted)] truncate max-w-[160px]">
                      {row.existingVoiceId ?? <span className="text-[var(--color-text-muted)] italic">none</span>}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {!row.matched ? (
                        <span className="text-[var(--color-data-orange)]">No match</span>
                      ) : willSkip ? (
                        <span className="text-[var(--color-text-muted)]">Skip</span>
                      ) : row.existingVoiceId ? (
                        <span className="text-[var(--color-data-cyan)]">Overwrite</span>
                      ) : (
                        <span className="text-[var(--color-data-green)]">Import</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 justify-end pt-1 border-t border-[var(--color-border-default)]">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={willImport === 0}
          >
            Import {willImport > 0 ? `(${willImport})` : ""}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Result modal
   -------------------------------------------------------------------------- */

interface VoiceImportResultModalProps {
  result: BulkVoiceImportResult | null;
  onClose: () => void;
}

export function VoiceImportResultModal({ result, onClose }: VoiceImportResultModalProps) {
  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      title="Voice ID Import Complete"
      size="sm"
    >
      {result && (
        <Stack gap={3}>
          <span className={TYPO_DATA_SUCCESS}>{result.updated.length} updated</span>
          {result.updated.length > 0 && (
            <div>
              <p className="text-xs font-mono text-[var(--color-text-muted)] mb-1">Updated models:</p>
              <div className={`flex flex-wrap gap-1.5 ${TYPO_DATA}`}>
                {result.updated.map((name, i) => (
                  <span key={name} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>}
                    <span className="text-[var(--color-data-green)]">{name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div>
              <p className="text-xs font-mono text-[var(--color-text-muted)] mb-1">Skipped (already set):</p>
              <div className={`flex flex-wrap gap-1.5 ${TYPO_DATA}`}>
                {result.skipped.map((name, i) => (
                  <span key={name} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>}
                    <span className="text-[var(--color-text-muted)]">{name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.unmatched.length > 0 && (
            <div>
              <p className="text-xs font-mono text-[var(--color-text-muted)] mb-1">Unmatched (skipped):</p>
              <div className={`flex flex-wrap gap-1.5 ${TYPO_DATA}`}>
                {result.unmatched.map((name, i) => (
                  <span key={name} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[var(--color-text-muted)] opacity-30 select-none">|</span>}
                    <span className="text-[var(--color-data-orange)]">{name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className={`${TYPO_DATA_DANGER} mb-1`}>Errors:</p>
              <ul className="text-xs font-mono text-[var(--color-text-muted)] list-disc pl-4">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
