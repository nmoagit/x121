/**
 * Alert configuration panel for system health (PRD-80).
 *
 * Lists alert configurations per service with editing support for
 * escalation delay, webhook URL, notification channels, and enabled toggle.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Button, Input, Toggle ,  ContextLoader } from "@/components/primitives";
import { Bell, Save } from "@/tokens/icons";

import { useAlertConfigs, useUpdateAlertConfig } from "./hooks/use-system-health";
import type { HealthAlertConfig, UpdateAlertConfigInput } from "./types";
import { SERVICE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Sub-component: Single alert config row
   -------------------------------------------------------------------------- */

interface AlertConfigRowProps {
  config: HealthAlertConfig;
}

function AlertConfigRow({ config }: AlertConfigRowProps) {
  const [editing, setEditing] = useState(false);
  const [delay, setDelay] = useState(String(config.escalation_delay_seconds));
  const [webhook, setWebhook] = useState(config.webhook_url ?? "");
  const [channels, setChannels] = useState(
    config.notification_channels_json?.join(", ") ?? "",
  );
  const [enabled, setEnabled] = useState(config.enabled);

  const updateMutation = useUpdateAlertConfig(config.service_name);

  const label = SERVICE_LABELS[config.service_name] ?? config.service_name;

  function handleSave() {
    const input: UpdateAlertConfigInput = {
      escalation_delay_seconds: Number(delay) || config.escalation_delay_seconds,
      webhook_url: webhook.trim() || null,
      notification_channels_json: channels
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      enabled,
    };
    updateMutation.mutate(input, {
      onSuccess: () => setEditing(false),
    });
  }

  return (
    <Card elevation="flat" padding="md">
      {/* Header row: service label + toggle */}
      <div className="flex items-center justify-between gap-[var(--spacing-2)]">
        <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
          <Bell size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {label}
          </span>
        </div>
        <Toggle
          checked={enabled}
          onChange={(val) => {
            setEnabled(val);
            if (!editing) setEditing(true);
          }}
          size="sm"
          label="Enabled"
        />
      </div>

      {/* Details (read-only unless editing) */}
      {!editing ? (
        <div className="mt-[var(--spacing-2)] space-y-[var(--spacing-1)] text-xs text-[var(--color-text-muted)]">
          <p>Escalation delay: {config.escalation_delay_seconds}s</p>
          <p>Webhook: {config.webhook_url ?? "(none)"}</p>
          <p>Channels: {config.notification_channels_json?.join(", ") || "(none)"}</p>
          <div className="mt-[var(--spacing-2)]">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-[var(--spacing-3)] space-y-[var(--spacing-3)]">
          <Input
            label="Escalation Delay (seconds)"
            type="number"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
          />
          <Input
            label="Webhook URL"
            type="url"
            value={webhook}
            placeholder="https://hooks.example.com/..."
            onChange={(e) => setWebhook(e.target.value)}
          />
          <Input
            label="Notification Channels (comma-separated)"
            value={channels}
            placeholder="email, slack, pagerduty"
            onChange={(e) => setChannels(e.target.value)}
          />
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Button
              variant="primary"
              size="sm"
              icon={<Save size={14} />}
              loading={updateMutation.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setDelay(String(config.escalation_delay_seconds));
                setWebhook(config.webhook_url ?? "");
                setChannels(config.notification_channels_json?.join(", ") ?? "");
                setEnabled(config.enabled);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AlertConfigPanel() {
  const { data: configs, isLoading, error } = useAlertConfigs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-6)]">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (error || !configs) {
    return (
      <p className="py-[var(--spacing-4)] text-center text-sm text-[var(--color-text-muted)]">
        Failed to load alert configurations.
      </p>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
        <Bell size={32} className="text-[var(--color-text-muted)]" aria-hidden />
        <p className="text-sm text-[var(--color-text-muted)]">
          No alert configurations found.
        </p>
      </div>
    );
  }

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Bell size={16} className="text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Alert Configuration
          </span>
        </div>
      </CardHeader>
      <CardBody className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="space-y-[var(--spacing-3)]">
          {configs.map((config) => (
            <AlertConfigRow key={config.id} config={config} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
