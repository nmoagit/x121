/**
 * Version chain display for an image variant (PRD-21).
 *
 * Shows the full edit history: original generated variant -> edited v2 -> edited v3.
 */

import { Stack } from "@/components/layout";
import { ContextLoader } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_PANEL } from "@/lib/ui-classes";
import { Clock } from "@/tokens/icons";

import { useVariantHistory } from "./hooks/use-media-variants";
import {
  MEDIA_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  type MediaVariantStatusId,
  type Provenance,
} from "./types";
import { variantMediaUrl } from "./utils";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VariantHistoryProps {
  avatarId: number;
  variantId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VariantHistory({ avatarId, variantId }: VariantHistoryProps) {
  const { data: history, isLoading } = useVariantHistory(avatarId, variantId);

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">No version history available.</p>
    );
  }

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Version History</span>
      </div>
      <div className={TERMINAL_BODY}>
      <Stack gap={4}>

        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--color-border-default)]" />

          <ul className="flex flex-col gap-4">
            {history.map((entry, index) => (
              <li key={entry.id} className="relative flex gap-3 pl-8">
                {/* Timeline dot */}
                <div
                  className={[
                    "absolute left-1.5 top-1 h-3 w-3 rounded-full border-2",
                    index === 0
                      ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]"
                      : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]",
                  ].join(" ")}
                />

                <div className="flex flex-1 gap-3">
                  {/* Thumbnail */}
                  {entry.file_path ? (
                    <img
                      src={variantMediaUrl(entry.file_path)}
                      alt={`Version ${entry.version}`}
                      className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)]" />
                  )}

                  {/* Info */}
                  <Stack gap={1}>
                    <span className="font-mono text-xs text-cyan-400">
                      Version {entry.version}
                      {entry.is_hero && (
                        <span className="ml-2 text-green-400">[Hero]</span>
                      )}
                    </span>

                    <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                      <span className="text-[var(--color-text-muted)]">
                        {MEDIA_VARIANT_STATUS_LABEL[entry.status_id as MediaVariantStatusId] ?? "Unknown"}
                      </span>
                      <span className="opacity-30">|</span>
                      <span className="text-[var(--color-text-muted)]">
                        {PROVENANCE_LABEL[entry.provenance as Provenance] ?? entry.provenance}
                      </span>
                      {entry.width && entry.height && (
                        <>
                          <span className="opacity-30">|</span>
                          <span className="text-cyan-400">{entry.width} x {entry.height}</span>
                        </>
                      )}
                    </div>

                    <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <Clock size={12} />
                      {formatDateTime(entry.created_at)}
                    </span>
                  </Stack>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Stack>
      </div>
    </div>
  );
}
