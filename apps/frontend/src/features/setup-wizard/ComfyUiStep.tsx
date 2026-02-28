/**
 * ComfyUI instance configuration step for the setup wizard (PRD-105).
 *
 * Allows registering one or more ComfyUI instances with URL and name.
 * Each instance has a "Test Connection" button. Users can add more
 * instances with the "Add Another Instance" button.
 */

import { useState } from "react";

import { Card, CardBody } from "@/components/composite";
import { Button, Input } from "@/components/primitives";
import { Plus, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { StepFeedback } from "./StepFeedback";
import { useExecuteStep, useTestConnection } from "./hooks/use-setup-wizard";
import { STEP_DESCRIPTIONS } from "./types";
import type { ComfyUiInstance, ComfyUiStepConfig } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const EMPTY_INSTANCE: ComfyUiInstance = { url: "", name: "" };

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ComfyUiStep() {
  const [instances, setInstances] = useState<ComfyUiInstance[]>([{ ...EMPTY_INSTANCE }]);
  const [testedIndexes, setTestedIndexes] = useState<Set<number>>(new Set());

  const testConnection = useTestConnection();
  const executeStep = useExecuteStep();

  function updateInstance(index: number, field: keyof ComfyUiInstance, value: string) {
    setInstances((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (!existing) return prev;
      next[index] = { ...existing, [field]: value };
      return next;
    });
    setTestedIndexes((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }

  function addInstance() {
    setInstances((prev) => [...prev, { ...EMPTY_INSTANCE }]);
  }

  function removeInstance(index: number) {
    setInstances((prev) => prev.filter((_, i) => i !== index));
    setTestedIndexes((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  }

  function handleTestInstance(index: number) {
    const instance = instances[index];
    if (!instance) return;
    testConnection.mutate(
      {
        service_type: "comfyui",
        config: { url: instance.url, name: instance.name },
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            setTestedIndexes((prev) => new Set(prev).add(index));
          }
        },
      },
    );
  }

  function handleConfigure() {
    const config: ComfyUiStepConfig = { instances };
    executeStep.mutate({
      stepName: "comfyui",
      config: config as unknown as Record<string, unknown>,
    });
  }

  const allTested = instances.length > 0 && instances.every((_, i) => testedIndexes.has(i));

  return (
    <div data-testid="comfyui-step" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">{STEP_DESCRIPTIONS.comfyui}</p>

      {instances.map((instance, index) => (
        <Card key={index} elevation="flat" padding="md">
          <CardBody className="space-y-3 p-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Instance {index + 1}
              </span>
              {instances.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeInstance(index)}
                  data-testid={`remove-instance-${index}`}
                >
                  <Trash2 size={iconSizes.sm} />
                </Button>
              )}
            </div>

            <Input
              label="URL"
              value={instance.url}
              onChange={(e) => updateInstance(index, "url", e.target.value)}
              placeholder="http://localhost:8188"
              data-testid={`comfyui-url-${index}`}
            />
            <Input
              label="Name"
              value={instance.name}
              onChange={(e) => updateInstance(index, "name", e.target.value)}
              placeholder="GPU Worker 1"
              data-testid={`comfyui-name-${index}`}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={testConnection.isPending}
                onClick={() => handleTestInstance(index)}
                data-testid={`test-comfyui-${index}`}
              >
                Test Connection
              </Button>
              {testedIndexes.has(index) && (
                <span className="text-xs text-[var(--color-action-success)]">Connected</span>
              )}
            </div>
          </CardBody>
        </Card>
      ))}

      {/* Feedback */}
      {testConnection.data && !testConnection.data.success && (
        <StepFeedback result={testConnection.data} testId="comfyui-feedback" />
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={iconSizes.sm} />}
          onClick={addInstance}
          data-testid="add-instance-btn"
        >
          Add Another Instance
        </Button>

        <Button
          variant="primary"
          size="sm"
          loading={executeStep.isPending}
          disabled={!allTested}
          onClick={handleConfigure}
          data-testid="configure-comfyui-btn"
        >
          Configure
        </Button>
      </div>
    </div>
  );
}
