/**
 * ComfyUI workflow import wizard page (PRD-75).
 *
 * Wraps the multi-step ImportWizard with the necessary import and
 * validation mutation hooks.
 */

import { useCallback } from "react";
import { Stack } from "@/components/layout";

import {
  ImportWizard,
  useImportWorkflow,
  useValidateWorkflow,
} from "@/features/workflow-import";
import type { ImportWorkflowRequest } from "@/features/workflow-import";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkflowImportPage() {
  const importMutation = useImportWorkflow();
  const validateMutation = useValidateWorkflow();

  const handleImport = useCallback(
    (input: ImportWorkflowRequest) => importMutation.mutateAsync(input),
    [importMutation],
  );

  const handleValidate = useCallback(
    (id: number) => validateMutation.mutateAsync(id),
    [validateMutation],
  );

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Import Workflow
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Upload and validate ComfyUI workflow JSON files for use in
            generation pipelines.
          </p>
        </div>

        <ImportWizard
          onImport={handleImport}
          onValidate={handleValidate}
          isImporting={importMutation.isPending}
        />
      </Stack>
    </div>
  );
}
