/**
 * Admin page for managing pipeline generator scripts (PRD-143).
 *
 * CRUD interface with script list, create/edit forms, and test execution.
 * Uses terminal design system (TERMINAL_PANEL, monospace, size="sm" inputs).
 *
 * Route: /admin/generator-scripts
 */

import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteModal, Modal, useToast } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane } from "@/components/primitives";
import { usePipelines } from "@/features/pipelines/hooks/use-pipelines";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_SELECT,
  TERMINAL_TH,
} from "@/lib/ui-classes";
import { FileText, Play, Plus, Save, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useGeneratorScripts,
  useGeneratorScript,
  useCreateScript,
  useUpdateScript,
  useDeleteScript,
  useExecuteScript,
} from "./hooks/use-generator-scripts";
import type {
  GeneratorScript,
  CreateGeneratorScript,
  UpdateGeneratorScript,
  ExecuteScriptResponse,
} from "./hooks/use-generator-scripts";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SCRIPT_TYPES = ["python", "javascript", "shell"] as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GeneratorScriptsPage() {
  useSetPageTitle("Generator Scripts", "Create and manage pipeline generator scripts.");

  const { data: pipelines } = usePipelines();
  const { addToast } = useToast();

  // Filter state
  const [filterPipelineId, setFilterPipelineId] = useState<number | undefined>(undefined);
  const { data: scripts, isLoading } = useGeneratorScripts(filterPipelineId);

  // Create/Edit modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editScriptId, setEditScriptId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GeneratorScript | null>(null);
  const [testScriptId, setTestScriptId] = useState<number | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createPipelineId, setCreatePipelineId] = useState<number>(0);
  const [createType, setCreateType] = useState<string>("python");
  const [createDescription, setCreateDescription] = useState("");
  const [createContent, setCreateContent] = useState("");

  // Edit form state
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Test modal state
  const [testAvatarId, setTestAvatarId] = useState("");
  const [testResult, setTestResult] = useState<ExecuteScriptResponse | null>(null);

  // Mutations
  const createScript = useCreateScript();
  const updateScript = useUpdateScript();
  const deleteScript = useDeleteScript();
  const executeScript = useExecuteScript();

  // Fetch detail for edit modal
  const { data: editScriptData } = useGeneratorScript(editScriptId ?? 0);

  // Pipeline lookup map
  const pipelineMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of pipelines ?? []) map.set(p.id, p.name);
    return map;
  }, [pipelines]);

  /* --- Create handler --- */
  const handleCreate = useCallback(() => {
    if (!createName.trim() || !createContent.trim() || !createPipelineId) return;
    const input: CreateGeneratorScript = {
      pipeline_id: createPipelineId,
      name: createName.trim(),
      description: createDescription.trim() || undefined,
      script_type: createType,
      script_content: createContent,
    };
    createScript.mutate(input, {
      onSuccess: () => {
        addToast({ variant: "success", message: "Script created" });
        setCreateOpen(false);
        resetCreateForm();
      },
      onError: (err) => addToast({ variant: "error", message: `Failed: ${err.message}` }),
    });
  }, [createName, createContent, createPipelineId, createType, createDescription, createScript, addToast]);

  function resetCreateForm() {
    setCreateName("");
    setCreatePipelineId(0);
    setCreateType("python");
    setCreateDescription("");
    setCreateContent("");
  }

  /* --- Edit handler --- */
  const openEdit = useCallback((script: GeneratorScript) => {
    setEditScriptId(script.id);
    setEditContent(script.script_content);
    setEditName(script.name);
    setEditDescription(script.description ?? "");
  }, []);

  const handleUpdate = useCallback(() => {
    if (!editScriptId) return;
    const data: UpdateGeneratorScript = {
      name: editName.trim() || undefined,
      description: editDescription.trim() || undefined,
      script_content: editContent || undefined,
    };
    updateScript.mutate(
      { id: editScriptId, data },
      {
        onSuccess: () => {
          addToast({ variant: "success", message: "Script updated (version incremented)" });
          setEditScriptId(null);
        },
        onError: (err) => addToast({ variant: "error", message: `Failed: ${err.message}` }),
      },
    );
  }, [editScriptId, editName, editDescription, editContent, updateScript, addToast]);

  /* --- Delete handler --- */
  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteScript.mutate(deleteTarget.id, {
      onSuccess: () => {
        addToast({ variant: "success", message: "Script deactivated" });
        setDeleteTarget(null);
      },
      onError: (err) => addToast({ variant: "error", message: `Failed: ${err.message}` }),
    });
  }, [deleteTarget, deleteScript, addToast]);

  /* --- Test handler --- */
  const handleTest = useCallback(() => {
    if (!testScriptId || !testAvatarId) return;
    setTestResult(null);
    executeScript.mutate(
      { scriptId: testScriptId, avatarId: Number(testAvatarId) },
      {
        onSuccess: (result) => setTestResult(result),
        onError: (err) => addToast({ variant: "error", message: `Execution failed: ${err.message}` }),
      },
    );
  }, [testScriptId, testAvatarId, executeScript, addToast]);

  if (isLoading) return <LoadingPane />;

  const activeScripts = (scripts ?? []).filter((s) => s.is_active);
  const inactiveScripts = (scripts ?? []).filter((s) => !s.is_active);

  return (
    <Stack gap={6}>
      {/* Toolbar */}
      <div className="flex items-center gap-[var(--spacing-2)] flex-wrap">
        <Button size="xs" icon={<Plus size={12} />} onClick={() => setCreateOpen(true)}>
          New Script
        </Button>
        <div className="ml-auto flex items-center gap-[var(--spacing-2)]">
          <span className="font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
            Pipeline:
          </span>
          <select
            className={`${TERMINAL_SELECT} w-40`}
            value={filterPipelineId ?? ""}
            onChange={(e) => setFilterPipelineId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All</option>
            {(pipelines ?? []).map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Script List */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h2 className={TERMINAL_HEADER_TITLE}>Scripts</h2>
        </div>
        <div className={TERMINAL_BODY}>
          {activeScripts.length === 0 && inactiveScripts.length === 0 ? (
            <EmptyState
              icon={<FileText size={32} />}
              title="No scripts"
              description="Create a generator script to automate metadata generation."
              action={
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                  New Script
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={TERMINAL_DIVIDER}>
                    <th className={`${TERMINAL_TH} px-2 py-1.5`}>Name</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5`}>Pipeline</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5`}>Type</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5 text-center`}>Version</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5`}>Status</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5`}>Updated</th>
                    <th className={`${TERMINAL_TH} px-2 py-1.5 text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeScripts, ...inactiveScripts].map((script) => (
                    <tr
                      key={script.id}
                      className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, "cursor-pointer")}
                      onClick={() => openEdit(script)}
                    >
                      <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-text-primary)]">
                        {script.name}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
                        {pipelineMap.get(script.pipeline_id) ?? `Pipeline #${script.pipeline_id}`}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-cyan-400">
                        {script.script_type}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-text-secondary)] text-center">
                        v{script.version}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={cn(
                          "font-mono text-[10px] uppercase tracking-wide",
                          script.is_active ? "text-green-400" : "text-[var(--color-text-muted)]",
                        )}>
                          {script.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">
                        {formatDate(script.updated_at)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={<Play size={12} />}
                            onClick={() => {
                              setTestScriptId(script.id);
                              setTestAvatarId("");
                              setTestResult(null);
                            }}
                          >
                            Test
                          </Button>
                          {script.is_active && (
                            <Button
                              size="xs"
                              variant="ghost"
                              icon={<Trash2 size={12} />}
                              onClick={() => setDeleteTarget(script)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                              */}
      {/* ------------------------------------------------------------------ */}

      {/* Create Script Modal */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetCreateForm(); }}
        title="Create Generator Script"
        size="2xl"
      >
        <Stack gap={4}>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              size="sm"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. bio-generator"
            />
            <div>
              <span className="block font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                Pipeline
              </span>
              <select
                className={`${TERMINAL_SELECT} w-full`}
                value={createPipelineId || ""}
                onChange={(e) => setCreatePipelineId(Number(e.target.value))}
              >
                <option value="">-- Select pipeline --</option>
                {(pipelines ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                Script Type
              </span>
              <select
                className={`${TERMINAL_SELECT} w-full`}
                value={createType}
                onChange={(e) => setCreateType(e.target.value)}
              >
                {SCRIPT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Input
              label="Description"
              size="sm"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>
          <div>
            <span className="block font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Script Content
            </span>
            <textarea
              className="w-full h-48 px-3 py-2 text-xs font-mono bg-[#0d1117] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] resize-y"
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              placeholder={`# ${createType} script\n# Input JSON is passed as first CLI arg (path to temp file)\n`}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save size={iconSizes.sm} />}
              onClick={handleCreate}
              loading={createScript.isPending}
              disabled={!createName.trim() || !createContent.trim() || !createPipelineId}
            >
              Create
            </Button>
          </div>
        </Stack>
      </Modal>

      {/* Edit Script Modal */}
      <Modal
        open={editScriptId !== null}
        onClose={() => setEditScriptId(null)}
        title={editScriptData ? `Edit: ${editScriptData.name}` : "Edit Script"}
        size="2xl"
      >
        {editScriptData && (
          <Stack gap={4}>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                size="sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                label="Description"
                size="sm"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-[var(--color-text-muted)]">Type:</span>
              <span className="text-cyan-400">{editScriptData.script_type}</span>
              <span className="text-[var(--color-text-muted)]">|</span>
              <span className="text-[var(--color-text-muted)]">Version:</span>
              <span className="text-cyan-400">v{editScriptData.version}</span>
              <span className="text-[var(--color-text-muted)]">|</span>
              <span className="text-[var(--color-text-muted)]">Pipeline:</span>
              <span className="text-cyan-400">
                {pipelineMap.get(editScriptData.pipeline_id) ?? `#${editScriptData.pipeline_id}`}
              </span>
            </div>
            <div>
              <span className="block font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                Script Content
              </span>
              <textarea
                className="w-full h-64 px-3 py-2 text-xs font-mono bg-[#0d1117] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] resize-y"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditScriptId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Save size={iconSizes.sm} />}
                onClick={handleUpdate}
                loading={updateScript.isPending}
              >
                Save (v{editScriptData.version + 1})
              </Button>
            </div>
          </Stack>
        )}
      </Modal>

      {/* Test Script Modal */}
      <Modal
        open={testScriptId !== null}
        onClose={() => { setTestScriptId(null); setTestResult(null); setTestAvatarId(""); }}
        title="Test Script Execution"
        size="lg"
      >
        <Stack gap={4}>
          <Input
            label="Avatar ID"
            size="sm"
            type="number"
            value={testAvatarId}
            onChange={(e) => setTestAvatarId(e.target.value)}
            placeholder="Enter avatar ID to test with..."
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              icon={<Play size={iconSizes.sm} />}
              onClick={handleTest}
              loading={executeScript.isPending}
              disabled={!testAvatarId}
            >
              Execute
            </Button>
          </div>

          {testResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-[var(--color-text-muted)]">Duration:</span>
                <span className="text-cyan-400">{testResult.duration_ms}ms</span>
                <span className="text-[var(--color-text-muted)]">|</span>
                <span className="text-[var(--color-text-muted)]">Script version:</span>
                <span className="text-cyan-400">v{testResult.script_version}</span>
              </div>

              {/* stdout / output */}
              <div>
                <span className="block font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                  Output
                </span>
                <pre className="max-h-48 overflow-auto px-3 py-2 text-xs font-mono bg-[#0d1117] text-green-400 border border-[var(--color-border-default)] rounded-[var(--radius-md)]">
                  {testResult.output_json != null
                    ? JSON.stringify(testResult.output_json, null, 2)
                    : "(no output)"}
                </pre>
              </div>

              {/* stderr */}
              {testResult.stderr && (
                <div>
                  <span className="block font-mono text-[10px] text-red-400 uppercase tracking-wide mb-1">
                    Stderr
                  </span>
                  <pre className="max-h-32 overflow-auto px-3 py-2 text-xs font-mono bg-[#0d1117] text-red-400 border border-red-900/30 rounded-[var(--radius-md)]">
                    {testResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Stack>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Deactivate Script"
        entityName={deleteTarget?.name ?? ""}
        onConfirm={handleDelete}
        loading={deleteScript.isPending}
      />
    </Stack>
  );
}
