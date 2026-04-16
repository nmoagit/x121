/**
 * Compliance check results table for a scene (PRD-102).
 *
 * Displays all compliance check results with a summary header showing
 * pass/fail counts and a button to trigger a new check run.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { formatPercent } from "@/lib/format";
import { RefreshCw, iconSizes } from "@/tokens/icons";

import { ComplianceBadge } from "./ComplianceBadge";
import {
  useRunComplianceCheck,
  useSceneChecks,
  useSceneSummary,
} from "./hooks/use-compliance";
import type { ComplianceCheck } from "./types";
import { compliancePassRate } from "./types";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Check row
   -------------------------------------------------------------------------- */

function CheckRow({ check }: { check: ComplianceCheck }) {
  return (
    <tr
      data-testid={`check-row-${check.id}`}
      className="border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        Rule #{check.rule_id}
      </td>
      <td className="px-3 py-2">
        <ComplianceBadge state={check.passed ? "pass" : "fail"} />
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {check.actual_value ?? "-"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {check.expected_value ?? "-"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
        {check.message ?? "-"}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Summary bar
   -------------------------------------------------------------------------- */

function SummaryBar({
  total,
  passed,
  passRate,
}: {
  total: number;
  passed: number;
  passRate: number;
}) {
  const allPassed = passed === total && total > 0;

  return (
    <div
      data-testid="compliance-summary"
      className="flex items-center gap-3 px-3 py-2"
    >
      <Badge variant={allPassed ? "success" : "warning"} size="sm">
        {passed} of {total} passed
      </Badge>
      <span className="text-sm text-[var(--color-text-muted)]">
        Pass rate: {formatPercent(passRate)}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ComplianceCheckListProps {
  sceneId: number;
}

export function ComplianceCheckList({ sceneId }: ComplianceCheckListProps) {
  const { data: checks, isLoading: checksLoading } = useSceneChecks(sceneId);
  const { data: summary } = useSceneSummary(sceneId);
  const runChecks = useRunComplianceCheck(sceneId);

  const list = checks ?? [];

  return (
    <div data-testid="compliance-check-list">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Compliance Checks
          </h3>
          <Button
            variant="primary"
            size="sm"
            onClick={() => runChecks.mutate()}
            loading={runChecks.isPending}
            data-testid="run-checks-btn"
            icon={<RefreshCw size={iconSizes.sm} />}
          >
            Run Checks
          </Button>
        </CardHeader>

        <CardBody className="p-0">
          {summary && (
            <SummaryBar
              total={summary.total}
              passed={summary.passed}
              passRate={compliancePassRate(summary)}
            />
          )}

          {checksLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading checks...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="checks-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No compliance checks run yet.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Rule
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Result
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Actual
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Expected
                  </th>
                  <th className={`px-3 py-2 text-left ${TYPO_INPUT_LABEL}`}>
                    Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
