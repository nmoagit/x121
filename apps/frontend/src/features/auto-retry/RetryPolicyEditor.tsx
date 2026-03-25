import { ContextLoader } from "@/components/primitives";
/**
 * Retry policy editor (PRD-71).
 *
 * Allows configuring the auto-retry policy for a scene type:
 * enable/disable, max attempts, trigger checks, seed variation,
 * and CFG jitter range.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Input } from "@/components/primitives/Input";
import { Toggle } from "@/components/primitives/Toggle";
import { cn } from "@/lib/cn";

import { useRetryPolicy, useUpdateRetryPolicy } from "./hooks/use-auto-retry";
import type { RetryPolicy } from "./types";
import {
  CFG_JITTER_STEP,
  MAX_CFG_JITTER,
  MAX_MAX_ATTEMPTS,
  MIN_CFG_JITTER,
  MIN_MAX_ATTEMPTS,
  TRIGGER_CHECK_OPTIONS,
} from "./types";

interface RetryPolicyEditorProps {
  sceneTypeId: number;
}

function policiesEqual(a: RetryPolicy, b: RetryPolicy): boolean {
  return (
    a.enabled === b.enabled &&
    a.max_attempts === b.max_attempts &&
    a.seed_variation === b.seed_variation &&
    a.cfg_jitter === b.cfg_jitter &&
    a.trigger_checks.length === b.trigger_checks.length &&
    a.trigger_checks.every((check) => b.trigger_checks.includes(check))
  );
}

export function RetryPolicyEditor({ sceneTypeId }: RetryPolicyEditorProps) {
  const { data: policy, isPending } = useRetryPolicy(sceneTypeId);
  const updateMutation = useUpdateRetryPolicy();

  const [draft, setDraft] = useState<RetryPolicy>({
    enabled: false,
    max_attempts: 3,
    trigger_checks: [],
    seed_variation: true,
    cfg_jitter: 0,
  });

  // Sync draft when server data arrives
  useEffect(() => {
    if (policy) {
      setDraft(policy);
    }
  }, [policy]);

  const isDirty = policy ? !policiesEqual(draft, policy) : false;
  const disabledClass = !draft.enabled ? "opacity-50 pointer-events-none" : undefined;

  const handleToggleCheck = useCallback((checkValue: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      trigger_checks: checked
        ? [...prev.trigger_checks, checkValue]
        : prev.trigger_checks.filter((c) => c !== checkValue),
    }));
  }, []);

  const handleMaxAttemptsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(MAX_MAX_ATTEMPTS, Math.max(MIN_MAX_ATTEMPTS, Number(e.target.value)));
    setDraft((prev) => ({ ...prev, max_attempts: value }));
  }, []);

  const handleCfgJitterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(MAX_CFG_JITTER, Math.max(MIN_CFG_JITTER, Number(e.target.value)));
    setDraft((prev) => ({ ...prev, cfg_jitter: Math.round(value * 10) / 10 }));
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate({ sceneTypeId, data: draft });
  }, [sceneTypeId, draft, updateMutation]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="retry-policy-loading">
        <ContextLoader size={48} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="retry-policy-editor">
      {/* Enable / disable */}
      <div data-testid="retry-policy-enabled">
        <Toggle
          checked={draft.enabled}
          onChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
          label="Enable Auto-Retry"
        />
      </div>

      {/* Max attempts */}
      <div className={cn(disabledClass)}>
        <Input
          label="Max Attempts"
          type="number"
          min={MIN_MAX_ATTEMPTS}
          max={MAX_MAX_ATTEMPTS}
          value={draft.max_attempts}
          onChange={handleMaxAttemptsChange}
          helperText={`Range: ${MIN_MAX_ATTEMPTS}-${MAX_MAX_ATTEMPTS}`}
          data-testid="retry-policy-max-attempts"
        />
      </div>

      {/* Trigger checks */}
      <fieldset
        className={cn("flex flex-col gap-2", disabledClass)}
        data-testid="retry-policy-trigger-checks"
      >
        <legend className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">
          QA Trigger Checks
        </legend>
        {TRIGGER_CHECK_OPTIONS.map((option) => (
          <Checkbox
            key={option.value}
            checked={draft.trigger_checks.includes(option.value)}
            onChange={(checked) => handleToggleCheck(option.value, checked)}
            label={option.label}
          />
        ))}
      </fieldset>

      {/* Seed variation */}
      <div className={cn(disabledClass)} data-testid="retry-policy-seed-variation">
        <Toggle
          checked={draft.seed_variation}
          onChange={(checked) => setDraft((prev) => ({ ...prev, seed_variation: checked }))}
          label="Seed Variation"
        />
      </div>

      {/* CFG jitter */}
      <div className={cn(disabledClass)}>
        <Input
          label="CFG Jitter"
          type="number"
          min={MIN_CFG_JITTER}
          max={MAX_CFG_JITTER}
          step={CFG_JITTER_STEP}
          value={draft.cfg_jitter}
          onChange={handleCfgJitterChange}
          helperText={`Range: ${MIN_CFG_JITTER}-${MAX_CFG_JITTER}`}
          data-testid="retry-policy-cfg-jitter"
        />
      </div>

      {/* Save */}
      <div>
        <Button
          variant="primary"
          size="md"
          disabled={!isDirty}
          loading={updateMutation.isPending}
          onClick={handleSave}
          data-testid="retry-policy-save-btn"
        >
          Save Policy
        </Button>
      </div>
    </div>
  );
}
