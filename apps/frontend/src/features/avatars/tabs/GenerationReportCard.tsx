/**
 * Generation report card — displays missing fields, warnings, and errors
 * from a metadata generation run.
 */

import { Accordion } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import type { GenerationReport } from "../types";
import { TYPO_INPUT_LABEL, TYPO_CAPTION} from "@/lib/typography-tokens";

interface GenerationReportCardProps {
  report: GenerationReport;
}

export function GenerationReportCard({ report }: GenerationReportCardProps) {
  const { field_count, missing, warnings, errors } = report;

  // Group missing fields by category
  const missingByCategory: Record<string, string[]> = {};
  for (const m of missing) {
    const list = missingByCategory[m.category] ?? [];
    list.push(m.field);
    missingByCategory[m.category] = list;
  }

  const hasMissing = missing.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasErrors = errors.length > 0;
  const isClean = !hasMissing && !hasWarnings && !hasErrors;

  const items = [];

  if (hasMissing) {
    items.push({
      id: "missing",
      title: `Missing Fields (${missing.length})`,
      content: (
        <div className="flex flex-col gap-[var(--spacing-2)]">
          {Object.entries(missingByCategory).map(([category, fields]) => (
            <div key={category}>
              <span className="text-xs font-medium capitalize text-[var(--color-text-muted)]">
                {category}
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {fields.map((f) => (
                  <Badge key={f} variant="warning" size="sm">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }

  if (hasWarnings) {
    items.push({
      id: "warnings",
      title: `Warnings (${warnings.length})`,
      content: (
        <ul className={`list-inside list-disc space-y-1 ${TYPO_CAPTION}`}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ),
    });
  }

  if (hasErrors) {
    items.push({
      id: "errors",
      title: `Errors (${errors.length})`,
      content: (
        <ul className="list-inside list-disc space-y-1 text-xs text-[var(--color-action-danger)]">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <Stack gap={2}>
      <div className="flex items-center gap-[var(--spacing-2)]">
        <span className={TYPO_INPUT_LABEL}>
          Generation Report
        </span>
        <Badge variant={isClean ? "success" : hasErrors ? "danger" : "warning"} size="sm">
          {field_count} fields
        </Badge>
      </div>

      {isClean ? (
        <p className={TYPO_CAPTION}>
          All expected fields present. No warnings or errors.
        </p>
      ) : (
        <Accordion items={items} allowMultiple defaultOpenIds={items.map((i) => i.id)} />
      )}
    </Stack>
  );
}
