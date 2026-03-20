/**
 * BackupDashboard -- main page for Backup & Disaster Recovery (PRD-81).
 *
 * Displays summary stat cards, the backup list, trigger button,
 * schedule manager, and recovery runbook download.
 */

import { useState } from "react";

import { Badge, Button ,  WireframeLoader } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { Plus } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatBytes, formatDateTime } from "@/lib/format";

import { useBackupSummary } from "./hooks/use-backup-recovery";
import { BackupList } from "./BackupList";
import { ScheduleManager } from "./ScheduleManager";
import { TriggerBackupDialog } from "./TriggerBackupDialog";
import { RecoveryRunbookDownload } from "./RecoveryRunbookDownload";

/* --------------------------------------------------------------------------
   Summary cards
   -------------------------------------------------------------------------- */

function SummaryCards() {
  const { data: summary, isPending } = useBackupSummary();

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-6">
        <WireframeLoader size={32} />
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    {
      label: "Total Backups",
      value: String(summary.total_count),
      testId: "stat-total-count",
    },
    {
      label: "Total Size",
      value: formatBytes(summary.total_size_bytes),
      testId: "stat-total-size",
    },
    {
      label: "Last Full Backup",
      value: summary.last_full_at ? formatDateTime(summary.last_full_at) : "--",
      testId: "stat-last-full",
    },
    {
      label: "Last Verified",
      value: summary.last_verified_at ? formatDateTime(summary.last_verified_at) : "--",
      testId: "stat-last-verified",
    },
    {
      label: "Next Scheduled",
      value: summary.next_scheduled_at ? formatDateTime(summary.next_scheduled_at) : "--",
      testId: "stat-next-scheduled",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="backup-summary">
      {cards.map((card) => (
        <Card key={card.testId} elevation="flat" padding="sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[var(--color-text-muted)]">{card.label}</span>
            <span
              className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums"
              data-testid={card.testId}
            >
              {card.value}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function BackupDashboard() {
  const [triggerOpen, setTriggerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6" data-testid="backup-dashboard">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Backup &amp; Recovery
          </h2>
          <Badge variant="info" size="sm">PRD-81</Badge>
        </div>
        <div className="flex items-center gap-2">
          <RecoveryRunbookDownload />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={iconSizes.sm} />}
            onClick={() => setTriggerOpen(true)}
            data-testid="trigger-backup-btn"
          >
            Trigger Backup
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <SummaryCards />

      {/* Backup list */}
      <Card elevation="flat" padding="none">
        <CardHeader className="px-4">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Backups
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <BackupList />
        </CardBody>
      </Card>

      {/* Schedule manager */}
      <ScheduleManager />

      {/* Trigger modal */}
      <TriggerBackupDialog
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
      />
    </div>
  );
}
