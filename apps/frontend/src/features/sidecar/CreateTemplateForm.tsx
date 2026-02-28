/**
 * Inline form for creating a new sidecar template (PRD-40).
 *
 * Renders within TemplateManager when the user clicks "New Template".
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components/primitives";
import { isValidJson } from "@/lib/validation";

import { useCreateTemplate } from "./hooks/use-sidecar";
import { FORMAT_LABELS, TARGET_TOOL_LABELS } from "./types";
import type { SidecarFormat } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FORMAT_OPTIONS = Object.entries(FORMAT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const TOOL_OPTIONS = [
  { value: "", label: "None" },
  ...Object.entries(TARGET_TOOL_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CreateTemplateFormProps {
  onCancel: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CreateTemplateForm({ onCancel }: CreateTemplateFormProps) {
  const createTemplate = useCreateTemplate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<SidecarFormat>("xml");
  const [targetTool, setTargetTool] = useState("");
  const [templateJson, setTemplateJson] = useState("{}");

  const canSubmit = name.trim() !== "" && isValidJson(templateJson);

  function handleSubmit() {
    if (!canSubmit) return;

    createTemplate.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        format,
        target_tool: targetTool || undefined,
        template_json: JSON.parse(templateJson) as Record<string, unknown>,
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div data-testid="create-template-form" className="flex flex-col gap-3 p-3">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
      />
      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Format"
          options={FORMAT_OPTIONS}
          value={format}
          onChange={(v) => setFormat(v as SidecarFormat)}
        />
        <Select
          label="Target Tool"
          options={TOOL_OPTIONS}
          value={targetTool}
          onChange={setTargetTool}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
          Template JSON
        </label>
        <textarea
          data-testid="template-json-editor"
          className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-action-primary)]"
          rows={4}
          value={templateJson}
          onChange={(e) => setTemplateJson(e.target.value)}
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
          loading={createTemplate.isPending}
          data-testid="submit-template-btn"
        >
          Create Template
        </Button>
      </div>
    </div>
  );
}
