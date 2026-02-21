/**
 * Retention Policy Settings (PRD-45).
 *
 * Editor for per-category audit log retention policies.
 */

import { useState, useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Button, Input, Spinner, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useRetentionPolicies,
  useUpdateRetentionPolicy,
} from "./hooks/use-audit";
import type { AuditRetentionPolicy } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RetentionSettings() {
  const { data: policies, isLoading } = useRetentionPolicies();
  const updateMutation = useUpdateRetentionPolicy();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Card padding="lg">
      <Stack gap={4}>
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Retention Policies
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Configure how long audit logs are retained per category.
          </p>
        </div>

        {policies?.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">
            No retention policies found.
          </p>
        )}

        <div className="space-y-3">
          {policies?.map((policy) => (
            <RetentionPolicyRow
              key={policy.id}
              policy={policy}
              onSave={(active, archive, enabled) => {
                updateMutation.mutate({
                  category: policy.log_category,
                  data: {
                    active_retention_days: active,
                    archive_retention_days: archive,
                    enabled,
                  },
                });
              }}
              isSaving={updateMutation.isPending}
            />
          ))}
        </div>
      </Stack>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Row sub-component
   -------------------------------------------------------------------------- */

function RetentionPolicyRow({
  policy,
  onSave,
  isSaving,
}: {
  policy: AuditRetentionPolicy;
  onSave: (active: number, archive: number, enabled: boolean) => void;
  isSaving: boolean;
}) {
  const [activeDays, setActiveDays] = useState(policy.active_retention_days);
  const [archiveDays, setArchiveDays] = useState(
    policy.archive_retention_days,
  );
  const [enabled, setEnabled] = useState(policy.enabled);
  const [showWarning, setShowWarning] = useState(false);

  const hasChanges =
    activeDays !== policy.active_retention_days ||
    archiveDays !== policy.archive_retention_days ||
    enabled !== policy.enabled;

  const handleSave = useCallback(() => {
    // Warn when reducing retention.
    if (
      activeDays < policy.active_retention_days ||
      archiveDays < policy.archive_retention_days
    ) {
      setShowWarning(true);
      return;
    }
    onSave(activeDays, archiveDays, enabled);
  }, [activeDays, archiveDays, enabled, policy, onSave]);

  const confirmSave = useCallback(() => {
    setShowWarning(false);
    onSave(activeDays, archiveDays, enabled);
  }, [activeDays, archiveDays, enabled, onSave]);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium capitalize text-[var(--color-text-primary)]">
            {policy.log_category}
          </span>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={enabled ? "Enabled" : "Disabled"}
          />
        </div>
        {hasChanges && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>

      <div className="mt-3 flex gap-4">
        <div className="w-[160px]">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Active Retention (days)
          </label>
          <Input
            type="number"
            min={1}
            value={String(activeDays)}
            onChange={(e) => setActiveDays(Number(e.target.value))}
          />
        </div>
        <div className="w-[160px]">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Archive Retention (days)
          </label>
          <Input
            type="number"
            min={1}
            value={String(archiveDays)}
            onChange={(e) => setArchiveDays(Number(e.target.value))}
          />
        </div>
      </div>

      {showWarning && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-status-warning)] bg-yellow-50 p-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Reducing retention may cause existing logs to be purged earlier than
            originally configured. Are you sure?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" size="sm" onClick={confirmSave}>
              Confirm
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowWarning(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
