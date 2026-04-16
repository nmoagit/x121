/**
 * Validation dashboard component (PRD-113).
 *
 * Project-wide validation overview showing session summaries with
 * re-validate capability.
 */

import { Badge, Button ,  ContextLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { formatDate } from "@/lib/format";
import {
  useIngestSessions,
  useRevalidateProject,
  useValidationSummary,
} from "./hooks/use-avatar-ingest";
import { INGEST_STATUS_LABELS, ingestSessionBadgeVariant } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ValidationDashboardProps {
  projectId: number;
}

export function ValidationDashboard({ projectId }: ValidationDashboardProps) {
  const { data: summary, isLoading: summaryLoading } =
    useValidationSummary(projectId);
  const { data: sessions, isLoading: sessionsLoading } =
    useIngestSessions(projectId);
  const revalidate = useRevalidateProject(projectId);

  const isLoading = summaryLoading || sessionsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  return (
    <Stack gap={6}>
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard
            label="Total Sessions"
            value={summary.total_sessions}
          />
          <SummaryCard
            label="Active"
            value={summary.active_sessions}
            variant="info"
          />
          <SummaryCard
            label="Completed"
            value={summary.completed_sessions}
            variant="success"
          />
          <SummaryCard
            label="Failed"
            value={summary.failed_sessions}
            variant="destructive"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => revalidate.mutate()}
          disabled={revalidate.isPending}
        >
          {revalidate.isPending ? <ContextLoader size={32} /> : "Re-validate All"}
        </Button>
      </div>

      {/* Sessions list */}
      {sessions && sessions.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Session</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Entries</th>
                <th className="px-3 py-2 text-right font-medium">Ready</th>
                <th className="px-3 py-2 text-right font-medium">Errors</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b hover:bg-muted/30">
                  <td className={`px-3 py-2 ${TYPO_DATA}`}>
                    #{session.id}
                  </td>
                  <td className="px-3 py-2">
                    {session.source_name ?? session.source_type}
                  </td>
                  <td className="px-3 py-2">
                    <SessionStatusBadge statusId={session.status_id} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {session.total_entries}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {session.ready_count}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {session.error_count}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(session.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          No ingest sessions found for this project.
        </p>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "destructive" | "info";
}) {
  const colorClass =
    variant === "success"
      ? "text-green-600"
      : variant === "destructive"
        ? "text-red-600"
        : variant === "info"
          ? "text-blue-600"
          : "text-foreground";

  return (
    <Card>
      <div className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${colorClass}`}>{value}</p>
      </div>
    </Card>
  );
}

function SessionStatusBadge({ statusId }: { statusId: number }) {
  const label = INGEST_STATUS_LABELS[statusId] ?? "Unknown";
  return <Badge variant={ingestSessionBadgeVariant(statusId)}>{label}</Badge>;
}
