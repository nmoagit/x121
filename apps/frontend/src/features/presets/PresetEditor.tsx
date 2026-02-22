/**
 * Create/edit form for presets (PRD-27).
 */

import { useState } from "react";

import { Button } from "@/components";
import { cn } from "@/lib/cn";

import type { CreatePreset, Preset, Scope } from "./types";
import { MAX_DESCRIPTION_LEN, MAX_NAME_LEN } from "./types";

interface PresetEditorProps {
  /** Existing preset to edit, or undefined for a new one. */
  preset?: Preset;
  /** Called with the form data when the user saves. */
  onSave: (data: CreatePreset) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

export function PresetEditor({ preset, onSave, onCancel }: PresetEditorProps) {
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [scope, setScope] = useState<Scope>(preset?.scope ?? "personal");
  const [parametersText, setParametersText] = useState(
    preset ? JSON.stringify(preset.parameters, null, 2) : "{}",
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const isEdit = !!preset;
  const nameError = name.length === 0 ? "Name is required" : name.length > MAX_NAME_LEN ? "Name is too long" : null;
  const descError = description.length > MAX_DESCRIPTION_LEN ? "Description is too long" : null;

  function handleSave() {
    let parameters: Record<string, unknown>;
    try {
      parameters = JSON.parse(parametersText);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
      return;
    }

    onSave({
      name,
      description: description || undefined,
      scope,
      parameters,
    });
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-6",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "max-w-lg w-full",
      )}
      data-testid="preset-editor"
    >
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
        {isEdit ? "Edit Preset" : "New Preset"}
        {isEdit && preset && (
          <span className="ml-2 text-xs text-[var(--color-text-muted)]">
            v{preset.version}
          </span>
        )}
      </h3>

      {/* Name */}
      <div className="mb-3">
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(
            "w-full text-sm rounded-[var(--radius-md)] px-3 py-2",
            "bg-[var(--color-surface-secondary)]",
            "text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)]",
          )}
          placeholder="Preset name"
          data-testid="preset-name-input"
        />
        {nameError && (
          <p className="text-xs text-[var(--color-action-danger)] mt-1" data-testid="name-error">
            {nameError}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(
            "w-full text-sm rounded-[var(--radius-md)] px-3 py-2 h-20 resize-none",
            "bg-[var(--color-surface-secondary)]",
            "text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)]",
          )}
          placeholder="Optional description"
          data-testid="preset-description-input"
        />
        {descError && (
          <p className="text-xs text-[var(--color-action-danger)] mt-1">{descError}</p>
        )}
      </div>

      {/* Scope selector */}
      <div className="mb-3">
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">
          Scope
        </label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className={cn(
            "w-full text-sm rounded-[var(--radius-md)] px-3 py-2",
            "bg-[var(--color-surface-secondary)]",
            "text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)]",
          )}
          data-testid="scope-select"
        >
          <option value="personal">Personal</option>
          <option value="project">Project</option>
          <option value="studio">Studio</option>
        </select>
      </div>

      {/* Parameters JSON editor */}
      <div className="mb-4">
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">
          Parameters (JSON)
        </label>
        <textarea
          value={parametersText}
          onChange={(e) => {
            setParametersText(e.target.value);
            setJsonError(null);
          }}
          className={cn(
            "w-full text-sm font-mono rounded-[var(--radius-md)] px-3 py-2 h-32 resize-none",
            "bg-[var(--color-surface-secondary)]",
            "text-[var(--color-text-primary)]",
            "border",
            jsonError
              ? "border-[var(--color-action-danger)]"
              : "border-[var(--color-border-default)]",
          )}
          data-testid="parameters-input"
        />
        {jsonError && (
          <p className="text-xs text-[var(--color-action-danger)] mt-1" data-testid="json-error">
            {jsonError}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!!nameError || !!descError}
          data-testid="save-button"
        >
          {isEdit ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
