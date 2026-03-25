/**
 * GPU power management dashboard (PRD-87).
 *
 * Displays fleet power summary stats, a grid of worker power cards,
 * fleet settings, and energy consumption data.
 */

import { useMemo, useState } from "react";

import { StatBadge ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { daysAgoDate } from "@/lib/format";
import { AlertCircle, Power } from "@/tokens/icons";

import { ConsumptionSummary } from "./ConsumptionSummary";
import { FleetSettingsPanel } from "./FleetSettingsPanel";
import {
  useFleetPowerSettings,
  useFleetPowerStatus,
  useUpdateFleetSettings,
} from "./hooks/use-gpu-power";
import type { ConsumptionParams, PowerState } from "./types";
import { WorkerPowerCard } from "./WorkerPowerCard";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PowerDashboard() {
  useSetPageTitle("GPU Scheduling", "Monitor power states, manage schedules, and track energy consumption.");
  const { data: statuses, isLoading, error } = useFleetPowerStatus();
  const { data: fleetSettings } = useFleetPowerSettings();
  const updateFleetSettings = useUpdateFleetSettings();

  const [consumptionParams] = useState<ConsumptionParams>({
    from: daysAgoDate(7),
    to: daysAgoDate(0),
  });

  /** Derive fleet-level power state counts from worker statuses. */
  const powerCounts = useMemo(() => {
    const counts: Record<PowerState, number> = {
      on: 0,
      idle: 0,
      shutting_down: 0,
      sleeping: 0,
      waking: 0,
    };
    statuses?.forEach((s) => {
      counts[s.power_state] = (counts[s.power_state] ?? 0) + 1;
    });
    return counts;
  }, [statuses]);

  return (
    <div className="overflow-auto">
      <Stack gap={6}>
        {/* Fleet power state stats */}
        {statuses && (
          <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-3 lg:grid-cols-5">
            <StatBadge label="On" value={powerCounts.on} />
            <StatBadge label="Idle" value={powerCounts.idle} />
            <StatBadge label="Sleeping" value={powerCounts.sleeping} />
            <StatBadge label="Shutting Down" value={powerCounts.shutting_down} />
            <StatBadge label="Waking" value={powerCounts.waking} />
          </div>
        )}

        {/* Worker power grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-[var(--spacing-8)]">
            <ContextLoader size={64} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
            <AlertCircle
              size={24}
              className="text-[var(--color-action-danger)]"
              aria-hidden
            />
            <p className="text-sm text-[var(--color-text-muted)]">
              Failed to load power statuses.
            </p>
          </div>
        ) : statuses && statuses.length > 0 ? (
          <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {statuses.map((s) => (
              <WorkerPowerCard key={s.worker_id} status={s} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
            <Power
              size={32}
              className="text-[var(--color-text-muted)]"
              aria-hidden
            />
            <p className="text-sm text-[var(--color-text-muted)]">
              No workers with power data available.
            </p>
          </div>
        )}

        {/* Fleet settings */}
        {fleetSettings && (
          <FleetSettingsPanel
            idleTimeout={fleetSettings.default_idle_timeout_minutes}
            defaultWakeMethod={fleetSettings.default_wake_method}
            onSave={(settings) => updateFleetSettings.mutate(settings)}
            isSaving={updateFleetSettings.isPending}
          />
        )}

        {/* Consumption summary */}
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-[var(--spacing-3)]">
            Energy Consumption (Last 7 Days)
          </h2>
          <ConsumptionSummary params={consumptionParams} />
        </div>
      </Stack>
    </div>
  );
}
