/**
 * Active sessions table with force-terminate action (PRD-98).
 *
 * Auto-refreshes every 10 seconds via the useActiveSessions hook.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite/Card";
import { Modal } from "@/components/composite/Modal";
import { Button, Spinner } from "@/components/primitives";
import { formatDateTime, formatDuration } from "@/lib/format";

import { useActiveSessions, useForceTerminate } from "./hooks/use-session-management";
import { SessionStatusBadge } from "./SessionStatusBadge";
import type { ActiveSession } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function sessionDurationMs(session: ActiveSession): number {
  const start = new Date(session.started_at).getTime();
  const end = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  return end - start;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActiveSessionsTable() {
  const { data: page, isLoading, error } = useActiveSessions();
  const sessions = page?.items;
  const terminateMutation = useForceTerminate();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const handleTerminate = useCallback(() => {
    if (confirmId === null) return;
    terminateMutation.mutate(confirmId, {
      onSettled: () => setConfirmId(null),
    });
  }, [confirmId, terminateMutation]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load active sessions.
      </p>
    );
  }

  return (
    <>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <Th>User</Th>
                <Th>Status</Th>
                <Th>IP Address</Th>
                <Th>Current View</Th>
                <Th>Last Activity</Th>
                <Th>Duration</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(!sessions || sessions.length === 0) && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No active sessions.
                  </td>
                </tr>
              )}
              {sessions?.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--color-border-default)] transition-colors hover:bg-[var(--color-surface-secondary)]"
                >
                  <Td>{`User #${s.user_id}`}</Td>
                  <Td>
                    <SessionStatusBadge status={s.status} />
                  </Td>
                  <Td>{s.ip_address ?? "-"}</Td>
                  <Td>{s.current_view ?? "-"}</Td>
                  <Td>{formatDateTime(s.last_activity)}</Td>
                  <Td>{formatDuration(sessionDurationMs(s))}</Td>
                  <Td>
                    {s.status !== "terminated" && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmId(s.id)}
                      >
                        Terminate
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirm terminate modal */}
      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="Terminate Session"
        size="sm"
      >
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          Are you sure you want to force-terminate this session? The user will be
          logged out immediately.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={terminateMutation.isPending}
            onClick={handleTerminate}
          >
            Terminate
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* --------------------------------------------------------------------------
   Table cell primitives (private)
   -------------------------------------------------------------------------- */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-muted)]">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
      {children}
    </td>
  );
}
