/**
 * Per-character metadata editing form (PRD-66).
 *
 * Groups fields by category (biographical, physical, preferences, production)
 * with inline validation and a completeness bar.
 */

import { useCallback, useMemo, useState } from "react";

import { Card } from "@/components/composite/Card";
import { Button, Input, Select, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { CompletenessBar } from "./CompletenessBar";
import { useCharacterMetadata, useUpdateCharacterMetadata } from "./hooks/use-metadata-editor";
import type {
  FieldCategory,
  MetadataFieldError,
  MetadataFieldWithValue,
  MetadataValidationFailure,
} from "./types";
import { CATEGORY_LABELS, FIELD_CATEGORIES } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MetadataFormProps {
  characterId: number;
}

export function MetadataForm({ characterId }: MetadataFormProps) {
  const { data, isLoading } = useCharacterMetadata(characterId);
  const updateMutation = useUpdateCharacterMetadata(characterId);

  const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<MetadataFieldError[]>([]);
  const [dirty, setDirty] = useState(false);

  // Merge server data with local edits.
  const fieldValues = useMemo(() => {
    if (!data) return {};
    const values: Record<string, unknown> = {};
    for (const field of data.fields) {
      values[field.name] = field.name in localValues ? localValues[field.name] : field.value;
    }
    return values;
  }, [data, localValues]);

  // Group fields by category.
  const groupedFields = useMemo(() => {
    if (!data) return new Map<FieldCategory, MetadataFieldWithValue[]>();
    const groups = new Map<FieldCategory, MetadataFieldWithValue[]>();
    for (const field of data.fields) {
      const existing = groups.get(field.category) ?? [];
      existing.push(field);
      groups.set(field.category, existing);
    }
    return groups;
  }, [data]);

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setLocalValues((prev) => ({ ...prev, [fieldName]: value }));
    setDirty(true);
    // Clear error for this field.
    setErrors((prev) => prev.filter((e) => e.field !== fieldName));
  }, []);

  const getFieldError = useCallback(
    (fieldName: string): string | undefined => {
      return errors.find((e) => e.field === fieldName)?.message;
    },
    [errors],
  );

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setErrors([]);

    try {
      const result = await updateMutation.mutateAsync(localValues);
      // Check if the result is a validation failure.
      if ("errors" in result && (result as MetadataValidationFailure).status === "validation_failed") {
        setErrors((result as MetadataValidationFailure).errors);
      } else {
        // Success -- clear local state.
        setLocalValues({});
        setDirty(false);
      }
    } catch {
      // Network error handled by TanStack Query.
    }
  }, [dirty, localValues, updateMutation]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-[var(--color-text-muted)]">
        Character not found.
      </div>
    );
  }

  return (
    <Stack gap={6}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {data.character_name} - Metadata
          </h2>
          <div className="mt-2 max-w-md">
            <CompletenessBar completeness={data.completeness} />
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || updateMutation.isPending}
          onClick={handleSave}
        >
          {updateMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Grouped fields */}
      {FIELD_CATEGORIES.map((category) => {
        const fields = groupedFields.get(category);
        if (!fields || fields.length === 0) return null;

        return (
          <Card key={category} padding="md">
            <h3 className="mb-4 text-sm font-semibold text-[var(--color-text-secondary)]">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <MetadataField
                  key={field.name}
                  field={field}
                  value={fieldValues[field.name]}
                  error={getFieldError(field.name)}
                  onChange={handleFieldChange}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Field renderer
   -------------------------------------------------------------------------- */

function MetadataField({
  field,
  value,
  error,
  onChange,
}: {
  field: MetadataFieldWithValue;
  value: unknown;
  error: string | undefined;
  onChange: (name: string, value: unknown) => void;
}) {
  const label = field.is_required ? `${field.label} *` : field.label;

  switch (field.field_type) {
    case "select":
      return (
        <div>
          <Select
            label={label}
            value={String(value ?? "")}
            onChange={(val) => onChange(field.name, val || null)}
            options={[
              { value: "", label: "-- Select --" },
              ...field.options.map((opt) => ({ value: opt, label: opt })),
            ]}
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--color-status-error)]">{error}</p>
          )}
        </div>
      );

    case "multi_select":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
            {label}
          </label>
          <div className="flex flex-wrap gap-2">
            {field.options.map((opt) => {
              const selected = Array.isArray(value) && value.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => {
                    const current = Array.isArray(value) ? [...value] : [];
                    const next = selected
                      ? current.filter((v) => v !== opt)
                      : [...current, opt];
                    onChange(field.name, next);
                  }}
                  className={`rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors ${
                    selected
                      ? "border-[var(--color-border-active)] bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                      : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-border-active)]"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="mt-1 text-xs text-[var(--color-status-error)]">{error}</p>
          )}
        </div>
      );

    case "number":
      return (
        <div>
          <Input
            label={label}
            type="number"
            value={value != null ? String(value) : ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange(field.name, v === "" ? null : Number(v));
            }}
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--color-status-error)]">{error}</p>
          )}
        </div>
      );

    case "date":
      return (
        <div>
          <Input
            label={label}
            type="date"
            value={String(value ?? "")}
            onChange={(e) => onChange(field.name, e.target.value || null)}
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--color-status-error)]">{error}</p>
          )}
        </div>
      );

    default:
      // Text field.
      return (
        <div>
          <Input
            label={label}
            value={String(value ?? "")}
            onChange={(e) => onChange(field.name, e.target.value || null)}
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--color-status-error)]">{error}</p>
          )}
        </div>
      );
  }
}
