/**
 * Workflows management page (PRD-75, PRD-33).
 *
 * Provides a tabbed interface:
 * - "Workflows" tab: lists all workflows with select-to-view canvas
 * - "Import" tab: renders the ImportWizard for adding new workflows
 */

import { useCallback, useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, LoadingPane, SelectableRow, TabBar } from "@/components/primitives";
import { EmptyState } from "@/components/domain";

import {
  ImportWizard,
  useImportWorkflow,
  useValidateWorkflow,
  useWorkflows,
} from "@/features/workflow-import";
import type { ImportWorkflowRequest, Workflow } from "@/features/workflow-import";
import { workflowStatusLabel, workflowStatusVariant } from "@/features/workflow-import";
import { WorkflowCanvas } from "@/features/workflow-canvas/WorkflowCanvas";

/* --------------------------------------------------------------------------
   Tab types
   -------------------------------------------------------------------------- */

type TabKey = "list" | "import";

const TABS: { key: TabKey; label: string }[] = [
  { key: "list", label: "Workflows" },
  { key: "import", label: "Import New" },
];

/* --------------------------------------------------------------------------
   Workflow list item
   -------------------------------------------------------------------------- */

function WorkflowRow({
  workflow,
  isSelected,
  onSelect,
}: {
  workflow: Workflow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <SelectableRow isSelected={isSelected} onSelect={onSelect}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {workflow.name}
        </span>
        <Badge variant={workflowStatusVariant(workflow.status_id)} size="sm">
          {workflowStatusLabel(workflow.status_id)}
        </Badge>
      </div>
      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
        v{workflow.current_version}
      </span>
    </SelectableRow>
  );
}

/* --------------------------------------------------------------------------
   Main page
   -------------------------------------------------------------------------- */

export function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);

  const { data: workflows, isLoading } = useWorkflows();
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

  const handleImportComplete = useCallback(
    (workflow: Workflow) => {
      setSelectedWorkflowId(workflow.id);
      setActiveTab("list");
    },
    [],
  );

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Workflows"
          description="Import, manage, and configure ComfyUI workflows for generation pipelines."
        />

        <TabBar tabs={TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />

        {/* List tab */}
        {activeTab === "list" && (
          <>
            {isLoading && <LoadingPane />}

            {!isLoading && workflows && workflows.length === 0 && (
              <EmptyState
                title="No Workflows"
                description="Import a ComfyUI workflow JSON to get started."
                action={
                  <Button variant="primary" onClick={() => setActiveTab("import")}>
                    Import Workflow
                  </Button>
                }
              />
            )}

            {!isLoading && workflows && workflows.length > 0 && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
                {/* Workflow list */}
                <Stack gap={2}>
                  {workflows.map((w) => (
                    <WorkflowRow
                      key={w.id}
                      workflow={w}
                      isSelected={w.id === selectedWorkflowId}
                      onSelect={() => setSelectedWorkflowId(w.id)}
                    />
                  ))}
                </Stack>

                {/* Canvas area */}
                <div className="min-h-[500px] rounded border border-[var(--color-border-default)]">
                  {selectedWorkflowId ? (
                    <WorkflowCanvas workflowId={selectedWorkflowId} />
                  ) : (
                    <EmptyState
                      title="Select a Workflow"
                      description="Choose a workflow from the list to view its canvas."
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Import tab */}
        {activeTab === "import" && (
          <ImportWizard
            onImport={handleImport}
            onValidate={handleValidate}
            onComplete={handleImportComplete}
            isImporting={importMutation.isPending}
          />
        )}
      </Stack>
    </div>
  );
}
