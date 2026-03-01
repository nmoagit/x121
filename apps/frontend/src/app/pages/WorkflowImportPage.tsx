/**
 * ComfyUI workflow import wizard page (PRD-75).
 *
 * Wraps the multi-step ImportWizard with the necessary import and
 * validation mutation hooks.
 */

import { useCallback } from "react";
import { PageHeader, Stack } from "@/components/layout";

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
        <PageHeader
          title="Import Workflow"
          description="Upload and validate ComfyUI workflow JSON files for use in generation pipelines."
        />

        <ImportWizard
          onImport={handleImport}
          onValidate={handleValidate}
          isImporting={importMutation.isPending}
        />
      </Stack>
    </div>
  );
}
