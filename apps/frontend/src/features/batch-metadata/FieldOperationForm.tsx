/**
 * Field Operation form for batch metadata operations (PRD-88).
 *
 * Supports clear, set_default, copy_field, and concatenate operations
 * on metadata fields.
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components";

import { useCreatePreview } from "./hooks/use-batch-metadata";
import type {
  BatchMetadataOperation,
  CreateBatchMetadataRequest,
  FieldOperationType,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FIELD_OP_OPTIONS: { value: FieldOperationType; label: string }[] = [
  { value: "clear", label: "Clear Field" },
  { value: "set_default", label: "Set Default Value" },
  { value: "copy_field", label: "Copy From Field" },
  { value: "concatenate", label: "Concatenate Fields" },
];

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface FieldOperationFormProps {
  /** Builds the full request object from params + field_name. */
  buildRequest: (
    params: Record<string, unknown>,
    fieldName?: string,
  ) => CreateBatchMetadataRequest;
  /** Called when a preview is successfully created. */
  onPreviewCreated: (op: BatchMetadataOperation) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FieldOperationForm({
  buildRequest,
  onPreviewCreated,
}: FieldOperationFormProps) {
  const [fieldOpType, setFieldOpType] =
    useState<FieldOperationType>("clear");
  const [fieldName, setFieldName] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [sourceField, setSourceField] = useState("");
  const [separator, setSeparator] = useState(" ");

  const createPreview = useCreatePreview();

  const handleSubmit = () => {
    const params: Record<string, unknown> = {
      field_operation_type: fieldOpType,
    };

    if (fieldOpType === "set_default") {
      params.default_value = defaultValue;
    }
    if (fieldOpType === "copy_field") {
      params.source_field = sourceField;
    }
    if (fieldOpType === "concatenate") {
      params.source_field = sourceField;
      params.separator = separator;
    }

    const request = buildRequest(params, fieldName || undefined);

    createPreview.mutate(request, {
      onSuccess: (op) => onPreviewCreated(op),
    });
  };

  const isValid = fieldName.length > 0;

  return (
    <div data-testid="field-operation-form" className="flex flex-col gap-3">
      <div data-testid="field-op-select" className="flex flex-col gap-1">
        <label className="text-sm font-medium">Operation</label>
        <Select
          value={fieldOpType}
          onChange={(v: string) => setFieldOpType(v as FieldOperationType)}
          options={FIELD_OP_OPTIONS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Target Field</label>
        <Input
          data-testid="target-field-input"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          placeholder="e.g. hair_color"
        />
      </div>

      {fieldOpType === "set_default" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Default Value</label>
          <Input
            data-testid="default-value-input"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Enter default value..."
          />
        </div>
      )}

      {(fieldOpType === "copy_field" || fieldOpType === "concatenate") && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Source Field</label>
          <Input
            data-testid="source-field-input"
            value={sourceField}
            onChange={(e) => setSourceField(e.target.value)}
            placeholder="e.g. agency"
          />
        </div>
      )}

      {fieldOpType === "concatenate" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Separator</label>
          <Input
            data-testid="separator-input"
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
            placeholder="e.g. , or -"
          />
        </div>
      )}

      <Button
        data-testid="preview-field-op-btn"
        onClick={handleSubmit}
        disabled={!isValid || createPreview.isPending}
      >
        {createPreview.isPending ? "Creating Preview..." : "Preview Changes"}
      </Button>
    </div>
  );
}
