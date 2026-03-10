/**
 * Card displaying a single cloud instance with status, connection info,
 * cost data, and action buttons.
 */

import { Badge, Checkbox } from "@/components/primitives";
import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Server, Wifi, WifiOff, Clock, DollarSign } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatCents, formatDuration } from "@/lib/format";

import type { EnrichedInstance } from "../types";
import {
  statusVariant,
  comfyuiVariant,
  comfyuiLabel,
  calculateUptimeMs,
} from "./status-helpers";
import { InstanceActions } from "./InstanceActions";

interface InstanceCardProps {
  instance: EnrichedInstance;
  selected: boolean;
  onToggleSelect: (id: number) => void;
}

export function InstanceCard({
  instance,
  selected,
  onToggleSelect,
}: InstanceCardProps) {
  const uptimeMs = calculateUptimeMs(instance.started_at);
  const sessionCostCents = instance.cost_per_hour_cents
    ? Math.round((instance.cost_per_hour_cents * uptimeMs) / 3_600_000)
    : 0;

  return (
    <Card padding="sm" className={selected ? "ring-2 ring-[var(--color-border-focus)]" : ""}>
      <Stack gap={3}>
        {/* Header row: checkbox, name, status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={selected}
              onChange={() => onToggleSelect(instance.id)}
            />
            <Server size={iconSizes.sm} className="shrink-0 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {instance.name ?? instance.external_id}
            </span>
          </div>
          <Badge variant={statusVariant(instance.status_name)} size="sm">
            {instance.status_name}
          </Badge>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <InfoRow label="Provider" value={instance.provider_name} />
          <InfoRow label="GPU" value={instance.gpu_type ?? "N/A"} />
          <InfoRow label="External ID" value={instance.external_id} mono />
          <InfoRow
            label="IP"
            value={
              instance.ip_address
                ? `${instance.ip_address}${instance.ssh_port ? `:${instance.ssh_port}` : ""}`
                : "N/A"
            }
            mono
          />
        </div>

        {/* ComfyUI + Uptime + Cost row */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            {instance.comfyui_status === "connected" ? (
              <Wifi size={12} className="text-[var(--color-action-success)]" />
            ) : (
              <WifiOff size={12} className="text-[var(--color-text-muted)]" />
            )}
            <Badge variant={comfyuiVariant(instance.comfyui_status)} size="sm">
              {comfyuiLabel(instance.comfyui_status)}
            </Badge>
          </div>

          {uptimeMs > 0 && (
            <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
              <Clock size={12} />
              <span>{formatDuration(uptimeMs)}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
            <DollarSign size={12} />
            <span>
              {formatCents(sessionCostCents)} session
              {instance.total_cost_cents != null && (
                <> / {formatCents(instance.total_cost_cents)} total</>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <InstanceActions instance={instance} />
      </Stack>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Tiny helper for info rows
   -------------------------------------------------------------------------- */

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[var(--color-text-muted)]">{label}:</span>
      <span
        className={`text-[var(--color-text-secondary)] truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
