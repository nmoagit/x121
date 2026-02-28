/**
 * WidgetSettingsPanel -- settings panel for a selected widget instance (PRD-89).
 *
 * Auto-generates form fields based on the widget's settings_schema.
 * Updates are applied to the widget_settings_json for the instance.
 */

import { useCallback, useState } from "react";

import { Button, Input, Toggle } from "@/components/primitives";
import { Drawer } from "@/components/composite";
import { Save } from "@/tokens/icons";

import type { WidgetDefinition } from "./types";

/* --------------------------------------------------------------------------
   Schema field renderer
   -------------------------------------------------------------------------- */

interface SchemaFieldProps {
  fieldKey: string;
  schema: Record<string, unknown>;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

function SchemaField({ fieldKey, schema, value, onChange }: SchemaFieldProps) {
  const fieldType = schema.type as string | undefined;
  const label = (schema.label as string) ?? fieldKey;
  const description = schema.description as string | undefined;

  if (fieldType === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">
            {label}
          </label>
          <Toggle
            checked={Boolean(value)}
            onChange={(checked) => onChange(fieldKey, checked)}
            aria-label={label}
          />
        </div>
        {description && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {description}
          </span>
        )}
      </div>
    );
  }

  if (fieldType === "number") {
    return (
      <Input
        label={label}
        type="number"
        helperText={description}
        value={String(value ?? "")}
        onChange={(e) => onChange(fieldKey, Number(e.target.value))}
      />
    );
  }

  // Default: text input
  return (
    <Input
      label={label}
      type="text"
      helperText={description}
      value={String(value ?? "")}
      onChange={(e) => onChange(fieldKey, e.target.value)}
    />
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface WidgetSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  widget: WidgetDefinition | null;
  instanceId: string | null;
  currentSettings: Record<string, unknown>;
  onSave: (instanceId: string, settings: Record<string, unknown>) => void;
}

export function WidgetSettingsPanel({
  open,
  onClose,
  widget,
  instanceId,
  currentSettings,
  onSave,
}: WidgetSettingsPanelProps) {
  const [localSettings, setLocalSettings] =
    useState<Record<string, unknown>>(currentSettings);

  // Reset local state when a different widget is opened
  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = () => {
    if (!instanceId) return;
    onSave(instanceId, localSettings);
    onClose();
  };

  if (!widget || !instanceId) return null;

  // Backend schema shape: { properties: { key: { type: "...", ... }, ... }, required?: [...] }
  // Iterate the entries inside "properties", not the top level.
  const rawSchema = widget.settings_schema ?? {};
  const properties = (rawSchema as Record<string, unknown>).properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  const fields = properties ? Object.entries(properties) : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Settings: ${widget.name}`}
      size="sm"
    >
      <div data-testid="widget-settings-panel" className="flex flex-col gap-4">
        {fields.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            This widget has no configurable settings.
          </p>
        ) : (
          <>
            {fields.map(([key, fieldSchema]) => (
              <SchemaField
                key={key}
                fieldKey={key}
                schema={fieldSchema as Record<string, unknown>}
                value={localSettings[key]}
                onChange={handleFieldChange}
              />
            ))}
          </>
        )}

        <div className="pt-2 border-t border-[var(--color-border-default)]">
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={16} aria-hidden="true" />}
            onClick={handleSave}
            disabled={fields.length === 0}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
