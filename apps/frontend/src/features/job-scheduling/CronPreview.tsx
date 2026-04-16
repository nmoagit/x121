/**
 * Cron expression preview (PRD-119).
 *
 * Displays a human-readable cron description and next 5 upcoming runs.
 */

import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { Clock } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Stack } from "@/components/layout";

import { computeNextRuns, describeCron } from "./cron-utils";
import { TYPO_INPUT_LABEL, TYPO_CAPTION} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const NEXT_RUNS_COUNT = 5;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CronPreviewProps {
  expression: string;
  className?: string;
}

export function CronPreview({ expression, className }: CronPreviewProps) {
  const description = useMemo(() => describeCron(expression), [expression]);
  const nextRuns = useMemo(
    () => computeNextRuns(expression, NEXT_RUNS_COUNT),
    [expression],
  );

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-primary)] p-[var(--spacing-3)]",
        className,
      )}
      data-testid="cron-preview"
    >
      <Stack direction="vertical" gap={2}>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          {description}
        </p>

        {nextRuns.length > 0 && (
          <div>
            <Stack direction="horizontal" gap={1} align="center" className="mb-1.5">
              <Clock
                size={iconSizes.sm}
                className="text-[var(--color-text-muted)]"
              />
              <span className={TYPO_INPUT_LABEL}>
                Next {nextRuns.length} runs
              </span>
            </Stack>
            <ul className="space-y-0.5">
              {nextRuns.map((date, i) => (
                <li
                  key={i}
                  className={TYPO_CAPTION}
                >
                  {formatDateTime(date.toISOString())}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Stack>
    </div>
  );
}
