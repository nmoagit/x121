/**
 * Pipeline settings inline editor component (PRD-108).
 *
 * Displays the current settings as key-value pairs with inline editing.
 * Saves via PATCH to merge changes.
 */

import { useState } from "react";

import { Button, Input } from "@/components";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PipelineSettingsEditorProps {
  /** Current settings object. */
  settings: Record<string, unknown>;
  /** Called when the user saves changes. Receives a partial settings object. */
  onSave: (updates: Record<string, unknown>) => void;
  /** Whether a save is in progress. */
  isSaving?: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const KNOWN_KEYS = [
  "a2c4_model",
  "elevenlabs_voice",
  "avatar_json",
  "lora_model",
  "comfyui_workflow",
];

function formatKeyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PipelineSettingsEditor({
  settings,
  onSave,
  isSaving = false,
}: PipelineSettingsEditorProps) {
  // Collect all keys: known keys + any extra keys already in settings.
  const allKeys = Array.from(
    new Set([...KNOWN_KEYS, ...Object.keys(settings)]),
  );

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of allKeys) {
      initial[key] = settings[key] != null ? String(settings[key]) : "";
    }
    return initial;
  });

  const [isDirty, setIsDirty] = useState(false);

  function handleChange(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function handleSave() {
    // Build updates object with only changed values.
    const updates: Record<string, unknown> = {};
    for (const key of allKeys) {
      const original = settings[key] != null ? String(settings[key]) : "";
      if (draft[key] !== original) {
        updates[key] = draft[key] || null;
      }
    }
    if (Object.keys(updates).length > 0) {
      onSave(updates);
      setIsDirty(false);
    }
  }

  return (
    <div data-testid="pipeline-settings-editor" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Pipeline Settings
      </h3>
      <div className="flex flex-col gap-2">
        {allKeys.map((key) => (
          <div
            key={key}
            data-testid={`setting-row-${key}`}
            className="flex items-center gap-2"
          >
            <label
              className="w-40 text-xs text-[var(--color-text-secondary)]"
              data-testid={`setting-label-${key}`}
            >
              {formatKeyLabel(key)}
            </label>
            <Input
              data-testid={`setting-input-${key}`}
              value={draft[key] ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(key, e.target.value)
              }
              className="flex-1 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          data-testid="save-settings-btn"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
