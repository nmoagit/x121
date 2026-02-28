/**
 * Trigger create/edit form (PRD-97).
 *
 * Provides fields for name, event type, entity type, conditions,
 * actions, execution mode, max chain depth, and approval toggle.
 */

import { useCallback, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { parseJsonOrNull } from "@/lib/validation";

import { ConditionBuilder } from "./ConditionBuilder";
import { ExecutionSettings } from "./ExecutionSettings";
import { JsonTextarea } from "./JsonTextarea";
import type { CreateTrigger, ExecutionMode, Trigger } from "./types";

/* -------------------------------------------------------------------------- */

const DEFAULT_ACTIONS = '[\n  { "action": "submit_job", "params": {} }\n]';
const DEFAULT_SCOPE = "{}";
const DEFAULT_CONDITIONS = "{}";
const DEFAULT_MAX_CHAIN_DEPTH = 3;

/* -------------------------------------------------------------------------- */

interface TriggerFormProps {
  trigger?: Trigger;
  projectId?: number;
  onSubmit: (data: CreateTrigger) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function TriggerForm({
  trigger,
  projectId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: TriggerFormProps) {
  const isEdit = trigger != null;

  const [name, setName] = useState(trigger?.name ?? "");
  const [description, setDescription] = useState(trigger?.description ?? "");
  const [eventType, setEventType] = useState(trigger?.event_type ?? "completed");
  const [entityType, setEntityType] = useState(trigger?.entity_type ?? "variant");
  const [scopeJson, setScopeJson] = useState(
    trigger?.scope ? JSON.stringify(trigger.scope, null, 2) : DEFAULT_SCOPE,
  );
  const [conditionsJson, setConditionsJson] = useState(
    trigger?.conditions ? JSON.stringify(trigger.conditions, null, 2) : DEFAULT_CONDITIONS,
  );
  const [actionsJson, setActionsJson] = useState(
    trigger?.actions ? JSON.stringify(trigger.actions, null, 2) : DEFAULT_ACTIONS,
  );
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    (trigger?.execution_mode as ExecutionMode) ?? "sequential",
  );
  const [maxChainDepth, setMaxChainDepth] = useState(
    String(trigger?.max_chain_depth ?? DEFAULT_MAX_CHAIN_DEPTH),
  );
  const [requiresApproval, setRequiresApproval] = useState(trigger?.requires_approval ?? false);
  const [sortOrder, setSortOrder] = useState(String(trigger?.sort_order ?? 0));

  const [scopeError, setScopeError] = useState<string | undefined>();
  const [conditionsError, setConditionsError] = useState<string | undefined>();
  const [actionsError, setActionsError] = useState<string | undefined>();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const parsedScope = parseJsonOrNull<Record<string, unknown>>(scopeJson);
      if (!parsedScope && scopeJson.trim() !== "{}") {
        setScopeError("Invalid JSON");
        return;
      }
      const parsedConditions = parseJsonOrNull<Record<string, unknown>>(conditionsJson);
      if (!parsedConditions && conditionsJson.trim() !== "{}") {
        setConditionsError("Invalid JSON");
        return;
      }
      const parsedActions = parseJsonOrNull<unknown>(actionsJson);
      if (parsedActions == null) {
        setActionsError("Invalid JSON");
        return;
      }
      if (!Array.isArray(parsedActions)) {
        setActionsError("Actions must be a JSON array");
        return;
      }
      setActionsError(undefined);

      const resolvedProjectId = trigger?.project_id ?? projectId;
      if (resolvedProjectId == null) return;

      onSubmit({
        project_id: resolvedProjectId,
        name: name.trim(),
        description: description.trim() || undefined,
        event_type: eventType,
        entity_type: entityType,
        scope: parsedScope ?? undefined,
        conditions: parsedConditions ?? undefined,
        actions: parsedActions as CreateTrigger["actions"],
        execution_mode: executionMode,
        max_chain_depth: parseInt(maxChainDepth, 10) || DEFAULT_MAX_CHAIN_DEPTH,
        requires_approval: requiresApproval,
        sort_order: parseInt(sortOrder, 10) || 0,
      });
    },
    [
      name, description, eventType, entityType, scopeJson,
      conditionsJson, actionsJson, executionMode, maxChainDepth,
      requiresApproval, sortOrder, onSubmit, trigger, projectId,
    ],
  );

  return (
    <form onSubmit={handleSubmit} data-testid="trigger-form">
      <Stack direction="vertical" gap={4}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="On variant completed, submit QA job"
          required
          data-testid="trigger-name"
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          data-testid="trigger-description"
        />

        <ConditionBuilder
          eventType={eventType}
          entityType={entityType}
          scope={scopeJson}
          conditions={conditionsJson}
          onEventTypeChange={setEventType}
          onEntityTypeChange={setEntityType}
          onScopeChange={setScopeJson}
          onConditionsChange={setConditionsJson}
          scopeError={scopeError}
          conditionsError={conditionsError}
          onScopeErrorClear={() => setScopeError(undefined)}
          onConditionsErrorClear={() => setConditionsError(undefined)}
        />

        <JsonTextarea
          label="Actions (JSON array)"
          value={actionsJson}
          onChange={setActionsJson}
          error={actionsError}
          onErrorClear={() => setActionsError(undefined)}
          rows={5}
          data-testid="trigger-actions"
        />

        <ExecutionSettings
          executionMode={executionMode}
          maxChainDepth={maxChainDepth}
          sortOrder={sortOrder}
          requiresApproval={requiresApproval}
          onExecutionModeChange={setExecutionMode}
          onMaxChainDepthChange={setMaxChainDepth}
          onSortOrderChange={setSortOrder}
          onRequiresApprovalChange={setRequiresApproval}
        />

        <Stack direction="horizontal" gap={2} justify="end">
          <Button variant="secondary" size="md" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            type="submit"
            loading={isSubmitting}
            disabled={!name.trim()}
            data-testid="trigger-submit-btn"
          >
            {isEdit ? "Update Trigger" : "Create Trigger"}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
