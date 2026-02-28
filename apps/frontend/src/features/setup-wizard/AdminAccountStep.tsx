/**
 * Admin account creation step for the setup wizard (PRD-105).
 *
 * Username and password form with a password strength indicator.
 * Displays a "skip" message if an admin account already exists.
 */

import { useMemo, useState } from "react";

import { Badge, Button, Input } from "@/components/primitives";

import { StepFeedback } from "./StepFeedback";
import { useExecuteStep, useStepConfig } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS, stepStatusToFeedback } from "./types";
import type { AdminAccountStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Password strength helpers
   -------------------------------------------------------------------------- */

type PasswordStrength = "weak" | "fair" | "strong";

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
};

const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: "bg-[var(--color-action-danger)]",
  fair: "bg-[var(--color-action-warning)]",
  strong: "bg-[var(--color-action-success)]",
};

const STRENGTH_BADGE_VARIANT: Record<PasswordStrength, "danger" | "warning" | "success"> = {
  weak: "danger",
  fair: "warning",
  strong: "success",
};

/** Must match backend MIN_PASSWORD_LENGTH in core/src/setup_wizard.rs. */
const MIN_LENGTH = 12;

function assessStrength(password: string): PasswordStrength {
  if (password.length < MIN_LENGTH) return "weak";

  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;

  if (score >= 4) return "strong";
  if (score >= 2) return "fair";
  return "weak";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AdminAccountStep() {
  const [config, setConfig] = useState<AdminAccountStepConfig>({
    username: "",
    password: "",
  });

  const { data: stepConfig } = useStepConfig("admin_account");
  const executeStep = useExecuteStep();

  const strength = useMemo(() => assessStrength(config.password), [config.password]);
  const adminExists = stepConfig?.completed ?? false;

  function handleCreate() {
    executeStep.mutate({
      stepName: "admin_account",
      config: config as unknown as Record<string, unknown>,
    });
  }

  if (adminExists) {
    return (
      <div data-testid="admin-step" className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {STEP_DESCRIPTIONS.admin_account}
        </p>
        <div className="rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-action-success)]/10 text-[var(--color-action-success)]">
          An admin account already exists. This step can be skipped.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="admin-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {STEP_DESCRIPTIONS.admin_account}
      </p>

      <div className="space-y-3">
        <Input
          label="Username"
          value={config.username}
          onChange={(e) => setConfig((prev) => ({ ...prev, username: e.target.value }))}
          placeholder="admin"
          data-testid="admin-username"
        />

        <Input
          label="Password"
          type="password"
          value={config.password}
          onChange={(e) => setConfig((prev) => ({ ...prev, password: e.target.value }))}
          placeholder="Enter a strong password"
          data-testid="admin-password"
        />

        {/* Password strength indicator */}
        {config.password.length > 0 && (
          <div data-testid="password-strength" className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-1">
                {(["weak", "fair", "strong"] as const).map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-[var(--radius-full)] ${
                      strength === level ||
                      (strength === "strong" && level !== "strong") ||
                      (strength === "fair" && level === "weak")
                        ? STRENGTH_COLOR[strength]
                        : "bg-[var(--color-surface-tertiary)]"
                    }`}
                  />
                ))}
              </div>
              <Badge variant={STRENGTH_BADGE_VARIANT[strength]} size="sm">
                {STRENGTH_LABEL[strength]}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      <StepFeedback
        result={executeStep.data ? stepStatusToFeedback(executeStep.data) : undefined}
        testId="admin-feedback"
      />

      <Button
        variant="primary"
        size="sm"
        loading={executeStep.isPending}
        disabled={!config.username || strength === "weak"}
        onClick={handleCreate}
        data-testid="create-admin-btn"
      >
        Create Admin Account
      </Button>
    </div>
  );
}
