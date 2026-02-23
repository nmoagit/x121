/**
 * ExecutionLogViewer -- paginated list of hook execution logs (PRD-77).
 *
 * Can show logs for a specific hook or a specific job. Each entry
 * displays timestamp, success/failure badge, duration, and exit code
 * with expandable details.
 */

import { useState } from "react";

import { Badge } from "@/components";
import { formatDateTime } from "@/lib/format";

import { useHookLogs, useJobHookLogs } from "./hooks/use-pipeline-hooks";
import type { HookExecutionLog } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ExecutionLogViewerProps {
  hookId?: number;
  jobId?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ExecutionLogViewer({ hookId, jobId }: ExecutionLogViewerProps) {
  const hookLogsQuery = useHookLogs(hookId ?? 0);
  const jobLogsQuery = useJobHookLogs(jobId ?? 0);

  // Use the appropriate query based on which prop was provided
  const { data: logs = [], isLoading } = hookId ? hookLogsQuery : jobLogsQuery;

  if (isLoading) {
    return (
      <div
        data-testid="logs-loading"
        className="p-4 text-sm text-[var(--color-text-secondary)]"
      >
        Loading execution logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div
        data-testid="logs-empty"
        className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]"
      >
        No execution logs yet.
      </div>
    );
  }

  return (
    <div data-testid="execution-log-viewer" className="space-y-2">
      {logs.map((log) => (
        <LogEntry key={log.id} log={log} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   LogEntry sub-component
   -------------------------------------------------------------------------- */

function LogEntry({ log }: { log: HookExecutionLog }) {
  const [expanded, setExpanded] = useState(false);

  const formattedTime = formatDateTime(log.executed_at);

  return (
    <div
      data-testid={`log-entry-${log.id}`}
      className="rounded border border-[var(--color-border)] p-3"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <Badge variant={log.success ? "success" : "danger"}>
            {log.success ? "Success" : "Failed"}
          </Badge>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {formattedTime}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          {log.duration_ms != null && <span>{log.duration_ms}ms</span>}
          {log.exit_code != null && <span>Exit: {log.exit_code}</span>}
          <span>{expanded ? "Collapse" : "Expand"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
          {log.input_json && (
            <div>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Input:
              </span>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]">
                {JSON.stringify(log.input_json, null, 2)}
              </pre>
            </div>
          )}
          {log.output_text && (
            <div>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Output:
              </span>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]">
                {log.output_text}
              </pre>
            </div>
          )}
          {log.error_message && (
            <div>
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Error:
              </span>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-red-50 p-2 font-mono text-xs text-red-700">
                {log.error_message}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
