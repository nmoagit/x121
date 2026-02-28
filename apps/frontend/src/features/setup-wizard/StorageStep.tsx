/**
 * Storage configuration step for the setup wizard (PRD-105).
 *
 * Provides path input for root storage directory and a "Verify" button
 * that checks available disk space against a configurable minimum.
 */

import { useState } from "react";

import { Card, CardBody } from "@/components/composite";
import { Button, Input } from "@/components/primitives";

import { StepFeedback } from "./StepFeedback";
import { useExecuteStep, useTestConnection } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS } from "./types";
import type { StorageStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_MIN_SPACE_GB = 50;

const INITIAL_CONFIG: StorageStepConfig = {
  root_path: "/data/x121",
  min_space_gb: DEFAULT_MIN_SPACE_GB,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StorageStep() {
  const [config, setConfig] = useState<StorageStepConfig>(INITIAL_CONFIG);

  const testConnection = useTestConnection();
  const executeStep = useExecuteStep();

  function handleVerify() {
    testConnection.mutate({
      service_type: "storage",
      config: config as unknown as Record<string, unknown>,
    });
  }

  function handleConfigure() {
    executeStep.mutate({
      stepName: "storage",
      config: config as unknown as Record<string, unknown>,
    });
  }

  const verifyResult = testConnection.data;
  const isVerified = verifyResult?.success ?? false;

  return (
    <div data-testid="storage-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{STEP_DESCRIPTIONS.storage}</p>

      <Card elevation="flat" padding="md">
        <CardBody className="space-y-3 p-0">
          <Input
            label="Root Storage Path"
            value={config.root_path}
            onChange={(e) => setConfig((prev) => ({ ...prev, root_path: e.target.value }))}
            placeholder="/data/x121"
            data-testid="storage-path"
          />

          <Input
            label="Minimum Required Space (GB)"
            type="number"
            value={String(config.min_space_gb)}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                min_space_gb: Number(e.target.value),
              }))
            }
            placeholder="50"
            data-testid="storage-min-space"
          />
        </CardBody>
      </Card>

      {/* Disk space feedback */}
      <StepFeedback result={verifyResult} testId="storage-feedback" />

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          loading={testConnection.isPending}
          onClick={handleVerify}
          data-testid="verify-storage-btn"
        >
          Verify
        </Button>

        <Button
          variant="primary"
          size="sm"
          loading={executeStep.isPending}
          disabled={!isVerified}
          onClick={handleConfigure}
          data-testid="configure-storage-btn"
        >
          Configure
        </Button>
      </div>
    </div>
  );
}
