/**
 * Schedule active/paused status indicator (PRD-119).
 *
 * Displays a monospace colored text indicating whether a schedule is active or paused.
 */

interface ScheduleStatusBadgeProps {
  isActive: boolean;
}

export function ScheduleStatusBadge({ isActive }: ScheduleStatusBadgeProps) {
  return (
    <span className={`font-mono text-xs uppercase tracking-wide ${isActive ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)]"}`}>
      {isActive ? "Active" : "Paused"}
    </span>
  );
}
