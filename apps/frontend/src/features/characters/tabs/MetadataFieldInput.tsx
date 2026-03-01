/**
 * Renders a single metadata field input based on its type.
 */

import { Input, Select, Toggle } from "@/components/primitives";
import { snakeCaseToTitle } from "@/lib/format";
import { ICON_ACTION_BTN_DANGER } from "@/lib/ui-classes";
import { Trash2 } from "@/tokens/icons";

import type { MetadataTemplateField } from "../types";

interface MetadataFieldInputProps {
  field: MetadataTemplateField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  onDelete?: (fieldName: string) => void;
}

/** Extract the leaf label from a dot-notation field name. */
function fieldLabel(field: MetadataTemplateField): string {
  const parts = field.field_name.split(".");
  const name = parts[parts.length - 1] ?? field.field_name;
  return snakeCaseToTitle(name);
}

export function MetadataFieldInput({ field, value, onChange, onDelete }: MetadataFieldInputProps) {
  const label = fieldLabel(field);
  const displayLabel = field.is_required ? `${label} *` : label;
  const strValue = value != null ? String(value) : "";

  // Check for enum constraints
  const enumValues = (field.constraints?.enum as string[] | undefined) ?? [];

  if (enumValues.length > 0) {
    return (
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Select
          label={displayLabel}
          options={enumValues.map((v) => ({ value: v, label: v }))}
          value={strValue}
          onChange={(val) => onChange(field.field_name, val)}
        />
        {onDelete && !field.is_required && (
          <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
        )}
      </div>
    );
  }

  switch (field.field_type) {
    case "boolean":
      return (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Toggle
            label={displayLabel}
            checked={Boolean(value)}
            onChange={(checked) => onChange(field.field_name, checked)}
          />
          {onDelete && !field.is_required && (
            <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
          )}
        </div>
      );

    case "number":
      return (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              label={displayLabel}
              type="number"
              value={strValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(field.field_name, e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
          {onDelete && !field.is_required && (
            <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
          )}
        </div>
      );

    default:
      // string, array, object — all rendered as text input
      return (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              label={displayLabel}
              value={strValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(field.field_name, e.target.value)
              }
            />
          </div>
          {onDelete && !field.is_required && (
            <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
          )}
        </div>
      );
  }
}

function DeleteButton({
  fieldName,
  onDelete,
}: {
  fieldName: string;
  onDelete: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onDelete(fieldName)}
      className={`mt-5 shrink-0 ${ICON_ACTION_BTN_DANGER}`}
      aria-label={`Delete ${fieldName}`}
    >
      <Trash2 size={14} />
    </button>
  );
}
