/**
 * Confirmation modal shown before importing drag-and-dropped videos.
 *
 * Displays matched files (file → scene slot mapping) and unmatched files
 * so the user can review before committing to the import.
 */

import { Modal } from "@/components/composite/Modal";
import { Badge, Button } from "@/components/primitives";
import { AlertCircle, Upload } from "@/tokens/icons";

import type { MatchResult } from "./matchDroppedVideos";

interface ImportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  result: MatchResult | null;
  onConfirm: () => void;
  importing: boolean;
}

export function ImportPreviewModal({
  open,
  onClose,
  result,
  onConfirm,
  importing,
}: ImportPreviewModalProps) {
  if (!result) return null;

  const matchedCount = result.matched.length;
  const unmatchedCount = result.unmatched.length;

  return (
    <Modal open={open} onClose={onClose} title="Import Videos" size="lg">
      <div className="space-y-[var(--spacing-4)]">
        {/* Matched files */}
        {matchedCount > 0 && (
          <div className="space-y-[var(--spacing-2)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
              Matched ({matchedCount})
            </h3>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]">
                    <th className="text-left px-[var(--spacing-3)] py-[var(--spacing-2)] font-medium">
                      File
                    </th>
                    <th className="text-left px-[var(--spacing-3)] py-[var(--spacing-2)] font-medium">
                      Scene
                    </th>
                    <th className="text-left px-[var(--spacing-3)] py-[var(--spacing-2)] font-medium">
                      Track
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map(({ file, row }) => (
                    <tr
                      key={file.name}
                      className="border-t border-[var(--color-border-default)]"
                    >
                      <td className="px-[var(--spacing-3)] py-[var(--spacing-2)] text-[var(--color-text-primary)] truncate max-w-[200px]">
                        {file.name}
                      </td>
                      <td className="px-[var(--spacing-3)] py-[var(--spacing-2)] text-[var(--color-text-primary)]">
                        {row.name}
                      </td>
                      <td className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
                        {row.track_slug ? (
                          <Badge variant="default" size="sm">
                            {row.track_slug}
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Unmatched files */}
        {unmatchedCount > 0 && (
          <div className="space-y-[var(--spacing-2)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-[var(--spacing-1)]">
              <AlertCircle size={14} className="text-[var(--color-action-warning)]" />
              Unmatched ({unmatchedCount}) — will be skipped
            </h3>
            <ul className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-[var(--spacing-3)] py-[var(--spacing-2)] space-y-1">
              {result.unmatched.map((file) => (
                <li
                  key={file.name}
                  className="text-sm text-[var(--color-text-muted)] truncate"
                >
                  {file.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-[var(--spacing-3)] pt-[var(--spacing-2)]">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={importing}
            disabled={importing}
            icon={<Upload size={14} />}
          >
            Import {matchedCount} video{matchedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
