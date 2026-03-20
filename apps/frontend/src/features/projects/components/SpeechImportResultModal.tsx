/**
 * Shared result modal for bulk speech import — shows per-model breakdown.
 */

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

import type { BulkImportReport } from "@/features/characters/types";

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
        <div className="flex items-center gap-3 font-mono text-xs">
          <span><span className="text-green-400">{result.imported}</span> imported</span>
          {result.skipped > 0 && (
            <>
              <span className="text-white/20">|</span>
              <span><span className="text-[var(--color-text-muted)]">{result.skipped}</span> skipped</span>
            </>
          )}
        </div>

        {/* Matched models */}
        {result.characters_matched.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              matched ({result.characters_matched.length})
            </p>
            <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.characters_matched.map((name) => (
                <div key={name} className="px-2 py-0.5 font-mono text-xs text-cyan-400 border-b border-white/5 last:border-b-0">
                  {name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unmatched models */}
        {result.characters_unmatched.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-orange-400 mb-1">
              unmatched ({result.characters_unmatched.length})
            </p>
            <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.characters_unmatched.map((name) => (
                <div key={name} className="px-2 py-0.5 font-mono text-xs text-orange-400 border-b border-white/5 last:border-b-0">
                  {name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {result.errors.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-red-400 mb-1">
              errors ({result.errors.length})
            </p>
            <div className="max-h-24 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {result.errors.map((e, i) => (
                <div key={i} className="px-2 py-0.5 font-mono text-xs text-red-400 border-b border-white/5 last:border-b-0">
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
