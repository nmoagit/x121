/**
 * Renders a single metadata field input based on its type.
 *
 * Handles runtime type detection for arrays and nested objects that come
 * from flattened metadata (e.g. after dropping a metadata.json file).
 */

import { Input, Select, Toggle } from "@/components/primitives";
import { snakeCaseToTitle } from "@/lib/format";
import { ICON_ACTION_BTN_DANGER } from "@/lib/ui-classes";
import { Trash2 } from "@/tokens/icons";

import type { MetadataTemplateField } from "../types";
import { ChipInput } from "./ChipInput";

/** Shared className override for metadata inputs — transparent bg, smaller text. */
const FIELD_INPUT_CLASS = "!bg-transparent !text-xs !py-1";

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

/** Coerce array elements to strings for ChipInput. */
function toStringArray(arr: unknown[]): string[] {
  return arr.map((item) => (typeof item === "string" ? item : String(item)));
}

export function MetadataFieldInput({ field, value, onChange, onDelete }: MetadataFieldInputProps) {
  const label = fieldLabel(field);
  const displayLabel = field.is_required ? `${label} *` : label;

  // --- Runtime type detection (takes precedence over template field_type) ---

  // Array → chip input
  if (Array.isArray(value)) {
    return (
      <div className="flex items-center gap-[var(--spacing-2)]">
        <div className="flex-1">
          <ChipInput
            label={displayLabel}
            values={toStringArray(value)}
            onChange={(vals) => onChange(field.field_name, vals)}
          />
        </div>
        {onDelete && !field.is_required && (
          <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
        )}
      </div>
    );
  }

  // Non-null object → render sub-fields
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const subKeys = Object.keys(obj);
    return (
      <div className="col-span-full flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)]/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
            {displayLabel}
          </span>
          {onDelete && !field.is_required && (
            <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subKeys.map((subKey) => {
            const subValue = obj[subKey];
            const subLabel = snakeCaseToTitle(subKey);

            // Sub-value is array → chip input
            if (Array.isArray(subValue)) {
              return (
                <ChipInput
                  key={subKey}
                  label={subLabel}
                  values={toStringArray(subValue)}
                  onChange={(vals) =>
                    onChange(field.field_name, { ...obj, [subKey]: vals })
                  }
                />
              );
            }

            // Sub-value is boolean → toggle
            if (typeof subValue === "boolean") {
              return (
                <Toggle
                  key={subKey}
                  label={subLabel}
                  checked={subValue}
                  onChange={(checked) =>
                    onChange(field.field_name, { ...obj, [subKey]: checked })
                  }
                />
              );
            }

            // Sub-value is number → number input (falls back to text if edited to non-numeric)
            if (typeof subValue === "number" || (typeof subValue === "string" && !Number.isNaN(Number(subValue)) && subValue !== "")) {
              return (
                <Input
                  key={subKey}
                  label={subLabel}
                  type="text"
                  inputMode="numeric"
                  size="sm"
                  className={FIELD_INPUT_CLASS}
                  value={String(subValue)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value;
                    const num = Number(v);
                    onChange(field.field_name, {
                      ...obj,
                      [subKey]: v === "" ? null : Number.isNaN(num) ? v : num,
                    });
                  }}
                />
              );
            }

            // Default: string input
            return (
              <Input
                key={subKey}
                label={subLabel}
                size="sm"
                className={FIELD_INPUT_CLASS}
                value={subValue != null ? String(subValue) : ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange(field.field_name, { ...obj, [subKey]: e.target.value })
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  // --- Standard scalar rendering below ---

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

    case "number": {
      // If the current value is non-numeric (e.g. "Prefer not to say"),
      // render a text input so the browser doesn't reject it.
      const isNumericValue = strValue === "" || !Number.isNaN(Number(strValue));
      return (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              label={displayLabel}
              type={isNumericValue ? "number" : "text"}
              size="sm"
              className={FIELD_INPUT_CLASS}
              value={strValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value;
                // Store as number if parseable, string otherwise
                const num = Number(v);
                onChange(field.field_name, v === "" ? null : Number.isNaN(num) ? v : num);
              }}
            />
          </div>
          {onDelete && !field.is_required && (
            <DeleteButton fieldName={field.field_name} onDelete={onDelete} />
          )}
        </div>
      );
    }

    default:
      return (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              label={displayLabel}
              size="sm"
              className={FIELD_INPUT_CLASS}
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
