/**
 * Retention Policy Settings (PRD-45).
 *
 * Editor for per-category audit log retention policies.
 */

import { useState, useCallback } from "react";

import { Button, Input, Toggle ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_BODY, TERMINAL_DIVIDER, TERMINAL_INPUT } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
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
        <ContextLoader size={64} />
      </div>
    );
  }

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Retention Policies</span>
        <p className="mt-1 text-xs text-[var(--color-text-muted)] font-mono">
          Configure how long audit logs are retained per category.
        </p>
      </div>

      <div className={TERMINAL_BODY}>
        <Stack gap={4}>
          {policies?.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
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
      </div>
    </div>
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
    <div className={cn(TERMINAL_DIVIDER, "pb-3")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium capitalize text-cyan-400 font-mono">
            {policy.log_category}
          </span>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={enabled ? "Enabled" : "Disabled"}
            size="sm"
          />
        </div>
        {hasChanges && (
          <Button
            variant="primary"
            size="xs"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>

      <div className="mt-3 flex gap-4">
        <div className="w-[160px]">
          <Input
            label="Active Retention (days)"
            className={TERMINAL_INPUT}
            type="number"
            min={1}
            value={String(activeDays)}
            onChange={(e) => setActiveDays(Number(e.target.value))}
          />
        </div>
        <div className="w-[160px]">
          <Input
            label="Archive Retention (days)"
            className={TERMINAL_INPUT}
            type="number"
            min={1}
            value={String(archiveDays)}
            onChange={(e) => setArchiveDays(Number(e.target.value))}
          />
        </div>
      </div>

      {showWarning && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-orange-400/30 bg-orange-400/5 p-3">
          <p className="text-xs text-orange-400 font-mono">
            Reducing retention may cause existing logs to be purged earlier than
            originally configured. Are you sure?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" size="xs" onClick={confirmSave}>
              Confirm
            </Button>
            <Button
              variant="secondary"
              size="xs"
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
