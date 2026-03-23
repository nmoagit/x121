/**
 * Avatar readiness & state view page (PRD-107).
 *
 * Provides two tabs:
 * - "Library View" renders the AvatarLibraryStateView with readiness data
 * - "Criteria" renders the ReadinessCriteriaEditor for managing readiness rules
 *
 * Since AvatarLibraryStateView expects avatar rows with readiness data,
 * this page fetches the readiness summary and displays it. For now, avatar
 * data comes from the readiness hooks (no project/avatar context needed
 * since this is an admin-level view).
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, LoadingPane, TabBar } from "@/components/primitives";

import {
  ReadinessCriteriaEditor,
  ReadinessSummaryBar,
  useBatchEvaluate,
  useCreateCriteria,
  useCriteria,
  useReadinessSummary,
} from "@/features/readiness";
import type { CriteriaJson } from "@/features/readiness";

/* --------------------------------------------------------------------------
   Tab types
   -------------------------------------------------------------------------- */

type TabKey = "summary" | "criteria";

const TABS: { key: TabKey; label: string }[] = [
  { key: "summary", label: "Readiness Summary" },
  { key: "criteria", label: "Criteria Editor" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReadinessPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

  const { data: summary, isLoading: summaryLoading } = useReadinessSummary();
  const { data: criteria, isLoading: criteriaLoading } = useCriteria();
  const createCriteria = useCreateCriteria();
  const batchEvaluate = useBatchEvaluate();

  const studioCriteria = criteria?.find((c) => c.scope_type === "studio");

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Avatar Readiness"
          description="View avatar library readiness states and manage readiness criteria."
        />

        <TabBar tabs={TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />

        {/* Summary tab */}
        {activeTab === "summary" && (
          <Stack gap={4}>
            {summaryLoading && <LoadingPane />}

            {!summaryLoading && summary && (
              <>
                <ReadinessSummaryBar summary={summary} />

                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchEvaluate.mutate({ avatar_ids: [] })}
                    disabled={batchEvaluate.isPending}
                  >
                    {batchEvaluate.isPending
                      ? "Re-evaluating..."
                      : "Re-evaluate All"}
                  </Button>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {summary.total} avatars total
                  </span>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-3 gap-4">
                  <SummaryCard label="Ready" count={summary.ready} variant="success" />
                  <SummaryCard label="Partially Ready" count={summary.partially_ready} variant="warning" />
                  <SummaryCard label="Not Started" count={summary.not_started} variant="default" />
                </div>
              </>
            )}

            {!summaryLoading && !summary && (
              <p className="text-sm text-[var(--color-text-muted)]">
                No readiness data available. Define criteria first, then evaluate avatars.
              </p>
            )}
          </Stack>
        )}

        {/* Criteria tab */}
        {activeTab === "criteria" && (
          <Stack gap={4}>
            {criteriaLoading && <LoadingPane />}

            {!criteriaLoading && (
              <ReadinessCriteriaEditor
                scope="studio"
                initialCriteria={studioCriteria?.criteria_json}
                onSave={(criteriaJson: CriteriaJson) => {
                  createCriteria.mutate({
                    scope_type: "studio",
                    criteria_json: criteriaJson,
                  });
                }}
                onCancel={() => setActiveTab("summary")}
              />
            )}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Summary card sub-component
   -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "warning" | "default";
}) {
  const colorMap = {
    success: "var(--color-action-success)",
    warning: "var(--color-action-warning)",
    default: "var(--color-text-muted)",
  };

  return (
    <div className="rounded border border-[var(--color-border-default)] p-4">
      <div
        className="text-2xl font-bold tabular-nums"
        style={{ color: colorMap[variant] }}
      >
        {count}
      </div>
      <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{label}</div>
    </div>
  );
}
