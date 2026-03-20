/**
 * Activity timeline for a specific shared link (PRD-84).
 *
 * Shows access log entries with summary stats at the top.
 */

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge ,  WireframeLoader } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";

import { useLinkActivity } from "./hooks/use-shared-links";
import type { LinkAccessLogEntry } from "./types";

interface LinkActivityPanelProps {
  linkId: number;
}

export function LinkActivityPanel({ linkId }: LinkActivityPanelProps) {
  const { data: entries, isLoading } = useLinkActivity(linkId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <WireframeLoader size={48} />
      </div>
    );
  }

  const list = entries ?? [];
  const uniqueIps = new Set(
    list.map((e) => e.ip_address).filter(Boolean),
  ).size;
  const feedbackCount = list.filter(
    (e) => e.feedback_text || e.decision,
  ).length;

  return (
    <Stack gap={4}>
      {/* Summary stats */}
      <div className="flex gap-4">
        <StatItem label="Total Views" value={list.length} />
        <StatItem label="Unique IPs" value={uniqueIps} />
        <StatItem label="Feedback" value={feedbackCount} />
      </div>

      {/* Timeline */}
      {list.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
          No activity recorded yet.
        </p>
      ) : (
        <Stack gap={2}>
          {list.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <Card elevation="flat" padding="sm" className="flex-1 text-center">
      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </Card>
  );
}

function ActivityRow({ entry }: { entry: LinkAccessLogEntry }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {entry.viewer_name ?? "Anonymous"}
          </span>
          {entry.decision && (
            <Badge
              variant={entry.decision === "approved" ? "success" : "danger"}
              size="sm"
            >
              {entry.decision === "approved" ? "Approved" : "Rejected"}
            </Badge>
          )}
        </div>
        {entry.feedback_text && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] line-clamp-2">
            {entry.feedback_text}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {formatDateTime(entry.accessed_at)}
          {entry.ip_address && ` \u2014 ${entry.ip_address}`}
        </p>
      </div>
    </div>
  );
}
