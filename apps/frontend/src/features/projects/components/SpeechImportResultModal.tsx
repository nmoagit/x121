/**
 * Shared result modal for bulk speech import — shows per-model breakdown.
 */

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

import type { BulkImportReport } from "@/features/avatars/types";
import { TYPO_DATA, TYPO_DATA_CYAN, TYPO_DATA_DANGER, TYPO_DATA_WARNING, TYPO_LABEL} from "@/lib/typography-tokens";

interface SpeechImportResultModalProps {
  open: boolean;
  onClose: () => void;
  result: BulkImportReport;
}

export function SpeechImportResultModal({ open, onClose, result }: SpeechImportResultModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Speech Import Complete" size="md">
      <Stack gap={3}>
        {/* Counts */}
        <div className={`flex items-center gap-3 ${TYPO_DATA}`}>
          <span><span className="text-[var(--color-data-green)]">{result.imported}</span> imported</span>
          {result.skipped > 0 && (
            <>
              <span className="text-white/20">|</span>
              <span><span className="text-[var(--color-text-muted)]">{result.skipped}</span> skipped</span>
            </>
          )}
        </div>

        {/* Matched models */}
        {result.avatars_matched.length > 0 && (
          <div>
            <p className={`${TYPO_LABEL} mb-1`}>
              matched ({result.avatars_matched.length})
            </p>
            <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.avatars_matched.map((name) => (
                <div key={name} className={`${TYPO_DATA_CYAN} px-2 py-0.5 border-b border-white/5 last:border-b-0`}>
                  {name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unmatched models */}
        {result.avatars_unmatched.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-data-orange)] mb-1">
              unmatched ({result.avatars_unmatched.length})
            </p>
            <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.avatars_unmatched.map((name) => (
                <div key={name} className={`${TYPO_DATA_WARNING} px-2 py-0.5 border-b border-white/5 last:border-b-0`}>
                  {name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {result.errors.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-data-red)] mb-1">
              errors ({result.errors.length})
            </p>
            <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.errors.map((e, i) => (
                <div key={i} className={`${TYPO_DATA_DANGER} px-2 py-0.5 border-b border-white/5 last:border-b-0`}>
                  {e}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </Stack>
    </Modal>
  );
}
