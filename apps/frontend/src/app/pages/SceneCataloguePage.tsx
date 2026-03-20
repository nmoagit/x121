/**
 * Scene catalogue management page (PRD-111).
 *
 * Provides a tabbed interface for managing scene types (with workflow
 * assignment), scene catalogue entries, and track definitions.
 */

import { useCallback, useState } from "react";

import { ConfirmDeleteModal, ConfigToolbar, Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Button, LoadingPane, SelectableRow } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  GHOST_DANGER_BTN,
  TERMINAL_BODY,
  TERMINAL_HEADER,
  TERMINAL_LABEL,
  TERMINAL_PANEL,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { Edit3, Plus, Trash2 } from "@/tokens/icons";

import { useExportSceneCatalogue, useConfigImport } from "@/features/config-io";
import { SceneTypePromptDefaultsPanel } from "@/features/prompt-management";
import { SceneCatalogueList } from "@/features/scene-catalogue/SceneCatalogueList";
import { useTrackConfigs } from "@/features/scene-catalogue/hooks/use-track-configs";
import { TrackManager } from "@/features/scene-catalogue/TrackManager";
import { TrackWorkflowManager } from "@/features/scene-catalogue/TrackWorkflowManager";
import {
  SceneTypeEditor,
  useSceneTypes,
  useCreateSceneType,
  useUpdateSceneType,
  useDeleteSceneType,
} from "@/features/scene-types";
import type { CreateSceneType, SceneType } from "@/features/scene-types";
import { VideoSettingsDefaultsTab } from "@/features/video-settings/VideoSettingsDefaultsTab";
import { useWorkflows } from "@/features/workflow-import";
import type { Workflow } from "@/features/workflow-import";

/* --------------------------------------------------------------------------
   Tab options
   -------------------------------------------------------------------------- */

type TabKey = "scene-types" | "workflows" | "catalogue" | "tracks" | "prompt-defaults" | "video-settings";

const TABS: { id: TabKey; label: string }[] = [
  { id: "scene-types", label: "Scene Types" },
  { id: "catalogue", label: "Scene Catalogue" },
  { id: "tracks", label: "Tracks" },
  { id: "workflows", label: "Workflows" },
  { id: "prompt-defaults", label: "Prompt Defaults" },
  { id: "video-settings", label: "Video Settings" },
];

/* --------------------------------------------------------------------------
   Scene Types tab
   -------------------------------------------------------------------------- */

