/**
 * Database configuration step for the setup wizard (PRD-105).
 *
 * Form fields: host, port, database name, user, password, SSL toggle.
 * "Test Connection" button with real-time feedback.
 * "Run Migrations" button after successful connection test.
 */

import { useState } from "react";

import { Card, CardBody } from "@/components/composite";
import { Button, Input, Toggle } from "@/components/primitives";

import { StepFeedback } from "./StepFeedback";
import { useExecuteStep, useTestConnection } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS, stepStatusToFeedback } from "./types";
import type { DatabaseStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const INITIAL_CONFIG: DatabaseStepConfig = {
  host: "localhost",
  port: 5432,
  name: "",
  user: "",
  password: "",
  ssl: false,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DatabaseStep() {
  const [config, setConfig] = useState<DatabaseStepConfig>(INITIAL_CONFIG);
  const [connectionTested, setConnectionTested] = useState(false);

  const testConnection = useTestConnection();
  const executeStep = useExecuteStep();

  function updateField<K extends keyof DatabaseStepConfig>(field: K, value: DatabaseStepConfig[K]) {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setConnectionTested(false);
  }

  function handleTestConnection() {
    testConnection.mutate(
      {
        service_type: "database",
        config: config as unknown as Record<string, unknown>,
      },
      {
        onSuccess: (result) => {
          if (result.success) setConnectionTested(true);
        },
      },
    );
  }

  function handleRunMigrations() {
    executeStep.mutate({
      stepName: "database",
      config: config as unknown as Record<string, unknown>,
    });
  }

  const isTestingConnection = testConnection.isPending;
  const isRunningMigrations = executeStep.isPending;

  return (
    <div data-testid="database-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{STEP_DESCRIPTIONS.database}</p>

      <Card elevation="flat" padding="md">
        <CardBody className="space-y-3 p-0">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Host"
              value={config.host}
              onChange={(e) => updateField("host", e.target.value)}
              placeholder="localhost"
              data-testid="db-host"
            />
            <Input
              label="Port"
              type="number"
              value={String(config.port)}
              onChange={(e) => updateField("port", Number(e.target.value))}
              placeholder="5432"
              data-testid="db-port"
            />
          </div>

          <Input
            label="Database Name"
            value={config.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="x121_production"
            data-testid="db-name"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="User"
              value={config.user}
              onChange={(e) => updateField("user", e.target.value)}
              placeholder="postgres"
              data-testid="db-user"
            />
            <Input
              label="Password"
              type="password"
              value={config.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="********"
              data-testid="db-password"
            />
          </div>

          <Toggle
            label="Enable SSL"
            checked={config.ssl}
            onChange={(checked) => updateField("ssl", checked)}
          />
        </CardBody>
      </Card>

      {/* Feedback messages */}
      <StepFeedback result={testConnection.data} testId="test-connection-feedback" />
      <StepFeedback
        result={executeStep.data ? stepStatusToFeedback(executeStep.data) : undefined}
        testId="migration-feedback"
      />

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          loading={isTestingConnection}
          onClick={handleTestConnection}
          data-testid="test-connection-btn"
        >
          Test Connection
        </Button>

        <Button
          variant="primary"
          size="sm"
          loading={isRunningMigrations}
          disabled={!connectionTested}
          onClick={handleRunMigrations}
          data-testid="run-migrations-btn"
        >
          Run Migrations
        </Button>
      </div>
    </div>
  );
}
