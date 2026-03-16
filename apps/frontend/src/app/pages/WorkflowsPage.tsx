/**
 * Workflows management page (PRD-75, PRD-33).
 *
 * Provides a tabbed interface:
 * - "Workflows" tab: lists all workflows with CRUD + canvas preview
 * - "Import" tab: renders the ImportWizard for adding new workflows
 */

import { useCallback, useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { ConfirmDeleteModal, ConfigToolbar, Modal, Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import {
  Badge,
  Button,
  Input,
  LoadingPane,
  Select,
  SelectableRow,
} from "@/components/primitives";
import { ChevronLeft, ChevronRight, Edit3, Trash2 } from "@/tokens/icons";

import {
  ImportWizard,
  useDeleteWorkflow,
  useImportWorkflow,
  useUpdateWorkflow,
  useValidateWorkflow,
  useWorkflows,
  WORKFLOW_STATUS,
  workflowStatusLabel,
  workflowStatusVariant,
} from "@/features/workflow-import";
import type { ImportWorkflowRequest, Workflow } from "@/features/workflow-import";
import { WorkflowDetailPanel } from "@/features/workflow-import/WorkflowDetailPanel";
import { useExportWorkflow, useConfigImport } from "@/features/config-io";

/* --------------------------------------------------------------------------
   Tab types
   -------------------------------------------------------------------------- */

type TabKey = "list" | "import";

const TABS: { id: TabKey; label: string }[] = [
  { id: "list", label: "Workflows" },
  { id: "import", label: "Import New" },
];

/* --------------------------------------------------------------------------
   Status options for the select dropdown
   -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: String(WORKFLOW_STATUS.DRAFT), label: "Draft" },
  { value: String(WORKFLOW_STATUS.VALIDATED), label: "Validated" },
  { value: String(WORKFLOW_STATUS.TESTED), label: "Tested" },
  { value: String(WORKFLOW_STATUS.PRODUCTION), label: "Production" },
  { value: String(WORKFLOW_STATUS.DEPRECATED), label: "Deprecated" },
];

/* --------------------------------------------------------------------------
   Workflow list item
   -------------------------------------------------------------------------- */

function WorkflowRow({
  workflow,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  workflow: Workflow;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <SelectableRow isSelected={isSelected} onSelect={onSelect}>
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-2">
        <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {workflow.name}
        </span>
        <Badge variant={workflowStatusVariant(workflow.status_id)} size="sm">
          {workflowStatusLabel(workflow.status_id)}
        </Badge>
        <span className="text-xs text-[var(--color-text-muted)]">
          v{workflow.current_version}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={<Edit3 size={14} />}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label="Edit workflow"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete workflow"
        />
      </div>
    </SelectableRow>
  );
}

/* --------------------------------------------------------------------------
   Edit Workflow Modal
   -------------------------------------------------------------------------- */

function EditWorkflowModal({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? "");
  const [statusId, setStatusId] = useState(String(workflow.status_id));
  const updateMutation = useUpdateWorkflow();

  const handleSave = () => {
    updateMutation.mutate(
      {
        id: workflow.id,
        name,
        description: description || null,
        status_id: Number(statusId),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal open onClose={onClose} title="Edit Workflow" size="lg">
      <Stack gap={4}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          label="Status"
          value={statusId}
          onChange={(val) => setStatusId(val)}
          options={STATUS_OPTIONS}
        />
        <div className="flex gap-[var(--spacing-2)] justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={updateMutation.isPending}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Main page
   -------------------------------------------------------------------------- */

export function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<Workflow | null>(null);

  const { data: workflows, isLoading } = useWorkflows();
  const { name: searchName } = useSearch({ strict: false }) as { name?: string };

  // Auto-select workflow from URL search param (e.g., ?name=boobs-fondle)
  useEffect(() => {
    if (!searchName || !workflows?.length) return;
    const match = workflows.find((w) => w.name.toLowerCase() === searchName.toLowerCase());
    if (match && selectedWorkflowId !== match.id) {
      setSelectedWorkflowId(match.id);
    }
  }, [searchName, workflows]);

  const selectedWorkflow = workflows?.find((w) => w.id === selectedWorkflowId) ?? null;
  const importMutation = useImportWorkflow();
  const validateMutation = useValidateWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const workflowExport = useExportWorkflow();
  const workflowImport = useConfigImport();

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

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingWorkflow) return;
    deleteMutation.mutate(deletingWorkflow.id, {
      onSuccess: () => {
        if (selectedWorkflowId === deletingWorkflow.id) {
          setSelectedWorkflowId(null);
        }
        setDeletingWorkflow(null);
      },
    });
  }, [deletingWorkflow, deleteMutation, selectedWorkflowId]);

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div className="flex items-start justify-between">
          <PageHeader
            title="Workflows"
            description="Import, manage, and configure ComfyUI workflows for generation pipelines."
          />
          {selectedWorkflow && (
            <ConfigToolbar
              onExport={() => workflowExport.exportConfig(selectedWorkflow.id, selectedWorkflow.name)}
              onImport={(file) => workflowImport.importFile(file)}
              exporting={workflowExport.exporting}
              importing={workflowImport.importing}
            />
          )}
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={(k) => setActiveTab(k as TabKey)} variant="underline" />

        {/* List tab */}
        {activeTab === "list" && (
          <>
            {isLoading && <LoadingPane />}

            {!isLoading && workflows && workflows.length === 0 && (
              <EmptyState
                title="No Workflows"
                description="Import a ComfyUI workflow JSON to get started."
                action={
                  <Button variant="primary" size="sm" onClick={() => setActiveTab("import")}>
                    Import Workflow
                  </Button>
                }
              />
            )}

            {!isLoading && workflows && workflows.length > 0 && (
              <div className="flex gap-6">
                {/* Workflow list — collapsible */}
                <div
                  className={`shrink-0 transition-[width] duration-200 ${
                    listCollapsed ? "w-0 overflow-hidden" : "w-[320px]"
                  }`}
                >
                  <Stack gap={2}>
                    {workflows.map((w) => (
                      <WorkflowRow
                        key={w.id}
                        workflow={w}
                        isSelected={w.id === selectedWorkflowId}
                        onSelect={() => setSelectedWorkflowId(w.id)}
                        onEdit={() => setEditingWorkflow(w)}
                        onDelete={() => setDeletingWorkflow(w)}
                      />
                    ))}
                  </Stack>
                </div>

                {/* Collapse / expand toggle */}
                <div className="flex items-start pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={listCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    onClick={() => setListCollapsed((c) => !c)}
                    aria-label={listCollapsed ? "Show workflow list" : "Hide workflow list"}
                  />
                </div>

                {/* Detail panel */}
                <div className="min-h-[500px] min-w-0 flex-1 rounded border border-[var(--color-border-default)]">
                  {selectedWorkflow ? (
                    <WorkflowDetailPanel workflow={selectedWorkflow} />
                  ) : (
                    <EmptyState
                      title="Select a Workflow"
                      description="Choose a workflow from the list to view details."
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

      {/* Edit modal */}
      {editingWorkflow && (
        <EditWorkflowModal
          workflow={editingWorkflow}
          onClose={() => setEditingWorkflow(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        open={deletingWorkflow !== null}
        onClose={() => setDeletingWorkflow(null)}
        title="Delete Workflow"
        entityName={deletingWorkflow?.name ?? ""}
        warningText="All versions and canvas layouts will be permanently removed."
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