function SceneTypesTab() {
  const { data: sceneTypes, isLoading } = useSceneTypes();
  const { data: workflows } = useWorkflows();
  const createMutation = useCreateSceneType();
  const deleteMutation = useDeleteSceneType();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<SceneType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SceneType | null>(null);

  const selected = sceneTypes?.find((st) => st.id === selectedId) ?? null;

  const workflowName = (wfId: number | null) => {
    if (!wfId) return null;
    return workflows?.find((w) => w.id === wfId)?.name ?? `Workflow #${wfId}`;
  };

  const handleCreateSave = useCallback(
    (data: CreateSceneType) => {
      createMutation.mutate(data, {
        onSuccess: (newSt) => {
          setCreating(false);
          setSelectedId(newSt.id);
        },
      });
    },
    [createMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        if (selectedId === deleting.id) setSelectedId(null);
        setDeleting(null);
      },
    });
  }, [deleting, deleteMutation, selectedId]);

  if (creating) {
    return (
      <div className="max-w-2xl">
        <SceneTypeEditor
          onSave={handleCreateSave}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-2xl">
        <EditSceneTypeForm
          sceneType={editing}
          onDone={() => setEditing(null)}
        />
      </div>
    );
  }

  if (isLoading) return <LoadingPane />;

  if (!sceneTypes?.length) {
    return (
      <EmptyState
        title="No Scene Types"
        description="Create your first scene type to define workflow configurations for video generation."
        action={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            Create Scene Type
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex gap-6">
      {/* List */}
      <div className="w-[340px] shrink-0">
        <Stack gap={2}>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCreating(true)}
          >
            New Scene Type
          </Button>

          {sceneTypes.map((st) => (
            <SelectableRow
              key={st.id}
              isSelected={st.id === selectedId}
              onSelect={() => setSelectedId(st.id)}
            >
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 w-full">
                <span className="truncate font-mono text-xs text-cyan-400">
                  {st.name}
                </span>
                <span className={cn("font-mono text-xs", TERMINAL_STATUS_COLORS[st.is_active ? "active" : "pending"])}>
                  {st.is_active ? "Active" : "Inactive"}
                </span>
                <span className="truncate font-mono text-xs text-[var(--color-text-muted)] max-w-[100px]">
                  {st.workflow_id ? workflowName(st.workflow_id) : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Edit3 size={14} />}
                    onClick={(e) => { e.stopPropagation(); setEditing(st); }}
                    aria-label="Edit scene type"
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    className={GHOST_DANGER_BTN}
                    icon={<Trash2 size={14} />}
                    onClick={(e) => { e.stopPropagation(); setDeleting(st); }}
                    aria-label="Delete scene type"
                  />
                </div>
              </div>
            </SelectableRow>
          ))}
        </Stack>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <SceneTypeDetail sceneType={selected} workflows={workflows ?? []} />
        ) : (
          <EmptyState
            title="Select a Scene Type"
            description="Choose a scene type from the list to view its configuration."
          />
        )}
      </div>

      <ConfirmDeleteModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete Scene Type"
        entityName={deleting?.name ?? ""}
        warningText="All scenes using this type will need to be reconfigured."
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Edit wrapper — calls useUpdateSceneType at the top level of a component
   -------------------------------------------------------------------------- */

function EditSceneTypeForm({
  sceneType,
  onDone,
}: {
  sceneType: SceneType;
  onDone: () => void;
}) {
  const updateMutation = useUpdateSceneType(sceneType.id);

  const handleSave = (data: CreateSceneType) => {
    updateMutation.mutate(data, { onSuccess: onDone });
  };

  return (
    <SceneTypeEditor
      sceneType={sceneType}
      onSave={handleSave}
      onCancel={onDone}
    />
  );
}

/* --------------------------------------------------------------------------
   Scene Type detail panel
   -------------------------------------------------------------------------- */

