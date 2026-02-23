/**
 * Re-path panel for bulk data maintenance (PRD-18).
 *
 * Provides old/new prefix inputs, a validate-paths toggle, a preview
 * table with broken references highlighted, and an execute button.
 */

import { useCallback, useState } from "react";

import { PreviewTable } from "./PreviewTable";
import type { FieldInfo, RepathRequest } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface RePathPanelProps {
  /** Called to trigger a preview. */
  onPreview?: (body: RepathRequest) => void;
  /** Called to execute a previewed operation. */
  onExecute?: (operationId: number) => void;
  /** Preview fields returned from the server. */
  previewFields?: FieldInfo[];
  /** The operation ID returned from the preview call. */
  previewOperationId?: number;
  /** Total number of matches from preview. */
  previewTotalMatches?: number;
  /** Whether an operation is currently in progress. */
  isLoading?: boolean;
  /** Whether execution is in progress. */
  isExecuting?: boolean;
  /** Optional entity type filter options. */
  entityTypes?: string[];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RePathPanel({
  onPreview,
  onExecute,
  previewFields,
  previewOperationId,
  previewTotalMatches,
  isLoading = false,
  isExecuting = false,
  entityTypes = [],
}: RePathPanelProps) {
  const [oldPrefix, setOldPrefix] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [validatePaths, setValidatePaths] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePreview = useCallback(() => {
    const body: RepathRequest = {
      old_prefix: oldPrefix,
      new_prefix: newPrefix,
      validate_new_paths: validatePaths,
      entity_type: entityType || undefined,
    };
    onPreview?.(body);
    setShowConfirm(false);
  }, [oldPrefix, newPrefix, validatePaths, entityType, onPreview]);

  const handleExecute = useCallback(() => {
    if (previewOperationId != null) {
      onExecute?.(previewOperationId);
      setShowConfirm(false);
    }
  }, [previewOperationId, onExecute]);

  const canPreview = oldPrefix.trim().length > 0 && newPrefix.trim().length > 0;
  const hasPreview = previewFields != null && previewFields.length > 0;

  return (
    <div data-testid="repath-panel" className="space-y-4">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Re-Path
      </h3>

      {/* Path prefix inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Old Prefix
          </label>
          <input
            data-testid="old-prefix-input"
            type="text"
            value={oldPrefix}
            onChange={(e) => setOldPrefix(e.target.value)}
            placeholder="/old/path/prefix"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            New Prefix
          </label>
          <input
            data-testid="new-prefix-input"
            type="text"
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value)}
            placeholder="/new/path/prefix"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Toggles and filters */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            data-testid="validate-paths-toggle"
            type="checkbox"
            checked={validatePaths}
            onChange={(e) => setValidatePaths(e.target.checked)}
          />
          Validate New Paths
        </label>
        {entityTypes.length > 0 && (
          <select
            data-testid="entity-type-filter"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">All Entity Types</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Preview button */}
      <button
        data-testid="preview-btn"
        onClick={handlePreview}
        disabled={!canPreview || isLoading}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        type="button"
      >
        {isLoading ? "Loading..." : "Preview"}
      </button>

      {/* Preview results */}
      {hasPreview && (
        <div className="space-y-3">
          <p
            data-testid="preview-match-count"
            className="text-sm text-[var(--color-text-secondary)]"
          >
            {previewTotalMatches} field{previewTotalMatches === 1 ? "" : "s"} matched
          </p>
          <PreviewTable
            fields={previewFields}
            oldValue={oldPrefix}
            newValue={newPrefix}
            highlightBroken={validatePaths}
          />

          {/* Execute with confirmation */}
          {!showConfirm ? (
            <button
              data-testid="execute-btn"
              onClick={() => setShowConfirm(true)}
              disabled={isExecuting}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              type="button"
            >
              Execute
            </button>
          ) : (
            <div
              data-testid="confirm-dialog"
              className="flex items-center gap-3 rounded border border-yellow-400 bg-yellow-50 p-3"
            >
              <span className="text-sm text-yellow-800">
                Are you sure? This will update {previewTotalMatches} path
                {previewTotalMatches === 1 ? "" : "s"}.
              </span>
              <button
                data-testid="confirm-execute-btn"
                onClick={handleExecute}
                disabled={isExecuting}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                type="button"
              >
                {isExecuting ? "Executing..." : "Confirm"}
              </button>
              <button
                data-testid="cancel-execute-btn"
                onClick={() => setShowConfirm(false)}
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
