/**
 * Main panel for batch metadata operations (PRD-88).
 *
 * Provides operation type selector, character selector, and delegates
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
  /** Selected character IDs for the batch operation. */
  characterIds: number[];
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
  characterIds,
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
    character_ids: characterIds,
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

      {/* Character count indicator */}
      <div data-testid="character-count" className="text-sm text-[var(--color-text-secondary)]">
        {characterIds.length} character{characterIds.length !== 1 ? "s" : ""} selected
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
            Select characters and configure the {operationType.replace(/_/g, " ")} operation.
          </div>
        )}
      </div>

      {/* Preview of affected characters */}
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