function SceneTypeDetail({
  sceneType,
  workflows,
}: {
  sceneType: SceneType;
  workflows: Workflow[];
}) {
  const { data: trackConfigs } = useTrackConfigs(sceneType.id);

  const wfName = (wfId: number | null) => {
    if (!wfId) return null;
    return workflows.find((w) => w.id === wfId)?.name ?? `Workflow #${wfId}`;
  };

  // Build per-track workflow list from track configs
  const trackWorkflows = (trackConfigs ?? [])
    .filter((c) => c.workflow_id != null)
    .map((c) => ({
      trackName: c.track_name ?? `Track #${c.track_id}`,
      isClothesOff: c.is_clothes_off,
      workflowName: wfName(c.workflow_id) ?? `Workflow #${c.workflow_id}`,
    }));

  return (
    <div className={TERMINAL_PANEL}>
      <div className={cn(TERMINAL_HEADER, "flex items-center gap-3")}>
        <span className="font-mono text-sm text-cyan-400">{sceneType.name}</span>
        <span className={cn("font-mono text-xs", TERMINAL_STATUS_COLORS[sceneType.is_active ? "active" : "pending"])}>
          {sceneType.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className={TERMINAL_BODY}>
        <div className="space-y-4">
          {sceneType.description && (
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{sceneType.description}</p>
          )}

          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <DetailRow label="Slug" value={sceneType.slug} />
            <DetailRow
              label="Default Workflow"
              value={
                wfName(sceneType.workflow_id)
                  ?? (trackWorkflows.length > 0 ? "Per-track (see below)" : "None assigned")
              }
            />
            <DetailRow
              label="Target Duration"
              value={sceneType.target_duration_secs ? `${sceneType.target_duration_secs}s` : "Not set"}
            />
            <DetailRow
              label="Segment Duration"
              value={sceneType.segment_duration_secs ? `${sceneType.segment_duration_secs}s` : "Not set"}
            />
            <DetailRow
              label="Duration Tolerance"
              value={`${sceneType.duration_tolerance_secs}s`}
            />
            <DetailRow
              label="Frame Rate"
              value={sceneType.target_fps ? `${sceneType.target_fps} fps` : "Not set"}
            />
            <DetailRow
              label="Resolution"
              value={sceneType.target_resolution ?? "Not set"}
            />
            <DetailRow label="Sort Order" value={String(sceneType.sort_order)} />
            <DetailRow
              label="Generation Strategy"
              value={sceneType.generation_strategy}
            />
            <DetailRow
              label="Auto-Retry"
              value={
                sceneType.auto_retry_enabled
                  ? `Enabled (max ${sceneType.auto_retry_max_attempts})`
                  : "Disabled"
              }
            />
          </dl>

          {/* Per-track workflow assignments */}
          <div className="space-y-2">
            <span className={TERMINAL_LABEL}>Track Workflows</span>
            <div className="rounded-[var(--radius-md)] bg-[#0d1117] border border-[var(--color-border-default)]/30 p-3 space-y-1.5">
              {trackWorkflows.length > 0 ? (
                trackWorkflows.map((tw, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-cyan-400">{tw.trackName}</span>
                    {tw.isClothesOff && (
                      <span className="text-orange-400">[Clothes Off]</span>
                    )}
                    <span className="text-[var(--color-text-muted)] opacity-30">&rarr;</span>
                    <span className="text-[var(--color-text-muted)]">{tw.workflowName}</span>
                  </div>
                ))
              ) : (
                <p className="font-mono text-xs text-[var(--color-text-muted)]">
                  No per-track workflows assigned. Use the Workflows tab to assign workflows to tracks.
                </p>
              )}
            </div>
          </div>

          {/* Prompt templates */}
          {sceneType.prompt_template && (
            <div className="space-y-1">
              <span className={TERMINAL_LABEL}>Prompt Template</span>
              <pre className="rounded-[var(--radius-md)] bg-[#0d1117] border border-[var(--color-border-default)]/30 p-3 font-mono text-xs text-cyan-400 whitespace-pre-wrap max-h-[200px] overflow-auto">
                {sceneType.prompt_template}
              </pre>
            </div>
          )}

          {sceneType.negative_prompt_template && (
            <div className="space-y-1">
              <span className={TERMINAL_LABEL}>Negative Prompt</span>
              <pre className="rounded-[var(--radius-md)] bg-[#0d1117] border border-[var(--color-border-default)]/30 p-3 font-mono text-xs text-red-400 whitespace-pre-wrap max-h-[150px] overflow-auto">
                {sceneType.negative_prompt_template}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className={TERMINAL_LABEL}>{label}</dt>
      <dd className="font-mono text-xs text-cyan-400">{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main page
   -------------------------------------------------------------------------- */

export function SceneCataloguePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("scene-types");
  const { exporting, exportConfig } = useExportSceneCatalogue();
  const { importing, importFile } = useConfigImport();

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div className="flex items-start justify-between">
          <PageHeader
            title="Scene Catalogue"
            description="Manage scene types, catalogue entries, and track definitions."
          />
          <ConfigToolbar
            onExport={exportConfig}
            onImport={(file) => importFile(file)}
            exporting={exporting}
            importing={importing}
          />
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={(k) => setActiveTab(k as TabKey)} variant="pill" />

        {activeTab === "scene-types" && <SceneTypesTab />}
        {activeTab === "workflows" && <TrackWorkflowManager />}
        {activeTab === "catalogue" && <SceneCatalogueList />}
        {activeTab === "tracks" && <TrackManager />}
        {activeTab === "video-settings" && <VideoSettingsDefaultsTab />}
        {activeTab === "prompt-defaults" && <SceneTypePromptDefaultsPanel />}
      </Stack>
    </div>
  );
}
