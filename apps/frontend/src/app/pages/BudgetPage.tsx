/**
 * Budget & quota management page (PRD-93).
 *
 * Loads the budget status for a selected project and renders the
 * BudgetDashboard visualization.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button, Input, Spinner } from "@/components/primitives";

import { BudgetDashboard, useBudget, useBudgetHistory } from "@/features/budget-quota";

export function BudgetPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");

  const activeProjectId = projectId ?? 0;
  const { data: status, isLoading: statusLoading } = useBudget(activeProjectId);
  const { data: history } = useBudgetHistory(activeProjectId);

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
    }
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Generation Budgets
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            View and manage per-project generation budget quotas and consumption.
          </p>
        </div>

        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Project ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter project ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {projectId !== null && statusLoading && (
          <Stack align="center" gap={3}>
            <Spinner size="lg" />
          </Stack>
        )}

        {projectId !== null && status && (
          <BudgetDashboard status={status} history={history ?? []} />
        )}

        {projectId === null && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a project ID above to view budget details.
          </p>
        )}
      </Stack>
    </div>
  );
}
