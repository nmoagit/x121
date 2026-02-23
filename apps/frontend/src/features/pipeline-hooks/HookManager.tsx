/**
 * HookManager -- lists and manages pipeline hooks for a given scope (PRD-77).
 *
 * Displays hooks grouped by hook_point with create/edit form, toggle,
 * test, and delete capabilities.
 */

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  Toggle,
} from "@/components";

import {
  useCreateHook,
  useDeleteHook,
  useHooks,
  useTestHook,
  useToggleHook,
} from "./hooks/use-pipeline-hooks";
import type {
  CreateHookRequest,
  FailureMode,
  Hook,
  HookPoint,
  HookType,
  ScopeType,
} from "./types";
import {
  FAILURE_MODE_LABELS,
  HOOK_POINT_LABELS,
  failureModeVariant,
  hookTypeVariant,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const HOOK_POINTS: HookPoint[] = [
  "post_variant",
  "pre_segment",
  "post_segment",
  "pre_concatenation",
  "post_delivery",
];

const HOOK_TYPES: HookType[] = ["shell", "python", "webhook"];
const FAILURE_MODES: FailureMode[] = ["block", "warn", "ignore"];

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface HookManagerProps {
  scopeType?: ScopeType;
  scopeId?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HookManager({ scopeType, scopeId }: HookManagerProps) {
  const { data: hooks = [], isLoading } = useHooks(
    scopeType
      ? { scope_type: scopeType, scope_id: scopeId }
      : undefined,
  );

  const createHook = useCreateHook();
  const deleteHook = useDeleteHook();
  const toggleHook = useToggleHook();
  const testHook = useTestHook();

  const [showForm, setShowForm] = useState(false);

  // Group hooks by hook_point
  const grouped = HOOK_POINTS.reduce<Record<string, Hook[]>>((acc, point) => {
    acc[point] = hooks.filter((h) => h.hook_point === point);
    return acc;
  }, {});

  const handleToggle = (hook: Hook) => {
    toggleHook.mutate({ id: hook.id, enabled: !hook.enabled });
  };

  const handleDelete = (id: number) => {
    deleteHook.mutate(id);
  };

  const handleTest = (id: number) => {
    testHook.mutate({ id });
  };

  const handleCreate = (input: CreateHookRequest) => {
    createHook.mutate(input, {
      onSuccess: () => setShowForm(false),
    });
  };

  if (isLoading) {
    return (
      <div data-testid="hooks-loading" className="p-4 text-sm text-[var(--color-text-secondary)]">
        Loading hooks...
      </div>
    );
  }

  return (
    <div data-testid="hook-manager" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Pipeline Hooks
        </h2>
        <Button
          data-testid="add-hook-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "Add Hook"}
        </Button>
      </div>

      {showForm && (
        <CreateHookForm
          scopeType={scopeType}
          scopeId={scopeId}
          onSubmit={handleCreate}
          isSubmitting={createHook.isPending}
        />
      )}

      {hooks.length === 0 && !showForm && (
        <div
          data-testid="empty-state"
          className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]"
        >
          No hooks configured. Add one to get started.
        </div>
      )}

      {HOOK_POINTS.map((point) => {
        const pointHooks = grouped[point];
        if (!pointHooks || pointHooks.length === 0) return null;

        return (
          <Card key={point}>
            <CardHeader>
              <h3
                data-testid={`hook-group-${point}`}
                className="text-sm font-medium text-[var(--color-text-primary)]"
              >
                {HOOK_POINT_LABELS[point]}
              </h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {pointHooks.map((hook) => (
                  <div
                    key={hook.id}
                    data-testid={`hook-row-${hook.id}`}
                    className="flex items-center justify-between gap-4 rounded border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span data-testid={`toggle-${hook.id}`}>
                        <Toggle
                          checked={hook.enabled}
                          onChange={() => handleToggle(hook)}
                        />
                      </span>
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {hook.name}
                        </span>
                        {hook.description && (
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {hook.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={hookTypeVariant(hook.hook_type)}>
                        {hook.hook_type}
                      </Badge>
                      <Badge variant={failureModeVariant(hook.failure_mode)}>
                        {FAILURE_MODE_LABELS[hook.failure_mode]}
                      </Badge>
                      <Button
                        data-testid={`test-btn-${hook.id}`}
                        onClick={() => handleTest(hook.id)}
                      >
                        Test
                      </Button>
                      <Button
                        data-testid={`delete-btn-${hook.id}`}
                        onClick={() => handleDelete(hook.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Create Hook Form
   -------------------------------------------------------------------------- */

interface CreateHookFormProps {
  scopeType?: ScopeType;
  scopeId?: number;
  onSubmit: (input: CreateHookRequest) => void;
  isSubmitting: boolean;
}

function CreateHookForm({
  scopeType,
  scopeId,
  onSubmit,
  isSubmitting,
}: CreateHookFormProps) {
  const [name, setName] = useState("");
  const [hookType, setHookType] = useState<HookType>("shell");
  const [hookPoint, setHookPoint] = useState<HookPoint>("post_variant");
  const [failureMode, setFailureMode] = useState<FailureMode>("warn");
  const [configText, setConfigText] = useState('{"script_path": ""}');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configText);
    } catch {
      return; // Invalid JSON -- do not submit
    }

    onSubmit({
      name,
      hook_type: hookType,
      hook_point: hookPoint,
      scope_type: scopeType ?? "studio",
      scope_id: scopeId,
      failure_mode: failureMode,
      config_json: config,
    });
  };

  return (
    <Card>
      <CardBody>
        <form
          data-testid="create-hook-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <Input
            data-testid="hook-name-input"
            placeholder="Hook name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-4">
            <div data-testid="hook-type-select">
              <Select
                value={hookType}
                onChange={(val) => setHookType(val as HookType)}
                options={HOOK_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>

            <div data-testid="hook-point-select">
              <Select
                value={hookPoint}
                onChange={(val) => setHookPoint(val as HookPoint)}
                options={HOOK_POINTS.map((p) => ({
                  value: p,
                  label: HOOK_POINT_LABELS[p],
                }))}
              />
            </div>

            <div data-testid="failure-mode-select">
              <Select
                value={failureMode}
                onChange={(val) => setFailureMode(val as FailureMode)}
                options={FAILURE_MODES.map((m) => ({
                  value: m,
                  label: FAILURE_MODE_LABELS[m],
                }))}
              />
            </div>
          </div>

          <textarea
            data-testid="config-json-input"
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
            rows={4}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
          />

          <Button
            data-testid="submit-hook-btn"
            type="submit"
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Hook"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
