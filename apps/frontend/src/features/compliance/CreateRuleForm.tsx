/**
 * Inline form for creating a new compliance rule (PRD-102).
 *
 * Renders within RuleManager when the user clicks "New Rule".
 */

import { useState } from "react";

import { Button, Input, Select, Toggle } from "@/components/primitives";

import { useCreateRule } from "./hooks/use-compliance";
import { RULE_TYPE_LABELS } from "./types";
import type { ComplianceRuleType } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const RULE_TYPE_OPTIONS = Object.entries(RULE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CreateRuleFormProps {
  projectId?: number;
  onCancel: () => void;
}

export function CreateRuleForm({ projectId, onCancel }: CreateRuleFormProps) {
  const createRule = useCreateRule();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState<ComplianceRuleType>("resolution");
  const [configJson, setConfigJson] = useState("{}");
  const [isGlobal, setIsGlobal] = useState(false);

  const canSubmit = name.trim() !== "";

  function handleSubmit() {
    if (!canSubmit) return;

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(configJson);
    } catch {
      // Keep empty object on parse error
    }

    createRule.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        rule_type: ruleType,
        config_json: parsedConfig,
        is_global: isGlobal,
        project_id: isGlobal ? undefined : projectId,
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div data-testid="create-rule-form" className="flex flex-col gap-3 p-3">
      <Input
        label="Rule Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. HD Resolution Check"
        data-testid="rule-name-input"
      />

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description..."
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Rule Type"
          options={RULE_TYPE_OPTIONS}
          value={ruleType}
          onChange={(v) => setRuleType(v as ComplianceRuleType)}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Scope
          </span>
          <Toggle
            checked={isGlobal}
            onChange={setIsGlobal}
            label="Global"
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Config (JSON)
        </label>
        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={3}
          data-testid="rule-config-input"
          className="w-full px-3 py-2 text-sm font-mono bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={createRule.isPending}
          data-testid="submit-rule-btn"
        >
          Create Rule
        </Button>
      </div>
    </div>
  );
}
