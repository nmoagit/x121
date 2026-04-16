/**
 * Side-by-side diff view for comparing current vs. LLM-refined metadata.
 *
 * Supports cherry-pick selection via checkboxes per changed field.
 */

import { Badge, Checkbox } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";

import type { FieldChange, RefinementReport } from "../types";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CHANGE_TYPE_VARIANT = {
  added: "success",
  modified: "warning",
  removed: "danger",
  enriched: "info",
} as const;

const CHANGE_TYPE_BG = {
  added: "bg-[var(--color-action-success)]/5",
  modified: "bg-[var(--color-action-warning)]/5",
  removed: "bg-[var(--color-action-danger)]/5",
  enriched: "bg-[var(--color-action-primary)]/5",
} as const;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface MetadataDiffViewProps {
  currentMetadata: Record<string, unknown>;
  refinedMetadata: Record<string, unknown>;
  report: RefinementReport | null;
  selectedFields: Set<string>;
  onToggleField: (field: string) => void;
}

/** Build a lookup of changes by field name. */
function buildChangeMap(report: RefinementReport | null): Map<string, FieldChange> {
  const map = new Map<string, FieldChange>();
  if (!report?.changes) return map;
  for (const change of report.changes) {
    map.set(change.field, change);
  }
  return map;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MetadataDiffView({
  currentMetadata,
  refinedMetadata,
  report,
  selectedFields,
  onToggleField,
}: MetadataDiffViewProps) {
  const changeMap = buildChangeMap(report);

  // Collect all fields: changed fields first, then unchanged
  const allFields = new Set([
    ...Object.keys(currentMetadata),
    ...Object.keys(refinedMetadata),
  ]);
  const changedFields = [...allFields].filter((f) => changeMap.has(f));
  const unchangedFields = [...allFields].filter((f) => !changeMap.has(f));

  return (
    <div className="flex flex-col gap-[var(--spacing-3)]">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-[var(--spacing-3)] px-2">
        <div className="w-6" />
        <span className={TYPO_INPUT_LABEL}>
          Current Metadata
        </span>
        <span className={TYPO_INPUT_LABEL}>
          Refined Metadata
        </span>
      </div>

      {/* Changed fields */}
      {changedFields.map((field) => {
        const change = changeMap.get(field)!;
        const bg = CHANGE_TYPE_BG[change.change_type];
        const variant = CHANGE_TYPE_VARIANT[change.change_type];

        return (
          <div
            key={field}
            className={cn(
              "grid grid-cols-[auto_1fr_1fr] gap-[var(--spacing-3)] items-start rounded-[var(--radius-md)] px-2 py-2",
              bg,
            )}
          >
            <Checkbox
              checked={selectedFields.has(field)}
              onChange={() => onToggleField(field)}
            />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-[var(--spacing-1)]">
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {field}
                </span>
                <Badge variant={variant} size="sm">
                  {change.change_type}
                </Badge>
              </div>
              <pre className="text-[10px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words font-mono">
                {formatValue(change.old_value)}
              </pre>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={TYPO_INPUT_LABEL}>
                {change.source}
              </span>
              <pre className="text-[10px] leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words font-mono">
                {formatValue(change.new_value)}
              </pre>
            </div>
          </div>
        );
      })}

      {/* Unchanged fields */}
      {unchangedFields.length > 0 && (
        <div className="border-t border-[var(--color-border-default)] pt-[var(--spacing-2)]">
          <span className="text-[10px] text-[var(--color-text-muted)] mb-1 block">
            {unchangedFields.length} unchanged field{unchangedFields.length !== 1 ? "s" : ""}
          </span>
          {unchangedFields.map((field) => (
            <div
              key={field}
              className="grid grid-cols-[auto_1fr_1fr] gap-[var(--spacing-3)] items-start px-2 py-1 opacity-60"
            >
              <div className="w-6" />
              <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                {field}: {formatValue(currentMetadata[field])}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                {formatValue(refinedMetadata[field])}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Report warnings */}
      {report?.warnings && report.warnings.length > 0 && (
        <div className="border-t border-[var(--color-border-default)] pt-[var(--spacing-2)]">
          <span className="text-xs font-medium text-[var(--color-action-warning)]">Warnings</span>
          <ul className="mt-1 list-disc list-inside text-[10px] text-[var(--color-text-secondary)]">
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
