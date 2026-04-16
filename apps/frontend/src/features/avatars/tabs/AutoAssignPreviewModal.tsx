/**
 * Auto-assign preview modal for the Avatar Seeds tab (PRD-147).
 *
 * Shows a dry-run preview of which slots will be auto-assigned
 * and which will be skipped, before the user confirms.
 */

import { Button } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { variantThumbnailUrl } from "@/features/media/utils";

import type { AutoAssignResult } from "../hooks/use-media-assignments";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface AutoAssignPreviewModalProps {
  preview: AutoAssignResult | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function AutoAssignPreviewModal({
  preview,
  onConfirm,
  onCancel,
  loading,
}: AutoAssignPreviewModalProps) {
  return (
    <Modal
      open={preview !== null}
      onClose={onCancel}
      title="Auto-Assign Seeds"
      size="lg"
    >
      {preview && (
        <Stack gap={4}>
          <p className="text-xs font-mono text-[var(--color-text-muted)]">
            {preview.total_assigned} of {preview.total_slots} slots will be assigned.
            {preview.total_skipped > 0 && ` ${preview.total_skipped} skipped.`}
          </p>

          {/* Assignments */}
          {preview.assigned.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-mono text-[var(--color-data-green)] uppercase tracking-wide">Will Assign</h4>
              <div className="space-y-1">
                {preview.assigned.map((a) => (
                  <div
                    key={`${a.scene_type_id}-${a.track_id}`}
                    className={`flex items-center gap-2 rounded bg-green-500/5 border border-green-500/20 px-2 py-1.5 ${TYPO_DATA}`}
                  >
                    <span className="text-[var(--color-text-primary)]">{a.scene_type_name}</span>
                    <span className={TRACK_TEXT_COLORS[a.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{a.track_name}</span>
                    <span className="text-[var(--color-text-muted)]">→</span>
                    {a.media_variant_id && (
                      <img
                        src={variantThumbnailUrl(a.media_variant_id, 64)}
                        alt={a.variant_label}
                        className="h-6 w-6 rounded object-cover"
                      />
                    )}
                    <span className="text-[var(--color-data-cyan)] truncate">{a.variant_label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped */}
          {preview.skipped.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-mono text-[var(--color-data-orange)] uppercase tracking-wide">Skipped</h4>
              <div className="space-y-1">
                {preview.skipped.map((s) => (
                  <div
                    key={`${s.scene_type_name}-${s.track_name}`}
                    className="flex items-center gap-2 rounded bg-orange-500/5 border border-orange-500/20 px-2 py-1.5 font-mono text-[10px] text-[var(--color-text-muted)]"
                  >
                    <span>{s.scene_type_name}</span>
                    <span>{s.track_name}</span>
                    <span className="text-[var(--color-data-orange)]">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={onConfirm} loading={loading}>
              Confirm ({preview.total_assigned})
            </Button>
          </div>
        </Stack>
      )}
    </Modal>
  );
}
