/**
 * Integrations configuration step for the setup wizard (PRD-105).
 *
 * Collapsible sections for email (SMTP), Slack (webhook URL), and
 * backup destination. Each has "Test" and "Skip" buttons. All optional.
 */

import { useState } from "react";

import { Accordion } from "@/components/composite";
import { Button, Input } from "@/components/primitives";

import { StepFeedback } from "./StepFeedback";
import { useExecuteStep, useTestConnection } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS, stepStatusToFeedback } from "./types";
import type { IntegrationsStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function IntegrationsStep() {
  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState("587");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [backupDest, setBackupDest] = useState("");

  const testConnection = useTestConnection();
  const executeStep = useExecuteStep();

  function handleTest(serviceType: string, config: Record<string, unknown>) {
    testConnection.mutate({ service_type: serviceType, config });
  }

  function handleConfigure() {
    const config: IntegrationsStepConfig = {};
    if (emailHost) config.email = { host: emailHost, port: Number(emailPort) };
    if (slackWebhook) config.slack_webhook = slackWebhook;
    if (backupDest) config.backup_destination = backupDest;
    executeStep.mutate({
      stepName: "integrations",
      config: config as unknown as Record<string, unknown>,
    });
  }

  function handleSkip() {
    executeStep.mutate({ stepName: "integrations", config: {} });
  }

  const accordionItems = [
    {
      id: "email",
      title: "Email (SMTP)",
      content: (
        <div className="space-y-3" data-testid="email-section">
          <Input
            label="SMTP Host"
            value={emailHost}
            onChange={(e) => setEmailHost(e.target.value)}
            placeholder="smtp.example.com"
            data-testid="email-host"
          />
          <Input
            label="SMTP Port"
            type="number"
            value={emailPort}
            onChange={(e) => setEmailPort(e.target.value)}
            placeholder="587"
            data-testid="email-port"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={testConnection.isPending}
            onClick={() => handleTest("smtp", { host: emailHost, port: Number(emailPort) })}
            data-testid="test-email-btn"
          >
            Test Email
          </Button>
        </div>
      ),
    },
    {
      id: "slack",
      title: "Slack Notifications",
      content: (
        <div className="space-y-3" data-testid="slack-section">
          <Input
            label="Webhook URL"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            data-testid="slack-webhook"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={testConnection.isPending}
            onClick={() => handleTest("slack", { webhook_url: slackWebhook })}
            data-testid="test-slack-btn"
          >
            Test Slack
          </Button>
        </div>
      ),
    },
    {
      id: "backup",
      title: "Backup Destination",
      content: (
        <div className="space-y-3" data-testid="backup-section">
          <Input
            label="Destination Path"
            value={backupDest}
            onChange={(e) => setBackupDest(e.target.value)}
            placeholder="/backups/x121"
            data-testid="backup-dest"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={testConnection.isPending}
            onClick={() => handleTest("backup", { destination: backupDest })}
            data-testid="test-backup-btn"
          >
            Test Backup
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div data-testid="integrations-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{STEP_DESCRIPTIONS.integrations}</p>

      <Accordion items={accordionItems} allowMultiple />

      <StepFeedback result={testConnection.data} testId="integration-feedback" />
      <StepFeedback
        result={executeStep.data ? stepStatusToFeedback(executeStep.data) : undefined}
        testId="integration-execute-feedback"
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={executeStep.isPending}
          onClick={handleConfigure}
          data-testid="configure-integrations-btn"
        >
          Save Integrations
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          disabled={executeStep.isPending}
          data-testid="skip-integrations-btn"
        >
          Skip All
        </Button>
      </div>
    </div>
  );
}
