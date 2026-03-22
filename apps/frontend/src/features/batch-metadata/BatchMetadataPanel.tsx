/**
 * Main panel for batch metadata operations (PRD-88).
 *
 * Provides operation type selector, avatar selector, and delegates
 * to the appropriate form component based on the chosen operation type.
 */

import { useState } from "react";

import { Select } from "@/components";

import { OperationHistory } from "./OperationHistory";
import { OperationPreview } from "./OperationPreview";
import { SearchReplaceForm } from "./SearchReplaceForm";
import { FieldOperationForm } from "./FieldOperationForm";
import type {
  BatchMetadataOperation,
  BatchOperationType,
  CreateBatchMetadataRequest,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const OPERATION_TYPE_OPTIONS: { value: BatchOperationType; label: string }[] = [
  { value: "multi_select_edit", label: "Multi-Select Edit" },
  { value: "search_replace", label: "Search & Replace" },
  { value: "csv_import", label: "CSV Import" },
  { value: "field_operation", label: "Field Operation" },
];

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BatchMetadataPanelProps {
  /** Current project ID. */
  projectId: number;
  /** Selected avatar IDs for the batch operation. */
  avatarIds: number[];
  /** Callback when a preview is created. */
  onPreviewCreated?: (op: BatchMetadataOperation) => void;
  /** Callback when an operation is executed. */
  onExecuted?: (op: BatchMetadataOperation) => void;
  /** Callback when an operation is undone. */
  onUndone?: (op: BatchMetadataOperation) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BatchMetadataPanel({
  projectId,
  avatarIds,
  onPreviewCreated,
  onExecuted,
  onUndone,
}: BatchMetadataPanelProps) {
  const [operationType, setOperationType] =
    useState<BatchOperationType>("multi_select_edit");
  const [previewOp, setPreviewOp] = useState<BatchMetadataOperation | null>(
    null,
  );

  const handlePreviewCreated = (op: BatchMetadataOperation) => {
    setPreviewOp(op);
    onPreviewCreated?.(op);
  };

  const buildRequest = (
    params: Record<string, unknown>,
    fieldName?: string,
  ): CreateBatchMetadataRequest => ({
    operation_type: operationType,
    project_id: projectId,
    avatar_ids: avatarIds,
    parameters: params,
    field_name: fieldName,
  });

  return (
    <div data-testid="batch-metadata-panel" className="flex flex-col gap-4">
      {/* Operation type selector */}
      <div data-testid="operation-type-selector" className="flex items-center gap-3">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          Operation Type
        </label>
        <Select
          value={operationType}
          onChange={(v: string) => setOperationType(v as BatchOperationType)}
          options={OPERATION_TYPE_OPTIONS}
        />
      </div>

      {/* Avatar count indicator */}
      <div data-testid="avatar-count" className="text-sm text-[var(--color-text-secondary)]">
        {avatarIds.length} avatar{avatarIds.length !== 1 ? "s" : ""} selected
      </div>

      {/* Operation-specific form */}
      <div data-testid="operation-form">
        {operationType === "search_replace" && (
          <SearchReplaceForm
            buildRequest={buildRequest}
            onPreviewCreated={handlePreviewCreated}
          />
        )}
        {operationType === "field_operation" && (
          <FieldOperationForm
            buildRequest={buildRequest}
            onPreviewCreated={handlePreviewCreated}
          />
        )}
        {(operationType === "multi_select_edit" ||
          operationType === "csv_import") && (
          <div
            data-testid="placeholder-form"
            className="rounded border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]"
          >
            Select avatars and configure the {operationType.replace(/_/g, " ")} operation.
          </div>
        )}
      </div>

      {/* Preview of affected avatars */}
      {previewOp && (
        <OperationPreview
          operation={previewOp}
          onExecuted={(op) => {
            setPreviewOp(null);
            onExecuted?.(op);
          }}
        />
      )}

      {/* Operation history */}
      <OperationHistory
        projectId={projectId}
        onUndone={onUndone}
      />
    </div>
  );
}
