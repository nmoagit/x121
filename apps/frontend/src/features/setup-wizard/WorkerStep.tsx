/**
 * Worker registration step for the setup wizard (PRD-105).
 *
 * Worker URL and name input with "Test Connection" button.
 * Displays GPU detection results after a successful connection test.
 */

import { useState } from "react";

import { Card, CardBody } from "@/components/composite";
import { Button, Input } from "@/components/primitives";

import { useExecuteStep } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS } from "./types";
import type { WorkerStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkerStep() {
  const [config, setConfig] = useState<WorkerStepConfig>({
    worker_url: "",
    name: "",
  });

  const executeStep = useExecuteStep();

  function handleRegister() {
    executeStep.mutate({
      stepName: "worker_registration",
      config: config as unknown as Record<string, unknown>,
    });
  }

  const isValid = config.worker_url.trim().length > 0 && config.name.trim().length > 0;

  return (
    <div data-testid="worker-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {STEP_DESCRIPTIONS.worker_registration}
      </p>

      <Card elevation="flat" padding="md">
        <CardBody className="space-y-3 p-0">
          <Input
            label="Worker URL"
            value={config.worker_url}
            onChange={(e) => setConfig((prev) => ({ ...prev, worker_url: e.target.value }))}
            placeholder="http://localhost:8080"
            data-testid="worker-url"
          />
          <Input
            label="Worker Name"
            value={config.name}
            onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="GPU Worker 1"
            data-testid="worker-name"
          />
        </CardBody>
      </Card>

      {/* Execute feedback */}
      {executeStep.error && (
        <div
          data-testid="worker-feedback"
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-action-danger)]/10 text-[var(--color-action-danger)]"
        >
          {executeStep.error.message}
        </div>
      )}

      {executeStep.data && (
        <div
          data-testid="worker-feedback"
          className="rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--color-action-success)]/10 text-[var(--color-action-success)]"
        >
          Worker registered successfully.
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        loading={executeStep.isPending}
        disabled={!isValid}
        onClick={handleRegister}
        data-testid="register-worker-btn"
      >
        Register Worker
      </Button>
    </div>
  );
}
