/**
 * Dry-run results panel (PRD-97).
 *
 * Shows what actions a trigger would fire, including chain depth
 * and warnings about downstream chaining.
 */

import { Badge } from "@/components/primitives";
import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { AlertTriangle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import type { DryRunResult } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MAX_SAFE_CHAIN_DEPTH = 5;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface DryRunPanelProps {
  results: DryRunResult[];
}

export function DryRunPanel({ results }: DryRunPanelProps) {
  if (results.length === 0) {
    return (
      <Card elevation="flat" padding="md">
        <p className="text-sm text-[var(--color-text-muted)]" data-testid="dry-run-empty">
          No actions would be triggered.
        </p>
      </Card>
    );
  }

  const hasDeepChain = results.some((r) => r.chain_depth >= MAX_SAFE_CHAIN_DEPTH);

  return (
    <div data-testid="dry-run-panel">
      <Stack direction="vertical" gap={3}>
        {hasDeepChain && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-action-warning)]/10 text-[var(--color-action-warning)]">
            <AlertTriangle size={iconSizes.md} />
            <span className="text-sm font-medium">
              Deep chain detected (depth {">="} {MAX_SAFE_CHAIN_DEPTH}). Review carefully.
            </span>
          </div>
        )}

        {results.map((result) => (
          <Card key={result.trigger_id} elevation="flat" padding="md">
            <Stack direction="vertical" gap={2}>
              <Stack direction="horizontal" gap={2} align="center">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {result.trigger_name}
                </span>
                <Badge variant="info" size="sm">Depth {result.chain_depth}</Badge>
                {result.would_chain && (
                  <Badge variant="warning" size="sm">Chains</Badge>
                )}
              </Stack>

              <div className="space-y-1">
                {result.actions.map((action, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-primary)] px-2 py-1 rounded-[var(--radius-sm)]"
                  >
                    {action.action}: {JSON.stringify(action.params)}
                  </div>
                ))}
              </div>
            </Stack>
          </Card>
        ))}
      </Stack>
    </div>
  );
}
