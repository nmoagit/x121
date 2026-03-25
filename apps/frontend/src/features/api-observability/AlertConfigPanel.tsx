/**
 * Alert configuration panel for API observability (PRD-106).
 *
 * Lists alert rules with type/threshold/status and enable/disable toggle.
 * Form creation is delegated to CreateAlertForm.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Badge, Button, Toggle ,  ContextLoader } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { Bell, Plus, Trash2 } from "@/tokens/icons";

import { CreateAlertForm } from "./CreateAlertForm";
import {
  useAlertConfigs,
  useDeleteAlert,
  useUpdateAlert,
} from "./hooks/use-api-observability";
import type { ApiAlertConfig } from "./types";
import {
  ALERT_TYPE_BADGE_VARIANT,
  ALERT_TYPE_LABEL,
  COMPARISON_LABEL,
} from "./types";

/* --------------------------------------------------------------------------
   Sub-component: alert row
   -------------------------------------------------------------------------- */

interface AlertRowProps {
  config: ApiAlertConfig;
}

function AlertRow({ config }: AlertRowProps) {
  const updateMutation = useUpdateAlert();
  const deleteMutation = useDeleteAlert();

  function handleToggle(enabled: boolean) {
    updateMutation.mutate({ id: config.id, enabled });
  }

  function handleDelete() {
    deleteMutation.mutate(config.id);
  }

  return (
    <div className="flex items-center justify-between gap-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {config.name}
          </span>
          <Badge variant={ALERT_TYPE_BADGE_VARIANT[config.alert_type]} size="sm">
            {ALERT_TYPE_LABEL[config.alert_type]}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Threshold: {COMPARISON_LABEL[config.comparison]} {config.threshold_value}
          {" \u00B7 "}Window: {config.window_minutes}m
          {config.last_fired_at && (
            <> {" \u00B7 "}Last fired: {formatDateTime(config.last_fired_at)}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Toggle
          checked={config.enabled}
          onChange={handleToggle}
          size="sm"
          label="Enabled"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          loading={deleteMutation.isPending}
          onClick={handleDelete}
          aria-label={`Delete ${config.name}`}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AlertConfigPanel() {
  const { data: configs, isLoading, error } = useAlertConfigs();
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Bell size={16} className="text-[var(--color-text-muted)]" aria-hidden />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Alert Rules
            </span>
            <Badge variant="default" size="sm">
              {configs.length}
            </Badge>
          </div>
          {!showCreate && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              Add Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        {configs.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center gap-[var(--spacing-2)] py-[var(--spacing-4)]">
            <Bell size={24} className="text-[var(--color-text-muted)]" aria-hidden />
            <p className="text-sm text-[var(--color-text-muted)]">No alert rules configured.</p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              Create First Alert
            </Button>
          </div>
        ) : (
          <div>
            {configs.map((config) => (
              <AlertRow key={config.id} config={config} />
            ))}
          </div>
        )}
        {showCreate && <CreateAlertForm onClose={() => setShowCreate(false)} />}
      </CardBody>
    </Card>
  );
}
