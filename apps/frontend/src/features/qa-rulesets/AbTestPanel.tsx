/**
 * AbTestPanel — A/B threshold testing panel (PRD-91).
 *
 * Shows current vs proposed threshold comparison and runs an A/B test
 * against historical segment data. Displays pass/warn/fail breakdown.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, Spinner } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import {
  useAbTestThresholds,
  useEffectiveThresholds,
} from "./hooks/use-qa-rulesets";
import { ThresholdSlider } from "./ThresholdSlider";
import type { AbTestResult, MetricThreshold } from "./types";
import { EMPTY_THRESHOLD, metricLabel, SECTION_HEADING_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AbTestPanelProps {
  sceneTypeId: number;
}

/* --------------------------------------------------------------------------
   Results table sub-component
   -------------------------------------------------------------------------- */

function ResultsTable({ result }: { result: AbTestResult }) {
  return (
    <div data-testid="ab-test-results" className="space-y-4">
      {/* Summary row */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-default)]">
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                Group
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-action-success)] uppercase">
                Pass
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-action-warning)] uppercase">
                Warn
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-action-danger)] uppercase">
                Fail
              </th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="ab-row-current">
              <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">
                Current
              </td>
              <td className="px-3 py-2">{result.current_pass}</td>
              <td className="px-3 py-2">{result.current_warn}</td>
              <td className="px-3 py-2">{result.current_fail}</td>
            </tr>
            <tr data-testid="ab-row-proposed">
              <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">
                Proposed
              </td>
              <td className="px-3 py-2">{result.proposed_pass}</td>
              <td className="px-3 py-2">{result.proposed_warn}</td>
              <td className="px-3 py-2">{result.proposed_fail}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Tested against {result.total_segments} segments
      </p>

      {/* Per-metric breakdown */}
      {result.per_metric.length > 0 && (
        <div data-testid="ab-per-metric" className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Metric
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase" colSpan={3}>
                  Current
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase" colSpan={3}>
                  Proposed
                </th>
              </tr>
            </thead>
            <tbody>
              {result.per_metric.map((m) => (
                <tr
                  key={m.check_type}
                  data-testid={`ab-metric-${m.check_type}`}
                >
                  <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">
                    {metricLabel(m.check_type)}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-success)]">
                    {m.current_pass}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-warning)]">
                    {m.current_warn}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-danger)]">
                    {m.current_fail}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-success)]">
                    {m.proposed_pass}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-warning)]">
                    {m.proposed_warn}
                  </td>
                  <td className="px-3 py-1 text-[var(--color-action-danger)]">
                    {m.proposed_fail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function AbTestPanel({ sceneTypeId }: AbTestPanelProps) {
  const { data: effective, isPending: effectivePending } =
    useEffectiveThresholds(sceneTypeId);
  const abTestMutation = useAbTestThresholds();

  const [proposed, setProposed] = useState<Record<string, MetricThreshold>>(
    {},
  );

  // Seed proposed thresholds from effective when first loaded.
  const metricNames = useMemo(() => {
    if (!effective) return [];
    return Object.keys(effective).sort();
  }, [effective]);

  const handleThresholdChange = useCallback(
    (metric: string, threshold: MetricThreshold) => {
      setProposed((prev) => ({ ...prev, [metric]: threshold }));
    },
    [],
  );

  const handleRunTest = useCallback(() => {
    if (!effective) return;

    // Merge effective with any proposed overrides.
    const merged: Record<string, MetricThreshold> = { ...effective };
    for (const [key, val] of Object.entries(proposed)) {
      merged[key] = val;
    }

    abTestMutation.mutate({
      scene_type_id: sceneTypeId,
      proposed_thresholds: merged,
    });
  }, [sceneTypeId, effective, proposed, abTestMutation]);

  if (effectivePending) {
    return (
      <div data-testid="ab-test-loading" className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div data-testid="ab-test-panel">
      <Card elevation="flat">
        <CardHeader>
          <h3 className={SECTION_HEADING_CLASSES}>
            A/B Threshold Test
          </h3>
        </CardHeader>

        <CardBody className="space-y-4">
          {/* Proposed threshold editors */}
          <div data-testid="ab-proposed-thresholds" className="space-y-1">
            {metricNames.map((metric) => (
              <ThresholdSlider
                key={metric}
                metricName={metric}
                label={metricLabel(metric)}
                threshold={
                  proposed[metric] ??
                  (effective?.[metric] as MetricThreshold) ?? EMPTY_THRESHOLD
                }
                onChange={(t) => handleThresholdChange(metric, t)}
              />
            ))}
          </div>

          {/* Run button */}
          <Button
            data-testid="ab-test-run-btn"
            onClick={handleRunTest}
            loading={abTestMutation.isPending}
          >
            Run A/B Test
          </Button>

          {/* Results */}
          {abTestMutation.data && <ResultsTable result={abTestMutation.data} />}
        </CardBody>
      </Card>
    </div>
  );
}
