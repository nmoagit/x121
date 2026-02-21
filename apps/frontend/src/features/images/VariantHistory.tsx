/**
 * Version chain display for an image variant (PRD-21).
 *
 * Shows the full edit history: original generated variant -> edited v2 -> edited v3.
 */

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Spinner } from "@/components/primitives";
import { Clock } from "@/tokens/icons";
import { formatDateTime } from "@/lib/format";

import { useVariantHistory } from "./hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  type ImageVariantStatusId,
  type Provenance,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface VariantHistoryProps {
  characterId: number;
  variantId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VariantHistory({ characterId, variantId }: VariantHistoryProps) {
  const { data: history, isLoading } = useVariantHistory(characterId, variantId);

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">No version history available.</p>
    );
  }

  return (
    <Card elevation="sm" padding="md">
      <Stack gap={4}>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Version History</h4>

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
                      src={entry.file_path}
                      alt={`Version ${entry.version}`}
                      className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)]" />
                  )}

                  {/* Info */}
                  <Stack gap={1}>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      Version {entry.version}
                      {entry.is_hero && (
                        <span className="ml-2 inline-block">
                          <Badge variant="success" size="sm">
                            Hero
                          </Badge>
                        </span>
                      )}
                    </span>

                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant="default"
                        size="sm"
                      >
                        {IMAGE_VARIANT_STATUS_LABEL[entry.status_id as ImageVariantStatusId] ?? "Unknown"}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {PROVENANCE_LABEL[entry.provenance as Provenance] ?? entry.provenance}
                      </Badge>
                      {entry.width && entry.height && (
                        <Badge variant="info" size="sm">
                          {entry.width} x {entry.height}
                        </Badge>
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
    </Card>
  );
}
